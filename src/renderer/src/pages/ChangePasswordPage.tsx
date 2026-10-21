import { useState, type FormEvent } from 'react'
import { call, errorMessage } from '../api/client'
import { Field } from '../components/ui/Field'
import { passwordSchema } from '@shared/schemas'
import { useSession } from '../stores/session'

export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useSession((state) => state.refresh)

  const strengthIssue = passwordSchema.safeParse(newPassword).success
    ? null
    : 'Password must be at least 8 characters'

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (busy) return
    setError(null)

    if (newPassword !== confirm) {
      setError('The new passwords do not match')
      return
    }
    if (!passwordSchema.safeParse(newPassword).success) {
      setError(strengthIssue)
      return
    }

    setBusy(true)
    try {
      await call('auth:changePassword', { currentPassword, newPassword })
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-xl font-bold text-slate-900">Change your password</h1>
        <p className="mt-1 text-sm text-slate-500">
          This account still has its initial password. Set a new one before using StockPoint.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Current password" required>
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </Field>
          <Field label="New password" required error={error ? strengthIssue : null} hint="At least 8 characters">
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password" required>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
            />
          </Field>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={busy || !currentPassword || !newPassword || !confirm}
          >
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </div>
    </div>
  )
}
