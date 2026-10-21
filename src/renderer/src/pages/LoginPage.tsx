import { useState, type FormEvent } from 'react'
import { call, errorMessage } from '../api/client'
import { Field } from '../components/ui/Field'
import { useSession } from '../stores/session'
import logoMark from '../assets/stockpoint-mark.svg'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useSession((state) => state.refresh)
  const appInfo = useSession((state) => state.appInfo)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await call('auth:login', { username, password })
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-shell flex h-full items-center justify-center p-5">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-2xl shadow-emerald-950/15 md:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden min-h-[560px] flex-col justify-between bg-emerald-800 p-10 text-white md:flex">
          <div>
            <img className="mb-12 h-12 w-12" src={logoMark} alt="StockPoint" />
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-200">Retail, simplified</p>
            <h1 className="mt-4 max-w-sm text-4xl font-bold leading-tight">Run every sale with confidence.</h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-emerald-100">Fast checkout, live inventory, and practical reports for your shop — even when you are offline.</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 p-4 text-sm text-emerald-50">
            <div className="font-semibold">Your store is ready</div>
            <div className="mt-1 text-emerald-100">Secure local data · Offline-first</div>
          </div>
        </section>

        <section className="p-7 sm:p-10">
          <div className="mb-8">
            <img className="mb-5 h-11 w-11 md:hidden" src={logoMark} alt="StockPoint" />
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">StockPoint</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-500">Sign in to manage your store.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Username" required>
              <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoFocus autoComplete="username" placeholder="owner" />
            </Field>
            <Field label="Password" required error={error}>
              <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="••••••••" />
            </Field>

            <button type="submit" className="btn-primary w-full" disabled={busy || !username || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {appInfo && !appInfo.isPackaged ? (
            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
              First run: <span className="font-semibold">owner / owner123</span>
            </p>
          ) : null}

          <p className="mt-5 text-center text-xs text-slate-400">{appInfo ? `v${appInfo.version} · offline mode` : 'offline mode'}</p>
        </section>
      </div>
    </div>
  )
}
