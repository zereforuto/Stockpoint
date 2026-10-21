import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as reportsService from '../src/main/services/reports.service'
import * as salesService from '../src/main/services/sales.service'
import { setSession } from '../src/main/session'
import { ErrorCodes } from '../src/shared/errors'
import { addDays, toDateKey, type DateKey } from '../src/shared/times'
import { cardSale, cashSale, createTestDb, expectAppError, type TestContext } from './helpers/testDb'

let ctx: TestContext
let from: DateKey
let to: DateKey
let saleToday: { id: number; receiptNo: string; totalCent: number }
let saleYesterday: { id: number; receiptNo: string; totalCent: number }

function moveSaleTo(saleId: number, dateKey: DateKey, time = '10:15:00.000'): void {
  ctx.db.prepare('UPDATE sales SET created_at = ? WHERE id = ?').run(`${dateKey} ${time}`, saleId)
}

/**
 * Builds a small, known history:
 * - today: 2 completed sales (one with a fixed discount)
 * - yesterday: 1 completed sale
 * - 5 days ago: 1 sale that is subsequently voided
 */
beforeEach(() => {
  ctx = createTestDb()
  setSession({ id: 1, username: 'owner', fullName: 'Shop Owner', role: 'owner', mustChangePassword: false })

  const coke = ctx.productId('COC-290')
  const water = ctx.productId('H2O-500')
  const nescafe = ctx.productId('NES-3IN1')

  const first = salesService.createSale(ctx.db, cardSale([{ productId: coke, quantity: 2 }]))
  salesService.createSale(
    ctx.db,
    cashSale([{ productId: water, quantity: 1 }], 5000, { type: 'fixed', value: 500 })
  )
  const third = salesService.createSale(ctx.db, cardSale([{ productId: coke, quantity: 1 }]))
  const fourth = salesService.createSale(ctx.db, cardSale([{ productId: nescafe, quantity: 1 }]))

  moveSaleTo(third.id, addDays(toDateKey(), -1))
  moveSaleTo(fourth.id, addDays(toDateKey(), -5))
  salesService.voidSale(ctx.db, fourth.id, 'Customer left the store', 1)

  saleToday = { id: first.id, receiptNo: first.receiptNo, totalCent: first.totalCent }
  saleYesterday = { id: third.id, receiptNo: third.receiptNo, totalCent: third.totalCent }
  from = addDays(toDateKey(), -7)
  to = toDateKey()
})

afterEach(() => {
  ctx.close()
})

describe('dashboard', () => {
  it('summarises today and the catalogue', () => {
    const dash = reportsService.dashboard(ctx.db)

    // 3000 (2 x 1500) + 700 (1200 - 500 discount), inclusive 12% VAT
    expect(dash.today.salesCount).toBe(2)
    expect(dash.today.revenueCent).toBe(3700)
    expect(dash.today.profitCent).toBe(500) // 3700 - (2400 + 800) cost
    expect(dash.productCount).toBe(12)
    expect(dash.outOfStockCount).toBe(0)
    expect(dash.lowStock.some((product) => product.sku === 'SFG-SB')).toBe(true)
    expect(dash.recentSales.length).toBeGreaterThanOrEqual(3)
    expect(dash.stockValuation.productCount).toBe(12)
    expect(dash.stockValuation.totalUnits).toBeGreaterThan(0)
    expect(dash.stockValuation.costValueCent).toBeGreaterThan(0)
  })

  it('is owner-only', () => {
    setSession({ id: 1, username: 'owner', fullName: 'Shop Owner', role: 'cashier', mustChangePassword: false })
    expectAppError(() => reportsService.dashboard(ctx.db), ErrorCodes.FORBIDDEN)
    setSession(null)
    expectAppError(() => reportsService.dashboard(ctx.db), ErrorCodes.SESSION_EXPIRED)
  })
})

