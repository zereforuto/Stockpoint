import Database from 'better-sqlite3'

/** Instance type of an open database connection. */
export type Db = Database.Database

export interface OpenDatabaseOptions {
  /** Skip WAL (used for :memory: databases in tests). */
  readonly?: boolean
}

/**
 * Opens (and creates when missing) the SQLite database with the pragmas every
 * connection must have: foreign keys enforced, WAL journaling for concurrent
 * reads during writes, and a busy timeout so rapid sales queue instead of
 * throwing SQLITE_BUSY.
 */
export function openDatabase(filePath: string, options: OpenDatabaseOptions = {}): Db {
  const db = new Database(filePath, { readonly: options.readonly ?? false })
  if (!options.readonly) {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
  }
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

/**
 * Runs `fn` inside an IMMEDIATE transaction. IMMEDIATE takes the write lock up
 * front, which is what keeps two rapid sales from interleaving.
 */
export function transact<T>(db: Db, fn: () => T): T {
  const wrapped = db.transaction(fn)
  return wrapped.immediate() as T
}
