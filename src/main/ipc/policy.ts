import { AppError, ErrorCodes } from '../../shared/errors'
import type { IpcChannel, IpcMap } from '../../shared/ipc'
import { IPC_ROLES } from '../../shared/ipc'
import { getSession } from '../session'

/** Channels that stay available while a password change is still required. */
const LOCKDOWN_ALLOWED = [
  'auth:changePassword',
  'auth:logout',
  'auth:session',
  'app:info'
] as const satisfies readonly IpcChannel[]

const ALLOWED_WHILE_LOCKED = new Set<string>(LOCKDOWN_ALLOWED)

export function assertAuthorized(channel: IpcChannel): void {
  const policy = IPC_ROLES[channel]
  const session = getSession()

  if (policy === 'public') {
    return
  }
  if (!session) {
    throw new AppError(ErrorCodes.SESSION_EXPIRED, 'Please sign in again')
  }
  if (!(policy as readonly string[]).includes(session.role)) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      session.role === 'owner' ? 'Not allowed' : 'This action requires the owner account'
    )
  }
  if (session.mustChangePassword && !ALLOWED_WHILE_LOCKED.has(channel)) {
    throw new AppError(ErrorCodes.PASSWORD_CHANGE_REQUIRED, 'Please change your password to continue')
  }
}

export type IpcHandler<K extends IpcChannel> = (
  request: IpcMap[K]['req']
) => IpcMap[K]['res'] | Promise<IpcMap[K]['res']>

export type HandlerMap = { [K in IpcChannel]: IpcHandler<K> }
