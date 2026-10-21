import { useDeferredValue, useMemo, useState, type KeyboardEvent } from 'react'
import { computeTotals } from '@shared/money'
import type { DiscountType, PaymentMethod, Product, SaleDetail } from '@shared/types'
import { call } from '../api/client'
import { ReceiptModal } from '../components/ReceiptModal'
import { Field } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { Badge, EmptyState, PageHeader, Spinner } from '../components/ui/Primitives'
import { inputToMoney, moneyToInput, useMoney } from '../lib/format'
import { useAsyncData } from '../lib/hooks'
import { useCart } from '../stores/cart'
import { useSession } from '../stores/session'
import { useToasts } from '../stores/toast'

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'e_wallet', label: 'E-Wallet' }
]

function TotalsRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${muted ? 'text-slate-500' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

export function PosPage() {
  const settings = useSession((state) => state.settings)
  const money = useMoney()
  const cart = useCart()
  const push = useToasts((state) => state.push)
  const pushError = useToasts((state) => state.pushError)

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [payOpen, setPayOpen] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [tenderedText, setTenderedText] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastSale, setLastSale] = useState<SaleDetail | null>(null)
  const [discountText, setDiscountText] = useState('')

  const results = useAsyncData<Product[]>(async () => {
    const term = deferredQuery.trim()
    if (!term) {
      return (await call('products:list', { limit: 24 })).items
    }
    return call('products:search', { term, limit: 24 })
  }, [deferredQuery])

  const subtotalCent = useMemo(
    () => cart.lines.reduce((sum, line) => sum + line.unitPriceCent * line.quantity, 0),
    [cart.lines]
  )

  const taxRatePercent = settings?.taxRatePercent ?? 0
  const taxMode = settings?.taxMode ?? 'inclusive'
  const totals = useMemo(
    () => computeTotals(subtotalCent, cart.discount, taxRatePercent, taxMode),
    [subtotalCent, cart.discount, taxRatePercent, taxMode]
  )

  const tenderedCents = method === 'cash' ? (inputToMoney(tenderedText) ?? 0) : totals.totalCent
  const changeCents = totals.totalCent > 0 ? tenderedCents - totals.totalCent : 0
  const cashShort = method === 'cash' && changeCents < 0

  const addProduct = (product: Product): void => {
    const added = cart.add({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unitPriceCent: product.sellingPriceCent,
      stockQty: product.stockQty
    })
    if (!added) {
      push('info', `No stock left for ${product.name}`)
    }
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return
    const first = results.data?.[0]
    if (first) {
      addProduct(first)
      setQuery('')
    }
  }

  const updateDiscount = (type: DiscountType): void => {
    setDiscountText('')
    cart.setDiscount({ type, value: 0 })
  }

  const onDiscountChange = (text: string): void => {
    setDiscountText(text)
    if (cart.discount.type === 'none') return
    if (cart.discount.type === 'percent') {
      const value = Number(text)
      cart.setDiscount({ type: 'percent', value: Number.isFinite(value) && value > 0 ? Math.min(value, 100) : 0 })
      return
    }
    cart.setDiscount({ type: 'fixed', value: inputToMoney(text) ?? 0 })
  }

  const checkout = async (): Promise<void> => {
    if (cart.lines.length === 0 || busy) return
    setBusy(true)
    try {
      const sale = await call('sales:create', {
        items: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        discount: cart.discount,
        payment: { method, amountTenderedCent: tenderedCents }
      })
      cart.clear()
      setPayOpen(false)
      setTenderedText('')
      setDiscountText('')
      setLastSale(sale)
      push('success', `Sale ${sale.receiptNo} completed`)
      results.reload()
    } catch (error) {
      pushError(error)
      results.reload()
    } finally {
      setBusy(false)
    }
  }

  const discountLabel =
    cart.discount.type === 'percent'
      ? `Discount (${cart.discount.value}%)`
      : cart.discount.type === 'fixed'
        ? 'Discount'
        : 'Discount'

  return (
    <div>
      <PageHeader
        title="Point of Sale"
        subtitle="Scan or search for products, then take payment."
        actions={
          cart.lines.length > 0 ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                cart.clear()
                setDiscountText('')
              }}
            >
              Clear cart
            </button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="card p-4">
            <Field label="Find product" hint="Type a name, SKU or barcode — Enter adds the first match.">
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="e.g. 4800001000012, COC-290, water…"
                autoFocus
              />
            </Field>

            <div className="mt-3">
              {results.loading ? (
                <Spinner label="Searching…" />
              ) : results.error ? (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  Could not load products.
                </div>
              ) : !results.data || results.data.length === 0 ? (
                <EmptyState title="No products found" message="Try a different name, SKU or barcode." />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {results.data.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-400 hover:shadow-sm disabled:opacity-50"
                      onClick={() => addProduct(product)}
                      disabled={product.stockQty < 1}
                    >
                      <div className="truncate text-sm font-semibold text-slate-800">{product.name}</div>
                      <div className="mt-0.5 flex items-center justify-between text-xs text-slate-500">
                        <span className="font-mono">{product.sku}</span>
                        <span className="font-semibold text-slate-700">{money(product.sellingPriceCent)}</span>
                      </div>
                      <div className="mt-1.5">
                        {product.stockQty < 1 ? (
                          <Badge tone="red">Out of stock</Badge>
                        ) : product.stockQty <= product.reorderLevel ? (
                          <Badge tone="amber">Low · {product.stockQty} left</Badge>
                        ) : (
                          <Badge tone="green">{product.stockQty} in stock</Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card flex flex-col p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Current cart</h2>

          {cart.lines.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
              Cart is empty
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto">
              {cart.lines.map((line) => (
                <div key={line.productId} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">{line.name}</div>
                      <div className="text-xs text-slate-500">
                        {money(line.unitPriceCent)} · {line.sku}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost !px-1.5 !py-0.5 text-xs"
                      onClick={() => cart.remove(line.productId)}
                      aria-label={`Remove ${line.name}`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="btn-secondary !px-2 !py-1"
                        onClick={() => cart.setQuantity(line.productId, line.quantity - 1)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <input
                        className="input w-14 !px-2 text-center"
                        inputMode="numeric"
                        value={line.quantity}
                        onChange={(event) => cart.setQuantity(line.productId, Number(event.target.value) || 1)}
                        aria-label={`Quantity of ${line.name}`}
                      />
                      <button
                        type="button"
                        className="btn-secondary !px-2 !py-1"
                        onClick={() => cart.setQuantity(line.productId, line.quantity + 1)}
                        disabled={line.quantity >= line.stockQty}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                      <span className="ml-1 text-xs text-slate-400">/ {line.stockQty}</span>
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-slate-800">
                      {money(line.unitPriceCent * line.quantity)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 border-t border-slate-200 pt-3">
            <div className="mb-2 flex items-end gap-2">
              <div className="flex-1">
                <Field label="Discount type">
                  <select
                    className="input"
                    value={cart.discount.type}
                    onChange={(event) => updateDiscount(event.target.value as DiscountType)}
                  >
                    <option value="none">No discount</option>
                    <option value="percent">Percent</option>
                    <option value="fixed">Fixed amount</option>
                  </select>
                </Field>
              </div>
              <div className="w-32">
                <Field label={cart.discount.type === 'percent' ? '%' : 'Amount'}>
                  <input
                    className="input"
                    inputMode="decimal"
                    disabled={cart.discount.type === 'none'}
                    value={discountText}
                    onChange={(event) => onDiscountChange(event.target.value)}
                    placeholder={cart.discount.type === 'fixed' ? '0.00' : '0'}
                  />
                </Field>
              </div>
            </div>

            <TotalsRow label="Subtotal" value={money(subtotalCent)} />
            <TotalsRow label={discountLabel} value={`− ${money(totals.discountCent)}`} muted />
            <TotalsRow
              label={taxMode === 'inclusive' ? `VAT incl. ${taxRatePercent}%` : `VAT ${taxRatePercent}%`}
              value={money(totals.taxCent)}
              muted
            />
            <div className="mt-1 border-t border-slate-200 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Total</span>
                <span className="text-2xl font-bold tabular-nums text-slate-900">{money(totals.totalCent)}</span>
              </div>
            </div>

            <button
              type="button"
              className="btn-primary mt-3 w-full py-3 text-base"
              disabled={cart.lines.length === 0 || totals.totalCent < 0}
              onClick={() => setPayOpen(true)}
            >
              Charge {money(totals.totalCent)}
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={payOpen}
        title="Take payment"
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPayOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void checkout()}
              disabled={busy || cart.lines.length === 0 || cashShort}
            >
              {busy ? 'Processing…' : `Complete sale · ${money(totals.totalCent)}`}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <span className="label">Payment method</span>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={method === option.value ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setMethod(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {method === 'cash' ? (
            <Field
              label="Amount tendered"
              required
              error={cashShort ? 'Amount tendered is less than the total' : null}
            >
              <input
                className="input text-right text-lg tabular-nums"
                inputMode="decimal"
                value={tenderedText}
                onChange={(event) => setTenderedText(event.target.value)}
                placeholder={moneyToInput(totals.totalCent)}
                autoFocus
              />
            </Field>
          ) : (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              The full {money(totals.totalCent)} will be charged to the {METHODS.find((m) => m.value === method)?.label.toLowerCase()} account.
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <TotalsRow label="Total due" value={money(totals.totalCent)} />
            {method === 'cash' ? (
              <>
                <TotalsRow label="Tendered" value={money(tenderedCents)} />
                <TotalsRow label="Change" value={money(Math.max(changeCents, 0))} />
              </>
            ) : null}
          </div>
        </div>
      </Modal>

      {lastSale && settings ? (
        <ReceiptModal sale={lastSale} settings={settings} onClose={() => setLastSale(null)} />
      ) : null}
    </div>
  )
}
