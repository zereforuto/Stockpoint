import { useMemo, useState, type FormEvent } from 'react'
import { allowedChannels, type ProductInput } from '@shared/ipc'
import { productInputSchema } from '@shared/schemas'
import type { Category, CsvImportReport, Product } from '@shared/types'
import { call } from '../api/client'
import { Field } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { Badge, EmptyState, PageHeader, Spinner } from '../components/ui/Primitives'
import { inputToMoney, moneyToInput, useMoney } from '../lib/format'
import { useAsyncData } from '../lib/hooks'
import { useSession } from '../stores/session'
import { useToasts } from '../stores/toast'

interface FormState {
  name: string
  sku: string
  barcode: string
  categoryId: number | null
  costText: string
  sellingText: string
  stockText: string
  reorderText: string
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  name: '',
  sku: '',
  barcode: '',
  categoryId: null,
  costText: '',
  sellingText: '',
  stockText: '0',
  reorderText: '0',
  isActive: true
}

function toForm(product: Product | null): FormState {
  if (!product) return EMPTY_FORM
  return {
    name: product.name,
    sku: product.sku,
    barcode: product.barcode ?? '',
    categoryId: product.categoryId,
    costText: moneyToInput(product.costPriceCent),
    sellingText: moneyToInput(product.sellingPriceCent),
    stockText: String(product.stockQty),
    reorderText: String(product.reorderLevel),
    isActive: product.isActive
  }
}

function toInput(form: FormState): ProductInput {
  return {
    name: form.name.trim(),
    sku: form.sku.trim(),
    barcode: form.barcode.trim() || null,
    categoryId: form.categoryId,
    costPriceCent: inputToMoney(form.costText) ?? 0,
    sellingPriceCent: inputToMoney(form.sellingText) ?? 0,
    stockQty: Number(form.stockText) || 0,
    reorderLevel: Number(form.reorderText) || 0,
    isActive: form.isActive
  }
}

