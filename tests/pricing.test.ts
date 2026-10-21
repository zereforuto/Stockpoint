import { describe, expect, it } from 'vitest'
import {
  applyDiscount,
  centsToDecimalString,
  computeChange,
  computeTotals,
  formatCents,
  formatMoney,
  lineTotalCents,
  parseMoneyToCents,
  percentOf,
  roundHalfUp
} from '../src/shared/money'

describe('roundHalfUp', () => {
  it('rounds halves away from zero in both directions', () => {
    expect(roundHalfUp(2.5)).toBe(3)
    expect(roundHalfUp(-2.5)).toBe(-3) // Math.round(-2.5) === -2 would drift money
    expect(roundHalfUp(0.5)).toBe(1)
    expect(roundHalfUp(-0.5)).toBe(-1)
    expect(roundHalfUp(2.4)).toBe(2)
  })

  it('rejects non-finite values', () => {
    expect(() => roundHalfUp(Number.NaN)).toThrow()
    expect(() => roundHalfUp(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('parseMoneyToCents', () => {
  it('parses plain and grouped amounts', () => {
    expect(parseMoneyToCents('12.50')).toBe(1250)
    expect(parseMoneyToCents('1,234.5')).toBe(123450)
    expect(parseMoneyToCents('0.05')).toBe(5)
    expect(parseMoneyToCents('7')).toBe(700)
    expect(parseMoneyToCents(9.99)).toBe(999)
  })

  it('rejects malformed, over-precise and negative amounts', () => {
    expect(() => parseMoneyToCents('abc')).toThrow()
    expect(() => parseMoneyToCents('1.234')).toThrow()
    expect(() => parseMoneyToCents('')).toThrow()
    expect(() => parseMoneyToCents('-5')).toThrow(/negative/i)
    expect(parseMoneyToCents('-5', { allowNegative: true })).toBe(-500)
  })
})

describe('formatting', () => {
  it('formats minor units for display', () => {
    expect(centsToDecimalString(1250)).toBe('12.50')
    expect(centsToDecimalString(-1250)).toBe('-12.50')
    expect(centsToDecimalString(0)).toBe('0.00')
    expect(formatCents(123456)).toBe('1,234.56')
    expect(formatMoney(1250)).toBe('₱12.50')
    expect(formatMoney(125000)).toBe('₱1,250.00')
    expect(formatMoney(1250, '$')).toBe('$12.50')
  })
})

describe('applyDiscount', () => {
  it('computes percent discounts with half-up rounding', () => {
    expect(applyDiscount(1000, { type: 'percent', value: 10 })).toBe(100)
    expect(applyDiscount(999, { type: 'percent', value: 10 })).toBe(100) // 99.9 -> 100
    expect(applyDiscount(0, { type: 'percent', value: 10 })).toBe(0)
  })

  it('truncates fixed discounts to whole minor units and clamps to the subtotal', () => {
    expect(applyDiscount(10000, { type: 'fixed', value: 1500.7 })).toBe(1500)
    expect(applyDiscount(500, { type: 'fixed', value: 900 })).toBe(500) // never larger than the bill
    expect(applyDiscount(1000, { type: 'none', value: 0 })).toBe(0)
  })

  it('rejects out-of-range discounts', () => {
    expect(() => applyDiscount(1000, { type: 'percent', value: 120 })).toThrow()
    expect(() => applyDiscount(1000, { type: 'percent', value: -5 })).toThrow()
    expect(() => applyDiscount(1000, { type: 'fixed', value: -1 })).toThrow()
    expect(() => applyDiscount(-1, { type: 'fixed', value: 1 })).toThrow()
  })
})

describe('computeTotals', () => {
  it('adds tax on top of the discounted amount when exclusive', () => {
    const totals = computeTotals(10000, { type: 'none', value: 0 }, 12, 'exclusive')
    expect(totals).toEqual({
      subtotalCent: 10000,
      discountCent: 0,
      taxableCent: 10000,
      taxCent: 1200,
      totalCent: 11200
    })
  })

  it('extracts tax from the total when inclusive', () => {
    const totals = computeTotals(10000, { type: 'none', value: 0 }, 12, 'inclusive')
    expect(totals.taxCent).toBe(1071) // 10000 * 12 / 112 = 1071.43
    expect(totals.totalCent).toBe(10000)
    expect(totals.taxableCent).toBe(10000)
  })

  it('applies the discount before tax', () => {
    const exclusive = computeTotals(10000, { type: 'fixed', value: 500 }, 10, 'exclusive')
    expect(exclusive).toEqual({
      subtotalCent: 10000,
      discountCent: 500,
      taxableCent: 9500,
      taxCent: 950,
      totalCent: 10450
    })

    const inclusive = computeTotals(10000, { type: 'percent', value: 20 }, 12, 'inclusive')
    expect(inclusive.discountCent).toBe(2000)
    expect(inclusive.taxableCent).toBe(8000)
    expect(inclusive.totalCent).toBe(8000)
  })

  it('skips tax entirely when the rate is zero', () => {
    const totals = computeTotals(1234, { type: 'none', value: 0 }, 0, 'exclusive')
    expect(totals.taxCent).toBe(0)
    expect(totals.totalCent).toBe(1234)
  })

  it('keeps the invariant subtotal - discount + tax === total', () => {
    const totals = computeTotals(7777, { type: 'percent', value: 5 }, 12, 'exclusive')
    expect(totals.subtotalCent - totals.discountCent + totals.taxCent).toBe(totals.totalCent)
  })

  it('rejects invalid inputs', () => {
    expect(() => computeTotals(-1, { type: 'none', value: 0 }, 12, 'exclusive')).toThrow()
    expect(() => computeTotals(100, { type: 'none', value: 0 }, -1, 'exclusive')).toThrow()
  })
})

describe('lineTotalCents', () => {
  it('multiplies unit price by quantity', () => {
    expect(lineTotalCents(250, 4)).toBe(1000)
    expect(lineTotalCents(0, 3)).toBe(0)
  })

  it('rejects impossible quantities and negative prices', () => {
    expect(() => lineTotalCents(100, 0)).toThrow()
    expect(() => lineTotalCents(100, 1.5)).toThrow()
    expect(() => lineTotalCents(100, -2)).toThrow()
    expect(() => lineTotalCents(-100, 1)).toThrow()
  })
})

describe('computeChange', () => {
  it('returns the difference when the customer overpays', () => {
    expect(computeChange(10000, 20000)).toBe(10000)
    expect(computeChange(10000, 10000)).toBe(0)
  })

  it('refuses to hand back change the shop does not have', () => {
    expect(() => computeChange(10000, 9999)).toThrow(/less than/i)
  })
})

describe('percentOf', () => {
  it('rounds percentage shares half up', () => {
    expect(percentOf(333, 50)).toBe(167) // 166.5 -> 167
    expect(percentOf(1000, 33.33)).toBe(333)
    expect(percentOf(1000, 0)).toBe(0)
  })
})
