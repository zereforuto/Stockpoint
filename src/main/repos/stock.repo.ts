import type { StockMovement, StockMovementType } from '../../shared/types'
import type { Db } from '../db/database'

interface MovementRow {
  id: number
  product_id: number
  product_name: string
  delta: number
  type: StockMovementType
  reason: string | null
  ref_type: string | null
  ref_id: number | null
  user_id: number | null
  user_name: string | null
  created_at: string
}

const MOVEMENT_SELECT = `
  SELECT m.id, m.product_id, p.name AS product_name, m.delta, m.type, m.reason, m.ref_type, m.ref_id,
         m.user_id, u.full_name AS user_name, m.created_at
  FROM stock_movements m
  JOIN products p ON p.id = m.product_id
  LEFT JOIN users u ON u.id = m.user_id
`

function mapMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    delta: row.delta,
    type: row.type,
    reason: row.reason,
    refType: row.ref_type,
    refId: row.ref_id,
    userId: row.user_id,
    userName: row.user_name,
    createdAt: row.created_at
  }
}

export interface InsertMovementInput {
  productId: number
  delta: number
  type: StockMovementType
  reason?: string | null
  refType?: string | null
  refId?: number | null
  userId?: number | null
  createdAt: string
}

export function insertStockMovement(db: Db, input: InsertMovementInput): StockMovement {
  const info = db
    .prepare(
      `INSERT INTO stock_movements (product_id, delta, type, reason, ref_type, ref_id, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.productId,
      input.delta,
      input.type,
      input.reason ?? null,
      input.refType ?? null,
      input.refId ?? null,
      input.userId ?? null,
      input.createdAt
    )
  const row = db.prepare(`${MOVEMENT_SELECT} WHERE m.id = ?`).get(Number(info.lastInsertRowid)) as MovementRow
  return mapMovement(row)
}

export function listStockMovements(db: Db, filter: { productId?: number | null; limit?: number } = {}): StockMovement[] {
  const limit = filter.limit ?? 100
  if (filter.productId) {
    const rows = db
      .prepare(`${MOVEMENT_SELECT} WHERE m.product_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT ?`)
      .all(filter.productId, limit) as MovementRow[]
    return rows.map(mapMovement)
  }
  const rows = db
    .prepare(`${MOVEMENT_SELECT} ORDER BY m.created_at DESC, m.id DESC LIMIT ?`)
    .all(limit) as MovementRow[]
  return rows.map(mapMovement)
}
