import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as categoriesService from '../src/main/services/categories.service'
import * as productsService from '../src/main/services/products.service'
import * as settingsService from '../src/main/services/settings.service'
import { setSession } from '../src/main/session'
import { ErrorCodes } from '../src/shared/errors'
import type { ProductInput } from '../src/shared/ipc'
import { createTestDb, expectAppError, type TestContext } from './helpers/testDb'

let ctx: TestContext

beforeEach(() => {
  ctx = createTestDb()
})

afterEach(() => {
  ctx.close()
})

const cashierSession = { id: 1, username: 'owner', fullName: 'Shop Owner', role: 'cashier' as const, mustChangePassword: false }
const ownerSession = { id: 1, username: 'owner', fullName: 'Shop Owner', role: 'owner' as const, mustChangePassword: false }

function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: 'Test Product',
    sku: 'TEST-1',
    barcode: '9990001112223',
    categoryId: null,
    costPriceCent: 1000,
    sellingPriceCent: 1500,
    stockQty: 0,
    reorderLevel: 0,
    isActive: true,
    ...overrides
  }
}

describe('product catalogue', () => {
  beforeEach(() => {
    setSession(ownerSession)
  })

  it('creates a product and records its opening stock', () => {
    const product = productsService.createProduct(ctx.db, productInput({ stockQty: 25 }))

    expect(product.stockQty).toBe(25)
    const movement = ctx.db
      .prepare("SELECT delta, type, reason FROM stock_movements WHERE product_id = ?")
      .get(product.id) as { delta: number; type: string; reason: string }
    expect(movement).toMatchObject({ delta: 25, type: 'adjustment', reason: 'Opening stock' })
  })

  it('rejects duplicate SKUs and barcodes', () => {
    productsService.createProduct(ctx.db, productInput())

    expectAppError(
      () => productsService.createProduct(ctx.db, productInput({ sku: 'test-1', barcode: '111' })),
      ErrorCodes.CONFLICT
    )
    expectAppError(
      () => productsService.createProduct(ctx.db, productInput({ sku: 'TEST-2', barcode: '9990001112223' })),
      ErrorCodes.CONFLICT
    )
  })

  it('rejects an unknown category', () => {
    expectAppError(
      () => productsService.createProduct(ctx.db, productInput({ categoryId: 424242 })),
      ErrorCodes.NOT_FOUND
    )
  })

  it('updates a product and records a stock correction when the quantity changes', () => {
    const product = productsService.createProduct(ctx.db, productInput({ stockQty: 10 }))

    const updated = productsService.updateProduct(ctx.db, product.id, {
      ...productInput({ stockQty: 14, sellingPriceCent: 1800, sku: 'TEST-1B' })
    })
    expect(updated.stockQty).toBe(14)
    expect(updated.sellingPriceCent).toBe(1800)

    const movement = ctx.db
      .prepare("SELECT delta, type FROM stock_movements WHERE product_id = ? AND type = 'correction'")
      .get(product.id) as { delta: number }
    expect(movement.delta).toBe(4)

    expectAppError(() => productsService.updateProduct(ctx.db, 424242, productInput()), ErrorCodes.NOT_FOUND)
    expectAppError(
      () => productsService.updateProduct(ctx.db, product.id, productInput({ sku: 'COC-290' })),
      ErrorCodes.CONFLICT
    )
  })

  it('deactivates a product so it disappears from the default list', () => {
    const product = productsService.createProduct(ctx.db, productInput())
    productsService.setActive(ctx.db, product.id, false)

    const activeOnly = productsService.listProducts(ctx.db, { search: 'Test Product' })
    expect(activeOnly.items).toHaveLength(0)

    const withInactive = productsService.listProducts(ctx.db, { search: 'Test Product', includeInactive: true })
    expect(withInactive.items).toHaveLength(1)
    expect(withInactive.items[0].isActive).toBe(false)

    expect(productsService.getProduct(ctx.db, product.id).isActive).toBe(false)
    expectAppError(() => productsService.setActive(ctx.db, 424242, false), ErrorCodes.NOT_FOUND)
    expectAppError(() => productsService.getProduct(ctx.db, 424242), ErrorCodes.NOT_FOUND)
  })

  it('filters the list by category and low stock', () => {
    const lowStock = productsService.listProducts(ctx.db, { lowStockOnly: true })
    expect(lowStock.items.some((product) => product.sku === 'SFG-SB')).toBe(true)

    const beverages = ctx.db.prepare("SELECT id FROM categories WHERE name = 'Beverages'").get() as { id: number }
    const inCategory = productsService.listProducts(ctx.db, { categoryId: beverages.id })
    expect(inCategory.items.every((product) => product.categoryName === 'Beverages')).toBe(true)
    expect(inCategory.items.length).toBe(3)
  })

  it('searches by SKU, barcode and name for the POS lookup box', () => {
    expect(productsService.searchProducts(ctx.db, '')).toHaveLength(0)
    expect(productsService.searchProducts(ctx.db, 'coc')).toHaveLength(1)
    expect(productsService.searchProducts(ctx.db, '4800001000012')[0].sku).toBe('COC-290')
    expect(productsService.searchProducts(ctx.db, 'Pancit')[0].sku).toBe('LMP-PC')
    expect(productsService.searchProducts(ctx.db, 'zzz-nothing')).toHaveLength(0)
  })

  it('is available to cashiers for reading but not for writing', () => {
    setSession(cashierSession)
    expect(productsService.listProducts(ctx.db, {}).total).toBeGreaterThan(0)

    expectAppError(() => productsService.createProduct(ctx.db, productInput()), ErrorCodes.FORBIDDEN)
    expectAppError(() => productsService.setActive(ctx.db, 1, false), ErrorCodes.FORBIDDEN)
    setSession(null)
    expectAppError(() => productsService.listProducts(ctx.db, {}), ErrorCodes.SESSION_EXPIRED)
  })
})

