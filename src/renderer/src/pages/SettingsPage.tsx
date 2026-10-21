import { useEffect, useState, type FormEvent } from 'react'
import { allowedChannels } from '@shared/ipc'
import { taxModeLabel } from '@shared/format'
import type { Settings, TaxMode } from '@shared/types'
import { call } from '../api/client'
import { Field } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { PageHeader, Spinner } from '../components/ui/Primitives'
import { useAsyncData } from '../lib/hooks'
import { displayDateTime } from '../lib/format'
import { useSession } from '../stores/session'
import { useToasts } from '../stores/toast'

interface FormState {
  shopName: string
  address: string
  currency: string
  currencySymbol: string
  taxRateText: string
  taxMode: TaxMode
  receiptFooter: string
  autoBackupEnabled: boolean
  backupDir: string
  retainText: string
}

function toForm(settings: Settings): FormState {
  return {
    shopName: settings.shopName,
    address: settings.address,
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    taxRateText: String(settings.taxRatePercent),
    taxMode: settings.taxMode,
    receiptFooter: settings.receiptFooter,
    autoBackupEnabled: settings.autoBackupEnabled,
    backupDir: settings.backupDir ?? '',
    retainText: String(settings.retainBackups)
  }
}

export function SettingsPage() {
  const role = useSession((state) => state.user?.role ?? null)
  const refresh = useSession((state) => state.refresh)
  const appInfo = useSession((state) => state.appInfo)
  const loadAppInfo = useSession((state) => state.loadAppInfo)
  const push = useToasts((state) => state.push)
  const pushError = useToasts((state) => state.pushError)
  const canEdit = allowedChannels(role).has('settings:update')
  const canBackup = allowedChannels(role).has('backup:export')

  const loaded = useAsyncData(() => call('settings:get'), [])
  const [form, setForm] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [importTarget, setImportTarget] = useState<string | null>(null)

  useEffect(() => {
    if (loaded.data) setForm(toForm(loaded.data))
  }, [loaded.data])

  useEffect(() => {
    if (!appInfo) void loadAppInfo()
  }, [appInfo, loadAppInfo])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous))

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!form) return

    const taxRate = Number(form.taxRateText)
    const retain = Number(form.retainText)
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      pushError(new Error('Tax rate must be between 0 and 100.'))
      return
    }
    if (!Number.isInteger(retain) || retain < 1 || retain > 365) {
      pushError(new Error('Keep between 1 and 365 backups.'))
      return
    }
    if (!form.shopName.trim()) {
      pushError(new Error('Shop name is required.'))
      return
    }

    setBusy(true)
    try {
      await call('settings:update', {
        shopName: form.shopName.trim(),
        address: form.address.trim(),
        currency: form.currency.trim() || 'PHP',
        currencySymbol: form.currencySymbol.trim() || '₱',
        taxRatePercent: taxRate,
        taxMode: form.taxMode,
        receiptFooter: form.receiptFooter,
        autoBackupEnabled: form.autoBackupEnabled,
        backupDir: form.backupDir.trim() || null,
        retainBackups: retain
      })
      await refresh()
      loaded.reload()
      push('success', 'Settings saved')
    } catch (error) {
      pushError(error)
    } finally {
      setBusy(false)
    }
  }

  const runBackup = async (): Promise<void> => {
    setBackupBusy(true)
    try {
      const picked = await call('dialog:saveFile', {
        defaultName: `stockpoint-backup-${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: 'SQLite database', extensions: ['db'] }]
      })
      if (!picked.path) return
      const result = await call('backup:export', { filePath: picked.path })
      push('success', `Backup written (${Math.round(result.bytes / 1024)} KB)`)
      loaded.reload()
      await refresh()
    } catch (error) {
      pushError(error)
    } finally {
      setBackupBusy(false)
    }
  }

  const chooseBackupFolder = async (): Promise<void> => {
    try {
      const picked = await call('backup:pickFolder')
      if (!picked.path) return
      set('backupDir', picked.path)
    } catch (error) {
      pushError(error)
    }
  }

  const pickImport = async (): Promise<void> => {
    try {
      const picked = await call('dialog:pickFile', {
        properties: ['openFile'],
        filters: [{ name: 'Backup database', extensions: ['db', 'sqlite', 'sqlite3'] }]
      })
      if (!picked.path) return
      setImportTarget(picked.path)
    } catch (error) {
      pushError(error)
    }
  }

  const confirmImport = async (): Promise<void> => {
    if (!importTarget) return
    setBackupBusy(true)
    try {
      await call('backup:import', { filePath: importTarget })
      push('success', 'Backup restored — the app will restart in a moment')
      setImportTarget(null)
    } catch (error) {
      pushError(error)
    } finally {
      setBackupBusy(false)
    }
  }

  if (!form || !loaded.data) return <Spinner label="Loading settings…" />

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Shop identity, taxes, receipts and backups." />

      <form onSubmit={submit} className="card max-w-3xl p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Shop & receipts</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shop name" required>
            <input
              className="input"
              value={form.shopName}
              onChange={(event) => set('shopName', event.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Currency code">
            <input
              className="input font-mono"
              value={form.currency}
              onChange={(event) => set('currency', event.target.value)}
              disabled={!canEdit}
              maxLength={8}
            />
          </Field>
          <Field label="Currency symbol" hint="Shown on receipts and reports">
            <input
              className="input"
              value={form.currencySymbol}
              onChange={(event) => set('currencySymbol', event.target.value)}
              disabled={!canEdit}
              maxLength={8}
            />
          </Field>
          <Field label="Tax rate (%)">
            <input
              className="input text-right"
              inputMode="decimal"
              value={form.taxRateText}
              onChange={(event) => set('taxRateText', event.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Tax mode" hint={`Currently applied as: ${taxModeLabel(form.taxMode)}`}>
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={form.taxMode === 'inclusive'}
                    onChange={() => set('taxMode', 'inclusive')}
                    disabled={!canEdit}
                  />
                  Prices include tax
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={form.taxMode === 'exclusive'}
                    onChange={() => set('taxMode', 'exclusive')}
                    disabled={!canEdit}
                  />
                  Tax added at checkout
                </label>
              </div>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address">
              <input
                className="input"
                value={form.address}
                onChange={(event) => set('address', event.target.value)}
                disabled={!canEdit}
                maxLength={300}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Receipt footer" hint="Printed at the bottom of every receipt">
              <textarea
                className="input min-h-20"
                value={form.receiptFooter}
                onChange={(event) => set('receiptFooter', event.target.value)}
                disabled={!canEdit}
                maxLength={300}
              />
            </Field>
          </div>
        </div>

        <h2 className="mb-4 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Automatic backups</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.autoBackupEnabled}
              onChange={(event) => set('autoBackupEnabled', event.target.checked)}
              disabled={!canEdit}
            />
            Back up hourly while the app runs
          </label>
          <Field label="Keep this many backups">
            <input
              className="input text-right"
              inputMode="numeric"
              value={form.retainText}
              onChange={(event) => set('retainText', event.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Backup folder" hint="Leave empty to use the app data folder">
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={form.backupDir}
                  onChange={(event) => set('backupDir', event.target.value)}
                  disabled={!canEdit}
                  placeholder="No folder selected"
                />
                {canEdit ? (
                  <button type="button" className="btn-secondary" onClick={() => void chooseBackupFolder()}>
                    Browse…
                  </button>
                ) : null}
              </div>
            </Field>
            <p className="mt-1 text-xs text-slate-500">
              Last backup:{' '}
              {loaded.data.lastBackupAt ? displayDateTime(loaded.data.lastBackupAt) : 'never'}
            </p>
          </div>
        </div>

        {canEdit ? (
          <div className="mt-6 flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
            {loaded.data.shopName !== form.shopName ? (
              <span className="text-xs text-amber-600">Unsaved changes</span>
            ) : null}
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-500">Only an owner can change these settings.</p>
        )}
      </form>

      {canBackup ? (
        <section className="card max-w-3xl p-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Manual backup & restore</h2>
          <p className="mb-4 text-sm text-slate-500">
            Backups are plain SQLite files you can copy to a USB drive or cloud folder. Restoring replaces all current
            data with the contents of the backup file.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => void runBackup()} disabled={backupBusy}>
              {backupBusy ? 'Working…' : 'Back up now…'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => void pickImport()} disabled={backupBusy}>
              Restore from backup…
            </button>
          </div>
        </section>
      ) : null}

      {appInfo ? (
        <section className="card max-w-3xl p-5 text-sm text-slate-600">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">About</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-slate-400">Version</dt>
            <dd className="font-mono">{appInfo.version}{appInfo.isPackaged ? '' : ' (dev)'}</dd>
            <dt className="text-slate-400">Platform</dt>
            <dd>{appInfo.platform}</dd>
            <dt className="text-slate-400">Data folder</dt>
            <dd className="break-all font-mono text-xs">{appInfo.dataDir}</dd>
            <dt className="text-slate-400">Database</dt>
            <dd className="break-all font-mono text-xs">{appInfo.dbPath}</dd>
          </dl>
        </section>
      ) : null}

      <Modal
        open={importTarget !== null}
        title="Restore backup?"
        onClose={() => setImportTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setImportTarget(null)} disabled={backupBusy}>
              Cancel
            </button>
            <button type="button" className="btn-danger" onClick={() => void confirmImport()} disabled={backupBusy}>
              {backupBusy ? 'Restoring…' : 'Replace all data'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-rose-50 p-3 text-rose-700">
            This replaces <strong>every product, sale, user and setting</strong> with the contents of the selected
            backup. A copy of the current database is saved next to it first.
          </div>
          <p className="break-all font-mono text-xs text-slate-500">{importTarget}</p>
        </div>
      </Modal>
    </div>
  )
}
