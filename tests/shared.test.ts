import { describe, expect, it } from 'vitest'
import {
  PRODUCT_CSV_HEADERS,
  csvSerialize,
  productsToCsv,
  validateProductCsvRow
} from '../src/shared/csv'
import { ApiError, AppError, ErrorCodes, fail, ok, validationError } from '../src/shared/errors'
import {
  discountTypeLabel,
  movementTypeLabel,
  paymentMethodLabel,
  roleLabel,
  saleStatusLabel,
  taxModeLabel
} from '../src/shared/format'
import { escapeHtml } from '../src/shared/html'
import { buildReceiptHtml } from '../src/shared/receipt'
import { buildReportHtml } from '../src/shared/reportHtml'
import {
  addDays,
  formatDisplayDate,
  formatDisplayDateTime,
  localNow,
  parseDateKey,
  resolveRange,
  startOfMonth,
  startOfWeek,
  toDateKey,
  toTimestamp
} from '../src/shared/times'
import type { SaleDetail, Settings } from '../src/shared/types'

describe('date and time helpers', () => {
  it('formats local date keys and timestamps', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toTimestamp(new Date(2026, 11, 31, 23, 59, 5, 7))).toBe('2026-12-31 23:59:05.007')
    expect(localNow()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
  })

  it('round-trips date keys', () => {
    const date = parseDateKey('2026-03-15')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(15)
  })

  it('walks across month and year boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01') // 2026 is not a leap year
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-10-20', 0)).toBe('2026-10-20')
  })

  it('starts weeks on Monday and months on the 1st', () => {
    expect(startOfWeek('2026-01-04')).toBe('2025-12-29') // Sunday rolls back
    expect(startOfWeek('2026-01-05')).toBe('2026-01-05') // Monday stays
    expect(startOfMonth('2026-03-15')).toBe('2026-03-01')
  })

  it('resolves every range preset against a fixed clock', () => {
    const now = new Date(2026, 9, 20) // Tuesday, 20 October 2026
    expect(resolveRange('today', now)).toEqual({ from: '2026-10-20', to: '2026-10-20' })
    expect(resolveRange('yesterday', now)).toEqual({ from: '2026-10-19', to: '2026-10-19' })
    expect(resolveRange('last_7_days', now)).toEqual({ from: '2026-10-14', to: '2026-10-20' })
    expect(resolveRange('last_30_days', now)).toEqual({ from: '2026-09-21', to: '2026-10-20' })
    expect(resolveRange('this_week', now)).toEqual({ from: '2026-10-19', to: '2026-10-20' })
    expect(resolveRange('last_week', now)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(resolveRange('this_month', now)).toEqual({ from: '2026-10-01', to: '2026-10-20' })
    expect(resolveRange('last_month', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('formats dates for humans', () => {
    expect(formatDisplayDate('2026-10-20')).toBe('10/20/2026')
    expect(formatDisplayDate('2026-10-20 14:05:00.000')).toBe('10/20/2026')
    expect(formatDisplayDate('not-a-date')).toBe('not-a-date')
    expect(formatDisplayDateTime('2026-10-20 14:05:00.000')).toBe('10/20/2026 14:05')
    expect(formatDisplayDateTime('2026-10-20')).toBe('10/20/2026')
  })
})

describe('display labels', () => {
  it('maps every enum to a friendly label', () => {
    expect(paymentMethodLabel('cash')).toBe('Cash')
    expect(paymentMethodLabel('card')).toBe('Card')
    expect(paymentMethodLabel('e_wallet')).toBe('E-Wallet')
    expect(discountTypeLabel('none')).toBe('None')
    expect(discountTypeLabel('percent')).toBe('% discount')
    expect(discountTypeLabel('fixed')).toBe('Fixed discount')
    expect(taxModeLabel('inclusive')).toBe('VAT (inclusive)')
    expect(taxModeLabel('exclusive')).toBe('VAT (exclusive)')
    expect(roleLabel('owner')).toBe('Owner')
    expect(roleLabel('cashier')).toBe('Cashier')
    expect(saleStatusLabel('voided')).toBe('Voided')
    expect(saleStatusLabel('completed')).toBe('Completed')
    expect(movementTypeLabel('sale')).toBe('Sale')
    expect(movementTypeLabel('void')).toBe('Sale voided')
    expect(movementTypeLabel('restock')).toBe('Restock')
    expect(movementTypeLabel('damaged')).toBe('Damaged')
    expect(movementTypeLabel('correction')).toBe('Correction')
    expect(movementTypeLabel('adjustment')).toBe('Adjustment')
    expect(movementTypeLabel('import')).toBe('CSV import')
  })
})

describe('CSV helpers', () => {
  it('validates a full product row', () => {
    const result = validateProductCsvRow(
      {
        name: '  Mixed Nuts  ',
        sku: ' NUT-1 ',
        barcode: '123',
        category: 'Snacks',
        cost_price: '12.50',
        selling_price: '1,200.5',
        stock_qty: '7',
        reorder_level: '3',
        is_active: 'no'
      },
      2
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.line).toBe(2)
    expect(result.row).toEqual({
      name: 'Mixed Nuts',
      sku: 'NUT-1',
      barcode: '123',
      category: 'Snacks',
      costPriceCent: 1250,
      sellingPriceCent: 120050,
      stockQty: 7,
      reorderLevel: 3,
      isActive: false
    })
  })

  it('fills optional columns with defaults', () => {
    const result = validateProductCsvRow({ name: 'Plain', sku: 'PLN-1' }, 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.row.barcode).toBeNull()
    expect(result.row.category).toBeNull()
    expect(result.row.costPriceCent).toBe(0)
    expect(result.row.sellingPriceCent).toBe(0)
    expect(result.row.stockQty).toBe(0)
    expect(result.row.isActive).toBe(true)
  })

  it('reports a reason for every rejected row', () => {
    const missingName = validateProductCsvRow({ sku: 'X' }, 3)
    expect(missingName.ok).toBe(false)
    if (missingName.ok) return
    expect(missingName).toMatchObject({ line: 3, message: 'name is required' })

    const badNumber = validateProductCsvRow({ name: 'A', sku: 'B', stock_qty: '1.5' }, 4)
    expect(badNumber.ok).toBe(false)
    if (!badNumber.ok) expect(badNumber.message).toContain('stock_qty')

    const badBool = validateProductCsvRow({ name: 'A', sku: 'B', is_active: 'maybe' }, 5)
    expect(badBool.ok).toBe(false)
    if (!badBool.ok) expect(badBool.message).toContain('is_active')

    const longName = validateProductCsvRow({ name: 'x'.repeat(161), sku: 'B' }, 6)
    expect(longName.ok).toBe(false)
    if (!longName.ok) expect(longName.message).toContain('160 characters')
  })

  it('escapes dangerous cells when serializing', () => {
    const csv = csvSerialize([
      ['plain', 'has,comma', 'has"quote', 'has\nnewline', null, 42, true]
    ])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"has,comma"')
    expect(csv).toContain('"has""quote"')
    expect(csv).toContain('"has\nnewline"')
    expect(csv).toContain(',42,true')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('serializes products with the documented header order', () => {
    const csv = productsToCsv([
      {
        name: 'Thing, "Big"',
        sku: 'THG-1',
        barcode: '999',
        category: null,
        costPriceCent: 500,
        sellingPriceCent: 999,
        stockQty: 2,
        reorderLevel: 1,
        isActive: false
      }
    ])
    const [header, row] = csv.replace('\uFEFF', '').split('\r\n')
    expect(header).toBe(PRODUCT_CSV_HEADERS.join(','))
    expect(row).toBe('"Thing, ""Big""",THG-1,999,,5.00,9.99,2,1,false')
  })
})

describe('error envelopes', () => {
  it('carries codes, issues and metadata', () => {
    const error = new AppError(ErrorCodes.VALIDATION, 'Bad input', {
      issues: [{ path: 'name', message: 'Required' }],
      meta: { productId: 4 }
    })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AppError')
    expect(error.code).toBe('VALIDATION')
    expect(error.issues).toEqual([{ path: 'name', message: 'Required' }])
    expect(error.meta).toEqual({ productId: 4 })
  })

  it('builds success and failure envelopes', () => {
    expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } })
    const info = { code: ErrorCodes.NOT_FOUND, message: 'Nope' } as const
    expect(fail(info)).toEqual({ ok: false, error: info })
    expect(validationError('Bad', [{ path: 'x', message: 'y' }]).issues).toHaveLength(1)
  })

  it('rehydrates renderer-side errors from an envelope', () => {
    const api = new ApiError({ code: ErrorCodes.INSUFFICIENT_STOCK, message: 'Not enough', meta: { available: 1 } })
    expect(api).toBeInstanceOf(Error)
    expect(api.code).toBe(ErrorCodes.INSUFFICIENT_STOCK)
    expect(api.meta).toEqual({ available: 1 })
  })
})

describe('HTML escaping', () => {
  it('neutralises markup in every position', () => {
    expect(escapeHtml('<b>"x" & \'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(12.5)).toBe('12.5')
  })
})

function makeSale(overrides: Partial<SaleDetail> = {}): SaleDetail {
  return {
    id: 1,
    receiptNo: 'SP-20261020-0001',
    cashierId: 1,
    cashierName: 'Shop Owner',
    createdAt: '2026-10-20 10:30:00.000',
    subtotalCent: 3000,
    discountType: 'none',
    discountValueCent: 0,
    discountCent: 0,
    taxCent: 321,
    totalCent: 3000,
    paymentMethod: 'cash',
    amountTenderedCent: 5000,
    changeCent: 2000,
    status: 'completed',
    voidReason: null,
    voidedBy: null,
    voidedByName: null,
    voidedAt: null,
    items: [
      {
        id: 1,
        productId: 1,
        productName: 'Coca-Cola 290ml',
        sku: 'COC-290',
        costPriceCent: 1200,
        unitPriceCent: 1500,
        quantity: 2,
        lineTotalCent: 3000
      }
    ],
    payments: [{ id: 1, method: 'cash', amountCent: 5000, reference: null }],
    ...overrides
  }
}

const shop: Settings = {
  shopName: 'Corner <Store>',
  address: '12 Rizal St',
  currency: 'PHP',
  currencySymbol: '₱',
  taxRatePercent: 12,
  taxMode: 'inclusive',
  receiptFooter: 'Thank you!',
  autoBackupEnabled: false,
  backupDir: null,
  lastBackupAt: null,
  retainBackups: 30
}

describe('receipt HTML', () => {
  it('renders the shop, sale lines and totals', () => {
    const html = buildReceiptHtml(shop, makeSale())

    expect(html).toContain('Corner &lt;Store&gt;')
    expect(html).toContain('SP-20261020-0001')
    expect(html).toContain('10/20/2026 10:30')
    expect(html).toContain('Coca-Cola 290ml')
    expect(html).toContain('2 x 15.00')
    expect(html).toContain('VAT Inclusive 12%')
    expect(html).toContain('₱30.00')
    expect(html).toContain('Change')
    expect(html).toContain('Thank you!')
    expect(html).toContain('width: 302px')
    expect(html).toContain("default-src 'none'")
    expect(html).not.toContain('Voided receipt')
  })

  it('shows the exclusive VAT label and honours a custom width', () => {
    const html = buildReceiptHtml({ ...shop, taxMode: 'exclusive' }, makeSale(), { widthPx: 500 })
    expect(html).toContain('VAT 12%')
    expect(html).toContain('width: 500px')
  })

  it('stamps voided sales with the reason and reviewer', () => {
    const html = buildReceiptHtml(
      shop,
      makeSale({
        status: 'voided',
        voidReason: 'Wrong item',
        voidedByName: 'Shop Owner',
        voidedAt: '2026-10-20 11:00:00.000'
      })
    )

    expect(html).toContain('VOIDED')
    expect(html).toContain('Voided receipt')
    expect(html).toContain('Wrong item')
    expect(html).toContain('10/20/2026 11:00')
  })

  it('escapes hostile content coming from the database', () => {
    const html = buildReceiptHtml(
      { ...shop, shopName: '<script>alert(1)</script>', receiptFooter: '"><img src=x>' },
      makeSale({
        items: [
          {
            id: 1,
            productId: 1,
            productName: '<script>alert(2)</script>',
            sku: 'X',
            costPriceCent: 1,
            unitPriceCent: 1,
            quantity: 1,
            lineTotalCent: 1
          }
        ]
      })
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('report document HTML', () => {
  it('renders sections, charts, tables and key/value lines', () => {
    const html = buildReportHtml({
      title: 'Profit report <draft>',
      subtitle: '10/01/2026 – 10/20/2026',
      shopName: 'Corner Store',
      address: '12 Rizal St',
      currencySymbol: '₱',
      charts: ['<svg viewBox="0 0 10 10"></svg>', '<div>not a chart</div>'],
      sections: [
        {
          title: 'Summary',
          lines: [
            { label: 'Profit', value: '₱1,234.00', strong: true },
            { label: 'Sales', value: '12' }
          ]
        },
        { title: 'Ranking', columns: ['Product', 'Qty'], rows: [['Coca-Cola', '5'], ['Water & Ice', '2']] }
      ]
    })

    expect(html).toContain('Profit report &lt;draft&gt;')
    expect(html).toContain('10/01/2026 – 10/20/2026')
    expect(html).toContain('<svg viewBox="0 0 10 10"></svg>')
    expect(html).not.toContain('<div>not a chart</div>')
    expect(html).toContain('class="kv strong"')
    expect(html).toContain('<th>Product</th>')
    expect(html).toContain('Water &amp; Ice')
    expect(html).toContain('Generated by StockPoint')
  })

  it('renders an empty document without crashing', () => {
    const html = buildReportHtml({
      title: 'Empty',
      shopName: 'Shop',
      address: '',
      currencySymbol: '₱',
      sections: []
    })
    expect(html).toContain('Empty')
    expect(html).toContain('Shop')
    expect(html).not.toContain('<section>') // no sections requested, none rendered
  })
})
