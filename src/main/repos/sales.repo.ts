import type {
  DiscountType,
  Payment,
  PaymentMethod,
  Sale,
  SaleDetail,
  SaleItem,
  SaleQuery,
  SaleStatus,
  SaleSummary
} from '../../shared/types'
import type { Db } from '../db/database'

interface SaleRow {
  id: number
  receipt_no: string
  cashier_id: number
  cashier_name: string
  created_at: string
  subtotal_cent: number
  discount_type: DiscountType
  discount_value_cent: number
  discount_cent: number
  tax_cent: number
  total_cent: number
  payment_method: PaymentMethod
  amount_tendered_cent: number
  change_cent: number
  status: SaleStatus
  void_reason: string | null
  voided_by: number | null
  voided_by_name: string | null
  voided_at: string | null
  item_count: number | null
}

interface SaleItemRow {
  id: number
  product_id: number
  product_name: string
  sku: string
  cost_price_cent: number
  unit_price_cent: number
  quantity: number
  line_total_cent: number
}

interface PaymentRow {
  id: number
  method: PaymentMethod
  amount_cent: number
  reference: string | null
}

const SALE_SELECT = `
  SELECT s.id, s.receipt_no, s.cashier_id, u.full_name AS cashier_name, s.created_at,
         s.subtotal_cent, s.discount_type, s.discount_value_cent, s.discount_cent, s.tax_cent, s.total_cent,
         s.payment_method, s.amount_tendered_cent, s.change_cent, s.status, s.void_reason, s.voided_by,
         vu.full_name AS voided_by_name, s.voided_at, si.item_count
  FROM sales s
  JOIN users u ON u.id = s.cashier_id
  LEFT JOIN users vu ON vu.id = s.voided_by
  LEFT JOIN (SELECT sale_id, COUNT(*) AS item_count FROM sale_items GROUP BY sale_id) si ON si.sale_id = s.id
`

function mapSale(row: SaleRow): Sale {
  return {
    id: row.id,
    receiptNo: row.receipt_no,
    cashierId: row.cashier_id,
    cashierName: row.cashier_name,
    createdAt: row.created_at,
    subtotalCent: row.subtotal_cent,
    discountType: row.discount_type,
    discountValueCent: row.discount_value_cent,
    discountCent: row.discount_cent,
    taxCent: row.tax_cent,
    totalCent: row.total_cent,
    paymentMethod: row.payment_method,
    amountTenderedCent: row.amount_tendered_cent,
    changeCent: row.change_cent,
    status: row.status,
    voidReason: row.void_reason,
    voidedBy: row.voided_by,
    voidedByName: row.voided_by_name,
    voidedAt: row.voided_at
  }
}

function mapItem(row: SaleItemRow): SaleItem {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    costPriceCent: row.cost_price_cent,
    unitPriceCent: row.unit_price_cent,
    quantity: row.quantity,
    lineTotalCent: row.line_total_cent
  }
}

function mapPayment(row: PaymentRow): Payment {
  return { id: row.id, method: row.method, amountCent: row.amount_cent, reference: row.reference }
}

export interface InsertSaleInput {
  receiptNo: string
  cashierId: number
  subtotalCent: number
  discountType: DiscountType
  discountValueCent: number
  discountCent: number
  taxCent: number
  totalCent: number
  paymentMethod: PaymentMethod
  amountTenderedCent: number
  changeCent: number
  createdAt: string
}

export function insertSale(db: Db, input: InsertSaleInput): number {
  const info = db
    .prepare(
      `INSERT INTO sales (receipt_no, cashier_id, subtotal_cent, discount_type, discount_value_cent, discount_cent,
                          tax_cent, total_cent, payment_method, amount_tendered_cent, change_cent, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`
    )
    .run(
      input.receiptNo,
      input.cashierId,
      input.subtotalCent,
      input.discountType,
      input.discountValueCent,
      input.discountCent,
      input.taxCent,
      input.totalCent,
      input.paymentMethod,
      input.amountTenderedCent,
      input.changeCent,
      input.createdAt
    )
  return Number(info.lastInsertRowid)
}

export interface InsertSaleItemInput {
  saleId: number
  productId: number
  productName: string
  sku: string
  costPriceCent: number
  unitPriceCent: number
  quantity: number
  lineTotalCent: number
}

