import { AppError, ErrorCodes } from '../../shared/errors'
import { computeChange, computeTotals, lineTotalCents } from '../../shared/money'
import { localNow, toDateKey } from '../../shared/times'
import type { Paginated, SaleDetail, SaleInput, SaleQuery, SaleSummary } from '../../shared/types'
import { transact, type Db } from '../db/database'
import * as productsRepo from '../repos/products.repo'
import * as salesRepo from '../repos/sales.repo'
import * as stockRepo from '../repos/stock.repo'
import { getSettingsUnchecked } from './settings.service'
import { requireOwner, requireSession } from '../session'

interface PreparedLine {
  productId: number
  productName: string
  sku: string
  costPriceCent: number
  unitPriceCent: number
  quantity: number
  lineTotalCent: number
}

/**
 * Collapses repeated cart lines and snapshots each product's name, SKU, cost
 * and selling price at the moment of the sale, so historical profit reports
 * stay correct after price changes.
 */
function prepareLines(db: Db, items: SaleInput['items']): PreparedLine[] {
  const quantities = new Map<number, number>()
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
  }

  const lines: PreparedLine[] = []
  for (const [productId, quantity] of quantities) {
    const product = productsRepo.findProductSnapshot(db, productId)
    if (!product) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'One of the products in the cart no longer exists')
    }
    if (!product.isActive) {
      throw new AppError(ErrorCodes.VALIDATION, `"${product.name}" is no longer for sale`)
    }
    lines.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      costPriceCent: product.costPriceCent,
      unitPriceCent: product.sellingPriceCent,
      quantity,
      lineTotalCent: lineTotalCents(product.sellingPriceCent, quantity)
    })
  }
  return lines
}

/** Receipt numbers run sequentially per local day: SP-YYYYMMDD-0001. */
function receiptNumberFor(today: string, sequence: number): string {
  return `SP-${today.replace(/-/g, '')}-${String(sequence).padStart(4, '0')}`
}

/**
 * Defense in depth: the stored sale must always reconcile.
 *
 * The total must equal the discounted amount either as-is (inclusive tax: the
 * tax is part of the displayed price) or plus the tax line (exclusive: tax is
 * added on top). Checking both keeps the invariant valid even when the shop
 * changes tax mode after a sale was recorded.
 */
function assertSaleIsConsistent(sale: SaleDetail): void {
  const itemsTotal = sale.items.reduce((sum, item) => sum + item.lineTotalCent, 0)
  if (itemsTotal !== sale.subtotalCent) {
    throw new AppError(ErrorCodes.INTERNAL, 'Sale subtotal does not match its line items')
  }
  for (const item of sale.items) {
    if (item.unitPriceCent * item.quantity !== item.lineTotalCent) {
      throw new AppError(ErrorCodes.INTERNAL, 'A sale line does not match its unit price and quantity')
    }
  }
  if (sale.discountCent < 0 || sale.discountCent > sale.subtotalCent) {
    throw new AppError(ErrorCodes.INTERNAL, 'Sale discount is out of range')
  }
  const taxableCent = sale.subtotalCent - sale.discountCent
  if (sale.taxCent < 0 || sale.taxCent > taxableCent) {
    throw new AppError(ErrorCodes.INTERNAL, 'Sale tax is out of range')
  }
  const inclusiveTotal = taxableCent
  const exclusiveTotal = taxableCent + sale.taxCent
  if (sale.totalCent !== inclusiveTotal && sale.totalCent !== exclusiveTotal) {
    throw new AppError(ErrorCodes.INTERNAL, 'Sale totals do not reconcile')
  }
  if (sale.amountTenderedCent - sale.changeCent !== sale.totalCent) {
    throw new AppError(ErrorCodes.INTERNAL, 'Sale payment does not match the total')
  }
}

/**
 * Creates a sale and deducts stock in ONE immediate transaction. Any failure
 * (unknown product, insufficient stock, tendered amount too small) rolls the
 * whole thing back, so a sale row can never exist without its stock movement
 * and vice versa.
 */
