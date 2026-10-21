import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ErrorCodes } from '../src/shared/errors'
import * as stockService from '../src/main/services/stock.service'
import * as salesService from '../src/main/services/sales.service'
import * as settingsService from '../src/main/services/settings.service'
import { setSession } from '../src/main/session'
import { cardSale, cashSale, createTestDb, expectAppError, type TestContext } from './helpers/testDb'

let ctx: TestContext

beforeEach(() => {
  ctx = createTestDb()
})

afterEach(() => {
  ctx.close()
})

describe('stock is deducted on sale', () => {
  it('decrements stock and writes a sale movement', () => {
    const productId = ctx.productId('COC-290')
    const before = ctx.stockOf('COC-290')

    const sale = salesService.createSale(ctx.db, cardSale([{ productId, quantity: 3 }]))

    expect(ctx.stockOf('COC-290')).toBe(before - 3)
    expect(sale.items[0].quantity).toBe(3)
    expect(sale.status).toBe('completed')

    const movements = ctx.db
      .prepare('SELECT delta, type FROM stock_movements WHERE product_id = ? AND ref_id = ?')
      .all(productId, sale.id) as { delta: number; type: string }[]
    expect(movements).toHaveLength(1)
    expect(movements[0]).toEqual({ delta: -3, type: 'sale' })
  })

  it('collapses repeated cart lines for the same product', () => {
    const productId = ctx.productId('H2O-500')
    const before = ctx.stockOf('H2O-500')

    const sale = salesService.createSale(
      ctx.db,
      cardSale([
        { productId, quantity: 2 },
        { productId, quantity: 1 }
      ])
    )

    expect(sale.items).toHaveLength(1)
    expect(sale.items[0].quantity).toBe(3)
    expect(ctx.stockOf('H2O-500')).toBe(before - 3)
  })

  it('reconciles totals under inclusive tax (the default) and returns the right change', () => {
    const sale = salesService.createSale(
      ctx.db,
      cashSale([{ productId: ctx.productId('NES-3IN1'), quantity: 2 }], 30000, {
        type: 'percent',
        value: 10
      })
    )

    const linesTotal = sale.items.reduce((sum, item) => sum + item.lineTotalCent, 0)
    const taxableCent = sale.subtotalCent - sale.discountCent
    expect(sale.subtotalCent).toBe(linesTotal)
    expect(sale.subtotalCent).toBe(20000)
    expect(sale.discountCent).toBe(2000)
    expect(sale.totalCent).toBe(taxableCent) // inclusive: the tax is part of the price
    expect(sale.taxCent).toBeGreaterThan(0)
    expect(sale.taxCent).toBeLessThan(sale.totalCent)
    expect(sale.amountTenderedCent - sale.changeCent).toBe(sale.totalCent)
    expect(sale.changeCent).toBe(30000 - sale.totalCent)
    expect(sale.changeCent).toBeGreaterThan(0)
  })

  it('reconciles totals under exclusive tax (tax added on top)', () => {
    settingsService.updateSettings(ctx.db, { taxMode: 'exclusive' })

    const sale = salesService.createSale(
      ctx.db,
      cashSale([{ productId: ctx.productId('NES-3IN1'), quantity: 1 }], 20000)
    )

    expect(sale.subtotalCent).toBe(10000)
    expect(sale.taxCent).toBe(1200)
    expect(sale.totalCent).toBe(11200)
    expect(sale.subtotalCent - sale.discountCent + sale.taxCent).toBe(sale.totalCent)
    expect(sale.amountTenderedCent - sale.changeCent).toBe(sale.totalCent)
    expect(sale.changeCent).toBe(8800)
  })

  it('allocates a unique receipt number per sale', () => {
    const productId = ctx.productId('CHI-BBQ')
    const receipts = new Set<string>()
    for (let i = 0; i < 3; i += 1) {
      const sale = salesService.createSale(ctx.db, cardSale([{ productId, quantity: 1 }]))
      expect(sale.receiptNo).toMatch(/^SP-\d{8}-\d{4}$/)
      receipts.add(sale.receiptNo)
    }
    expect(receipts.size).toBe(3)
  })

  it('keeps the price snapshot even after the product price changes', () => {
    const productId = ctx.productId('OIS-PR')
    const sale = salesService.createSale(ctx.db, cardSale([{ productId, quantity: 2 }]))
    const snapshotPrice = sale.items[0].unitPriceCent

    ctx.db.prepare('UPDATE products SET selling_price_cent = 99999 WHERE id = ?').run(productId)

    const reread = salesService.getSaleDetail(ctx.db, sale.id)
    expect(reread.items[0].unitPriceCent).toBe(snapshotPrice)
    expect(reread.subtotalCent).toBe(snapshotPrice * 2)
  })
})

