import { call } from '../api/client'
import { Badge, EmptyState, Spinner, StatCard } from '../components/ui/Primitives'
import { displayDateTime, useMoney } from '../lib/format'
import { useAsyncData } from '../lib/hooks'
import { useUi } from '../stores/ui'

export function DashboardPage() {
  const money = useMoney()
  const setPage = useUi((state) => state.setPage)
  const { data, loading, error, reload } = useAsyncData(() => call('reports:dashboard'), [])

  if (loading) return <Spinner label="Loading dashboard…" />
  if (error || !data)
    return <EmptyState title="Could not load the dashboard" message="Check the app logs and try again." action={<button className="btn-secondary" onClick={reload}>Retry</button>} />

  const { today, lowStock, recentSales, productCount, outOfStockCount, stockValuation } = data
  const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-stone-200 bg-white px-7 py-8 shadow-[0_12px_40px_rgba(73,82,66,0.07)]">
        <div className="max-w-2xl">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800/60">{todayLabel}</div>
          <h1 className="mall-hero-title mt-2 text-4xl font-bold text-stone-950 sm:text-5xl">Welcome back, {data.today.salesCount > 0 ? 'shopkeeper' : 'let’s open the mall.'}</h1>
          <p className="mt-3 text-sm text-stone-500">A bright overview of today’s sales, shelves, and store activity.</p>
        </div>
        <div className="absolute -right-4 -top-5 hidden h-48 w-48 rounded-full border-[18px] border-[#dceee3] sm:block" />
        <div className="absolute right-16 top-14 hidden h-20 w-20 rounded-3xl bg-[#f7e7a0] rotate-12 sm:block" />
        <button type="button" className="btn-secondary mt-5" onClick={reload}>Refresh dashboard</button>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sales today" value={String(today.salesCount)} hint="Completed sales" tone="peach" />
        <StatCard label="Revenue today" value={money(today.revenueCent)} hint="Excludes voided sales" tone="butter" />
        <StatCard label="Profit today" value={money(today.profitCent)} hint="Revenue − cost of goods" tone="lilac" />
        <StatCard label="Stock value" value={money(stockValuation.costValueCent)} hint={`at cost · ${stockValuation.totalUnits} units`} tone="sage" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Low stock</h2>
            <span className="text-xs text-slate-400">{productCount} products · {outOfStockCount} out of stock</span>
          </div>
          {lowStock.length === 0 ? (
            <EmptyState title="All good" message="No product is at or below its reorder level." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStock.slice(0, 8).map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{product.name}</div>
                    <div className="font-mono text-xs text-slate-400">{product.sku}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={product.stockQty === 0 ? 'red' : 'amber'}>
                      {product.stockQty} / {product.reorderLevel}
                    </Badge>
                    <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setPage('stock')}>
                      Restock
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent sales</h2>
            <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setPage('sales')}>
              View all
            </button>
          </div>
          {recentSales.length === 0 ? (
            <EmptyState title="No sales yet" message="Sales made today will appear here as they happen." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentSales.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-slate-700">{sale.receiptNo}</div>
                    <div className="text-xs text-slate-400">{displayDateTime(sale.createdAt)} · {sale.cashierName}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums text-slate-800">{money(sale.totalCent)}</div>
                    {sale.status === 'voided' ? <Badge tone="red">Voided</Badge> : <Badge tone="green">{sale.itemCount} items</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
