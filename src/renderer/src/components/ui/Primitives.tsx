import type { ReactNode } from 'react'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      {label}
    </div>
  )
}

export function EmptyState({
  title,
  message,
  action
}: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="text-base font-semibold text-slate-700">{title}</div>
      <div className="max-w-md text-sm text-slate-500">{message}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'sage'
}: {
  label: string
  value: string
  hint?: string
  tone?: 'sage' | 'butter' | 'peach' | 'lilac'
}) {
  const tones = {
    sage: 'bg-[#dceee3] text-emerald-950',
    butter: 'bg-[#f7e7a0] text-amber-950',
    peach: 'bg-[#f7c0a8] text-orange-950',
    lilac: 'bg-[#e6d6f1] text-violet-950'
  }
  return (
    <div className={`mall-stat rounded-3xl border border-black/5 px-5 py-4 shadow-sm ${tones[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-[0.14em] opacity-60">{label}</div>
      <div className="mt-4 text-4xl font-bold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs font-medium opacity-65">{hint}</div> : null}
    </div>
  )
}

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'green' | 'red' | 'amber' | 'indigo'; children: ReactNode }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-rose-100 text-rose-700',
    amber: 'bg-amber-100 text-amber-800',
    indigo: 'bg-indigo-100 text-indigo-700'
  }
  return <span className={`badge ${tones[tone]}`}>{children}</span>
}
