import { dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import { AppError, ErrorCodes } from '../../../shared/errors'
import { buildReportHtml } from '../../../shared/reportHtml'
import { localNow } from '../../../shared/times'
import { printHtmlDocument } from '../../print.service'
import * as reportsService from '../../services/reports.service'
import * as settingsService from '../../services/settings.service'
import type { Db } from '../../db/database'
import type { HandlerMap } from '../policy'

async function pickSavePath(defaultPath: string, extension: string, name: string): Promise<string> {
  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name, extensions: [extension] }]
  })
  const filePath = result.filePath
  if (result.canceled || !filePath) {
    throw new AppError(ErrorCodes.VALIDATION, 'No save location was selected')
  }
  return filePath
}

export function reportHandlers(
  db: Db
): Pick<
  HandlerMap,
  | 'reports:dashboard'
  | 'reports:trend'
  | 'reports:topProducts'
  | 'reports:profit'
  | 'reports:valuation'
  | 'reports:exportCsv'
  | 'reports:exportPdf'
> {
  return {
    'reports:dashboard': () => reportsService.dashboard(db),
    'reports:trend': (request) => reportsService.trend(db, request.from, request.to, request.groupBy),
    'reports:topProducts': (request) => reportsService.topProducts(db, request.from, request.to, request.limit),
    'reports:profit': (request) => reportsService.profit(db, request.from, request.to),
    'reports:valuation': () => reportsService.valuation(db),

    'reports:exportCsv': async (request) => {
      const { csv, rows } = reportsService.buildReportCsv(db, request.report, request.from, request.to)
      const filePath =
        request.filePath ??
        (await pickSavePath(`${request.report}-${request.from}_${request.to}.csv`, 'csv', 'CSV files'))
      writeFileSync(filePath, csv, 'utf8')
      return { path: filePath, rows }
    },

    'reports:exportPdf': async (request) => {
      const settings = settingsService.getSettingsUnchecked(db)
      const payload = reportsService.buildReportPayload(
        db,
        request.report,
        request.from,
        request.to,
        settings.currencySymbol
      )
      const html = buildReportHtml({
        title: request.title ?? payload.title,
        subtitle: payload.subtitle,
        shopName: settings.shopName,
        address: settings.address,
        currencySymbol: settings.currencySymbol,
        charts: request.chartSvgs,
        sections: payload.sections,
        footer: `Generated ${localNow()} by StockPoint`
      })
      const filePath =
        request.filePath ??
        (await pickSavePath(`${request.report}-${request.from}_${request.to}.pdf`, 'pdf', 'PDF files'))
      await printHtmlDocument(html, { filePath })
      return { path: filePath }
    }
  }
}
