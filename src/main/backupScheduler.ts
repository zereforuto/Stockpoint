import { runScheduledBackup } from './services/backup.service'
import type { Db } from './db/database'

const HOUR_MS = 60 * 60 * 1000

/**
 * Runs the automatic daily backup shortly after launch and then hourly. The
 * service itself decides whether a backup is due (enabled + folder chosen +
 * 24 h since the last one).
 */
export function startBackupScheduler(db: Db): () => void {
  const run = (): void => {
    void runScheduledBackup(db).catch((error) => console.error('[backup] automatic backup failed:', error))
  }

  const initial = setTimeout(run, 15_000)
  const interval = setInterval(run, HOUR_MS)
  initial.unref?.()
  interval.unref?.()

  return () => {
    clearTimeout(initial)
    clearInterval(interval)
  }
}
