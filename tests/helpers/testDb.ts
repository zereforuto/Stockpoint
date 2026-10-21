import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { openDatabase, type Db } from '../../src/main/db/database'
import { migrate } from '../../src/main/db/migrate'
import { seedDatabase } from '../../src/main/db/seed'
import { setSession } from '../../src/main/session'
import { AppError } from '../../src/shared/errors'
import type { DiscountInput, SaleInput, SaleLineInput } from '../../src/shared/types'

/** Runs `fn` and asserts it threw an `AppError` with the expected code. */
export function expectAppError(fn: () => unknown, code: string): AppError {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe(code)
    return error as AppError
  }
  throw new Error(`Expected an AppError with code ${code}, but nothing was thrown`)
}

export interface TestContext {
  db: Db
  /** Temporary directory that owns this database (handy for export tests). */
  dir: string
  /** Looks up a demo product id by SKU (seeded catalogue). */
  productId(sku: string): number
  stockOf(sku: string): number
  salesCount(): number
  close(): void
}

/** Fresh on-disk database (migrated + seeded) with an owner session active. */
export function createTestDb(options: { demoData?: boolean } = {}): TestContext {
  const dir = mkdtempSync(join(tmpdir(), 'stockpoint-test-'))
  const db = openDatabase(join(dir, 'test.db'))
  migrate(db)
  seedDatabase(db, { demoData: options.demoData ?? true })

  setSession({ id: 1, username: 'owner', fullName: 'Shop Owner', role: 'owner', mustChangePassword: false })

  const productId = (sku: string): number => {
    const row = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku) as { id: number } | undefined
    if (!row) throw new Error(`No seeded product with SKU "${sku}"`)
    return row.id
  }
  const stockOf = (sku: string): number => {
    const row = db.prepare('SELECT stock_qty AS qty FROM products WHERE sku = ?').get(sku) as
      | { qty: number }
      | undefined
    if (!row) throw new Error(`No seeded product with SKU "${sku}"`)
    return row.qty
  }
  const salesCount = (): number => (db.prepare('SELECT COUNT(*) AS n FROM sales').get() as { n: number }).n

  return {
    db,
    dir,
    productId,
    stockOf,
    salesCount,
    close: () => {
      try {
        db.close()
      } catch {
        // already closed
      }
      setSession(null)
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

const NO_DISCOUNT: DiscountInput = { type: 'none', value: 0 }

/** Card sales do not need a tendered amount: it always equals the total. */
export function cardSale(items: SaleLineInput[], discount: DiscountInput = NO_DISCOUNT): SaleInput {
  return { items, discount, payment: { method: 'card', amountTenderedCent: 0 } }
}

export function cashSale(
  items: SaleLineInput[],
  tenderedCent: number,
  discount: DiscountInput = NO_DISCOUNT
): SaleInput {
  return { items, discount, payment: { method: 'cash', amountTenderedCent: tenderedCent } }
}
