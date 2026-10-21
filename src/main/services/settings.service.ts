import type { SettingsPatch } from '../../shared/ipc'
import type { Settings } from '../../shared/types'
import type { Db } from '../db/database'
import * as settingsRepo from '../repos/settings.repo'
import { requireOwner, requireSession } from '../session'

/** Settings are needed by every role (the POS shows tax and currency). */
export function getSettings(db: Db): Settings {
  requireSession()
  return settingsRepo.getSettings(db)
}

/** No session required — used while bootstrapping before login. */
export function getSettingsUnchecked(db: Db): Settings {
  return settingsRepo.getSettings(db)
}

export function updateSettings(db: Db, patch: SettingsPatch): Settings {
  requireOwner()
  settingsRepo.setSettings(db, patch)
  return settingsRepo.getSettings(db)
}
