import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { formatCents, formatMoney } from '@shared/money'
import { resolveRange, toDateKey } from '@shared/times'
import type { ReportName, TrendGroupBy } from '@shared/ipc'
import { call } from '../api/client'
import { Field } from '../components/ui/Field'
import { Badge, EmptyState, PageHeader, Spinner, StatCard } from '../components/ui/Primitives'
import { displayDate, useCurrencySymbol, useMoney } from '../lib/format'
import { useAsyncData } from '../lib/hooks'
import { useToasts } from '../stores/toast'

type Preset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_7_days' | 'last_30_days' | 'custom'

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range…' }
]

const GROUPS: { value: TrendGroupBy; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' }
]

const REPORTS: { value: ReportName; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'top_products', label: 'Top products' },
  { value: 'profit', label: 'Profit' },
  { value: 'valuation', label: 'Stock valuation' }
]

export function ReportsPage() {
  const money = useMoney()
  const symbol = useCurrencySymbol()
  const push = useToasts((state) => state.push)
  const pushError = useToasts((state) => state.pushError)

  const [preset, setPreset] = useState<Preset>('this_month')
  const initial = useMemo(() => resolveRange('this_month'), [])
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [groupBy, setGroupBy] = useState<TrendGroupBy>('day')

  const applyPreset = (next: Preset): void => {
    setPreset(next)
    if (next !== 'custom') {
      const range = resolveRange(next)
      setFrom(range.from)
      setTo(range.to)
    }
  }

  const trend = useAsyncData(() => call('reports:trend', { from, to, groupBy }), [from, to, groupBy])
  const top = useAsyncData(() => call('reports:topProducts', { from, to, limit: 10 }), [from, to])
  const profit = useAsyncData(() => call('reports:profit', { from, to }), [from, to])
  const valuation = useAsyncData(() => call('reports:valuation'), [])

  const [exporting, setExporting] = useState<null | 'csv' | 'pdf'>(null)

  const exportReport = async (kind: 'csv' | 'pdf', report: ReportName): Promise<void> => {
    setExporting(kind)
    try {
      const base = `stockpoint-${report.replace(/_/g, '-')}-${from}-to-${to}`
      const picked = await call('dialog:saveFile', {
        defaultName: base,
        filters: kind === 'csv' ? [{ name: 'CSV file', extensions: ['csv'] }] : [{ name: 'PDF file', extensions: ['pdf'] }]
      })
      if (!picked.path) return
      if (kind === 'csv') {
        const result = await call('reports:exportCsv', { report, from, to, filePath: picked.path })
        push('success', `Exported ${result.rows} rows to ${result.path}`)
      } else {
        const result = await call('reports:exportPdf', { report, from, to, title: REPORTS.find((r) => r.value === report)?.label, filePath: picked.path })
        push('success', `Saved ${result.path}`)
      }
    } catch (error) {
      pushError(error)
    } finally {
      setExporting(null)
    }
  }

  const chartData = useMemo(
    () => (trend.data ?? []).map((point) => ({ ...point, label: displayDate(point.date) })),
    [trend.data]
  )

  const rangeLabel = `${displayDate(from)} – ${displayDate(to)}`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Sales trend, profit and stock value for any period."
        actions={
          <div className="flex gap-2">
            <select className="input !w-auto" value="" onChange={(event) => void exportReport('csv', event.target.value as ReportName)} disabled={exporting !== null}>
              <option value="" disabled>
                {exporting === 'csv' ? 'Exporting…' : 'Export CSV ▾'}
              </option>
              {REPORTS.map((report) => (
                <option key={report.value} value={report.value}>
                  {report.label} CSV
                </option>
              ))}
            </select>
            <select className="input !w-auto" value="" onChange={(event) => void exportReport('pdf', event.target.value as ReportName)} disabled={exporting !== null}>
              <option value="" disabled>
                {exporting === 'pdf' ? 'Rendering…' : 'Export PDF ▾'}
              </option>
              {REPORTS.map((report) => (
                <option key={report.value} value={report.value}>
                  {report.label} PDF
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="w-48">
          <Field label="Period">
            <select className="input" value={preset} onChange={(event) => applyPreset(event.target.value as Preset)}>
              {PRESETS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="From">
            <input
              type="date"
              className="input"
              value={from}
              max={toDateKey()}
              onChange={(event) => {
                setFrom(event.target.value)
                setPreset('custom')
              }}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="To">
            <input
              type="date"
              className="input"
              value={to}
              onChange={(event) => {
                setTo(event.target.value)
                setPreset('custom')
              }}
            />
          </Field>
        </div>
        <div className="w-36">
          <Field label="Group by">
            <select className="input" value={groupBy} onChange={(event) => setGroupBy(event.target.value as TrendGroupBy)}>
              {GROUPS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <span className="pb-2 text-xs text-slate-400">{rangeLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Sales" value={String(profit.data?.salesCount ?? '—')} hint={`${profit.data?.voidedCount ?? 0} voided`} />
        <StatCard label="Revenue" value={profit.data ? money(profit.data.revenueCent) : '—'} hint="Completed sales" />
        <StatCard label="Cost of goods" value={profit.data ? money(profit.data.costCent) : '—'} hint="At cost price" />
        <StatCard label="Profit" value={profit.data ? money(profit.data.profitCent) : '—'} hint="Revenue − cost" />
        <StatCard
          label="Stock value"
          value={valuation.data ? money(valuation.data.costValueCent) : '—'}
          hint={valuation.data ? `${valuation.data.productCount} products · ${valuation.data.totalUnits} units` : ''}
        />
      </div>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sales trend</h2>
          <div className="flex gap-2 text-xs">
            <span className="flex items-center gap-1 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-indigo-500" /> Revenue
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Profit
            </span>
          </div>
        </div>
        {trend.loading ? (
          <Spinner label="Loading chart…" />
        ) : trend.error ? (
          <EmptyState title="Could not load the trend" message="Check the app logs and try again." />
        ) : chartData.length === 0 ? (
          <EmptyState title="No sales in this period" message="Pick a different range — the chart appears once there are sales." />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} minTickGap={28} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                  tickFormatter={(value: number) => formatCents(value)}
                />
                <Tooltip
                  formatter={(value, name) => [
                    typeof value === 'number' ? formatMoney(value, symbol) : String(value),
                    name === 'revenueCent' ? 'Revenue' : 'Profit'
                  ]}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
                />
                <Legend formatter={(value) => (value === 'revenueCent' ? 'Revenue' : 'Profit')} />
                <Area type="monotone" dataKey="revenueCent" stroke="#6366f1" strokeWidth={2} fill="url(#fillRevenue)" />
                <Area type="monotone" dataKey="profitCent" stroke="#10b981" strokeWidth={2} fill="url(#fillProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Top products</h2>
          {top.loading ? (
            <Spinner label="Loading…" />
          ) : !top.data || top.data.length === 0 ? (
            <EmptyState title="Nothing sold yet" message="Top sellers appear here for the selected period." />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="!text-right">Qty</th>
                  <th className="!text-right">Revenue</th>
                  <th className="!text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {top.data.map((row, index) => (
                  <tr key={row.productId}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Badge tone={index < 3 ? 'indigo' : 'slate'}>#{index + 1}</Badge>
                        <span className="font-medium text-slate-800">{row.productName}</span>
                      </div>
                      <div className="ml-7 font-mono text-xs text-slate-400">{row.sku}</div>
                    </td>
                    <td className="text-right tabular-nums">{row.quantitySold}</td>
                    <td className="text-right font-semibold tabular-nums">{money(row.revenueCent)}</td>
                    <td className="text-right tabular-nums text-emerald-600">{money(row.profitCent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Profit & breakdown</h2>
          {profit.loading ? (
            <Spinner label="Loading…" />
          ) : profit.data ? (
            <dl className="space-y-2 text-sm">
              <Line label="Period" value={rangeLabel} />
              <Line label="Completed sales" value={String(profit.data.salesCount)} />
              <Line label="Voided sales" value={String(profit.data.voidedCount)} />
              <Line label="Revenue" value={money(profit.data.revenueCent)} />
              <Line label="Discounts given" value={`− ${money(profit.data.discountCent)}`} />
              <Line label="Tax collected" value={money(profit.data.taxCent)} />
              <Line label="Cost of goods" value={`− ${money(profit.data.costCent)}`} />
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                <dt>Profit</dt>
                <dd className="tabular-nums text-emerald-600">{money(profit.data.profitCent)}</dd>
              </div>
              {valuation.data ? (
                <>
                  <div className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Stock valuation</div>
                  <Line label="Products in stock" value={String(valuation.data.productCount)} />
                  <Line label="Units on hand" value={String(valuation.data.totalUnits)} />
                  <Line label="Value at cost" value={money(valuation.data.costValueCent)} />
                  <Line label="Value at retail" value={money(valuation.data.retailValueCent)} />
                </>
              ) : null}
            </dl>
          ) : (
            <EmptyState title="No data" message="Try a wider date range." />
          )}
        </section>
      </div>

      <p className="text-xs text-slate-400">
        Ranges are inclusive local dates. Profit uses each sale's cost price at the time of sale.
      </p>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium tabular-nums text-slate-800">{value}</dd>
    </div>
  )
}
