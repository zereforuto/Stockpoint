import type { Role, User } from '../../shared/types'
import type { Db } from '../db/database'

interface UserRow {
  id: number
  username: string
  password_hash: string
  full_name: string
  role: Role
  is_active: number
  must_change_password: number
  created_at: string
  last_login_at: string | null
}

export interface UserWithHash extends User {
  passwordHash: string
}

const USER_COLUMNS = `id, username, password_hash, full_name, role, is_active, must_change_password, created_at, last_login_at`

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active === 1,
    mustChangePassword: row.must_change_password === 1,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  }
}

export function findUserWithHashByUsername(db: Db, username: string): UserWithHash | null {
  const row = db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ? COLLATE NOCASE`)
    .get(username) as UserRow | undefined
  if (!row) return null
  return { ...mapUser(row), passwordHash: row.password_hash }
}

export function findUserById(db: Db, id: number): User | null {
  const row = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) as UserRow | undefined
  return row ? mapUser(row) : null
}

export function listUsers(db: Db): User[] {
  const rows = db.prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY username COLLATE NOCASE`).all() as UserRow[]
  return rows.map(mapUser)
}

export interface InsertUserInput {
  username: string
  passwordHash: string
  fullName: string
  role: Role
  mustChangePassword?: boolean
  createdAt: string
}

export function insertUser(db: Db, input: InsertUserInput): User {
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .run(
      input.username,
      input.passwordHash,
      input.fullName,
      input.role,
      input.mustChangePassword ? 1 : 0,
      input.createdAt,
      input.createdAt
    )
  return findUserById(db, Number(info.lastInsertRowid)) as User
}

export interface UpdateUserPatch {
  username?: string
  fullName?: string
  role?: Role
}

export function updateUser(db: Db, id: number, patch: UpdateUserPatch, updatedAt: string): User {
  const assignments: string[] = []
  const params: unknown[] = []
  if (patch.username !== undefined) {
    assignments.push('username = ?')
    params.push(patch.username)
  }
  if (patch.fullName !== undefined) {
    assignments.push('full_name = ?')
    params.push(patch.fullName)
  }
  if (patch.role !== undefined) {
    assignments.push('role = ?')
    params.push(patch.role)
  }
  if (assignments.length > 0) {
    assignments.push('updated_at = ?')
    params.push(updatedAt, id)
    db.prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`).run(...params)
  }
  return findUserById(db, id) as User
}

export function setUserActive(db: Db, id: number, isActive: boolean, updatedAt: string): User {
  db.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?').run(
    isActive ? 1 : 0,
    updatedAt,
    id
  )
  return findUserById(db, id) as User
}

export function setPasswordHash(db: Db, id: number, passwordHash: string, mustChange: boolean, updatedAt: string): void {
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?').run(
    passwordHash,
    mustChange ? 1 : 0,
    updatedAt,
    id
  )
}

export function touchLastLogin(db: Db, id: number, at: string): void {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(at, id)
}

export function countActiveOwners(db: Db): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND is_active = 1")
    .get() as { n: number }
  return row.n
}
