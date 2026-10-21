import type { Settings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../db/defaults'
import type { Db } from '../db/database'

/** Reads all settings rows and decodes them, falling back to defaults. */
export function getSettings(db: Db): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const stored: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value)
    } catch {
      // A hand-edited file may contain a bare string; keep it as-is.
      stored[row.key] = row.value
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored } as Settings
}

export function setSetting(db: Db, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(key, JSON.stringify(value))
}

export function setSettings(db: Db, values: Partial<Record<keyof Settings, unknown>>): void {
  const stmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  )
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue
    stmt.run(key, JSON.stringify(value))
  }
}
