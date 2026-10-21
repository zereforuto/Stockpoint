import { app, dialog } from 'electron'
import { join } from 'node:path'
import { buildReceiptHtml } from '../../../shared/receipt'
import { currentSchemaVersion } from '../../db/migrate'
import { printHtmlDocument } from '../../print.service'
import {
  backupFileName,
  exportBackup,
  restoreBackup,
  runScheduledBackup
} from '../../services/backup.service'
import * as salesService from '../../services/sales.service'
import * as settingsService from '../../services/settings.service'
import { dataDir, dbPath, defaultBackupDir } from '../../util/paths'
import type { Db } from '../../db/database'
import type { HandlerMap } from '../policy'

export function systemHandlers(
  db: Db
): Pick<
  HandlerMap,
  | 'settings:get'
  | 'settings:update'
  | 'backup:export'
  | 'backup:import'
  | 'backup:pickFolder'
  | 'backup:runAuto'
  | 'print:receipt'
  | 'app:info'
  | 'dialog:pickFile'
  | 'dialog:saveFile'
> {
  return {
    'settings:get': () => settingsService.getSettings(db),
    'settings:update': (request) => settingsService.updateSettings(db, request),

    'backup:export': async (request) => {
      const settings = settingsService.getSettingsUnchecked(db)
      const filePath = request.filePath ?? join(settings.backupDir ?? defaultBackupDir(), backupFileName())
      return exportBackup(db, filePath)
    },
    'backup:import': (request) => {
      const result = restoreBackup(db, request.filePath, dbPath(), currentSchemaVersion(db))
      // The database file has been swapped; restart so everything reopens cleanly.
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 300)
      return result
    },
    'backup:pickFolder': async () => {
      const result = await dialog.showOpenDialog({
        title: 'Choose a backup folder',
        properties: ['openDirectory', 'createDirectory']
      })
      const folder = result.filePaths[0]
      return { path: result.canceled || !folder ? null : folder }
    },
    'backup:runAuto': () => runScheduledBackup(db),

    'print:receipt': async (request) => {
      const sale = salesService.getSaleDetail(db, request.saleId)
      const settings = settingsService.getSettingsUnchecked(db)
      const html = buildReceiptHtml(settings, sale)
      if (request.filePath) {
        await printHtmlDocument(html, { filePath: request.filePath })
        return { path: request.filePath }
      }
      await printHtmlDocument(html, { silent: request.silent ?? false, title: sale.receiptNo })
      return {}
    },

    'app:info': () => ({
      version: app.getVersion(),
      platform: process.platform,
      dataDir: dataDir(),
      dbPath: dbPath(),
      isPackaged: app.isPackaged
    }),

    'dialog:pickFile': async (request) => {
      const result = await dialog.showOpenDialog({
        properties: request.properties ?? ['openFile'],
        filters: request.filters
      })
      const filePath = result.filePaths[0]
      return { path: result.canceled || !filePath ? null : filePath }
    },
    'dialog:saveFile': async (request) => {
      const extension = request.filters?.[0]?.extensions?.[0] ?? 'csv'
      const result = await dialog.showSaveDialog({
        defaultPath: `${request.defaultName}.${extension}`,
        filters: request.filters
      })
      return { path: result.canceled || !result.filePath ? null : result.filePath }
    }
  }
}
