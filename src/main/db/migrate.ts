import { createHash } from 'node:crypto'
import { AppError, ErrorCodes } from '../../shared/errors'
import { localNow } from '../../shared/times'
import { transact, type Db } from './database'
import initSql from './migrations/001_init.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

/**
 * Numbered migrations, run in order at startup. SQL files must not contain
 * BEGIN/COMMIT: the runner wraps every migration in one transaction so a
 * half-applied schema is impossible.
 */
export const MIGRATIONS: readonly Migration[] = [{ version: 1, name: '001_init', sql: initSql }]

/**
 * Checksums from released revisions of a migration whose resulting schema is
 * identical to the current file. They are accepted so existing local data is
 * not stranded after a non-schema edit (such as comments or formatting).
 *
 * Do not add new values here for schema changes: those require a new numbered
 * migration instead.
 */
const COMPATIBLE_CHECKSUMS: Readonly<Record<number, readonly string[]>> = {
  1: ['1299118b6f82b53d2ac94330bb4207df']
}

const checksumOf = (sql: string): string =>
  createHash('sha256')
    .update(sql)
    .digest('hex')
    .slice(0, 32)

export interface MigrateResult {
  applied: number[]
  currentVersion: number
}

interface AppliedRow {
  version: number
  name: string
  checksum: string
}

export function currentSchemaVersion(db: Db): number {
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined
  return row?.version ?? 0
}

export function migrate(db: Db): MigrateResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const appliedRows = db
    .prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version')
    .all() as AppliedRow[]
  const applied = new Map(appliedRows.map((row) => [row.version, row]))

  // Fail fast when an already-applied migration file was edited in place.
  for (const migration of MIGRATIONS) {
    const existing = applied.get(migration.version)
    const compatibleChecksums = COMPATIBLE_CHECKSUMS[migration.version] ?? []
    const checksumMatches =
      existing?.checksum === checksumOf(migration.sql) || compatibleChecksums.includes(existing?.checksum ?? '')
    if (existing && !checksumMatches) {
      throw new AppError(
        ErrorCodes.MIGRATION,
        `Migration ${migration.version} (${migration.name}) changed after it was applied. ` +
          'Create a new numbered migration instead of editing an old one.'
      )
    }
  }

  const versions = MIGRATIONS.map((m) => m.version)
  if (new Set(versions).size !== versions.length) {
    throw new AppError(ErrorCodes.MIGRATION, 'Duplicate migration version numbers')
  }

  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
  )
  const newlyApplied: number[] = []

  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue
    transact(db, () => {
      db.exec(migration.sql)
      insert.run(migration.version, migration.name, checksumOf(migration.sql), localNow())
    })
    newlyApplied.push(migration.version)
  }

  return { applied: newlyApplied, currentVersion: currentSchemaVersion(db) }
}
