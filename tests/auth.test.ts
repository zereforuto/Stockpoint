import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as authService from '../src/main/services/auth.service'
import * as usersService from '../src/main/services/users.service'
import { getSession, setSession } from '../src/main/session'
import { ErrorCodes } from '../src/shared/errors'
import { createTestDb, expectAppError, type TestContext } from './helpers/testDb'

let ctx: TestContext

beforeEach(() => {
  ctx = createTestDb()
  setSession(null)
})

afterEach(() => {
  ctx.close()
})

describe('login', () => {
  it('signs the seeded owner in and flags the first-run password change', () => {
    const result = authService.login(ctx.db, { username: 'owner', password: 'owner123' })

    expect(result.user.username).toBe('owner')
    expect(result.user.role).toBe('owner')
    expect(result.user.mustChangePassword).toBe(true)
    expect(getSession()).toMatchObject({ username: 'owner', role: 'owner' })
  })

  it('trims the username so " owner " still works', () => {
    const result = authService.login(ctx.db, { username: '  owner  ', password: 'owner123' })
    expect(result.user.username).toBe('owner')
  })

  it('rejects wrong passwords and unknown users with the same message', () => {
    const wrongPassword = expectAppError(
      () => authService.login(ctx.db, { username: 'owner', password: 'nope1234' }),
      ErrorCodes.INVALID_CREDENTIALS
    )
    const unknownUser = expectAppError(
      () => authService.login(ctx.db, { username: 'ghost', password: 'whatever' }),
      ErrorCodes.INVALID_CREDENTIALS
    )
    expect(wrongPassword.message).toBe(unknownUser.message)
    expect(getSession()).toBeNull()
  })

  it('does not reveal a deactivated account', () => {
    setSession({ id: 1, username: 'owner', fullName: 'Shop Owner', role: 'owner', mustChangePassword: false })
    const cashier = usersService.createUser(ctx.db, {
      username: 'cashier1',
      fullName: 'Cash One',
      password: 'cashier123',
      role: 'cashier'
    })
    usersService.setActive(ctx.db, { id: cashier.id, isActive: false })
    setSession(null)

    expectAppError(
      () => authService.login(ctx.db, { username: 'cashier1', password: 'cashier123' }),
      ErrorCodes.INVALID_CREDENTIALS
    )
    expect(getSession()).toBeNull()
  })

  it('signs out and clears the session', () => {
    authService.login(ctx.db, { username: 'owner', password: 'owner123' })
    expect(getSession()).not.toBeNull()

    authService.logout()
    expect(getSession()).toBeNull()
    expectAppError(() => usersService.listUsers(ctx.db), ErrorCodes.SESSION_EXPIRED)
  })
})

describe('password change', () => {
  beforeEach(() => {
    authService.login(ctx.db, { username: 'owner', password: 'owner123' })
  })

  it('requires a signed-in session', () => {
    setSession(null)
    expectAppError(
      () => authService.changePassword(ctx.db, { currentPassword: 'owner123', newPassword: 'brandnew123' }),
      ErrorCodes.SESSION_EXPIRED
    )
  })

  it('rejects a wrong current password', () => {
    expectAppError(
      () => authService.changePassword(ctx.db, { currentPassword: 'not-the-one', newPassword: 'brandnew123' }),
      ErrorCodes.INVALID_CREDENTIALS
    )
  })

  it('rejects a weak new password with field issues', () => {
    const error = expectAppError(
      () => authService.changePassword(ctx.db, { currentPassword: 'owner123', newPassword: 'short' }),
      ErrorCodes.VALIDATION
    )
    expect(error.issues?.length).toBeGreaterThan(0)
  })

  it('stores the new password and clears the first-run flag', () => {
    const user = authService.changePassword(ctx.db, {
      currentPassword: 'owner123',
      newPassword: 'brandnew123'
    })

    expect(user.mustChangePassword).toBe(false)
    expect(getSession()?.mustChangePassword).toBe(false)

    setSession(null)
    expectAppError(
      () => authService.login(ctx.db, { username: 'owner', password: 'owner123' }),
      ErrorCodes.INVALID_CREDENTIALS
    )
    expect(authService.login(ctx.db, { username: 'owner', password: 'brandnew123' }).user.username).toBe('owner')
  })

  it('hashes the password rather than storing it', () => {
    authService.changePassword(ctx.db, { currentPassword: 'owner123', newPassword: 'brandnew123' })
    const row = ctx.db.prepare('SELECT password_hash AS hash FROM users WHERE id = 1').get() as { hash: string }
    expect(row.hash).not.toBe('brandnew123')
    expect(row.hash).toMatch(/^\$2[aby]\$/)
  })
})

