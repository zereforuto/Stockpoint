/**
 * Integer money helpers. Every monetary value in StockPoint is stored and
 * transported as an integer number of minor units ("centavos"). Floats never
 * touch the database or the arithmetic used for totals.
 */

import type { DiscountInput as DiscountInputLike, TaxMode } from './types'

/** Rounds halves away from zero (symmetric, unlike Math.round which is -inf biased). */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot round non-finite value: ${value}`)
  }
  return Math.sign(value) * Math.round(Math.abs(value))
}

/** "12.50" | "1,234.5" -> 1250. Rejects >2 decimals and negatives unless allowed. */
export function parseMoneyToCents(input: string | number, options: { allowNegative?: boolean } = {}): number {
  const raw = typeof input === 'number' ? String(input) : input.trim()
  const cleaned = raw.replace(/,/g, '')
  if (cleaned === '') {
    throw new Error('Amount is required')
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid amount: "${input}"`)
  }
  const negative = cleaned.startsWith('-')
  const [intPart, fracPart = ''] = cleaned.replace('-', '').split('.')
  const cents = Number(intPart) * 100 + Number((fracPart + '00').slice(0, 2))
  const signed = negative ? -cents : cents
  if (signed < 0 && !options.allowNegative) {
    throw new Error('Amount cannot be negative')
  }
  return signed
}

/** 1250 -> "12.50" */
export function centsToDecimalString(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(Math.trunc(cents))
  const int = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${negative ? '-' : ''}${int}.${frac}`
}

/** 1250 -> "1,250.00" (grouped thousands, for display tables). */
export function formatCents(cents: number): string {
  const body = centsToDecimalString(cents)
  const [int, frac] = body.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${grouped}.${frac}`
}

/** 1250 + "₱" -> "₱1,250.00" */
export function formatMoney(cents: number, symbol = '₱'): string {
  return `${symbol}${formatCents(cents)}`
}

/** Multiples a minor-unit amount by a percentage, rounding halves up. */
export function percentOf(amountCents: number, percent: number): number {
  if (!Number.isFinite(percent)) {
    throw new Error(`Invalid percentage: ${percent}`)
  }
  return roundHalfUp((amountCents * percent) / 100)
}

/** Clamps a discount to [0, subtotal] and returns the discounted amount. */
export function applyDiscount(subtotalCents: number, discount: DiscountInputLike): number {
  if (subtotalCents < 0) {
    throw new Error('Subtotal cannot be negative')
  }
  if (discount.type === 'none' || !discount.value) {
    return 0
  }
  let amount: number
  if (discount.type === 'percent') {
    if (discount.value < 0 || discount.value > 100) {
      throw new Error('Percentage discount must be between 0 and 100')
    }
    amount = percentOf(subtotalCents, discount.value)
  } else {
    if (discount.value < 0) {
      throw new Error('Discount cannot be negative')
    }
    amount = Math.trunc(discount.value)
  }
  return Math.min(amount, subtotalCents)
}

export interface Totals {
  subtotalCent: number
  discountCent: number
  taxableCent: number
  taxCent: number
  totalCent: number
}

/**
 * Computes the authoritative sale totals.
 *
 * - exclusive: tax is added on top of (subtotal - discount)
 * - inclusive: tax is already part of (subtotal - discount); total equals it
 */
export function computeTotals(
  subtotalCents: number,
  discount: DiscountInputLike,
  taxRatePercent: number,
  taxMode: TaxMode
): Totals {
  if (subtotalCents < 0) {
    throw new Error('Subtotal cannot be negative')
  }
  if (taxRatePercent < 0) {
    throw new Error('Tax rate cannot be negative')
  }
  const discountCents = applyDiscount(subtotalCents, discount)
  const taxable = subtotalCents - discountCents
  let taxCents = 0
  let totalCents = taxable
  if (taxRatePercent > 0) {
    if (taxMode === 'exclusive') {
      taxCents = percentOf(taxable, taxRatePercent)
      totalCents = taxable + taxCents
    } else {
      taxCents = roundHalfUp((taxable * taxRatePercent) / (100 + taxRatePercent))
      totalCents = taxable
    }
  }
  return {
    subtotalCent: subtotalCents,
    discountCent: discountCents,
    taxableCent: taxable,
    taxCent: taxCents,
    totalCent: totalCents
  }
}

export function lineTotalCents(unitPriceCents: number, quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Quantity must be a positive integer, got ${quantity}`)
  }
  if (unitPriceCents < 0) {
    throw new Error('Unit price cannot be negative')
  }
  return unitPriceCents * quantity
}

export function profitCents(unitPriceCents: number, costPriceCents: number, quantity: number): number {
  return (unitPriceCents - costPriceCents) * quantity
}

/** Throws when the tendered amount does not cover the total (cash only). */
export function computeChange(totalCents: number, tenderedCents: number): number {
  const change = tenderedCents - totalCents
  if (change < 0) {
    throw new Error('Amount tendered is less than the total')
  }
  return change
}