describe('failed sales never touch stock', () => {
  it('rolls back a partial multi-line sale when the second product is short', () => {
    const coke = ctx.productId('COC-290')
    const soap = ctx.productId('SFG-SB') // seeded with 1 unit
    const beforeCoke = ctx.stockOf('COC-290')
    const beforeSoap = ctx.stockOf('SFG-SB')

    expectAppError(
      () =>
        salesService.createSale(
          ctx.db,
          cardSale([
            { productId: coke, quantity: 5 },
            { productId: soap, quantity: 999 }
          ])
        ),
      ErrorCodes.INSUFFICIENT_STOCK
    )

    expect(ctx.stockOf('COC-290')).toBe(beforeCoke)
    expect(ctx.stockOf('SFG-SB')).toBe(beforeSoap)
    expect(ctx.salesCount()).toBe(0)
    expect((ctx.db.prepare('SELECT COUNT(*) AS n FROM sale_items').get() as { n: number }).n).toBe(0)
    expect((ctx.db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get() as { n: number }).n).toBe(0)
  })

  it('reports the available quantity when stock is short', () => {
    const productId = ctx.productId('SFG-SB')
    const error = expectAppError(
      () => salesService.createSale(ctx.db, cardSale([{ productId, quantity: 5 }])),
      ErrorCodes.INSUFFICIENT_STOCK
    )
    expect(error.meta).toMatchObject({ productId, requested: 5, available: 1 })
    expect(error.message).toContain('Not enough stock')
  })

  it('refuses to sell more stock than exists, then accepts it after a restock', () => {
    const productId = ctx.productId('ALA-370')
    const stock = ctx.stockOf('ALA-370')

    expectAppError(
      () => salesService.createSale(ctx.db, cardSale([{ productId, quantity: stock + 1 }])),
      ErrorCodes.INSUFFICIENT_STOCK
    )
    expect(ctx.stockOf('ALA-370')).toBe(stock)

    ctx.db.prepare('UPDATE products SET stock_qty = stock_qty + 100 WHERE id = ?').run(productId)
    const sale = salesService.createSale(ctx.db, cardSale([{ productId, quantity: stock + 1 }]))
    expect(sale.status).toBe('completed')
    expect(ctx.stockOf('ALA-370')).toBe(100 - 1)
  })

  it('rejects cash that does not cover the total without altering stock', () => {
    const productId = ctx.productId('JOY-500')
    const before = ctx.stockOf('JOY-500')

    expect(() => salesService.createSale(ctx.db, cashSale([{ productId, quantity: 1 }], 100))).toThrow(
      /less than/i
    )

    expect(ctx.stockOf('JOY-500')).toBe(before)
    expect(ctx.salesCount()).toBe(0)
  })

  it('rejects a cart referencing a product that no longer exists', () => {
    expectAppError(() => salesService.createSale(ctx.db, cardSale([{ productId: 99999, quantity: 1 }])), ErrorCodes.NOT_FOUND)
    expect(ctx.salesCount()).toBe(0)
  })

  it('rejects selling an inactive product', () => {
    const productId = ctx.productId('ARG-150')
    ctx.db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(productId)
    expectAppError(
      () => salesService.createSale(ctx.db, cardSale([{ productId, quantity: 1 }])),
      ErrorCodes.VALIDATION
    )
    expect(ctx.salesCount()).toBe(0)
  })

  it('requires a signed-in cashier', () => {
    setSession(null)
    const productId = ctx.productId('COC-290')
    expectAppError(
      () => salesService.createSale(ctx.db, cardSale([{ productId, quantity: 1 }])),
      ErrorCodes.SESSION_EXPIRED
    )
    expect(ctx.salesCount()).toBe(0)
  })
})