describe('categories', () => {
  beforeEach(() => {
    setSession(ownerSession)
  })

  it('lists the seeded categories', () => {
    const names = categoriesService.listCategories(ctx.db).map((category) => category.name)
    expect(names).toContain('Beverages')
    expect(names).toContain('Household')
    expect(names).toHaveLength(4)
  })

  it('creates, renames and deletes categories with conflict handling', () => {
    const created = categoriesService.createCategory(ctx.db, 'Summer Drinks')
    expect(created.sortOrder).toBeGreaterThanOrEqual(4)

    expectAppError(() => categoriesService.createCategory(ctx.db, 'summer drinks'), ErrorCodes.CONFLICT)
    expectAppError(
      () => categoriesService.updateCategory(ctx.db, created.id, 'Beverages'),
      ErrorCodes.CONFLICT
    )
    expectAppError(() => categoriesService.updateCategory(ctx.db, 424242, 'Ghost'), ErrorCodes.NOT_FOUND)
    expectAppError(() => categoriesService.deleteCategory(ctx.db, 424242), ErrorCodes.NOT_FOUND)

    const renamed = categoriesService.updateCategory(ctx.db, created.id, 'Drinks & Cooler')
    expect(renamed.name).toBe('Drinks & Cooler')

    expect(categoriesService.deleteCategory(ctx.db, created.id)).toEqual({ ok: true })
    expect(categoriesService.listCategories(ctx.db).some((category) => category.id === created.id)).toBe(false)
  })

  it('detaches products when their category is deleted', () => {
    const beverages = ctx.db.prepare("SELECT id FROM categories WHERE name = 'Beverages'").get() as { id: number }
    const coke = ctx.db.prepare("SELECT id FROM products WHERE sku = 'COC-290'").get() as { id: number }

    categoriesService.deleteCategory(ctx.db, beverages.id)

    const after = ctx.db.prepare('SELECT category_id AS categoryId FROM products WHERE id = ?').get(coke.id) as {
      categoryId: number | null
    }
    expect(after.categoryId).toBeNull()
  })

  it('requires the owner to manage categories', () => {
    setSession(cashierSession)
    expectAppError(() => categoriesService.createCategory(ctx.db, 'Nope'), ErrorCodes.FORBIDDEN)
    setSession(null)
    expectAppError(() => categoriesService.listCategories(ctx.db), ErrorCodes.SESSION_EXPIRED)
  })

  it('reuses or creates categories for the CSV importer', () => {
    setSession(ownerSession)
    expect(categoriesService.ensureCategory(ctx.db, null)).toBeNull()

    const snacks = ctx.db.prepare("SELECT id FROM categories WHERE name = 'Snacks'").get() as { id: number }
    expect(categoriesService.ensureCategory(ctx.db, 'Snacks')).toBe(snacks.id)

    const fresh = categoriesService.ensureCategory(ctx.db, 'Bakery')
    const bakery = ctx.db.prepare("SELECT id FROM categories WHERE name = 'Bakery'").get() as { id: number }
    expect(fresh).toBe(bakery.id)
  })
})

describe('settings', () => {
  it('reads settings for any signed-in user and writes them as owner', () => {
    setSession(cashierSession)
    const settings = settingsService.getSettings(ctx.db)
    expect(settings.shopName).toBe('My Store')
    expect(settings.taxMode).toBe('inclusive')

    expectAppError(() => settingsService.updateSettings(ctx.db, { shopName: 'Nope' }), ErrorCodes.FORBIDDEN)
    expect(settingsService.getSettings(ctx.db).shopName).toBe('My Store')

    setSession(ownerSession)
    const updated = settingsService.updateSettings(ctx.db, {
      shopName: 'Corner Store',
      taxRatePercent: 5,
      taxMode: 'exclusive',
      currencySymbol: '$'
    })
    expect(updated.shopName).toBe('Corner Store')
    expect(updated.taxRatePercent).toBe(5)
    expect(updated.taxMode).toBe('exclusive')
    expect(settingsService.getSettingsUnchecked(ctx.db).currencySymbol).toBe('$')
  })

  it('needs a session to be read through the normal path', () => {
    setSession(null)
    expectAppError(() => settingsService.getSettings(ctx.db), ErrorCodes.SESSION_EXPIRED)
    expect(settingsService.getSettingsUnchecked(ctx.db).shopName).toBe('My Store')
  })
})

