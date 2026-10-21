import { compareSync, hashSync } from 'bcryptjs'
import { AppError, ErrorCodes } from '../../shared/errors'
import { localNow } from '../../shared/times'
import type { ChangePasswordInput, LoginInput } from '../../shared/ipc'
import type { LoginResult, SessionUser } from '../../shared/types'
import type { Db } from '../db/database'
import { findUserWithHashByUsername, setPasswordHash, touchLastLogin } from '../repos/users.repo'
import { requireSession, setSession } from '../session'
import { passwordSchema } from '../../shared/schemas'

const BCRYPT_ROUNDS = 10

/**
 * Compared against when the username does not exist so the response time does
 * not reveal whether an account is present.
 */
let dummyHash: string | null = null

function timingSafeCompare(password: string, storedHash: string | null): boolean {
  if (storedHash) return compareSync(password, storedHash)
  dummyHash ??= hashSync('stockpoint-timing-equalizer', 4)
  compareSync(password, dummyHash)
  return false
}

export function hashPassword(password: string): string {
  return hashSync(password, BCRYPT_ROUNDS)
}

export function login(db: Db, input: LoginInput): LoginResult {
  const user = findUserWithHashByUsername(db, input.username.trim())
  if (!user || !user.isActive) {
    timingSafeCompare(input.password, null)
    throw new AppError(ErrorCodes.INVALID_CREDENTIALS, 'Incorrect username or password')
  }
  if (!compareSync(input.password, user.passwordHash)) {
    throw new AppError(ErrorCodes.INVALID_CREDENTIALS, 'Incorrect username or password')
  }

  touchLastLogin(db, user.id, localNow())
  const session: SessionUser = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    mustChangePassword: user.mustChangePassword
  }
  setSession(session)
  return { user: session }
}

export function logout(): { ok: true } {
  setSession(null)
  return { ok: true }
}

export function changePassword(db: Db, input: ChangePasswordInput): SessionUser {
  const session = requireSession()
  const user = findUserWithHashByUsername(db, session.username)
  if (!user || !compareSync(input.currentPassword, user.passwordHash)) {
    throw new AppError(ErrorCodes.INVALID_CREDENTIALS, 'Current password is incorrect')
  }
  const parsed = passwordSchema.safeParse(input.newPassword)
  if (!parsed.success) {
    throw new AppError(ErrorCodes.VALIDATION, 'New password does not meet the requirements', {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    })
  }
  setPasswordHash(db, user.id, hashPassword(input.newPassword), false, localNow())
  const updated: SessionUser = { ...session, mustChangePassword: false }
  setSession(updated)
  return updated
}
