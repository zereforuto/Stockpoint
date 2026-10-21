import { readFileSync, writeFileSync } from 'node:fs'
import Papa from 'papaparse'
import { productsToCsv, validateProductCsvRow } from '../../shared/csv'
import { AppError, ErrorCodes } from '../../shared/errors'
import type { ImportCsvInput, ProductInput } from '../../shared/ipc'
import { localNow } from '../../shared/times'
import type { CsvImportReport, Paginated, Product, ProductQuery } from '../../shared/types'
import { transact, type Db } from '../db/database'
import * as categoriesRepo from '../repos/categories.repo'
import * as productsRepo from '../repos/products.repo'
import * as stockRepo from '../repos/stock.repo'
import { requireOwner, requireSession } from '../session'
import { ensureCategory } from './categories.service'

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

function assertSkuAndBarcodeFree(db: Db, sku: string, barcode: string | null, excludeId?: number): void {
  if (productsRepo.findProductIdBySku(db, sku, excludeId)) {
    throw new AppError(ErrorCodes.CONFLICT, `SKU "${sku}" is already used by another product`)
  }
  if (barcode && productsRepo.findProductIdByBarcode(db, barcode, excludeId)) {
    throw new AppError(ErrorCodes.CONFLICT, `Barcode "${barcode}" is already used by another product`)
  }
}

function assertCategoryExists(db: Db, categoryId: number | null): void {
  if (categoryId && !categoriesRepo.findCategoryById(db, categoryId)) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Selected category no longer exists')
  }
}

function toWriteInput(db: Db, input: ProductInput): productsRepo.ProductWriteInput {
  assertCategoryExists(db, input.categoryId)
  return {
    name: input.name,
    sku: input.sku,
    barcode: input.barcode,
    categoryId: input.categoryId,
    costPriceCent: input.costPriceCent,
    sellingPriceCent: input.sellingPriceCent,
    stockQty: input.stockQty,
    reorderLevel: input.reorderLevel,
    imagePath: input.imagePath ?? null,
    isActive: input.isActive
  }
}

export function listProducts(db: Db, query: ProductQuery): Paginated<Product> {
  requireSession()
  return productsRepo.listProducts(db, query)
}

export function getProduct(db: Db, id: number): Product {
  requireSession()
  const product = productsRepo.findProductById(db, id)
  if (!product) throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found')
  return product
}

/** POS lookup used by the barcode box. */
export function searchProducts(db: Db, term: string, limit = 20): Product[] {
  requireSession()
  const trimmed = term.trim()
  if (!trimmed) return []
  return productsRepo.searchProducts(db, trimmed, limit)
}

export function createProduct(db: Db, input: ProductInput): Product {
  requireOwner()
  assertSkuAndBarcodeFree(db, input.sku, input.barcode)
  return transact(db, () => {
    const now = localNow()
    const product = productsRepo.insertProduct(db, toWriteInput(db, input), now)
    if (product.stockQty > 0) {
      stockRepo.insertStockMovement(db, {
        productId: product.id,
        delta: product.stockQty,
        type: 'adjustment',
        reason: 'Opening stock',
        userId: null,
        createdAt: now
      })
    }
    return product
  })
}

export function updateProduct(db: Db, id: number, patch: ProductInput): Product {
  requireOwner()
  return transact(db, () => {
    const existing = productsRepo.findProductById(db, id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found')
    assertSkuAndBarcodeFree(db, patch.sku, patch.barcode, id)
    const now = localNow()
    const product = productsRepo.updateProduct(db, id, toWriteInput(db, patch), now)
    const stockDelta = product.stockQty - existing.stockQty
    if (stockDelta !== 0) {
      stockRepo.insertStockMovement(db, {
        productId: id,
        delta: stockDelta,
        type: 'correction',
        reason: 'Stock edited on the product form',
        userId: null,
        createdAt: now
      })
    }
    return product
  })
}

export function setActive(db: Db, id: number, isActive: boolean): Product {
  requireOwner()
  if (!productsRepo.findProductById(db, id)) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found')
  }
  return productsRepo.setProductActive(db, id, isActive)
}