describe('sales trend', () => {
  it('groups per-day rows into day, week and month buckets without losing totals', () => {
    const byDay = reportsService.trend(ctx.db, from, to, 'day')
    expect(byDay.reduce((sum, point) => sum + point.salesCount, 0)).toBe(3)
    expect(byDay.reduce((sum, point) => sum + point.revenueCent, 0)).toBe(5200)
    expect(byDay).toHaveLength(2) // today + yesterday; the voided sale is excluded

    const byWeek = reportsService.trend(ctx.db, from, to, 'week')
    expect(byWeek.reduce((sum, point) => sum + point.salesCount, 0)).toBe(3)
    expect(byWeek.reduce((sum, point) => sum + point.revenueCent, 0)).toBe(5200)
    expect(byWeek.length).toBeLessThanOrEqual(byDay.length)

    const byMonth = reportsService.trend(ctx.db, from, to, 'month')
    expect(byMonth.reduce((sum, point) => sum + point.salesCount, 0)).toBe(3)
    expect(byMonth.every((point) => point.date.length === 7)).toBe(true)
  })

  it('buckets rows the same way in the pure grouping helper', () => {
    const rows = [
      { day: '2026-10-19', sales_count: 1, revenue_cent: 1000, discount_cent: 0, tax_cent: 100, cost_cent: 400 },
      { day: '2026-10-20', sales_count: 2, revenue_cent: 2000, discount_cent: 0, tax_cent: 200, cost_cent: 800 },
      { day: '2026-10-21', sales_count: 1, revenue_cent: 500, discount_cent: 0, tax_cent: 50, cost_cent: 100 }
    ]

    const days = reportsService.groupDailyRows(rows, 'day')
    expect(days).toHaveLength(3)
    expect(days[1]).toMatchObject({ date: '2026-10-20', salesCount: 2, revenueCent: 2000, profitCent: 1200 })

    const weeks = reportsService.groupDailyRows(rows, 'week') // 19-21 Oct 2026 is one Mon-Sun week
    expect(weeks).toHaveLength(1)
    expect(weeks[0]).toMatchObject({ date: '2026-10-19', salesCount: 4, revenueCent: 3500, profitCent: 2200 })

    const months = reportsService.groupDailyRows(rows, 'month')
    expect(months).toHaveLength(1)
    expect(months[0].date).toBe('2026-10')
  })

  it('is owner-only', () => {
    setSession({ id: 1, username: 'owner', fullName: 'Shop Owner', role: 'cashier', mustChangePassword: false })
    expectAppError(() => reportsService.trend(ctx.db, from, to, 'day'), ErrorCodes.FORBIDDEN)
  })
})

describe('top products, profit and valuation', () => {
  it('ranks products by quantity sold inside the range', () => {
    const rows = reportsService.topProducts(ctx.db, from, to, 10)

    expect(rows[0].sku).toBe('COC-290')
    expect(rows[0].quantitySold).toBe(3) // 2 today + 1 yesterday; the voided sale does not count
    expect(rows[0].revenueCent).toBe(4500)
    expect(rows[0].profitCent).toBe(900)

    const water = rows.find((row) => row.sku === 'H2O-500')
    expect(water).toMatchObject({ quantitySold: 1, revenueCent: 1200, profitCent: 400 })
    expect(rows.some((row) => row.sku === 'NES-3IN1')).toBe(false)
  })

  it('separates completed sales from voided ones in the profit summary', () => {
    const summary = reportsService.profit(ctx.db, from, to)

    expect(summary.salesCount).toBe(3)
    expect(summary.voidedCount).toBe(1)
    expect(summary.revenueCent).toBe(5200)
    expect(summary.discountCent).toBe(500)
    expect(summary.taxCent).toBe(557) // 321 + 75 + 161
    expect(summary.costCent).toBe(4400)
    expect(summary.profitCent).toBe(800)
    expect(summary.from).toBe(from)
    expect(summary.to).toBe(to)
  })

  it('values stock at cost and at retail', () => {
    const valuation = reportsService.valuation(ctx.db)
    const row = ctx.db
      .prepare(
        `SELECT COALESCE(SUM(stock_qty), 0) AS units,
                COALESCE(SUM(stock_qty * cost_price_cent), 0) AS cost,
                COALESCE(SUM(stock_qty * selling_price_cent), 0) AS retail
         FROM products WHERE is_active = 1`
      )
      .get() as { units: number; cost: number; retail: number }

    expect(valuation.productCount).toBe(12)
    expect(valuation.totalUnits).toBe(row.units)
    expect(valuation.costValueCent).toBe(row.cost)
    expect(valuation.retailValueCent).toBe(row.retail)
  })

  it('resolves report range presets', () => {
    const today = reportsService.resolveReportRange('today')
    expect(today.from).toBe(toDateKey())
    expect(today.to).toBe(toDateKey())

    const lastWeek = reportsService.resolveReportRange('last_week')
    expect(lastWeek.from < lastWeek.to).toBe(true)
  })
})

