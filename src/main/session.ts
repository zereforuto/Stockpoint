import { AppError, ErrorCodes } from '../shared/errors'
import type { SessionUser } from '../shared/types'

/**
 * In-memory session for the single logged-in user. Lives in the main process so
 * the renderer can never forge a role; every IPC handler consults this.
 */
let current: SessionUser | null = null

export function getSession(): SessionUser | null {
  return current
}

export function setSession(user: SessionUser | null): void {
  current = user
}

export function requireSession(): SessionUser {
  if (!current) {
    throw new AppError(ErrorCodes.SESSION_EXPIRED, 'Please sign in again')
  }
  return current
}

export function requireOwner(): SessionUser {
  const session = requireSession()
  if (session.role !== 'owner') {
    throw new AppError(ErrorCodes.FORBIDDEN, 'This action requires the owner account')
  }
  return session
}
