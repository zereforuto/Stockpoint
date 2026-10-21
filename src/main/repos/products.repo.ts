import { localNow } from '../../shared/times'
import type { Product, ProductQuery } from '../../shared/types'
import type { Db } from '../db/database'

interface ProductRow {
  id: number
  name: string
  sku: string
  barcode: string | null
  category_id: number | null
  category_name: string | null
  cost_price_cent: number
  selling_price_cent: number
  stock_qty: number
  reorder_level: number
  image_path: string | null
  is_active: number
  created_at: string
  updated_at: string
}

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.sku, p.barcode, p.category_id, c.name AS category_name,
         p.cost_price_cent, p.selling_price_cent, p.stock_qty, p.reorder_level, p.image_path,
         p.is_active, p.created_at, p.updated_at
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.category_id,
    categoryName: row.category_name,
    costPriceCent: row.cost_price_cent,
    sellingPriceCent: row.selling_price_cent,
    stockQty: row.stock_qty,
    reorderLevel: row.reorder_level,
    imagePath: row.image_path,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function findProductById(db: Db, id: number): Product | null {
  const row = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id) as ProductRow | undefined
  return row ? mapProduct(row) : null
}

export interface ProductWriteInput {
  name: string
  sku: string
  barcode: string | null
  categoryId: number | null
  costPriceCent: number
  sellingPriceCent: number
  stockQty: number
  reorderLevel: number
  imagePath?: string | null
  isActive?: boolean
}

export function insertProduct(db: Db, input: ProductWriteInput, now = localNow()): Product {
  const info = db
    .prepare(
      `INSERT INTO products (name, sku, barcode, category_id, cost_price_cent, selling_price_cent, stock_qty, reorder_level, image_path, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.sku,
      input.barcode,
      input.categoryId,
      input.costPriceCent,
      input.sellingPriceCent,
      input.stockQty,
      input.reorderLevel,
      input.imagePath ?? null,
      input.isActive === false ? 0 : 1,
      now,
      now
    )
  return findProductById(db, Number(info.lastInsertRowid)) as Product
}

export function updateProduct(db: Db, id: number, input: ProductWriteInput, now = localNow()): Product {
  db.prepare(
    `UPDATE products
     SET name = ?, sku = ?, barcode = ?, category_id = ?, cost_price_cent = ?, selling_price_cent = ?,
         stock_qty = ?, reorder_level = ?, image_path = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name,
    input.sku,
    input.barcode,
    input.categoryId,
    input.costPriceCent,
    input.sellingPriceCent,
    input.stockQty,
    input.reorderLevel,
    input.imagePath ?? null,
    input.isActive === false ? 0 : 1,
    now,
    id
  )
  return findProductById(db, id) as Product
}

export function setProductActive(db: Db, id: number, isActive: boolean, now = localNow()): Product {
  db.prepare('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?').run(
    isActive ? 1 : 0,
    now,
    id
  )
  return findProductById(db, id) as Product
}

/** Returns the product id owning a SKU (excluding `excludeId`), for conflict checks. */
export function findProductIdBySku(db: Db, sku: string, excludeId?: number): number | null {
  const row =
    excludeId === undefined
      ? (db.prepare('SELECT id FROM products WHERE sku = ? COLLATE NOCASE LIMIT 1').get(sku) as
          | { id: number }
          | undefined)
      : (db
          .prepare('SELECT id FROM products WHERE sku = ? COLLATE NOCASE AND id <> ? LIMIT 1')
          .get(sku, excludeId) as { id: number } | undefined)
  return row?.id ?? null
}

/** Returns the product id owning a barcode (excluding `excludeId`), for conflict checks. */
export function findProductIdByBarcode(db: Db, barcode: string, excludeId?: number): number | null {
  const row =
    excludeId === undefined
      ? (db.prepare('SELECT id FROM products WHERE barcode = ? LIMIT 1').get(barcode) as
          | { id: number }
          | undefined)
      : (db.prepare('SELECT id FROM products WHERE barcode = ? AND id <> ? LIMIT 1').get(barcode, excludeId) as
          | { id: number }
          | undefined)
  return row?.id ?? null
}