describe('report exports', () => {
  it('builds a CSV for every report with a BOM and a title', () => {
    const sales = reportsService.buildReportCsv(ctx.db, 'sales', from, to)
    expect(sales.csv.charCodeAt(0)).toBe(0xfeff)
    expect(sales.rows).toBe(4) // completed + voided; the status column tells them apart
    expect(sales.title).toContain('Sales')
    expect(sales.csv).toContain('receipt_no')
    expect(sales.csv).toContain(saleToday.receiptNo)
    expect(sales.csv).toContain(saleYesterday.receiptNo)
    expect(sales.csv).toContain('Voided')

    const top = reportsService.buildReportCsv(ctx.db, 'top_products', from, to)
    expect(top.rows).toBe(2)
    expect(top.csv).toContain('COC-290')

    const profit = reportsService.buildReportCsv(ctx.db, 'profit', from, to)
    expect(profit.csv).toContain('TOTAL')
    expect(profit.rows).toBe(3) // 2 days with completed sales + the TOTAL row

    const valuation = reportsService.buildReportCsv(ctx.db, 'valuation', from, to)
    expect(valuation.rows).toBe(12)
    expect(valuation.title).toBe('Stock valuation')
    expect(valuation.csv).toContain('retail_value')
  })

  it('builds a document payload for every report', () => {
    const sales = reportsService.buildReportPayload(ctx.db, 'sales', from, to, '₱')
    expect(sales.title).toBe('Sales report')
    expect(sales.subtitle).toContain('/')
    expect(sales.sections[0].rows).toHaveLength(4)

    const top = reportsService.buildReportPayload(ctx.db, 'top_products', from, to, '\u20b1')
    expect(top.title).toBe('Top selling products')
    expect(top.sections[0].rows?.length).toBe(2)

    const profit = reportsService.buildReportPayload(ctx.db, 'profit', from, to, '\u20b1')
    expect(profit.title).toBe('Profit report')
    const labels = (profit.sections[0].lines ?? []).map((line) => line.label)
    expect(labels).toContain('Profit')
    expect(labels).toContain('Voided sales')

    const valuation = reportsService.buildReportPayload(ctx.db, 'valuation', from, to, '\u20b1')
    expect(valuation.title).toBe('Stock valuation')
    expect(valuation.sections).toHaveLength(2)
  })
})

describe('sales listing', () => {
  it('filters by date range, status and receipt search', () => {
    const all = salesService.listSales(ctx.db, { limit: 50 })
    expect(all.total).toBe(4)

    const completed = salesService.listSales(ctx.db, { status: 'completed' })
    expect(completed.total).toBe(3)

    const voided = salesService.listSales(ctx.db, { status: 'voided' })
    expect(voided.total).toBe(1)
    expect(voided.items[0].status).toBe('voided')
    expect(voided.items[0].voidReason).toBe('Customer left the store')

    const yesterdayOnly = salesService.listSales(ctx.db, {
      from: addDays(toDateKey(), -1),
      to: addDays(toDateKey(), -1)
    })
    expect(yesterdayOnly.total).toBe(1)
    expect(yesterdayOnly.items[0].receiptNo).toBe(saleYesterday.receiptNo)

    const byReceipt = salesService.listSales(ctx.db, { search: saleToday.receiptNo })
    expect(byReceipt.total).toBe(1)
    expect(byReceipt.items[0].id).toBe(saleToday.id)
  })

  it('needs a session', () => {
    setSession(null)
    expectAppError(() => salesService.listSales(ctx.db, {}), ErrorCodes.SESSION_EXPIRED)
  })
})
