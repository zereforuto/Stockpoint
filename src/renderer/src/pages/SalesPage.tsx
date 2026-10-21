import { useState, type FormEvent } from 'react'
import { allowedChannels } from '@shared/ipc'
import { paymentMethodLabel, saleStatusLabel } from '@shared/format'
import { toDateKey, addDays } from '@shared/times'
import type { SaleDetail, SaleStatus, SaleSummary, PaymentMethod } from '@shared/types'
import { call } from '../api/client'
import { ReceiptModal } from '../components/ReceiptModal'
import { Field } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { Badge, EmptyState, PageHeader, Spinner } from '../components/ui/Primitives'
import { displayDateTime, useMoney } from '../lib/format'
import { useAsyncData } from '../lib/hooks'
import { useSession } from '../stores/session'
import { useToasts } from '../stores/toast'

const PAGE_SIZE = 25

export function SalesPage() {
  const role = useSession((state) => state.user?.role ?? null)
  const settings = useSession((state) => state.settings)
  const money = useMoney()
  const push = useToasts((state) => state.push)
  const pushError = useToasts((state) => state.pushError)
  const canVoid = allowedChannels(role).has('sales:void')

  const today = toDateKey()
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [status, setStatus] = useState<SaleStatus | 'all'>('all')
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)

  const [detailId, setDetailId] = useState<number | null>(null)
  const [receiptSale, setReceiptSale] = useState<SaleDetail | null>(null)
  const [voidTarget, setVoidTarget] = useState<SaleSummary | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [busy, setBusy] = useState(false)

  const sales = useAsyncData(
    () =>
      call('sales:list', {
        from,
        to,
        status,
        method,
        search: search.trim() || undefined,
        limit: PAGE_SIZE,
        offset
      }),
    [from, to, status, method, search, offset]
  )

  const detail = useAsyncData(
    () => (detailId === null ? Promise.resolve(null) : call('sales:get', { id: detailId })),
    [detailId]
  )

  const resetPaging = (): void => setOffset(0)

  const submitVoid = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!voidTarget) return
    setBusy(true)
    try {
      await call('sales:void', { id: voidTarget.id, reason: voidReason.trim() })
      push('success', `Sale ${voidTarget.receiptNo} voided — stock restored`)
      setVoidTarget(null)
      setVoidReason('')
      sales.reload()
      detail.reload()
    } catch (error) {
      pushError(error)
    } finally {
      setBusy(false)
    }
  }

  const totalPages = sales.data ? Math.max(1, Math.ceil(sales.data.total / PAGE_SIZE)) : 1
  const page = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div>
      <PageHeader title="Sales history" subtitle="Every sale, void and receipt — filterable by date, status and payment method." />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="w-40">
          <Field label="From">
            <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); resetPaging() }} />
          </Field>
        </div>
        <div className="w-40">
          <Field label="To">
            <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); resetPaging() }} />
          </Field>
        </div>
        <div className="w-36">
          <Field label="Status">
            <select className="input" value={status} onChange={(e) => { setStatus(e.target.value as SaleStatus | 'all'); resetPaging() }}>
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
            </select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="Payment">
            <select className="input" value={method} onChange={(e) => { setMethod(e.target.value as PaymentMethod | 'all'); resetPaging() }}>
              <option value="all">All methods</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="e_wallet">E-wallet</option>
            </select>
          </Field>
        </div>
        <div className="min-w-52 flex-1">
          <Field label="Search">
            <input
              className="input"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPaging() }}
              placeholder="Receipt no. or cashier"
            />
          </Field>
        </div>
      </div>

      {sales.loading ? (
        <Spinner label="Loading sales…" />
      ) : sales.error ? (
        <EmptyState title="Could not load sales" message="Check the app logs and try again." />
      ) : !sales.data || sales.data.items.length === 0 ? (
        <EmptyState title="No sales found" message="No sale matches these filters. Widen the date range or clear the search." />
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Cashier</th>
                  <th>Payment</th>
                  <th className="!text-right">Items</th>
                  <th className="!text-right">Total</th>
                  <th>Status</th>
                  <th className="!text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.data.items.map((sale) => (
                  <tr key={sale.id} className={sale.status === 'voided' ? 'opacity-60' : ''}>
                    <td className="font-mono text-xs font-semibold">{sale.receiptNo}</td>
                    <td className="whitespace-nowrap text-sm">{displayDateTime(sale.createdAt)}</td>
                    <td>{sale.cashierName}</td>
                    <td>{paymentMethodLabel(sale.paymentMethod)}</td>
                    <td className="text-right tabular-nums">{sale.itemCount}</td>
                    <td className={`text-right font-semibold tabular-nums ${sale.status === 'voided' ? 'line-through' : ''}`}>
                      {money(sale.totalCent)}
                    </td>
                    <td>
                      {sale.status === 'voided' ? <Badge tone="red">Voided</Badge> : <Badge tone="green">Completed</Badge>}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setDetailId(sale.id)}>
                          View
                        </button>
                        {canVoid && sale.status === 'completed' ? (
                          <button
                            type="button"
                            className="btn-ghost !px-2 !py-1 text-xs !text-rose-600"
                            onClick={() => {
                              setVoidTarget(sale)
                              setVoidReason('')
                            }}
                          >
                            Void
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              <span>
                {sales.data.total} sale{sales.data.total === 1 ? '' : 's'} · page {page} of {totalPages}
              </span>
              <div className="flex gap-1.5">
                <button type="button" className="btn-ghost !px-2 !py-1" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1"
                  disabled={offset + PAGE_SIZE >= sales.data.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-400">Voiding a sale restores its stock and is recorded on the stock movements page.</p>
        </>
      )}

      <Modal open={detailId !== null} title="Sale detail" onClose={() => setDetailId(null)} wide>
        {detail.loading ? (
          <Spinner />
        ) : detail.data ? (
          <SaleDetailView sale={detail.data} money={money} onPrint={() => setReceiptSale(detail.data)} />
        ) : (
          <EmptyState title="Sale not found" message="It may have been removed." />
        )}
      </Modal>

      <Modal
        open={voidTarget !== null}
        title={`Void sale ${voidTarget?.receiptNo ?? ''}`}
        onClose={() => setVoidTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setVoidTarget(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="void-form" className="btn-danger" disabled={busy || voidReason.trim().length === 0}>
              {busy ? 'Voiding…' : 'Void & restore stock'}
            </button>
          </>
        }
      >
        <form id="void-form" onSubmit={submitVoid} className="space-y-4">
          <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            This marks sale <span className="font-mono font-semibold">{voidTarget?.receiptNo}</span> as voided, restores the
            sold quantities to stock, and cannot be undone. Total:{' '}
            <span className="font-semibold">{voidTarget ? money(voidTarget.totalCent) : ''}</span>
          </div>
          <Field label="Reason" required hint="Shown in the audit trail (e.g. customer changed their mind)">
            <input
              className="input"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              maxLength={300}
              placeholder="Why is this sale being voided?"
            />
          </Field>
        </form>
      </Modal>

      {receiptSale && settings ? <ReceiptModal sale={receiptSale} settings={settings} onClose={() => setReceiptSale(null)} /> : null}
    </div>
  )
}

function SaleDetailView({ sale, money, onPrint }: { sale: SaleDetail; money: (cents: number) => string; onPrint: () => void }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <div>
          <div className="text-xs uppercase text-slate-400">Receipt</div>
          <div className="font-mono font-semibold">{sale.receiptNo}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Date</div>
          <div>{displayDateTime(sale.createdAt)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Cashier</div>
          <div>{sale.cashierName}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Payment</div>
          <div className="capitalize">{paymentMethodLabel(sale.paymentMethod)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Status</div>
          <div>{saleStatusLabel(sale.status)}</div>
        </div>
        {sale.status === 'voided' ? (
          <div>
            <div className="text-xs uppercase text-slate-400">Voided</div>
            <div>
              {sale.voidedByName ?? '—'} · {sale.voidedAt ? displayDateTime(sale.voidedAt) : ''}
              {sale.voidReason ? <div className="text-xs italic text-slate-500">“{sale.voidReason}”</div> : null}
            </div>
          </div>
        ) : null}
      </div>

      <table className="table-base">
        <thead>
          <tr>
            <th>Item</th>
            <th className="!text-right">Unit</th>
            <th className="!text-right">Qty</th>
            <th className="!text-right">Line total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="font-medium">{item.productName}</div>
                <div className="font-mono text-xs text-slate-400">{item.sku}</div>
              </td>
              <td className="text-right tabular-nums">{money(item.unitPriceCent)}</td>
              <td className="text-right tabular-nums">{item.quantity}</td>
              <td className="text-right font-semibold tabular-nums">{money(item.lineTotalCent)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-64 space-y-1 text-right">
        <Row label="Subtotal" value={money(sale.subtotalCent)} />
        {sale.discountCent > 0 ? <Row label="Discount" value={`− ${money(sale.discountCent)}`} /> : null}
        <Row label="Tax" value={money(sale.taxCent)} />
        <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
          <span>Total</span>
          <span className="tabular-nums">{money(sale.totalCent)}</span>
        </div>
        <Row label="Tendered" value={money(sale.amountTenderedCent)} />
        <Row label="Change" value={money(sale.changeCent)} />
      </div>

      <div className="flex justify-end">
        <button type="button" className="btn-secondary" onClick={onPrint}>
          Print receipt
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
