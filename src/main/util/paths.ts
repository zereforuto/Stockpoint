import { app } from 'electron'
import { join } from 'node:path'

/** Directory that holds the database, images and backups for this machine. */
export function dataDir(): string {
  return app.getPath('userData')
}

export function dbPath(): string {
  return join(dataDir(), 'stockpoint.db')
}

/** Product images are copied here so the database only ever stores a path. */
export function imagesDir(): string {
  return join(dataDir(), 'images')
}

export function defaultBackupDir(): string {
  return join(dataDir(), 'backups')
}
