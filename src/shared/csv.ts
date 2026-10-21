/**
 * Pure CSV helpers for the product import/export feature. Delimited-text
 * parsing itself happens in the main process (papaparse); this module owns the
 * column contract, validation and serialization so it is unit-testable.
 */

import { centsToDecimalString, parseMoneyToCents } from './money'

export const PRODUCT_CSV_HEADERS = [
  'name',
  'sku',
  'barcode',
  'category',
  'cost_price',
  'selling_price',
  'stock_qty',
  'reorder_level',
  'is_active'
] as const

export interface ProductCsvRow {
  name: string
  sku: string
  barcode: string | null
  category: string | null
  costPriceCent: number
  sellingPriceCent: number
  stockQty: number
  reorderLevel: number
  isActive: boolean
}

export type CsvRowResult =
  | { ok: true; line: number; row: ProductCsvRow }
  | { ok: false; line: number; message: string }

const parseCount = (value: string | undefined, field: string, fallback = 0): number => {
  const raw = (value ?? '').trim()
  if (raw === '') return fallback
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${field} must be a whole number (got "${raw}")`)
  }
  return Number(raw)
}

const parseBool = (value: string | undefined): boolean => {
  const raw = (value ?? '').trim().toLowerCase()
  if (raw === '' || raw === '1' || raw === 'true' || raw === 'yes' || raw === 'y') return true
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'n') return false
  throw new Error(`is_active must be true/false, yes/no or 1/0 (got "${value}")`)
}

/** Validates a single raw CSV record (already mapped by header name). */
export function validateProductCsvRow(record: Record<string, string | undefined>, line: number): CsvRowResult {
  try {
    const name = (record.name ?? '').trim()
    const sku = (record.sku ?? '').trim()
    if (!name) throw new Error('name is required')
    if (!sku) throw new Error('sku is required')
    if (name.length > 160) throw new Error('name must be 160 characters or less')
    if (sku.length > 64) throw new Error('sku must be 64 characters or less')

    const barcode = (record.barcode ?? '').trim()
    const category = (record.category ?? '').trim()
    if (barcode && barcode.length > 64) throw new Error('barcode must be 64 characters or less')

    return {
      ok: true,
      line,
      row: {
        name,
        sku,
        barcode: barcode || null,
        category: category || null,
        costPriceCent: parseMoneyToCents((record.cost_price ?? '').trim() || '0'),
        sellingPriceCent: parseMoneyToCents((record.selling_price ?? '').trim() || '0'),
        stockQty: parseCount(record.stock_qty, 'stock_qty'),
        reorderLevel: parseCount(record.reorder_level, 'reorder_level'),
        isActive: parseBool(record.is_active)
      }
    }
  } catch (error) {
    return { ok: false, line, message: error instanceof Error ? error.message : String(error) }
  }
}

const csvEscape = (value: string | number | boolean | null): string => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Serializes arbitrary rows with a UTF-8 BOM (Excel-friendly). */
export function csvSerialize(rows: Array<Array<string | number | boolean | null>>): string {
  const lines = rows.map((row) => row.map((cell) => csvEscape(cell)).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/**
 * Serializes product rows with a UTF-8 BOM so spreadsheet apps (notably Excel)
 * detect the encoding correctly.
 */
export function productsToCsv(rows: ProductCsvRow[]): string {
  const lines = [PRODUCT_CSV_HEADERS.join(',')]
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.name),
        csvEscape(row.sku),
        csvEscape(row.barcode),
        csvEscape(row.category),
        csvEscape(centsToDecimalString(row.costPriceCent)),
        csvEscape(centsToDecimalString(row.sellingPriceCent)),
        csvEscape(row.stockQty),
        csvEscape(row.reorderLevel),
        csvEscape(row.isActive)
      ].join(',')
    )
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
