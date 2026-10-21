import type { ProfitSummary, StockValuation, TopProductRow } from '../../shared/types'
import type { Db } from '../db/database'

/** Per-day sales aggregates for completed sales inside [from, to] (inclusive). */
export interface DailySalesRow {
  day: string
  sales_count: number
  revenue_cent: number
  discount_cent: number
  tax_cent: number
  cost_cent: number
}

export function dailySales(db: Db, from: string, to: string): DailySalesRow[] {
  const revenueRows = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day,
              COUNT(*) AS sales_count,
              COALESCE(SUM(total_cent), 0) AS revenue_cent,
              COALESCE(SUM(discount_cent), 0) AS discount_cent,
              COALESCE(SUM(tax_cent), 0) AS tax_cent
       FROM sales
       WHERE status = 'completed' AND substr(created_at, 1, 10) BETWEEN ? AND ?
       GROUP BY day`
    )
    .all(from, to) as Omit<DailySalesRow, 'cost_cent'>[]

  const costRows = db
    .prepare(
      `SELECT substr(s.created_at, 1, 10) AS day,
              COALESCE(SUM(it.cost_price_cent * it.quantity), 0) AS cost_cent
       FROM sale_items it
       JOIN sales s ON s.id = it.sale_id
       WHERE s.status = 'completed' AND substr(s.created_at, 1, 10) BETWEEN ? AND ?
       GROUP BY day`
    )
    .all(from, to) as { day: string; cost_cent: number }[]

  const costs = new Map(costRows.map((row) => [row.day, row.cost_cent]))
  return revenueRows.map((row) => ({ ...row, cost_cent: costs.get(row.day) ?? 0 }))
}

export function topSellingProducts(db: Db, from: string, to: string, limit: number): TopProductRow[] {
  const rows = db
    .prepare(
      `SELECT it.product_id AS product_id,
              MAX(it.product_name) AS product_name,
              MAX(it.sku) AS sku,
              SUM(it.quantity) AS quantity_sold,
              SUM(it.line_total_cent) AS revenue_cent,
              SUM((it.unit_price_cent - it.cost_price_cent) * it.quantity) AS profit_cent
       FROM sale_items it
       JOIN sales s ON s.id = it.sale_id
       WHERE s.status = 'completed' AND substr(s.created_at, 1, 10) BETWEEN ? AND ?
       GROUP BY it.product_id
       ORDER BY quantity_sold DESC, revenue_cent DESC
       LIMIT ?`
    )
    .all(from, to, limit) as {
    product_id: number
    product_name: string
    sku: string
    quantity_sold: number
    revenue_cent: number
    profit_cent: number
  }[]

  return rows.map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    quantitySold: row.quantity_sold,
    revenueCent: row.revenue_cent,
    profitCent: row.profit_cent
  }))
}

export function profitForRange(db: Db, from: string, to: string): ProfitSummary {
  const sales = db
    .prepare(
      `SELECT COUNT(*) AS sales_count,
              COALESCE(SUM(total_cent), 0) AS revenue_cent,
              COALESCE(SUM(discount_cent), 0) AS discount_cent,
              COALESCE(SUM(tax_cent), 0) AS tax_cent
       FROM sales
       WHERE status = 'completed' AND substr(created_at, 1, 10) BETWEEN ? AND ?`
    )
    .get(from, to) as {
    sales_count: number
    revenue_cent: number
    discount_cent: number
    tax_cent: number
  }

  const voided = db
    .prepare(
      "SELECT COUNT(*) AS n FROM sales WHERE status = 'voided' AND substr(created_at, 1, 10) BETWEEN ? AND ?"
    )
    .get(from, to) as { n: number }

  const cost = db
    .prepare(
      `SELECT COALESCE(SUM(it.cost_price_cent * it.quantity), 0) AS cost_cent
       FROM sale_items it
       JOIN sales s ON s.id = it.sale_id
       WHERE s.status = 'completed' AND substr(s.created_at, 1, 10) BETWEEN ? AND ?`
    )
    .get(from, to) as { cost_cent: number }

  return {
    from,
    to,
    salesCount: sales.sales_count,
    voidedCount: voided.n,
    revenueCent: sales.revenue_cent,
    costCent: cost.cost_cent,
    profitCent: sales.revenue_cent - cost.cost_cent,
    discountCent: sales.discount_cent,
    taxCent: sales.tax_cent
  }
}

export function stockValuation(db: Db): StockValuation {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS product_count,
              COALESCE(SUM(stock_qty), 0) AS total_units,
              COALESCE(SUM(stock_qty * cost_price_cent), 0) AS cost_value_cent,
              COALESCE(SUM(stock_qty * selling_price_cent), 0) AS retail_value_cent
       FROM products
       WHERE is_active = 1`
    )
    .get() as {
    product_count: number
    total_units: number
    cost_value_cent: number
    retail_value_cent: number
  }
  return {
    productCount: row.product_count,
    totalUnits: row.total_units,
    costValueCent: row.cost_value_cent,
    retailValueCent: row.retail_value_cent
  }
}

export interface TodayStats {
  salesCount: number
  revenueCent: number
  costCent: number
}

export function todayStats(db: Db, dateKey: string): TodayStats {
  const sales = db
    .prepare(
      `SELECT COUNT(*) AS sales_count, COALESCE(SUM(total_cent), 0) AS revenue_cent
       FROM sales
       WHERE status = 'completed' AND substr(created_at, 1, 10) = ?`
    )
    .get(dateKey) as { sales_count: number; revenue_cent: number }
  const cost = db
    .prepare(
      `SELECT COALESCE(SUM(it.cost_price_cent * it.quantity), 0) AS cost_cent
       FROM sale_items it
       JOIN sales s ON s.id = it.sale_id
       WHERE s.status = 'completed' AND substr(s.created_at, 1, 10) = ?`
    )
    .get(dateKey) as { cost_cent: number }
  return { salesCount: sales.sales_count, revenueCent: sales.revenue_cent, costCent: cost.cost_cent }
}

export function countProducts(db: Db): { total: number; outOfStock: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN stock_qty = 0 THEN 1 ELSE 0 END) AS out_of_stock
       FROM products WHERE is_active = 1`
    )
    .get() as { total: number; out_of_stock: number | null }
  return { total: row.total, outOfStock: row.out_of_stock ?? 0 }
}