export function listProducts(db: Db, query: ProductQuery = {}): { items: Product[]; total: number } {
  const where: string[] = []
  const params: unknown[] = []

  if (!query.includeInactive) where.push('p.is_active = 1')
  if (query.categoryId) {
    where.push('p.category_id = ?')
    params.push(query.categoryId)
  }
  if (query.search) {
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)')
    const like = `%${query.search}%`
    params.push(like, like, like)
  }
  if (query.lowStockOnly) where.push('p.stock_qty <= p.reorder_level')

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM products p ${whereSql}`).get(...params) as { n: number }).n
  const limit = query.limit ?? 50
  const offset = query.offset ?? 0
  const rows = db
    .prepare(`${PRODUCT_SELECT} ${whereSql} ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as ProductRow[]
  return { items: rows.map(mapProduct), total }
}

/** POS lookup: exact barcode/SKU first, then name matches. */
export function searchProducts(db: Db, term: string, limit = 20): Product[] {
  const like = `%${term}%`
  const rows = db
    .prepare(
      `${PRODUCT_SELECT}
       WHERE p.is_active = 1
         AND (p.barcode = ? OR p.sku = ? COLLATE NOCASE OR p.name LIKE ? OR p.sku LIKE ? COLLATE NOCASE OR p.barcode LIKE ?)
       ORDER BY CASE WHEN p.barcode = ? THEN 0 WHEN p.sku = ? COLLATE NOCASE THEN 1 ELSE 2 END,
                p.name COLLATE NOCASE
       LIMIT ?`
    )
    .all(term, term, like, like, like, term, term, limit) as ProductRow[]
  return rows.map(mapProduct)
}

export function listLowStockProducts(db: Db, limit = 50): Product[] {
  const rows = db
    .prepare(
      `${PRODUCT_SELECT}
       WHERE p.is_active = 1 AND p.stock_qty <= p.reorder_level
       ORDER BY (p.stock_qty - p.reorder_level) ASC, p.name COLLATE NOCASE
       LIMIT ?`
    )
    .all(limit) as ProductRow[]
  return rows.map(mapProduct)
}

/** Decrements stock only when there is enough of it; returns false when there is not. */
export function tryDecrementStock(db: Db, productId: number, quantity: number, now = localNow()): boolean {
  const info = db
    .prepare(
      'UPDATE products SET stock_qty = stock_qty - ?, updated_at = ? WHERE id = ? AND stock_qty >= ?'
    )
    .run(quantity, now, productId, quantity)
  return info.changes > 0
}

export function incrementStock(db: Db, productId: number, quantity: number, now = localNow()): void {
  db.prepare('UPDATE products SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?').run(
    quantity,
    now,
    productId
  )
}

export interface ProductSnapshot {
  id: number
  name: string
  sku: string
  costPriceCent: number
  sellingPriceCent: number
  stockQty: number
  isActive: boolean
}

export function findProductSnapshot(db: Db, id: number): ProductSnapshot | null {
  const row = db
    .prepare(
      'SELECT id, name, sku, cost_price_cent, selling_price_cent, stock_qty, is_active FROM products WHERE id = ?'
    )
    .get(id) as
    | {
        id: number
        name: string
        sku: string
        cost_price_cent: number
        selling_price_cent: number
        stock_qty: number
        is_active: number
      }
    | undefined
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    costPriceCent: row.cost_price_cent,
    sellingPriceCent: row.selling_price_cent,
    stockQty: row.stock_qty,
    isActive: row.is_active === 1
  }
}

export function listAllProductsWithStock(db: Db, includeInactive = false): Product[] {
  const rows = db
    .prepare(
      `${PRODUCT_SELECT} ${includeInactive ? '' : 'WHERE p.is_active = 1'} ORDER BY p.name COLLATE NOCASE`
    )
    .all() as ProductRow[]
  return rows.map(mapProduct)
}
