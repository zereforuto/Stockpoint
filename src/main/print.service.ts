import { app, BrowserWindow } from 'electron'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError, ErrorCodes } from '../shared/errors'

export interface PrintOptions {
  /** true = send straight to the default printer, false = show the print dialog */
  silent?: boolean
  /** When set, exports a PDF to this path instead of printing. */
  filePath?: string
  title?: string
}

/**
 * Renders an HTML document in a hidden window and either prints it or exports
 * it as PDF. Used for receipts and report exports.
 */
export async function printHtmlDocument(html: string, options: PrintOptions = {}): Promise<{ path?: string }> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true }
  })
  const tempFile = join(app.getPath('temp'), `stockpoint-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)

  try {
    await writeFile(tempFile, html, 'utf8')
    await window.loadFile(tempFile)

    if (options.filePath) {
      const pdf = await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      await writeFile(options.filePath, pdf)
      return { path: options.filePath }
    }

    await new Promise<void>((resolve, reject) => {
      window.webContents.print(
        { silent: options.silent ?? false, printBackground: true, deviceName: 'default' },
        (success, failureReason) => {
          if (success) {
            resolve()
          } else {
            reject(new AppError(ErrorCodes.PRINT_FAILED, failureReason || 'Printing failed'))
          }
        }
      )
    })
    return {}
  } finally {
    if (!window.isDestroyed()) window.destroy()
    await rm(tempFile, { force: true })
  }
}
