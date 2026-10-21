/**
 * Local-time helpers.
 *
 * Timestamps are stored as `YYYY-MM-DD HH:MM:SS.mmm` **local** time so that
 * SQLite date functions and every "today / this week / this month" report
 * boundary match what the shop owner sees on the wall clock.
 */

const pad = (n: number, size = 2): string => String(n).padStart(size, '0')

export type DateKey = string // YYYY-MM-DD

export function toDateKey(date: Date = new Date()): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function toTimestamp(date: Date = new Date()): string {
  return `${toDateKey(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}.${pad(date.getMilliseconds(), 3)}`
}

/** Current local timestamp, used for every `created_at` column. */
export function localNow(): string {
  return toTimestamp(new Date())
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

/** First day of the ISO-ish week (Monday) containing `key`. */
export function startOfWeek(key: DateKey): DateKey {
  const d = parseDateKey(key)
  const day = (d.getDay() + 6) % 7 // Mon=0 .. Sun=6
  d.setDate(d.getDate() - day)
  return toDateKey(d)
}

export function startOfMonth(key: DateKey): DateKey {
  const d = parseDateKey(key)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

/** Resolves a range preset into an inclusive [from, to] pair of date keys. */
export function resolveRange(
  preset: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_7_days' | 'last_30_days',
  now: Date = new Date()
): { from: DateKey; to: DateKey } {
  const today = toDateKey(now)
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) }
    case 'last_7_days':
      return { from: addDays(today, -6), to: today }
    case 'last_30_days':
      return { from: addDays(today, -29), to: today }
    case 'this_week': {
      const from = startOfWeek(today)
      return { from, to: today }
    }
    case 'last_week': {
      const from = startOfWeek(addDays(today, -7))
      return { from, to: addDays(from, 6) }
    }
    case 'this_month': {
      const from = startOfMonth(today)
      return { from, to: today }
    }
    case 'last_month': {
      const firstThis = startOfMonth(today)
      const lastPrev = addDays(firstThis, -1)
      return { from: startOfMonth(lastPrev), to: lastPrev }
    }
  }
}

export function formatDisplayDate(keyOrTimestamp: string): string {
  const datePart = keyOrTimestamp.slice(0, 10)
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return keyOrTimestamp
  return `${m}/${d}/${y}`
}

export function formatDisplayDateTime(timestamp: string): string {
  const [datePart, timePart = ''] = timestamp.split(' ')
  const hhmm = timePart.slice(0, 5)
  return `${formatDisplayDate(datePart)}${hhmm ? ` ${hhmm}` : ''}`
}
