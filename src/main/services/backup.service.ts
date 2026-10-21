import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AppError, ErrorCodes } from '../../shared/errors'
import { localNow, toTimestamp, toDateKey } from '../../shared/times'
import type { BackupResult } from '../../shared/types'
import type { Db } from '../db/database'
import * as settingsRepo from '../repos/settings.repo'

const BACKUP_PREFIX = 'stockpoint-backup-'
const DAY_MS = 24 * 60 * 60 * 1000

/** Timestamped, sortable backup file name. */
export function backupFileName(at: Date = new Date()): string {
  const day = toDateKey(at).replace(/-/g, '')
  const time = `${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}${String(
    at.getSeconds()
  ).padStart(2, '0')}`
  return `${BACKUP_PREFIX}${day}-${time}.db`
}

/** File names that should be deleted to keep only the newest `keep` backups. */
export function selectBackupsToPrune(fileNames: string[], keep: number): string[] {
  const sorted = [...fileNames].sort().reverse()
  return sorted.slice(Math.max(0, keep))
}

/** Writes a consistent snapshot of the live database to `filePath`. */
export async function exportBackup(db: Db, filePath: string): Promise<BackupResult> {
  mkdirSync(dirname(filePath), { recursive: true })
  db.pragma('wal_checkpoint(TRUNCATE)')
  await db.backup(filePath)
  const result: BackupResult = { path: filePath, bytes: statSync(filePath).size, at: localNow() }
  settingsRepo.setSetting(db, 'lastBackupAt', result.at)
  return result
}

export function listBackupsIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith('.db'))
}

function pruneBackups(dir: string, keep: number): void {
  for (const name of selectBackupsToPrune(listBackupsIn(dir), keep)) {
    rmSync(join(dir, name), { force: true })
  }
}

/** Runs the daily automatic backup when it is enabled and due. */
export async function runScheduledBackup(db: Db): Promise<BackupResult | null> {
  const settings = settingsRepo.getSettings(db)
  if (!settings.autoBackupEnabled || !settings.backupDir) return null
  const last = settings.lastBackupAt ? new Date(settings.lastBackupAt.replace(' ', 'T')) : null
  if (last && !Number.isNaN(last.getTime()) && Date.now() - last.getTime() < DAY_MS) return null

  mkdirSync(settings.backupDir, { recursive: true })
  const result = await exportBackup(db, join(settings.backupDir, backupFileName()))
  pruneBackups(settings.backupDir, settings.retainBackups)
  return result
}

/** Opens a backup file read-only and makes sure it really is a StockPoint database. */
export function validateBackupFile(filePath: string, maxVersion: number): { version: number } {
  if (!existsSync(filePath)) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'The selected backup file does not exist')
  }
  let probe: Database.Database | null = null
  try {
    probe = new Database(filePath, { readonly: true, fileMustExist: true })
  } catch (error) {
    throw new AppError(ErrorCodes.BACKUP_INVALID, 'The selected file could not be opened as a database', {
      cause: error
    })
  }
  try {
    const integrity = probe.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') {
      throw new AppError(ErrorCodes.BACKUP_INVALID, 'The backup file is corrupted')
    }
    const table = probe
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
      .get()
    if (!table) {
      throw new AppError(ErrorCodes.BACKUP_INVALID, 'The selected file is not a StockPoint backup')
    }
    const row = probe.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
      version: number | null
    }
    const version = row.version ?? 0
    if (version > maxVersion) {
      throw new AppError(
        ErrorCodes.BACKUP_INVALID,
        'This backup was created by a newer version of StockPoint'
      )
    }
    return { version }
  } catch (error) {
    // SQLite only reads the header lazily, so "not a database" surfaces on the
    // first pragma rather than when the handle is opened.
    if (error instanceof AppError) throw error
    throw new AppError(ErrorCodes.BACKUP_INVALID, 'The selected file could not be opened as a database', {
      cause: error
    })
  } finally {
    probe.close()
  }
}

export interface RestoreResult extends BackupResult {
  safetyCopyPath: string
}

/**
 * Replaces the live database with a backup. The caller must close the live
 * connection first and relaunch the app afterwards.
 */
export function restoreBackup(
  db: Db,
  filePath: string,
  currentDbPath: string,
  maxVersion: number
): RestoreResult {
  validateBackupFile(filePath, maxVersion)
  const safetyCopyPath = `${currentDbPath}.before-restore-${toTimestamp().replace(/[:.]/g, '-')}`
  db.close()
  if (existsSync(currentDbPath)) {
    copyFileSync(currentDbPath, safetyCopyPath)
  }
  copyFileSync(filePath, currentDbPath)
  rmSync(`${currentDbPath}-wal`, { force: true })
  rmSync(`${currentDbPath}-shm`, { force: true })
  return {
    path: currentDbPath,
    bytes: statSync(filePath).size,
    at: localNow(),
    safetyCopyPath
  }
}
