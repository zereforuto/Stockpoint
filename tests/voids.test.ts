import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as salesService from '../src/main/services/sales.service'
import { setSession } from '../src/main/session'
import { ErrorCodes } from '../src/shared/errors'
import { cardSale, createTestDb, expectAppError, type TestContext } from './helpers/testDb'

let ctx: TestContext

beforeEach(() => {
  ctx = createTestDb()
})

afterEach(() => {
  ctx.close()
})

describe('void restores stock', () => {
  it('puts every unit back and writes a void movement', () => {
    const sku = 'LMP-PC'
    const productId = ctx.productId(sku)
    const originalStock = ctx.stockOf(sku)

    const sale = salesService.createSale(ctx.db, cardSale([{ productId, quantity: 4 }]))
    expect(ctx.stockOf(sku)).toBe(originalStock - 4)

    const voided = salesService.voidSale(ctx.db, sale.id, 'Customer changed their mind', 1)

    expect(voided.status).toBe('voided')
    expect(ctx.stockOf(sku)).toBe(originalStock)

    const movements = ctx.db
      .prepare('SELECT delta, type, reason FROM stock_movements WHERE product_id = ? AND ref_id = ? ORDER BY id')
      .all(productId, sale.id) as { delta: number; type: string; reason: string | null }[]
    expect(movements).toHaveLength(2)
    expect(movements[0]).toMatchObject({ delta: -4, type: 'sale' })
    expect(movements[1]).toMatchObject({ delta: 4, type: 'void', reason: 'Customer changed their mind' })
  })

  it('keeps totals and item snapshots untouched', () => {
    const productId = ctx.productId('CEN-180')
    const sale = salesService.createSale(ctx.db, cardSale([{ productId, quantity: 2 }], { type: 'percent', value: 15 }))

    const voided = salesService.voidSale(ctx.db, sale.id, 'Wrong item', 1)

    expect(voided.subtotalCent).toBe(sale.subtotalCent)
    expect(voided.discountCent).toBe(sale.discountCent)
    expect(voided.taxCent).toBe(sale.taxCent)
    expect(voided.totalCent).toBe(sale.totalCent)
    expect(voided.items).toEqual(sale.items)
    expect(voided.amountTenderedCent).toBe(sale.amountTenderedCent)
    expect(voided.changeCent).toBe(sale.changeCent)
    expect(voided.voidReason).toBe('Wrong item')
    expect(voided.voidedBy).toBe(1)
    expect(voided.voidedAt).toBeTruthy()
  })

  it('supports a sell -> void -> sell cycle without corrupting quantities', () => {
    const sku = 'CHI-BBQ'
    const productId = ctx.productId(sku)
    const originalStock = ctx.stockOf(sku)

    const first = salesService.createSale(ctx.db, cardSale([{ productId, quantity: 3 }]))
    salesService.voidSale(ctx.db, first.id, 'Mistake', 1)
    expect(ctx.stockOf(sku)).toBe(originalStock)

    const second = salesService.createSale(ctx.db, cardSale([{ productId, quantity: 5 }]))
    expect(ctx.stockOf(sku)).toBe(originalStock - 5)
    expect(second.receiptNo).not.toBe(first.receiptNo)

    salesService.voidSale(ctx.db, second.id, 'Mistake again', 1)
    expect(ctx.stockOf(sku)).toBe(originalStock)

    const saleRows = ctx.db
      .prepare('SELECT status FROM sales ORDER BY id')
      .all() as { status: string }[]
    expect(saleRows.map((row) => row.status)).toEqual(['voided', 'voided'])
  })
})

describe('void guards', () => {
  it('cannot void the same sale twice', () => {
    const productId = ctx.productId('H2O-500')
    const sale = salesService.createSale(ctx.db, cardSale([{ productId, quantity: 1 }]))

    salesService.voidSale(ctx.db, sale.id, 'First void', 1)
    const stockAfterFirstVoid = ctx.stockOf('H2O-500')

    expectAppError(() => salesService.voidSale(ctx.db, sale.id, 'Second void', 1), ErrorCodes.CONFLICT)
    expect(ctx.stockOf('H2O-500')).toBe(stockAfterFirstVoid)
  })

  it('fails for a sale that does not exist', () => {
    expectAppError(() => salesService.voidSale(ctx.db, 987654, 'Ghost', 1), ErrorCodes.NOT_FOUND)
  })

  it('only lets the owner void', () => {
    const productId = ctx.productId('OIS-PR')
    const sale = salesService.createSale(ctx.db, cardSale([{ productId, quantity: 1 }]))

    setSession({ id: 1, username: 'owner', fullName: 'Shop Owner', role: 'cashier', mustChangePassword: false })
    const before = ctx.stockOf('OIS-PR')

    expectAppError(() => salesService.voidSale(ctx.db, sale.id, 'Not allowed', 1), ErrorCodes.FORBIDDEN)
    expect(ctx.stockOf('OIS-PR')).toBe(before)
    expect(ctx.salesCount()).toBe(1)
  })

  it('refuses to void while signed out', () => {
    const productId = ctx.productId('SUR-66')
    const sale = salesService.createSale(ctx.db, cardSale([{ productId, quantity: 1 }]))
    const stockAfterSale = ctx.stockOf('SUR-66')
    setSession(null)

    expectAppError(() => salesService.voidSale(ctx.db, sale.id, 'Signed out', 1), ErrorCodes.SESSION_EXPIRED)
    expect(ctx.stockOf('SUR-66')).toBe(stockAfterSale)
    expect(ctx.salesCount()).toBe(1)
  })
})
