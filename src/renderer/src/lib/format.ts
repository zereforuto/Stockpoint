import { centsToDecimalString, formatCents, formatMoney } from '@shared/money'
import { formatDisplayDate, formatDisplayDateTime } from '@shared/times'
import { useSession } from '../stores/session'

/** Money formatter bound to the shop's configured currency symbol. */
export function useMoney(): (cents: number) => string {
  const symbol = useSession((state) => state.settings?.currencySymbol ?? '\u20b1')
  return (cents: number) => formatMoney(cents, symbol)
}

/** Symbol-only formatter (headers, chart axes). */
export function useCurrencySymbol(): string {
  return useSession((state) => state.settings?.currencySymbol ?? '\u20b1')
}

/** Raw numeric text for inputs: 1250 -> "12.50". */
export function moneyToInput(cents: number): string {
  return centsToDecimalString(cents)
}

/** Parses user input into minor units; returns null when it is not valid money. */
export function inputToMoney(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [intPart, fracPart = ''] = cleaned.split('.')
  return Number(intPart) * 100 + Number((fracPart + '00').slice(0, 2))
}

export const displayMoney = formatCents
export const displayDate = formatDisplayDate
export const displayDateTime = formatDisplayDateTime
