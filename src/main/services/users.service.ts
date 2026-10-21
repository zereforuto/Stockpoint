import { AppError, ErrorCodes } from '../../shared/errors'
import type { CreateUserInput, ResetPasswordInput, SetActiveInput, UpdateUserInput } from '../../shared/ipc'
import { localNow } from '../../shared/times'
import type { User } from '../../shared/types'
import type { Db } from '../db/database'
import * as usersRepo from '../repos/users.repo'
import { requireOwner } from '../session'
import { hashPassword } from './auth.service'

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

export function listUsers(db: Db): User[] {
  requireOwner()
  return usersRepo.listUsers(db)
}

export function createUser(db: Db, input: CreateUserInput): User {
  requireOwner()
  try {
    return usersRepo.insertUser(db, {
      username: input.username,
      fullName: input.fullName,
      role: input.role,
      passwordHash: hashPassword(input.password),
      mustChangePassword: true,
      createdAt: localNow()
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(ErrorCodes.CONFLICT, `Username "${input.username}" is already taken`)
    }
    throw error
  }
}

export function updateUser(db: Db, input: UpdateUserInput): User {
  const actor = requireOwner()
  const target = usersRepo.findUserById(db, input.id)
  if (!target) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'User not found')
  }
  if (input.role === 'cashier' && target.role === 'owner' && target.id === actor.id) {
    throw new AppError(ErrorCodes.VALIDATION, 'You cannot change your own role to cashier')
  }
  try {
    return usersRepo.updateUser(
      db,
      input.id,
      { username: input.username, fullName: input.fullName, role: input.role },
      localNow()
    )
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(ErrorCodes.CONFLICT, `Username "${input.username}" is already taken`)
    }
    throw error
  }
}

export function setActive(db: Db, input: SetActiveInput): User {
  const actor = requireOwner()
  const target = usersRepo.findUserById(db, input.id)
  if (!target) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'User not found')
  }
  if (!input.isActive) {
    if (target.id === actor.id) {
      throw new AppError(ErrorCodes.VALIDATION, 'You cannot deactivate your own account')
    }
    if (target.role === 'owner' && usersRepo.countActiveOwners(db) <= 1) {
      throw new AppError(ErrorCodes.VALIDATION, 'The shop must keep at least one active owner')
    }
  }
  return usersRepo.setUserActive(db, input.id, input.isActive, localNow())
}

export function resetPassword(db: Db, input: ResetPasswordInput): { ok: true } {
  requireOwner()
  const target = usersRepo.findUserById(db, input.id)
  if (!target) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'User not found')
  }
  usersRepo.setPasswordHash(db, input.id, hashPassword(input.newPassword), true, localNow())
  return { ok: true }
}
