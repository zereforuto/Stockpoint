import { useState, type FormEvent } from 'react'
import { allowedChannels } from '@shared/ipc'
import type { Category } from '@shared/types'
import { call } from '../api/client'
import { Field } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { EmptyState, PageHeader, Spinner } from '../components/ui/Primitives'
import { useAsyncData } from '../lib/hooks'
import { useSession } from '../stores/session'
import { useToasts } from '../stores/toast'

export function CategoriesPage() {
  const role = useSession((state) => state.user?.role ?? null)
  const canWrite = allowedChannels(role).has('categories:create')
  const push = useToasts((state) => state.push)
  const pushError = useToasts((state) => state.pushError)

  const categories = useAsyncData(() => call('categories:list'), [])
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)

  const remove = async (): Promise<void> => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await call('categories:delete', { id: deleteTarget.id })
      push('success', `Deleted ${deleteTarget.name}`)
      setDeleteTarget(null)
      categories.reload()
    } catch (error) {
      pushError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Group products so shoppers and reports stay organised."
        actions={
          canWrite ? (
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              Add category
            </button>
          ) : null
        }
      />

      {categories.loading ? (
        <Spinner label="Loading categories…" />
      ) : categories.error ? (
        <EmptyState title="Could not load categories" message="Check the app logs and try again." />
      ) : !categories.data || categories.data.length === 0 ? (
        <EmptyState
          title="No categories yet"
          message="Create one to start grouping your products."
          action={
            canWrite ? (
              <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
                Add category
              </button>
            ) : null
          }
        />
      ) : (
        <div className="card max-w-2xl overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {categories.data.map((category) => (
              <li key={category.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-medium text-slate-800">{category.name}</div>
                  <div className="text-xs text-slate-400">Order {category.sortOrder}</div>
                </div>
                {canWrite ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="btn-ghost !px-2 !py-1 text-xs"
                      onClick={() => setEditing(category)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !px-2 !py-1 text-xs !text-rose-600"
                      onClick={() => setDeleteTarget(category)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing ? (
        <CategoryModal
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            categories.reload()
            setEditing(null)
          }}
        />
      ) : null}

      <Modal
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.name ?? ''}?`}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-danger" onClick={() => void remove()} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Products in this category will keep existing but become uncategorised. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}

function CategoryModal({
  category,
  onClose,
  onSaved
}: {
  category: Category | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pushError = useToasts((state) => state.pushError)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (category) {
        await call('categories:update', { id: category.id, name: trimmed })
      } else {
        await call('categories:create', { name: trimmed })
      }
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Save failed')
      pushError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={category ? 'Rename category' : 'Add category'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="category-form" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit}>
        <Field label="Name" required error={error ?? undefined}>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={64}
            autoFocus
            placeholder="e.g. Beverages"
          />
        </Field>
      </form>
    </Modal>
  )
}
