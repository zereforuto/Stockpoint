import { useState, type FormEvent } from 'react'
import { passwordSchema, usernameSchema } from '@shared/schemas'
import { roleLabel } from '@shared/format'
import type { Role, User } from '@shared/types'
import { call } from '../api/client'
import { Field } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { Badge, EmptyState, PageHeader, Spinner } from '../components/ui/Primitives'
import { useAsyncData } from '../lib/hooks'
import { displayDateTime } from '../lib/format'
import { useSession } from '../stores/session'
import { useToasts } from '../stores/toast'

export function UsersPage() {
  const me = useSession((state) => state.user)
  const push = useToasts((state) => state.push)
  const pushError = useToasts((state) => state.pushError)

  const users = useAsyncData(() => call('users:list'), [])
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<User | null>(null)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const toggleActive = async (user: User): Promise<void> => {
    try {
      await call('users:setActive', { id: user.id, isActive: !user.isActive })
      push('success', `${user.fullName} ${user.isActive ? 'deactivated' : 'reactivated'}`)
      users.reload()
    } catch (error) {
      pushError(error)
    }
  }

  const submitReset = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!resetTarget) return
    const parsed = passwordSchema.safeParse(resetPassword)
    if (!parsed.success) {
      pushError(new Error(parsed.error.issues[0]?.message ?? 'Invalid password'))
      return
    }
    setBusy(true)
    try {
      await call('users:resetPassword', { id: resetTarget.id, newPassword: parsed.data })
      push('success', `Password reset for ${resetTarget.username}`)
      setResetTarget(null)
      setResetPassword('')
    } catch (error) {
      pushError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Who can sign in. Owners manage everything; cashiers can sell and look up products."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditing(null)
              setFormMode('create')
            }}
          >
            Add user
          </button>
        }
      />

      {users.loading ? (
        <Spinner label="Loading users…" />
      ) : users.error ? (
        <EmptyState title="Could not load users" message="Check the app logs and try again." />
      ) : !users.data || users.data.length === 0 ? (
        <EmptyState title="No users" message="Create at least one account so people can sign in." />
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th className="!text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => {
                const isSelf = user.id === me?.id
                return (
                  <tr key={user.id} className={user.isActive ? '' : 'opacity-60'}>
                    <td className="font-medium text-slate-900">
                      {user.fullName}
                      {isSelf ? <span className="ml-2 text-xs text-slate-400">(you)</span> : null}
                    </td>
                    <td className="font-mono text-xs">{user.username}</td>
                    <td>
                      <Badge tone={user.role === 'owner' ? 'indigo' : 'slate'}>{roleLabel(user.role)}</Badge>
                    </td>
                    <td>
                      {user.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
                      {user.mustChangePassword ? <Badge tone="amber">Must change password</Badge> : null}
                    </td>
                    <td className="text-sm text-slate-500">
                      {user.lastLoginAt ? displayDateTime(user.lastLoginAt) : <span className="text-slate-400">Never</span>}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn-ghost !px-2 !py-1 text-xs"
                          onClick={() => {
                            setEditing(user)
                            setFormMode('edit')
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-ghost !px-2 !py-1 text-xs"
                          onClick={() => {
                            setResetTarget(user)
                            setResetPassword('')
                          }}
                        >
                          Reset password
                        </button>
                        <button
                          type="button"
                          className="btn-ghost !px-2 !py-1 text-xs !text-rose-600 disabled:opacity-40"
                          disabled={isSelf}
                          title={isSelf ? 'You cannot deactivate your own account' : undefined}
                          onClick={() => void toggleActive(user)}
                        >
                          {user.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {formMode ? (
        <UserFormModal
          mode={formMode}
          user={editing}
          onClose={() => {
            setFormMode(null)
            setEditing(null)
          }}
          onSaved={() => {
            users.reload()
            setFormMode(null)
            setEditing(null)
          }}
        />
      ) : null}

      <Modal
        open={resetTarget !== null}
        title={`Reset password — ${resetTarget?.username ?? ''}`}
        onClose={() => setResetTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setResetTarget(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="reset-form" className="btn-primary" disabled={busy}>
              {busy ? 'Resetting…' : 'Reset password'}
            </button>
          </>
        }
      >
        <form id="reset-form" onSubmit={submitReset} className="space-y-3">
          <p className="text-sm text-slate-600">
            They will be able to sign in immediately with the new password. If you are resetting your own password,
            remember it for your next sign-in.
          </p>
          <Field label="New password" required hint="At least 8 characters">
            <input
              type="password"
              className="input"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              autoFocus
            />
          </Field>
        </form>
      </Modal>
    </div>
  )
}

function UserFormModal({
  mode,
  user,
  onClose,
  onSaved
}: {
  mode: 'create' | 'edit'
  user: User | null
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(user?.role ?? 'cashier')
  const [busy, setBusy] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const pushError = useToasts((state) => state.pushError)
  const push = useToasts((state) => state.push)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const errors: Record<string, string> = {}

    const nameParsed = usernameSchema.safeParse(username)
    if (!nameParsed.success) errors.username = nameParsed.error.issues[0]?.message ?? 'Invalid username'
    if (!fullName.trim()) errors.fullName = 'Full name is required'
    if (mode === 'create') {
      const pwParsed = passwordSchema.safeParse(password)
      if (!pwParsed.success) errors.password = pwParsed.error.issues[0]?.message ?? 'Invalid password'
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setBusy(true)
    try {
      const validatedUsername = nameParsed.data!
      if (mode === 'create') {
        await call('users:create', {
          username: validatedUsername,
          fullName: fullName.trim(),
          password,
          role
        })
        push('success', `Created ${fullName.trim()}`)
      } else {
        await call('users:update', {
          id: user!.id,
          username: validatedUsername,
          fullName: fullName.trim(),
          role
        })
        push('success', `Updated ${fullName.trim()}`)
      }
      onSaved()
    } catch (error) {
      pushError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={mode === 'create' ? 'Add user' : `Edit ${user?.fullName ?? 'user'}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save user'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <Field label="Full name" required error={fieldErrors.fullName}>
          <input className="input" value={fullName} onChange={(event) => setFullName(event.target.value)} autoFocus />
        </Field>
        <Field label="Username" required error={fieldErrors.username} hint="Used to sign in">
          <input
            className="input font-mono"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Role" required>
          <select className="input" value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="cashier">Cashier — sells products</option>
            <option value="owner">Owner — full access</option>
          </select>
        </Field>
        {mode === 'create' ? (
          <Field label="Initial password" required error={fieldErrors.password} hint="At least 8 characters">
            <input
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
        ) : null}
      </form>
    </Modal>
  )
}
