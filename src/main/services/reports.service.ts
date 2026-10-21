import { csvSerialize } from '../../shared/csv'
import { centsToDecimalString, formatCents } from '../../shared/money'
import { paymentMethodLabel, saleStatusLabel } from '../../shared/format'
import { formatDisplayDate, resolveRange, startOfWeek, toDateKey, type DateKey } from '../../shared/times'
import type {
  DashboardData,
  ProfitSummary,
  SalesTrendPoint,
  StockValuation,
  TopProductRow
} from '../../shared/types'
import type { ReportName, TrendGroupBy } from '../../shared/ipc'
import type { Db } from '../db/database'
import * as productsRepo from '../repos/products.repo'
import * as reportsRepo from '../repos/reports.repo'
import * as salesRepo from '../repos/sales.repo'
import { requireOwner } from '../session'

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_7_days'
  | 'last_30_days'

export function resolveReportRange(preset: RangePreset): { from: DateKey; to: DateKey } {
  return resolveRange(preset)
}

export function dashboard(db: Db): DashboardData {
  requireOwner()
  const today = toDateKey()
  const stats = reportsRepo.todayStats(db, today)
  return {
    today: {
      salesCount: stats.salesCount,
      revenueCent: stats.revenueCent,
      profitCent: stats.revenueCent - stats.costCent
    },
    lowStock: productsRepo.listLowStockProducts(db, 10),
    recentSales: salesRepo.listSales(db, { limit: 8 }).items,
    ...countProductStats(db),
    stockValuation: reportsRepo.stockValuation(db)
  }
}

function countProductStats(db: Db): { productCount: number; outOfStockCount: number } {
  const counts = reportsRepo.countProducts(db)
  return { productCount: counts.total, outOfStockCount: counts.outOfStock }
}