export function insertSaleItem(db: Db, input: InsertSaleItemInput): number {
  const info = db
    .prepare(
      `INSERT INTO sale_items (sale_id, product_id, product_name, sku, cost_price_cent, unit_price_cent, quantity, line_total_cent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.saleId,
      input.productId,
      input.productName,
      input.sku,
      input.costPriceCent,
      input.unitPriceCent,
      input.quantity,
      input.lineTotalCent
    )
  return Number(info.lastInsertRowid)
}

export interface InsertPaymentInput {
  saleId: number
  method: PaymentMethod
  amountCent: number
  reference?: string | null
  createdAt: string
}

export function insertPayment(db: Db, input: InsertPaymentInput): number {
  const info = db
    .prepare('INSERT INTO payments (sale_id, method, amount_cent, reference, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(input.saleId, input.method, input.amountCent, input.reference ?? null, input.createdAt)
  return Number(info.lastInsertRowid)
}

/** How many receipts were already issued on the given local date. */
export function countSalesOnDate(db: Db, dateKey: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM sales WHERE substr(created_at, 1, 10) = ?")
    .get(dateKey) as { n: number }
  return row.n
}

export function getSaleStatus(db: Db, id: number): SaleStatus | null {
  const row = db.prepare('SELECT status FROM sales WHERE id = ?').get(id) as { status: SaleStatus } | undefined
  return row?.status ?? null
}

export function getSaleSummary(db: Db, id: number): SaleSummary | null {
  const row = db.prepare(`${SALE_SELECT} WHERE s.id = ?`).get(id) as SaleRow | undefined
  if (!row) return null
  return { ...mapSale(row), itemCount: row.item_count ?? 0 }
}

export function getSaleDetail(db: Db, id: number): SaleDetail | null {
  const row = db.prepare(`${SALE_SELECT} WHERE s.id = ?`).get(id) as SaleRow | undefined
  if (!row) return null
  const items = db
    .prepare(
      `SELECT id, product_id, product_name, sku, cost_price_cent, unit_price_cent, quantity, line_total_cent
       FROM sale_items WHERE sale_id = ? ORDER BY id`
    )
    .all(id) as SaleItemRow[]
  const payments = db
    .prepare('SELECT id, method, amount_cent, reference FROM payments WHERE sale_id = ? ORDER BY id')
    .all(id) as PaymentRow[]
  return { ...mapSale(row), items: items.map(mapItem), payments: payments.map(mapPayment) }
}

export function listSales(db: Db, query: SaleQuery = {}): { items: SaleSummary[]; total: number } {
  const where: string[] = []
  const params: unknown[] = []

  if (query.from) {
    where.push('substr(s.created_at, 1, 10) >= ?')
    params.push(query.from)
  }
  if (query.to) {
    where.push('substr(s.created_at, 1, 10) <= ?')
    params.push(query.to)
  }
  if (query.status && query.status !== 'all') {
    where.push('s.status = ?')
    params.push(query.status)
  }
  if (query.method && query.method !== 'all') {
    where.push('s.payment_method = ?')
    params.push(query.method)
  }
  if (query.cashierId) {
    where.push('s.cashier_id = ?')
    params.push(query.cashierId)
  }
  if (query.search) {
    where.push(
      '(s.receipt_no LIKE ? OR u.full_name LIKE ? OR EXISTS (SELECT 1 FROM sale_items it WHERE it.sale_id = s.id AND it.product_name LIKE ?))'
    )
    const like = `%${query.search}%`
    params.push(like, like, like)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const countSql = `SELECT COUNT(*) AS n FROM sales s JOIN users u ON u.id = s.cashier_id ${whereSql}`
  const total = (db.prepare(countSql).get(...params) as { n: number }).n

  const limit = query.limit ?? 50
  const offset = query.offset ?? 0
  const rows = db
    .prepare(`${SALE_SELECT} ${whereSql} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as SaleRow[]

  return { items: rows.map((row) => ({ ...mapSale(row), itemCount: row.item_count ?? 0 })), total }
}

export function markSaleVoided(
  db: Db,
  id: number,
  reason: string,
  voidedBy: number,
  voidedAt: string
): void {
  db.prepare(
    `UPDATE sales SET status = 'voided', void_reason = ?, voided_by = ?, voided_at = ? WHERE id = ? AND status = 'completed'`
  ).run(reason, voidedBy, voidedAt, id)
}
