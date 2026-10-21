import type { Category } from '../../shared/types'
import { localNow } from '../../shared/times'
import type { Db } from '../db/database'

interface CategoryRow {
  id: number
  name: string
  sort_order: number
}

function mapCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, sortOrder: row.sort_order }
}

export function listCategories(db: Db): Category[] {
  const rows = db
    .prepare('SELECT id, name, sort_order FROM categories ORDER BY sort_order, name COLLATE NOCASE')
    .all() as CategoryRow[]
  return rows.map(mapCategory)
}

export function findCategoryById(db: Db, id: number): Category | null {
  const row = db.prepare('SELECT id, name, sort_order FROM categories WHERE id = ?').get(id) as
    | CategoryRow
    | undefined
  return row ? mapCategory(row) : null
}

export function findCategoryByName(db: Db, name: string): Category | null {
  const row = db
    .prepare('SELECT id, name, sort_order FROM categories WHERE name = ? COLLATE NOCASE')
    .get(name) as CategoryRow | undefined
  return row ? mapCategory(row) : null
}

export function insertCategory(db: Db, name: string, sortOrder: number): Category {
  const info = db
    .prepare('INSERT INTO categories (name, sort_order, created_at) VALUES (?, ?, ?)')
    .run(name, sortOrder, localNow())
  return findCategoryById(db, Number(info.lastInsertRowid)) as Category
}

export function updateCategory(db: Db, id: number, name: string): Category {
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id)
  return findCategoryById(db, id) as Category
}

export function deleteCategory(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM categories WHERE id = ?').run(id).changes > 0
}

export function nextCategorySortOrder(db: Db): number {
  const row = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories').get() as { n: number }
  return row.n + 1
}