describe('user management', () => {
  beforeEach(() => {
    setSession({ id: 1, username: 'owner', fullName: 'Shop Owner', role: 'owner', mustChangePassword: false })
  })

  it('is owner-only', () => {
    setSession({ id: 1, username: 'owner', fullName: 'Shop Owner', role: 'cashier', mustChangePassword: false })
    expectAppError(() => usersService.listUsers(ctx.db), ErrorCodes.FORBIDDEN)
    expectAppError(
      () =>
        usersService.createUser(ctx.db, {
          username: 'someone',
          fullName: 'Some One',
          password: 'password123',
          role: 'cashier'
        }),
      ErrorCodes.FORBIDDEN
    )
  })

  it('creates a cashier that can log in with the hashed password', () => {
    const created = usersService.createUser(ctx.db, {
      username: 'cashier1',
      fullName: 'Cash One',
      password: 'cashier123',
      role: 'cashier'
    })

    expect(created.role).toBe('cashier')
    expect(created.mustChangePassword).toBe(true)
    expect(created.isActive).toBe(true)

    const stored = ctx.db.prepare('SELECT password_hash AS hash FROM users WHERE id = ?').get(created.id) as {
      hash: string
    }
    expect(stored.hash).not.toBe('cashier123')

    setSession(null)
    const login = authService.login(ctx.db, { username: 'cashier1', password: 'cashier123' })
    expect(login.user.role).toBe('cashier')
    expect(login.user.mustChangePassword).toBe(true)
  })

  it('rejects a duplicate username', () => {
    const input = { username: 'owner', fullName: 'Impostor', password: 'password123', role: 'cashier' as const }
    expectAppError(() => usersService.createUser(ctx.db, input), ErrorCodes.CONFLICT)
  })

  it('updates profile details but never lets you demote yourself', () => {
    const cashier = usersService.createUser(ctx.db, {
      username: 'cashier1',
      fullName: 'Cash One',
      password: 'cashier123',
      role: 'cashier'
    })

    const updated = usersService.updateUser(ctx.db, {
      id: cashier.id,
      fullName: 'Cash One Renamed',
      role: 'owner'
    })
    expect(updated.fullName).toBe('Cash One Renamed')
    expect(updated.role).toBe('owner')

    expectAppError(
      () => usersService.updateUser(ctx.db, { id: 1, username: 'owner', fullName: 'Shop Owner', role: 'cashier' }),
      ErrorCodes.VALIDATION
    )
    expectAppError(
      () => usersService.updateUser(ctx.db, { id: 999999, fullName: 'Ghost' }),
      ErrorCodes.NOT_FOUND
    )
  })

  it('catches username collisions on update', () => {
    const cashier = usersService.createUser(ctx.db, {
      username: 'cashier1',
      fullName: 'Cash One',
      password: 'cashier123',
      role: 'cashier'
    })
    expectAppError(
      () => usersService.updateUser(ctx.db, { id: cashier.id, username: 'owner' }),
      ErrorCodes.CONFLICT
    )
  })

  it('never lets the shop lose every active owner', () => {
    const secondOwner = usersService.createUser(ctx.db, {
      username: 'owner2',
      fullName: 'Second Owner',
      password: 'owner2pass',
      role: 'owner'
    })

    // Removing the other owner while two exist is fine.
    usersService.setActive(ctx.db, { id: secondOwner.id, isActive: false })
    expect(usersService.listUsers(ctx.db).find((user) => user.id === secondOwner.id)?.isActive).toBe(false)

    // Reactivate, then simulate a stale session whose own account is already
    // inactive: only one active owner remains, so it cannot be removed.
    usersService.setActive(ctx.db, { id: secondOwner.id, isActive: true })
    ctx.db.prepare('UPDATE users SET is_active = 0 WHERE id = 1').run()
    expectAppError(
      () => usersService.setActive(ctx.db, { id: secondOwner.id, isActive: false }),
      ErrorCodes.VALIDATION
    )

    expectAppError(() => usersService.setActive(ctx.db, { id: 424242, isActive: false }), ErrorCodes.NOT_FOUND)
    expectAppError(() => usersService.setActive(ctx.db, { id: 1, isActive: false }), ErrorCodes.VALIDATION)
  })

  it('resets a password and forces another change at next login', () => {
    const cashier = usersService.createUser(ctx.db, {
      username: 'cashier1',
      fullName: 'Cash One',
      password: 'cashier123',
      role: 'cashier'
    })

    usersService.resetPassword(ctx.db, { id: cashier.id, newPassword: 'temporary99' })

    setSession(null)
    expectAppError(
      () => authService.login(ctx.db, { username: 'cashier1', password: 'cashier123' }),
      ErrorCodes.INVALID_CREDENTIALS
    )
    expect(authService.login(ctx.db, { username: 'cashier1', password: 'temporary99' }).user.mustChangePassword).toBe(
      true
    )

    setSession({ id: 1, username: 'owner', fullName: 'Shop Owner', role: 'owner', mustChangePassword: false })
    expectAppError(
      () => usersService.resetPassword(ctx.db, { id: 424242, newPassword: 'temporary99' }),
      ErrorCodes.NOT_FOUND
    )
  })
})
