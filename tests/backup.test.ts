import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/database'
import * as backupService from '../src/main/services/backup.service'
import { ErrorCodes } from '../src/shared/errors'
import { createTestDb, expectAppError, type TestContext } from './helpers/testDb'

let ctx: TestContext

beforeEach(() => {
  ctx = createTestDb()
})

afterEach(() => {
  ctx.close()
})

const liveDbPath = (): string => join(ctx.dir, 'test.db')

describe('backup file naming and pruning', () => {
  it('builds a sortable timestamped name', () => {
    expect(backupService.backupFileName(new Date(2026, 0, 2, 3, 4, 5))).toBe(
      'stockpoint-backup-20260102-030405.db'
    )
    expect(backupService.backupFileName()).toMatch(/^stockpoint-backup-\d{8}-\d{6}\.db$/)
  })

  it('prunes the oldest backups beyond the retention count', () => {
    const names = ['stockpoint-backup-20260101-000000.db', 'stockpoint-backup-20260103-000000.db', 'stockpoint-backup-20260102-000000.db']
    expect(backupService.selectBackupsToPrune(names, 2)).toEqual([
      'stockpoint-backup-20260101-000000.db'
    ])
    expect(backupService.selectBackupsToPrune(names, 0)).toEqual([...names].sort().reverse())
    expect(backupService.selectBackupsToPrune(names, 99)).toEqual([])
  })

  it('lists nothing for a folder that does not exist yet', () => {
    expect(backupService.listBackupsIn(join(ctx.dir, 'missing-folder'))).toEqual([])
  })
})

describe('exporting a backup', () => {
  it('writes a readable snapshot and stamps lastBackupAt', async () => {
    const filePath = join(ctx.dir, 'exports', 'my-backup.db')

    const result = await backupService.exportBackup(ctx.db, filePath)

    expect(result.path).toBe(filePath)
    expect(result.bytes).toBeGreaterThan(1000)
    expect(existsSync(filePath)).toBe(true)

    const settings = ctx.db.prepare("SELECT value FROM settings WHERE key = 'lastBackupAt'").get() as {
      value: string
    }
    expect(JSON.parse(settings.value)).toBe(result.at)

    const copy = openDatabase(filePath, { readonly: true })
    const products = (copy.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n
    expect(products).toBe(12)
    copy.close()
  })

  it('runs the scheduled backup only when enabled, due and configured', async () => {
    expect(await backupService.runScheduledBackup(ctx.db)).toBeNull()

    const backupDir = join(ctx.dir, 'auto-backups')
    ctx.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('autoBackupEnabled', 'true')").run()
    ctx.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'backupDir',
      JSON.stringify(backupDir)
    )

    const first = await backupService.runScheduledBackup(ctx.db)
    expect(first).not.toBeNull()
    expect(readdirSync(backupDir)).toHaveLength(1)

    // Already backed up today -> not due again.
    expect(await backupService.runScheduledBackup(ctx.db)).toBeNull()
  })
})

describe('validating a backup file', () => {
  it('accepts a real StockPoint snapshot', async () => {
    const filePath = join(ctx.dir, 'valid.db')
    await backupService.exportBackup(ctx.db, filePath)
    expect(backupService.validateBackupFile(filePath, 1)).toEqual({ version: 1 })
  })

  it('rejects a missing file', () => {
    expectAppError(
      () => backupService.validateBackupFile(join(ctx.dir, 'nope.db'), 1),
      ErrorCodes.NOT_FOUND
    )
  })

  it('rejects a file that is not a database', () => {
    const filePath = join(ctx.dir, 'garbage.db')
    writeFileSync(filePath, 'this is definitely not sqlite', 'utf8')
    expectAppError(() => backupService.validateBackupFile(filePath, 1), ErrorCodes.BACKUP_INVALID)
  })

  it('rejects a database that is not a StockPoint backup', () => {
    const filePath = join(ctx.dir, 'other-app.db')
    const other = new Database(filePath)
    other.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY)')
    other.close()

    const error = expectAppError(
      () => backupService.validateBackupFile(filePath, 1),
      ErrorCodes.BACKUP_INVALID
    )
    expect(error.message).toContain('not a StockPoint backup')
  })

  it('rejects a backup written by a newer schema version', () => {
    const filePath = join(ctx.dir, 'future.db')
    const future = new Database(filePath)
    future.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT)'
    )
    future.prepare('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (999, ?, ?, ?)').run(
      'from the future',
      'x',
      'now'
    )
    future.close()

    const error = expectAppError(
      () => backupService.validateBackupFile(filePath, 1),
      ErrorCodes.BACKUP_INVALID
    )
    expect(error.message).toContain('newer version')
  })
})

describe('restoring a backup', () => {
  it('replaces the live database and keeps a safety copy', async () => {
    const backupPath = join(ctx.dir, 'restore-point.db')
    await backupService.exportBackup(ctx.db, backupPath)

    // Diverge from the snapshot afterwards.
    ctx.db.prepare("INSERT INTO products (name, sku, category_id, cost_price_cent, selling_price_cent, stock_qty, reorder_level, is_active, created_at, updated_at) VALUES ('After Snapshot', 'AFTER-1', NULL, 1, 1, 1, 0, 1, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000')").run()
    expect(
      (ctx.db.prepare("SELECT COUNT(*) AS n FROM products WHERE sku = 'AFTER-1'").get() as { n: number }).n
    ).toBe(1)

    const result = backupService.restoreBackup(ctx.db, backupPath, liveDbPath(), 1)

    expect(result.path).toBe(liveDbPath())
    expect(existsSync(result.safetyCopyPath)).toBe(true)
    expect(existsSync(`${liveDbPath()}-wal`)).toBe(false)

    const reopened = openDatabase(liveDbPath())
    expect(
      (reopened.prepare("SELECT COUNT(*) AS n FROM products WHERE sku = 'AFTER-1'").get() as { n: number }).n
    ).toBe(0)
    expect((reopened.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n).toBe(12)
    reopened.close()
  })
})