function ProductFormModal({
  mode,
  product,
  categories,
  onClose,
  onSaved
}: {
  mode: 'create' | 'edit'
  product: Product | null
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(() => toForm(product))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const push = useToasts((state) => state.push)
  const pushError = useToasts((state) => state.pushError)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((previous) => ({ ...previous, [key]: value }))

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const input = toInput(form)
    const parsed = productInputSchema.safeParse(input)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        errors[key] ??= issue.message
      }
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setBusy(true)
    try {
      if (mode === 'create') {
        await call('products:create', parsed.data)
        push('success', `Created ${parsed.data.name}`)
      } else {
        await call('products:update', { id: product!.id, patch: parsed.data })
        push('success', `Updated ${parsed.data.name}`)
      }
      onSaved()
      onClose()
    } catch (error) {
      pushError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={mode === 'create' ? 'Add product' : `Edit ${product?.name ?? 'product'}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="product-form" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save product'}
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name" required error={fieldErrors.name}>
            <input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} />
          </Field>
        </div>
        <Field label="SKU" required error={fieldErrors.sku} hint="Must be unique">
          <input className="input font-mono" value={form.sku} onChange={(event) => set('sku', event.target.value)} />
        </Field>
        <Field label="Barcode" error={fieldErrors.barcode} hint="Optional, must be unique when set">
          <input
            className="input font-mono"
            value={form.barcode}
            onChange={(event) => set('barcode', event.target.value)}
          />
        </Field>
        <Field label="Category" error={fieldErrors.categoryId}>
          <select
            className="input"
            value={form.categoryId ?? ''}
            onChange={(event) => set('categoryId', event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className="input"
            value={form.isActive ? 'active' : 'inactive'}
            onChange={(event) => set('isActive', event.target.value === 'active')}
          >
            <option value="active">Active (for sale)</option>
            <option value="inactive">Inactive (hidden from POS)</option>
          </select>
        </Field>
        <Field label="Cost price" required error={fieldErrors.costPriceCent}>
          <input
            className="input text-right"
            inputMode="decimal"
            value={form.costText}
            onChange={(event) => set('costText', event.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Selling price" required error={fieldErrors.sellingPriceCent}>
          <input
            className="input text-right"
            inputMode="decimal"
            value={form.sellingText}
            onChange={(event) => set('sellingText', event.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Stock quantity" required error={fieldErrors.stockQty}>
          <input
            className="input text-right"
            inputMode="numeric"
            value={form.stockText}
            onChange={(event) => set('stockText', event.target.value)}
          />
        </Field>
        <Field label="Reorder level" required error={fieldErrors.reorderLevel} hint="Low-stock alert threshold">
          <input
            className="input text-right"
            inputMode="numeric"
            value={form.reorderText}
            onChange={(event) => set('reorderText', event.target.value)}
          />
        </Field>
      </form>
    </Modal>
  )
}

function ImportReportModal({ report, onClose }: { report: CsvImportReport; onClose: () => void }) {
  return (
    <Modal
      open
      title="Import finished"
      onClose={onClose}
      footer={
        <button type="button" className="btn-primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-emerald-50 px-2 py-3">
            <div className="text-xl font-bold text-emerald-700">{report.created}</div>
            <div className="text-xs text-emerald-600">Created</div>
          </div>
          <div className="rounded-lg bg-indigo-50 px-2 py-3">
            <div className="text-xl font-bold text-indigo-700">{report.updated}</div>
            <div className="text-xs text-indigo-600">Updated</div>
          </div>
          <div className="rounded-lg bg-amber-50 px-2 py-3">
            <div className="text-xl font-bold text-amber-700">{report.skipped}</div>
            <div className="text-xs text-amber-600">Skipped</div>
          </div>
        </div>

        {report.errors.length > 0 ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-rose-200 bg-rose-50 p-3">
            <div className="mb-1 text-xs font-semibold uppercase text-rose-600">Rows that need attention</div>
            <ul className="space-y-1 text-xs text-rose-800">
              {report.errors.map((error) => (
                <li key={error.line}>
                  <span className="font-semibold">Line {error.line}:</span> {error.message}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-slate-500">Every row was imported cleanly.</p>
        )}
      </div>
    </Modal>
  )
}

export function ProductsPage() {
  const role = useSession((state) => state.user?.role ?? null)
  const money = useMoney()
  const push = useToasts((state) => state.push)
  const pushError = useToasts((state) => state.pushError)
  const canWrite = allowedChannels(role).has('products:create')

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [lowOnly, setLowOnly] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Product | null>(null)
  const [importReport, setImportReport] = useState<CsvImportReport | null>(null)
  const [busyCsv, setBusyCsv] = useState(false)

  const categories = useAsyncData(() => call('categories:list'), [])
  const products = useAsyncData(
    () =>
      call('products:list', {
        search: search.trim() || undefined,
        categoryId: categoryId === '' ? undefined : categoryId,
        includeInactive: includeInactive || !canWrite,
        lowStockOnly: lowOnly || undefined,
        limit: 200
      }),
    [search, categoryId, includeInactive, lowOnly, canWrite]
  )

  const categoryOptions = useMemo(() => categories.data ?? [], [categories.data])

  const exportCsv = async (): Promise<void> => {
    setBusyCsv(true)
    try {
      const picked = await call('dialog:saveFile', {
        defaultName: 'stockpoint-products',
        filters: [{ name: 'CSV file', extensions: ['csv'] }]
      })
      if (!picked.path) return
      const result = await call('products:exportCsv', { filePath: picked.path })
      push('success', `Exported ${result.rows} products to ${result.path}`)
    } catch (error) {
      pushError(error)
    } finally {
      setBusyCsv(false)
    }
  }

  const importCsv = async (): Promise<void> => {
    setBusyCsv(true)
    try {
      const picked = await call('dialog:pickFile', {
        properties: ['openFile'],
        filters: [{ name: 'CSV file', extensions: ['csv'] }]
      })
      if (!picked.path) return
      const report = await call('products:importCsv', { filePath: picked.path })
      setImportReport(report)
      products.reload()
      categories.reload()
    } catch (error) {
      pushError(error)
    } finally {
      setBusyCsv(false)
    }
  }

  const toggleActive = async (product: Product): Promise<void> => {
    try {
      await call('products:setActive', { id: product.id, isActive: !product.isActive })
      push('success', product.isActive ? `${product.name} deactivated` : `${product.name} reactivated`)
      products.reload()
    } catch (error) {
      pushError(error)
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Your catalogue: prices, stock levels and barcodes."
        actions={
          canWrite ? (
            <>
              <button type="button" className="btn-secondary" onClick={() => void importCsv()} disabled={busyCsv}>
                Import CSV
              </button>
              <button type="button" className="btn-secondary" onClick={() => void exportCsv()} disabled={busyCsv}>
                Export CSV
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setEditing(null)
                  setFormMode('create')
                }}
              >
                Add product
              </button>
            </>
          ) : null
        }
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <Field label="Search">
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, SKU or barcode"
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Category">
            <select
              className="input"
              value={categoryId === '' ? '' : String(categoryId)}
              onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : '')}
            >
              <option value="">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)} />
          Low stock only
        </label>
        <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          Include inactive
        </label>
      </div>

      {products.loading ? (
        <Spinner label="Loading products…" />
      ) : products.error ? (
        <EmptyState title="Could not load products" message="Check the app logs and try again." />
      ) : !products.data || products.data.items.length === 0 ? (
        <EmptyState
          title="No products match"
          message="Adjust the filters, or add your first product to start selling."
          action={
            canWrite ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setEditing(null)
                  setFormMode('create')
                }}
              >
                Add product
              </button>
            ) : null
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU / barcode</th>
                <th>Category</th>
                <th className="!text-right">Cost</th>
                <th className="!text-right">Price</th>
                <th className="!text-right">Stock</th>
                <th>Status</th>
                {canWrite ? <th className="!text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {products.data.items.map((product) => (
                <tr key={product.id}>
                  <td className="font-medium text-slate-900">{product.name}</td>
                  <td className="font-mono text-xs">
                    {product.sku}
                    {product.barcode ? <div className="text-slate-400">{product.barcode}</div> : null}
                  </td>
                  <td>{product.categoryName ?? <span className="text-slate-400">—</span>}</td>
                  <td className="text-right tabular-nums">{money(product.costPriceCent)}</td>
                  <td className="text-right font-semibold tabular-nums">{money(product.sellingPriceCent)}</td>
                  <td className="text-right tabular-nums">
                    {product.stockQty <= product.reorderLevel ? (
                      <Badge tone={product.stockQty === 0 ? 'red' : 'amber'}>{product.stockQty}</Badge>
                    ) : (
                      product.stockQty
                    )}
                  </td>
                  <td>{product.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  {canWrite ? (
                    <td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn-ghost !px-2 !py-1 text-xs"
                          onClick={() => {
                            setEditing(product)
                            setFormMode('edit')
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-ghost !px-2 !py-1 text-xs"
                          onClick={() => void toggleActive(product)}
                        >
                          {product.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            {products.data.total} product{products.data.total === 1 ? '' : 's'}
          </div>
        </div>
      )}

      {formMode ? (
        <ProductFormModal
          mode={formMode}
          product={editing}
          categories={categoryOptions}
          onClose={() => {
            setFormMode(null)
            setEditing(null)
          }}
          onSaved={products.reload}
        />
      ) : null}

      {importReport ? <ImportReportModal report={importReport} onClose={() => setImportReport(null)} /> : null}
    </div>
  )
}
