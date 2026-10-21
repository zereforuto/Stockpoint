import { hashSync } from 'bcryptjs'
import { localNow } from '../../shared/times'
import { transact, type Db } from './database'
import { DEFAULT_SETTINGS } from './defaults'

export const DEFAULT_OWNER = { username: 'owner', password: 'owner123' } as const

export interface SeedOptions {
  /** Insert a small demo catalogue on a brand new database. */
  demoData?: boolean
}

export interface SeedResult {
  ownerCreated: boolean
  settingsWritten: number
  demoProducts: number
}

interface DemoProduct {
  name: string
  sku: string
  barcode: string
  cost: number
  selling: number
  stock: number
  reorder: number
}

const DEMO_CATEGORIES: { name: string; products: DemoProduct[] }[] = [
  {
    name: 'Beverages',
    products: [
      { name: 'Coca-Cola 290ml', sku: 'COC-290', barcode: '4800001000012', cost: 1200, selling: 1500, stock: 48, reorder: 12 },
      { name: 'Bottled Water 500ml', sku: 'H2O-500', barcode: '4800001000029', cost: 800, selling: 1200, stock: 60, reorder: 12 },
      { name: 'Nescafe 3-in-1 Original (10s)', sku: 'NES-3IN1', barcode: '4800001000036', cost: 8500, selling: 10000, stock: 24, reorder: 6 }
    ]
  },
  {
    name: 'Snacks',
    products: [
      { name: 'Lucky Me Pancit Canton', sku: 'LMP-PC', barcode: '4800001000043', cost: 1200, selling: 1500, stock: 36, reorder: 12 },
      { name: 'Chippy Barbeque', sku: 'CHI-BBQ', barcode: '4800001000050', cost: 1000, selling: 1300, stock: 30, reorder: 10 },
      { name: 'Oishi Prawn Crackers', sku: 'OIS-PR', barcode: '4800001000067', cost: 1800, selling: 2200, stock: 25, reorder: 8 }
    ]
  },
  {
    name: 'Canned Goods',
    products: [
      { name: 'Century Tuna Flakes 180g', sku: 'CEN-180', barcode: '4800001000074', cost: 2800, selling: 3500, stock: 20, reorder: 6 },
      { name: 'Argentina Corned Beef 150g', sku: 'ARG-150', barcode: '4800001000081', cost: 3200, selling: 4000, stock: 18, reorder: 6 },
      { name: 'Alaska Evapada 370ml', sku: 'ALA-370', barcode: '4800001000098', cost: 2500, selling: 3200, stock: 24, reorder: 6 }
    ]
  },
  {
    name: 'Household',
    products: [
      { name: 'Surf Powder 66g', sku: 'SUR-66', barcode: '4800001000104', cost: 1200, selling: 1500, stock: 40, reorder: 10 },
      { name: 'Joy Dishwashing 500ml', sku: 'JOY-500', barcode: '4800001000111', cost: 3800, selling: 4800, stock: 15, reorder: 5 },
      // Deliberately below its reorder level so the low-stock alert is visible on first run.
      { name: 'Safeguard Bath Soap', sku: 'SFG-SB', barcode: '4800001000128', cost: 3200, selling: 4200, stock: 1, reorder: 6 }
    ]
  }
]

/**
 * First-run bootstrap: writes default settings, seeds the initial owner account
 * (username `owner`, password `owner123`, password change required on first
 * login) and, in dev, a small demo catalogue.
 */
export function seedDatabase(db: Db, options: SeedOptions = {}): SeedResult {
  const now = localNow()
  const result = transact(db, () => {
    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    let settingsWritten = 0
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      settingsWritten += insertSetting.run(key, JSON.stringify(value)).changes
    }

    const userCount = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
    let ownerCreated = false
    if (userCount === 0) {
      db.prepare(
        `INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 1, 1, ?, ?)`
      ).run(DEFAULT_OWNER.username, hashSync(DEFAULT_OWNER.password, 10), 'Shop Owner', now, now)
      ownerCreated = true
    }

    let demoProducts = 0
    if (options.demoData) {
      const productCount = (db.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n
      if (productCount === 0) {
        const insertCategory = db.prepare('INSERT INTO categories (name, sort_order, created_at) VALUES (?, ?, ?)')
        const insertProduct = db.prepare(
          `INSERT INTO products (name, sku, barcode, category_id, cost_price_cent, selling_price_cent, stock_qty, reorder_level, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        DEMO_CATEGORIES.forEach((category, index) => {
          const categoryId = insertCategory.run(category.name, index, now).lastInsertRowid as number
          for (const product of category.products) {
            insertProduct.run(
              product.name,
              product.sku,
              product.barcode,
              categoryId,
              product.cost,
              product.selling,
              product.stock,
              product.reorder,
              now,
              now
            )
            demoProducts += 1
          }
        })
      }
    }

    return { ownerCreated, settingsWritten, demoProducts }
  })
  return result
}
