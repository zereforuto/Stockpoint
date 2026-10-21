import { ipcMain } from 'electron'
import { AppError, ErrorCodes, fail, ok, type IpcErrorInfo, type IpcResult } from '../../shared/errors'
import { IPC_CHANNEL_NAMES, type IpcChannel } from '../../shared/ipc'
import { parseRequest } from '../../shared/schemas'
import type { Db } from '../db/database'
import { assertAuthorized, type HandlerMap } from './policy'
import { authHandlers } from './handlers/auth.handlers'
import { userHandlers } from './handlers/users.handlers'
import { catalogHandlers } from './handlers/catalog.handlers'
import { stockHandlers } from './handlers/stock.handlers'
import { salesHandlers } from './handlers/sales.handlers'
import { reportHandlers } from './handlers/reports.handlers'
import { systemHandlers } from './handlers/system.handlers'

/** Maps any thrown value to the plain-object error that crosses the bridge. */
export function toErrorInfo(error: unknown): IpcErrorInfo {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, issues: error.issues, meta: error.meta }
  }
  if (error && typeof error === 'object' && 'name' in error && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    if (/UNIQUE constraint failed/i.test(message)) {
      return { code: ErrorCodes.CONFLICT, message: 'That value is already taken' }
    }
    if (/FOREIGN KEY constraint failed/i.test(message)) {
      return { code: ErrorCodes.VALIDATION, message: 'A referenced record no longer exists' }
    }
  }
  console.error('[ipc] unhandled error:', error)
  return { code: ErrorCodes.INTERNAL, message: 'Something went wrong. Please try again.' }
}

/**
 * Registers one `ipcMain.handle` per channel. Everything is validated (Zod) and
 * authorized (role policy) here before a service ever runs.
 */
export function registerIpcHandlers(db: Db): void {
  const handlers: HandlerMap = {
    ...authHandlers(db),
    ...userHandlers(db),
    ...catalogHandlers(db),
    ...stockHandlers(db),
    ...salesHandlers(db),
    ...reportHandlers(db),
    ...systemHandlers(db)
  }

  for (const channel of IPC_CHANNEL_NAMES) {
    const handler = handlers[channel] as unknown as (request: unknown) => unknown | Promise<unknown>
    ipcMain.handle(channel, async (_event, raw) => {
      const result: IpcResult<unknown> = await (async () => {
        try {
          assertAuthorized(channel as IpcChannel)
          const request = parseRequest(channel, raw)
          return ok(await handler(request))
        } catch (error) {
          return fail(toErrorInfo(error))
        }
      })()
      return result
    })
  }
}