/** Groups per-day rows into day/week/month buckets (weeks start on Monday). */
export function groupDailyRows(rows: reportsRepo.DailySalesRow[], groupBy: TrendGroupBy): SalesTrendPoint[] {
  const mapRow = (row: reportsRepo.DailySalesRow): SalesTrendPoint => ({
    date: row.day,
    salesCount: row.sales_count,
    revenueCent: row.revenue_cent,
    profitCent: row.revenue_cent - row.cost_cent
  })

  if (groupBy === 'day') {
    return rows.map(mapRow)
  }

  const buckets = new Map<string, SalesTrendPoint>()
  for (const row of rows) {
    const key = groupBy === 'week' ? startOfWeek(row.day) : row.day.slice(0, 7)
    const existing = buckets.get(key)
    const mapped = mapRow(row)
    if (existing) {
      existing.salesCount += mapped.salesCount
      existing.revenueCent += mapped.revenueCent
      existing.profitCent += mapped.profitCent
    } else {
      buckets.set(key, { ...mapped, date: key })
    }
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function trend(db: Db, from: string, to: string, groupBy: TrendGroupBy): SalesTrendPoint[] {
  requireOwner()
  return groupDailyRows(reportsRepo.dailySales(db, from, to), groupBy)
}

export function topProducts(db: Db, from: string, to: string, limit: number): TopProductRow[] {
  requireOwner()
  return reportsRepo.topSellingProducts(db, from, to, limit)
}

export function profit(db: Db, from: string, to: string): ProfitSummary {
  requireOwner()
  return reportsRepo.profitForRange(db, from, to)
}

export function valuation(db: Db): StockValuation {
  requireOwner()
  return reportsRepo.stockValuation(db)
}

export interface ReportCsvResult {
  csv: string
  rows: number
  title: string
}

/** Builds the CSV payload (with BOM) for the requested report. */
export function buildReportCsv(db: Db, report: ReportName, from: string, to: string): ReportCsvResult {
  requireOwner()
  switch (report) {
    case 'sales': {
      const sales = salesRepo.listSales(db, { from, to, status: 'all', limit: 10000 }).items
      const rows: Array<Array<string | number | boolean | null>> = [
        ['receipt_no', 'date', 'cashier', 'items', 'subtotal', 'discount', 'tax', 'total', 'payment', 'status'],
        ...sales.map((sale) => [
          sale.receiptNo,
          sale.createdAt,
          sale.cashierName,
          sale.itemCount,
          centsToDecimalString(sale.subtotalCent),
          centsToDecimalString(sale.discountCent),
          centsToDecimalString(sale.taxCent),
          centsToDecimalString(sale.totalCent),
          paymentMethodLabel(sale.paymentMethod),
          saleStatusLabel(sale.status)
        ])
      ]
      return { csv: csvSerialize(rows), rows: sales.length, title: `Sales ${from} to ${to}` }
    }
    case 'top_products': {
      const products = reportsRepo.topSellingProducts(db, from, to, 500)
      const rows: Array<Array<string | number | boolean | null>> = [
        ['product', 'sku', 'quantity_sold', 'revenue', 'profit'],
        ...products.map((product) => [
          product.productName,
          product.sku,
          product.quantitySold,
          centsToDecimalString(product.revenueCent),
          centsToDecimalString(product.profitCent)
        ])
      ]
      return { csv: csvSerialize(rows), rows: products.length, title: `Top products ${from} to ${to}` }
    }
    case 'profit': {
      const days = reportsRepo.dailySales(db, from, to)
      const summary = reportsRepo.profitForRange(db, from, to)
      const rows: Array<Array<string | number | boolean | null>> = [
        ['date', 'sales', 'revenue', 'cost', 'profit'],
        ...days.map((day) => [
          day.day,
          day.sales_count,
          centsToDecimalString(day.revenue_cent),
          centsToDecimalString(day.cost_cent),
          centsToDecimalString(day.revenue_cent - day.cost_cent)
        ]),
        [
          'TOTAL',
          summary.salesCount,
          centsToDecimalString(summary.revenueCent),
          centsToDecimalString(summary.costCent),
          centsToDecimalString(summary.profitCent)
        ]
      ]
      return { csv: csvSerialize(rows), rows: days.length + 1, title: `Profit ${from} to ${to}` }
    }
    case 'valuation': {
      const stock = productsRepo.listAllProductsWithStock(db)
      const rows: Array<Array<string | number | boolean | null>> = [
        ['product', 'sku', 'stock_qty', 'cost_price', 'selling_price', 'cost_value', 'retail_value'],
        ...stock.map((product) => [
          product.name,
          product.sku,
          product.stockQty,
          centsToDecimalString(product.costPriceCent),
          centsToDecimalString(product.sellingPriceCent),
          centsToDecimalString(product.stockQty * product.costPriceCent),
          centsToDecimalString(product.stockQty * product.sellingPriceCent)
        ])
      ]
      return { csv: csvSerialize(rows), rows: stock.length, title: 'Stock valuation' }
    }
  }
}

/** Structured payload for the PDF document builder (shared/reportHtml). */
export interface ReportDocumentPayload {
  title: string
  subtitle: string
  sections: {
    title: string
    columns?: string[]
    rows?: string[][]
    lines?: { label: string; value: string; strong?: boolean }[]
  }[]
}

export function buildReportPayload(db: Db, report: ReportName, from: string, to: string, currencySymbol: string): ReportDocumentPayload {
  requireOwner()
  const range = `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`
  const money = (cents: number): string => `${formatCents(cents)}${currencySymbol}`

  switch (report) {
    case 'sales': {
      const sales = salesRepo.listSales(db, { from, to, status: 'all', limit: 2000 }).items
      return {
        title: 'Sales report',
        subtitle: range,
        sections: [
          {
            title: 'Transactions',
            columns: ['Receipt', 'Date', 'Cashier', 'Items', 'Total', 'Status'],
            rows: sales.map((sale) => [
              sale.receiptNo,
              sale.createdAt.slice(0, 16),
              sale.cashierName,
              String(sale.itemCount),
              money(sale.totalCent),
              saleStatusLabel(sale.status)
            ])
          }
        ]
      }
    }
    case 'top_products': {
      const products = reportsRepo.topSellingProducts(db, from, to, 20)
      return {
        title: 'Top selling products',
        subtitle: range,
        sections: [
          {
            title: 'Ranking',
            columns: ['Product', 'SKU', 'Qty', 'Revenue', 'Profit'],
            rows: products.map((product) => [
              product.productName,
              product.sku,
              String(product.quantitySold),
              money(product.revenueCent),
              money(product.profitCent)
            ])
          }
        ]
      }
    }
    case 'profit': {
      const summary = reportsRepo.profitForRange(db, from, to)
      return {
        title: 'Profit report',
        subtitle: range,
        sections: [
          {
            title: 'Summary',
            lines: [
              { label: 'Sales', value: String(summary.salesCount) },
              { label: 'Voided sales', value: String(summary.voidedCount) },
              { label: 'Revenue', value: money(summary.revenueCent) },
              { label: 'Cost of goods', value: money(summary.costCent) },
              { label: 'Discounts given', value: money(summary.discountCent) },
              { label: 'Tax collected', value: money(summary.taxCent) },
              { label: 'Profit', value: money(summary.profitCent), strong: true }
            ]
          }
        ]
      }
    }
    case 'valuation': {
      const stock = productsRepo.listAllProductsWithStock(db)
      const totals = reportsRepo.stockValuation(db)
      return {
        title: 'Stock valuation',
        subtitle: range,
        sections: [
          {
            title: 'Inventory',
            columns: ['Product', 'SKU', 'Qty', 'Cost value', 'Retail value'],
            rows: stock.map((product) => [
              product.name,
              product.sku,
              String(product.stockQty),
              money(product.stockQty * product.costPriceCent),
              money(product.stockQty * product.sellingPriceCent)
            ])
          },
          {
            title: 'Totals',
            lines: [
              { label: 'Active products', value: String(totals.productCount) },
              { label: 'Units in stock', value: String(totals.totalUnits) },
              { label: 'Value at cost', value: money(totals.costValueCent), strong: true },
              { label: 'Value at retail', value: money(totals.retailValueCent), strong: true }
            ]
          }
        ]
      }
    }
  }
}