export function createSale(db: Db, input: SaleInput): SaleDetail {
  const session = requireSession()

  return transact(db, () => {
    const settings = getSettingsUnchecked(db)
    const now = localNow()
    const today = toDateKey()
    const lines = prepareLines(db, input.items)

    const subtotalCent = lines.reduce((sum, line) => sum + line.lineTotalCent, 0)
    const totals = computeTotals(subtotalCent, input.discount, settings.taxRatePercent, settings.taxMode)

    let tenderedCent = totals.totalCent
    let changeCent = 0
    if (input.payment.method === 'cash') {
      tenderedCent = input.payment.amountTenderedCent
      changeCent = computeChange(totals.totalCent, tenderedCent) // throws when too small
    }

    const discountValueCent =
      input.discount.type === 'percent'
        ? Math.round(input.discount.value * 100) // percentage points x 100
        : Math.trunc(input.discount.value)

    let saleId = 0
    let receiptNo = receiptNumberFor(today, salesRepo.countSalesOnDate(db, today) + 1)
    for (let attempt = 0; attempt < 5 && saleId === 0; attempt += 1) {
      try {
        saleId = salesRepo.insertSale(db, {
          receiptNo,
          cashierId: session.id,
          subtotalCent: totals.subtotalCent,
          discountType: input.discount.type,
          discountValueCent,
          discountCent: totals.discountCent,
          taxCent: totals.taxCent,
          totalCent: totals.totalCent,
          paymentMethod: input.payment.method,
          amountTenderedCent: tenderedCent,
          changeCent,
          createdAt: now
        })
      } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
          receiptNo = receiptNumberFor(today, salesRepo.countSalesOnDate(db, today) + 1 + attempt + 1)
          continue
        }
        throw error
      }
    }
    if (saleId === 0) {
      throw new AppError(ErrorCodes.INTERNAL, 'Could not allocate a receipt number')
    }

    for (const line of lines) {
      salesRepo.insertSaleItem(db, { saleId, ...line })

      const decremented = productsRepo.tryDecrementStock(db, line.productId, line.quantity, now)
      if (!decremented) {
        const available = productsRepo.findProductSnapshot(db, line.productId)?.stockQty ?? 0
        throw new AppError(
          ErrorCodes.INSUFFICIENT_STOCK,
          `Not enough stock for "${line.productName}" (requested ${line.quantity}, available ${available})`,
          { meta: { productId: line.productId, requested: line.quantity, available } }
        )
      }

      stockRepo.insertStockMovement(db, {
        productId: line.productId,
        delta: -line.quantity,
        type: 'sale',
        refType: 'sale',
        refId: saleId,
        userId: session.id,
        createdAt: now
      })
    }

    salesRepo.insertPayment(db, {
      saleId,
      method: input.payment.method,
      amountCent: tenderedCent,
      reference: input.payment.reference ?? null,
      createdAt: now
    })

    const detail = salesRepo.getSaleDetail(db, saleId) as SaleDetail
    assertSaleIsConsistent(detail)
    return detail
  })
}

/**
 * Voids a sale: stock is restored (with a movement row) and the audit trail
 * records who did it and why. Totals are never rewritten.
 */
export function voidSale(db: Db, saleId: number, reason: string, userId: number): SaleDetail {
  requireOwner()
  return transact(db, () => {
    const status = salesRepo.getSaleStatus(db, saleId)
    if (!status) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Sale not found')
    }
    if (status === 'voided') {
      throw new AppError(ErrorCodes.CONFLICT, 'This sale has already been voided')
    }

    const sale = salesRepo.getSaleDetail(db, saleId) as SaleDetail
    const now = localNow()
    salesRepo.markSaleVoided(db, saleId, reason, userId, now)

    for (const item of sale.items) {
      productsRepo.incrementStock(db, item.productId, item.quantity, now)
      stockRepo.insertStockMovement(db, {
        productId: item.productId,
        delta: item.quantity,
        type: 'void',
        reason,
        refType: 'sale',
        refId: saleId,
        userId,
        createdAt: now
      })
    }

    const voided = salesRepo.getSaleDetail(db, saleId) as SaleDetail
    assertSaleIsConsistent(voided)
    return voided
  })
}

export function getSaleDetail(db: Db, saleId: number): SaleDetail {
  requireSession()
  const sale = salesRepo.getSaleDetail(db, saleId)
  if (!sale) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Sale not found')
  }
  return sale
}

export function listSales(db: Db, query: SaleQuery): Paginated<SaleSummary> {
  requireSession()
  return salesRepo.listSales(db, query)
}