describe('CSV import and export', () => {
  beforeEach(() => {
    setSession(ownerSession)
  })

  it('exports every product with a BOM and the shared header row', () => {
    const filePath = join(ctx.dir, 'exported.csv')
    const result = productsService.exportCsv(ctx.db, filePath)

    expect(result.path).toBe(filePath)
    expect(result.rows).toBe(12)

    const content = readFileSync(filePath, 'utf8')
    expect(content.charCodeAt(0)).toBe(0xfeff)
    expect(content).toContain('name,sku,barcode,category,cost_price,selling_price,stock_qty,reorder_level,is_active')
    expect(content).toContain('Coca-Cola 290ml')
  })

  it('creates new products and updates existing ones by SKU', () => {
    const content = [
      'name,sku,barcode,category,cost_price,selling_price,stock_qty,reorder_level,is_active',
      'Imported Tea,IMP-T,4800001999999,Beverages,8.00,12.50,10,3,1',
      'Updated Coke,COC-290,4800001000012,Beverages,12.00,16.00,50,12,1'
    ].join('\n')

    const report = productsService.importCsv(ctx.db, { content })

    expect(report).toMatchObject({ created: 1, updated: 1, skipped: 0 })
    expect(report.errors).toHaveLength(0)

    const imported = productsService.searchProducts(ctx.db, 'IMP-T')[0]
    expect(imported).toMatchObject({ name: 'Imported Tea', sellingPriceCent: 1250, stockQty: 10 })
    expect(imported.categoryName).toBe('Beverages')

    const coke = productsService.searchProducts(ctx.db, 'COC-290')[0]
    expect(coke.name).toBe('Updated Coke')
    expect(coke.stockQty).toBe(50) // was 48 -> +2 movement

    const movement = ctx.db
      .prepare("SELECT delta, type FROM stock_movements WHERE product_id = ? AND type = 'import'")
      .get(coke.id) as { delta: number }
    expect(movement.delta).toBe(2)
  })

  it('creates a missing category during import', () => {
    const content = [
      'name,sku,barcode,category,cost_price,selling_price,stock_qty,reorder_level,is_active',
      'Fresh Bread,FRS-BR,,Bakery,20.00,30.00,5,2,yes'
    ].join('\n')

    const report = productsService.importCsv(ctx.db, { content })
    expect(report.created).toBe(1)
    expect(categoriesService.listCategories(ctx.db).some((category) => category.name === 'Bakery')).toBe(true)
  })

  it('skips invalid rows and reports them by line number', () => {
    const content = [
      'name,sku,barcode,category,cost_price,selling_price,stock_qty,reorder_level,is_active',
      ',NO-NAME,,Beverages,1,2,1,1,1',
      'Bad Price,BAD-PR,,Beverages,abc,2,1,1,1',
      'Bad Qty,BAD-Q,,Beverages,1,2,1.5,1,1',
      'Bad Bool,BAD-B,,Beverages,1,2,1,1,maybe'
    ].join('\n')

    const report = productsService.importCsv(ctx.db, { content })

    expect(report).toMatchObject({ created: 0, updated: 0, skipped: 4 })
    expect(report.errors.map((error) => error.line)).toEqual([2, 3, 4, 5])
    expect(report.errors[0].message).toBe('name is required')
    expect(report.errors[3].message).toContain('is_active')
    expect(productsService.searchProducts(ctx.db, 'BAD-')).toHaveLength(0)
  })

  it('reports a friendly error when an import collides on barcode', () => {
    const content = [
      'name,sku,barcode,category,cost_price,selling_price,stock_qty,reorder_level,is_active',
      'Twin A,TWN-A,4800001888888,Beverages,1,2,1,1,1',
      'Twin B,TWN-B,4800001888888,Beverages,1,2,1,1,1'
    ].join('\n')

    const report = productsService.importCsv(ctx.db, { content })

    expect(report.created).toBe(1)
    expect(report.skipped).toBe(1)
    expect(report.errors[0].message).toBe('Another product already uses this SKU or barcode')
  })

  it('rejects an import without any source', () => {
    expectAppError(() => productsService.importCsv(ctx.db, {}), ErrorCodes.VALIDATION)
    expectAppError(
      () => productsService.importCsv(ctx.db, { filePath: join(ctx.dir, 'does-not-exist.csv') }),
      ErrorCodes.VALIDATION
    )
    expectAppError(
      () => productsService.importCsv(ctx.db, { content: 'name,sku\n' }),
      ErrorCodes.VALIDATION
    )
  })

  it('round-trips through export and import', () => {
    const filePath = join(ctx.dir, 'roundtrip.csv')
    const exported = productsService.exportCsv(ctx.db, filePath)
    const content = readFileSync(filePath, 'utf8')

    const report = productsService.importCsv(ctx.db, { content })
    expect(report.created).toBe(0)
    expect(report.updated).toBe(exported.rows)
    expect(report.skipped).toBe(0)
  })
})