describe('rapid sales never corrupt stock', () => {
  it('drives stock exactly to zero across many back-to-back sales', () => {
    const sku = 'SUR-66'
    const productId = ctx.productId(sku)
    const stock = ctx.stockOf(sku)

    for (let sold = 1; sold <= stock; sold += 1) {
      salesService.createSale(ctx.db, cardSale([{ productId, quantity: 1 }]))
      expect(ctx.stockOf(sku)).toBe(stock - sold)
    }

    expect(ctx.stockOf(sku)).toBe(0)
    expect(ctx.salesCount()).toBe(stock)

    expectAppError(
      () => salesService.createSale(ctx.db, cardSale([{ productId, quantity: 1 }])),
      ErrorCodes.INSUFFICIENT_STOCK
    )
    expect(ctx.stockOf(sku)).toBe(0)
    expect(ctx.salesCount()).toBe(stock)
  })

  it('keeps quantities correct when several products are sold in bursts', () => {
    const coke = ctx.productId('COC-290') // 48 in stock
    const h2o = ctx.productId('H2O-500') // 60 in stock
    const beforeCoke = ctx.stockOf('COC-290')
    const beforeH2o = ctx.stockOf('H2O-500')

    for (let i = 0; i < 20; i += 1) {
      salesService.createSale(
        ctx.db,
        cardSale([
          { productId: coke, quantity: 2 },
          { productId: h2o, quantity: 1 }
        ])
      )
    }

    expect(ctx.stockOf('COC-290')).toBe(beforeCoke - 40)
    expect(ctx.stockOf('H2O-500')).toBe(beforeH2o - 20)
    expect(ctx.salesCount()).toBe(20)
  })
})

describe('manual stock adjustments', () => {
  it('restocks with a recorded movement', () => {
    const productId = ctx.productId('CEN-180')
    const before = ctx.stockOf('CEN-180')

    const result = stockService.adjustStock(
      ctx.db,
      { productId, delta: 12, type: 'restock', reason: 'Delivery' },
      1
    )

    expect(result.product.stockQty).toBe(before + 12)
    expect(result.movement.delta).toBe(12)
    expect(result.movement.type).toBe('restock')
    expect(result.movement.reason).toBe('Delivery')
  })

  it('refuses to correct stock below zero', () => {
    const productId = ctx.productId('SUR-66')
    const before = ctx.stockOf('SUR-66')

    expectAppError(
      () => stockService.adjustStock(ctx.db, { productId, delta: -(before + 5), type: 'correction' }, 1),
      ErrorCodes.INSUFFICIENT_STOCK
    )
    expect(ctx.stockOf('SUR-66')).toBe(before)
    expect((ctx.db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get() as { n: number }).n).toBe(0)
  })

  it('records a zero-delta movement without changing stock', () => {
    const productId = ctx.productId('JOY-500')
    const before = ctx.stockOf('JOY-500')

    const result = stockService.adjustStock(
      ctx.db,
      { productId, delta: 0, type: 'correction', reason: 'Cycle count' },
      1
    )

    expect(result.product.stockQty).toBe(before)
    expect(result.movement.delta).toBe(0)
  })

  it('throws for a product that does not exist', () => {
    expectAppError(
      () => stockService.adjustStock(ctx.db, { productId: 424242, delta: 1, type: 'restock' }, 1),
      ErrorCodes.NOT_FOUND
    )
  })
})
