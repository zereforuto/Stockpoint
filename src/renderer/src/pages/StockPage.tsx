import { useState, type FormEvent } from 'react'
import { allowedChannels } from '@shared/ipc'
import { movementTypeLabel } from '@shared/format'
import type { Product, StockAdjustInput, StockMovementType } from '@shared/types'
import { call } from '../api/client'
import { Field } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { Badge, EmptyState, PageHeader, Spinner } from '../components/ui/Primitives'
import { useAsyncData } from '../lib/hooks'
import { displayDateTime } from '../lib/format'
import { useSession } from '../stores/session'
import { useToasts } from '../stores/toast'

const ADJUST_TYPES: StockMovementType[] = ['restock', 'damaged', 'correction', 'adjustment']

const TYPE_TONE: Record<string, 'green' | 'red' | 'amber' | 'indigo' | 'slate'> = {
  sale: 'indigo',
  void: 'green',
  restock: 'green',
  damaged: 'red',
  correction: 'amber',
  adjustment: 'slate',
  import: 'indigo'
}

export function StockPage() {
  const role = useSession((state) => state.user?.role ?? null)
  const canAdjust = allowedChannels(role).has('stock:adjust')
  const push = useToasts((state) => state.push)
  const pushError = useToasts((state) => state.pushError)

  const [productId, setProductId] = useState<number | ''>('')
  const [modalOpen, setModalOpen] = useState(false)

  const movements = useAsyncData(
    () => call('stock:movements', { productId: productId === '' ? null : productId, limit: 200 }),
    [productId]
  )

  const filterProducts = useAsyncData(() => call('products:list', { includeInactive: true, limit: 500 }), [])

  const lowStock = useAsyncData(
    () => call('products:list', { lowStockOnly: true, includeInactive: true, limit: 50 }),
    [movements.data]
  )

  return (
    <div>
      <PageHeader
        title="Stock movements"
        subtitle="Full audit trail of every quantity change: sales, voids, restocks and corrections."
        actions={
          canAdjust ? (
            <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
              Adjust stock
            </button>
          ) : null
        }
      />

      {lowStock.data && lowStock.data.items.length > 0 && canAdjust ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="font-semibold">{lowStock.data.items.length} product(s) at or below reorder level:</span>{' '}
          {lowStock.data.items.slice(0, 5).map((product) => product.name).join(', ')}
          {lowStock.data.items.length > 5 ? '…' : ''}
        </div>
      ) : null}

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="w-64">
          <Field label="Filter by product">
            <select
              className="input"
              value={productId === '' ? '' : String(productId)}
              onChange={(event) => setProductId(event.target.value ? Number(event.target.value) : '')}
            >
              <option value="">All products</option>
              {(filterProducts.data?.items ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="pb-2 text-xs text-slate-400">Showing the latest 200 movements.</p>
      </div>

      {movements.loading ? (
        <Spinner label="Loading movements…" />
      ) : movements.error ? (
        <EmptyState title="Could not load stock movements" message="Check the app logs and try again." />
      ) : !movements.data || movements.data.length === 0 ? (
        <EmptyState
          title="No movements yet"
          message="Sales, voids and manual adjustments will appear here."
          action={
            canAdjust ? (
              <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
                Adjust stock
              </button>
            ) : null
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>Type</th>
                <th className="!text-right">Change</th>
                <th>Reason</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {movements.data.map((movement) => (
                <tr key={movement.id}>
                  <td className="whitespace-nowrap text-sm">{displayDateTime(movement.createdAt)}</td>
                  <td className="font-medium text-slate-900">{movement.productName}</td>
                  <td>
                    <Badge tone={TYPE_TONE[movement.type] ?? 'slate'}>{movementTypeLabel(movement.type)}</Badge>
                  </td>
                  <td className={`text-right font-semibold tabular-nums ${movement.delta > 0 ? 'text-emerald-600' : movement.delta < 0 ? 'text-rose-600' : ''}`}>
                    {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                  </td>
                  <td className="max-w-xs truncate text-slate-600">
                    {movement.reason ??
                      (movement.refType && movement.refId ? `${movement.refType} #${movement.refId}` : '—')}
                  </td>
                  <td className="text-slate-500">{movement.userName ?? 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdjustModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onDone={() => {
          movements.reload()
          lowStock.reload()
          push('success', 'Stock updated')
        }}
        pushError={pushError}
      />
    </div>
  )
}

function AdjustModal({
  open,
  onClose,
  onDone,
  pushError
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
  pushError: (error: unknown) => void
}) {
  const [term, setTerm] = useState('')
  const [product, setProduct] = useState<Product | null>(null)
  const [deltaText, setDeltaText] = useState('10')
  const [type, setType] = useState<StockMovementType>('restock')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const results = useAsyncData(
    () => (open && term.trim().length >= 1 && !product ? call('products:search', { term: term.trim(), limit: 8 }) : Promise.resolve([])),
    [open, term, product]
  )

  const reset = (): void => {
    setTerm('')
    setProduct(null)
    setDeltaText('10')
    setType('restock')
    setReason('')
    setError(null)
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!product) {
      setError('Pick a product first.')
      return
    }
    const delta = Number(deltaText)
    if (!Number.isInteger(delta) || delta === 0) {
      setError('Quantity change must be a whole number other than 0.')
      return
    }
    if (delta < 0 && product.stockQty + delta < 0) {
      setError(`That would take stock below zero (currently ${product.stockQty}).`)
      return
    }

    const payload: StockAdjustInput = {
      productId: product.id,
      delta,
      type,
      reason: reason.trim() || undefined
    }

    setBusy(true)
    setError(null)
    try {
      await call('stock:adjust', payload)
      onDone()
      reset()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Adjustment failed')
      pushError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Adjust stock"
      onClose={() => {
        reset()
        onClose()
      }}
      wide
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              reset()
              onClose()
            }}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" form="adjust-form" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Apply adjustment'}
          </button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        <Field label="Product" required error={error ?? undefined}>
          {product ? (
            <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
              <div>
                <div className="font-medium text-indigo-900">{product.name}</div>
                <div className="font-mono text-xs text-indigo-500">
                  {product.sku} · {product.stockQty} in stock
                </div>
              </div>
              <button type="button" className="btn-ghost !px-2 text-xs" onClick={() => setProduct(null)}>
                Change
              </button>
            </div>
          ) : (
            <div>
              <input
                className="input"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search name, SKU or barcode…"
                autoFocus
              />
              {results.loading ? (
                <p className="mt-1 text-xs text-slate-400">Searching…</p>
              ) : results.data && results.data.length > 0 ? (
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                  {results.data.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50"
                        onClick={() => {
                          setProduct(candidate)
                          setError(null)
                        }}
                      >
                        <span>
                          <span className="font-medium">{candidate.name}</span>{' '}
                          <span className="font-mono text-xs text-slate-400">{candidate.sku}</span>
                        </span>
                        <span className="tabular-nums text-slate-500">{candidate.stockQty}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : term.trim() ? (
                <p className="mt-1 text-xs text-slate-400">No products match “{term}”.</p>
              ) : null}
            </div>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quantity change" required hint="Positive adds stock, negative removes it">
            <input
              className="input text-right"
              inputMode="numeric"
              value={deltaText}
              onChange={(event) => setDeltaText(event.target.value)}
            />
          </Field>
          <Field label="Movement type" required>
            <select className="input" value={type} onChange={(event) => setType(event.target.value as StockMovementType)}>
              {ADJUST_TYPES.map((option) => (
                <option key={option} value={option}>
                  {movementTypeLabel(option)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Reason" hint="Optional — recorded in the audit trail">
          <input
            className="input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            placeholder="e.g. Delivery from supplier #123"
          />
        </Field>
      </form>
    </Modal>
  )
}
