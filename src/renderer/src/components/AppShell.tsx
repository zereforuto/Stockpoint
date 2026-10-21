import { useEffect, useMemo, type ReactNode } from 'react'
import { allowedChannels, type IpcChannel } from '@shared/ipc'
import { useSession } from '../stores/session'
import { useUi, type PageKey } from '../stores/ui'
import { CategoriesPage } from '../pages/CategoriesPage'
import { DashboardPage } from '../pages/DashboardPage'
import { PosPage } from '../pages/PosPage'
import { ProductsPage } from '../pages/ProductsPage'
import { ReportsPage } from '../pages/ReportsPage'
import { SalesPage } from '../pages/SalesPage'
import { SettingsPage } from '../pages/SettingsPage'
import { StockPage } from '../pages/StockPage'
import { UsersPage } from '../pages/UsersPage'
import logoMark from '../assets/stockpoint-mark.svg'

type IconName =
  | 'dashboard'
  | 'cart'
  | 'box'
  | 'receipt'
  | 'layers'
  | 'chart'
  | 'tag'
  | 'users'
  | 'settings'

const ICONS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="12" width="4" height="8" rx="1" fill="currentColor" stroke="none" />
      <rect x="10" y="7" width="4" height="13" rx="1" fill="currentColor" stroke="none" />
      <rect x="17" y="3" width="4" height="17" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  cart: (
    <>
      <path d="M3 5h2l2.4 9.6a1 1 0 001 .8h7.9a1 1 0 001-.8L19 8H6" />
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </>
  ),
  box: (
    <>
      <path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </>
  ),
  receipt: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13.5l9 5 9-5" />
    </>
  ),
  chart: <path d="M3 21h18M7 21v-6M12 21V8M17 21v-9" />,
  tag: (
    <>
      <path d="M3 12V5a2 2 0 012-2h7l9 9-9 9-9-9z" />
      <circle cx="8.5" cy="8.5" r="1.4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16.5 5.2a3.5 3.5 0 010 5.6M18 14.4c1.9.9 3 2.9 3 5.6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M18.5 7H20M4 17h5.5M15 17h5" />
      <circle cx="15.5" cy="7" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
    </>
  )
}

const NAV: { key: PageKey; label: string; channel: IpcChannel; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', channel: 'reports:dashboard', icon: 'dashboard' },
  { key: 'pos', label: 'Point of Sale', channel: 'sales:create', icon: 'cart' },
  { key: 'products', label: 'Products', channel: 'products:list', icon: 'box' },
  { key: 'sales', label: 'Sales history', channel: 'sales:list', icon: 'receipt' },
  { key: 'stock', label: 'Stock movements', channel: 'stock:movements', icon: 'layers' },
  { key: 'reports', label: 'Reports', channel: 'reports:trend', icon: 'chart' },
  { key: 'categories', label: 'Categories', channel: 'categories:list', icon: 'tag' },
  { key: 'users', label: 'Users', channel: 'users:list', icon: 'users' },
  { key: 'settings', label: 'Settings', channel: 'settings:update', icon: 'settings' }
]

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

function MallMark() {
  return <img className="h-11 w-11 shrink-0" src={logoMark} alt="StockPoint" />
}

function renderPage(page: PageKey) {
  switch (page) {
    case 'dashboard':
      return <DashboardPage />
    case 'pos':
      return <PosPage />
    case 'products':
      return <ProductsPage />
    case 'sales':
      return <SalesPage />
    case 'stock':
      return <StockPage />
    case 'reports':
      return <ReportsPage />
    case 'categories':
      return <CategoriesPage />
    case 'users':
      return <UsersPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <PosPage />
  }
}

export function AppShell() {
  const user = useSession((state) => state.user)
  const settings = useSession((state) => state.settings)
  const logout = useSession((state) => state.logout)
  const page = useUi((state) => state.page)
  const setPage = useUi((state) => state.setPage)

  const visible = useMemo(() => {
    const role = user?.role ?? null
    const channels = allowedChannels(role)
    return NAV.filter((item) => channels.has(item.channel))
  }, [user?.role])

  const allowedPages = useMemo(() => new Set(visible.map((item) => item.key)), [visible])

  useEffect(() => {
    if (!allowedPages.has(page)) {
      setPage(allowedPages.has('pos') ? 'pos' : visible[0]?.key ?? 'pos')
    }
  }, [page, allowedPages, setPage, visible])

  const handleLogout = (): void => {
    void logout()
  }

  return (
    <div className="mall-shell flex h-full text-stone-800">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4">
        <div className="flex items-center gap-3 px-2 pb-5">
          <MallMark />
          <div className="min-w-0">
            <div className="truncate text-base font-bold tracking-tight text-stone-900">StockPoint</div>
            <div className="truncate text-xs font-medium text-stone-500">{settings?.shopName ?? 'Neighbourhood Mall'}</div>
          </div>
        </div>

        <button type="button" className="mb-5 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm text-slate-400" onClick={() => setPage('pos')}>
          <span className="text-lg leading-none">⌕</span>
          <span>Find a product or start a sale</span>
        </button>

        <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-stone-400">Shop floor</div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-link w-full ${page === item.key ? 'nav-link-active' : ''}`}
              onClick={() => setPage(item.key)}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f7e7a0] text-xs font-bold text-amber-950">
                {(user?.fullName ?? 'S').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-stone-800">{user?.fullName}</div>
                <div className="text-xs capitalize text-stone-400">{user?.role}</div>
              </div>
            </div>
            <button type="button" className="btn-ghost !px-2 text-xs" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1440px] p-5 lg:p-7">{renderPage(page)}</div>
      </main>
    </div>
  )
}