/** Parses CSV text (or a file) and upserts products by SKU. */
export function importCsv(db: Db, input: ImportCsvInput): CsvImportReport {
  requireOwner()
  let content: string
  if (typeof input.content === 'string') {
    content = input.content
  } else if (input.filePath) {
    try {
      content = readFileSync(input.filePath, 'utf8')
    } catch (error) {
      throw new AppError(ErrorCodes.VALIDATION, 'Could not read the selected CSV file', { cause: error })
    }
  } else {
    throw new AppError(ErrorCodes.VALIDATION, 'A CSV file is required')
  }

  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const parsed = Papa.parse<Record<string, string>>(stripped, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase()
  })

  const report: CsvImportReport = { created: 0, updated: 0, skipped: 0, errors: [] }
  if (parsed.data.length === 0) {
    const detail = parsed.errors[0]?.message
    throw new AppError(ErrorCodes.VALIDATION, `The CSV file has no readable rows${detail ? ` (${detail})` : ''}`)
  }

  transact(db, () => {
    parsed.data.forEach((record, index) => {
      const line = index + 2 // header occupies line 1
      const result = validateProductCsvRow(record ?? {}, line)
      if (!result.ok) {
        report.skipped += 1
        report.errors.push({ line, message: result.message })
        return
      }
      const row = result.row
      try {
        const categoryId = ensureCategory(db, row.category)
        const now = localNow()
        const existingId = productsRepo.findProductIdBySku(db, row.sku)
        if (existingId) {
          const existing = productsRepo.findProductById(db, existingId) as Product
          productsRepo.updateProduct(
            db,
            existingId,
            {
              name: row.name,
              sku: row.sku,
              barcode: row.barcode,
              categoryId,
              costPriceCent: row.costPriceCent,
              sellingPriceCent: row.sellingPriceCent,
              stockQty: row.stockQty,
              reorderLevel: row.reorderLevel,
              imagePath: existing.imagePath,
              isActive: row.isActive
            },
            now
          )
          const delta = row.stockQty - existing.stockQty
          if (delta !== 0) {
            stockRepo.insertStockMovement(db, {
              productId: existingId,
              delta,
              type: 'import',
              reason: 'CSV import',
              createdAt: now
            })
          }
          report.updated += 1
        } else {
          const product = productsRepo.insertProduct(
            db,
            {
              name: row.name,
              sku: row.sku,
              barcode: row.barcode,
              categoryId,
              costPriceCent: row.costPriceCent,
              sellingPriceCent: row.sellingPriceCent,
              stockQty: row.stockQty,
              reorderLevel: row.reorderLevel,
              isActive: row.isActive
            },
            now
          )
          if (product.stockQty > 0) {
            stockRepo.insertStockMovement(db, {
              productId: product.id,
              delta: product.stockQty,
              type: 'import',
              reason: 'CSV import',
              createdAt: now
            })
          }
          report.created += 1
        }
      } catch (error) {
        const message = isUniqueViolation(error)
          ? 'Another product already uses this SKU or barcode'
          : error instanceof Error
            ? error.message
            : 'Could not import this row'
        report.skipped += 1
        report.errors.push({ line, message })
      }
    })
  })

  return report
}

export function exportCsv(db: Db, filePath: string): { path: string; rows: number } {
  requireOwner()
  const products = productsRepo.listAllProductsWithStock(db, true)
  const csv = productsToCsv(
    products.map((product) => ({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      category: product.categoryName,
      costPriceCent: product.costPriceCent,
      sellingPriceCent: product.sellingPriceCent,
      stockQty: product.stockQty,
      reorderLevel: product.reorderLevel,
      isActive: product.isActive
    }))
  )
  try {
    writeFileSync(filePath, csv, 'utf8')
  } catch (error) {
    throw new AppError(ErrorCodes.INTERNAL, 'Could not write the CSV file', { cause: error })
  }
  return { path: filePath, rows: products.length }
}
