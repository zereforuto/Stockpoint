/**
 * Single source of truth for the IPC surface: channel names, request/response
 * types and the role policy enforced in the main process.
 *
 * The preload exposes only `invoke(channel, payload)` restricted to these
 * channels; the renderer never talks to SQLite (or to Electron) directly.
 */

import type {
  AppInfo,
  BackupResult,
  Category,
  CsvImportReport,
  DashboardData,
  LoginResult,
  Paginated,
  Product,
  ProductQuery,
  Role,
  SaleDetail,
  SaleInput,
  SaleQuery,
  SaleSummary,
  SessionUser,
  Settings,
  StockAdjustInput,
  StockMovement,
  StockValuation,
  TopProductRow,
  ProfitSummary,
  SalesTrendPoint,
  User
} from './types'

/* ------------------------------------------------------------------ inputs */

export interface LoginInput {
  username: string
  password: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface CreateUserInput {
  username: string
  fullName: string
  password: string
  role: Role
}

export interface UpdateUserInput {
  id: number
  username?: string
  fullName?: string
  role?: Role
}

export interface SetActiveInput {
  id: number
  isActive: boolean
}

export interface ResetPasswordInput {
  id: number
  newPassword: string
}

export interface IdInput {
  id: number
}

export interface ProductInput {
  name: string
  sku: string
  barcode: string | null
  categoryId: number | null
  costPriceCent: number
  sellingPriceCent: number
  stockQty: number
  reorderLevel: number
  imagePath?: string | null
  isActive?: boolean
}

export interface ProductSearchInput {
  term: string
  limit?: number
}

export interface ImportCsvInput {
  filePath?: string
  content?: string
}

export interface ExportCsvInput {
  filePath?: string
}

export interface StockMovementsQuery {
  productId?: number | null
  limit?: number
}

export interface SaleVoidInput {
  id: number
  reason: string
}

export interface ReportRange {
  from: string
  to: string
}

export type ReportName = 'sales' | 'top_products' | 'profit' | 'valuation'

export type TrendGroupBy = 'day' | 'week' | 'month'

export interface ExportReportInput extends ReportRange {
  report: ReportName
  filePath?: string
}

export interface ExportReportPdfInput extends ReportRange {
  report: ReportName
  title?: string
  /** Serialized <svg> markup captured from the on-screen charts (optional). */
  chartSvgs?: string[]
  filePath?: string
}

export type SettingsPatch = Partial<
  Pick<
    Settings,
    | 'shopName'
    | 'address'
    | 'currency'
    | 'currencySymbol'
    | 'taxRatePercent'
    | 'taxMode'
    | 'receiptFooter'
    | 'autoBackupEnabled'
    | 'backupDir'
    | 'retainBackups'
  >
>

export interface PrintReceiptInput {
  saleId: number
  /** false (default) opens the system print dialog, true prints to the default printer */
  silent?: boolean
  /** when set, writes a PDF instead of printing */
  filePath?: string
}

export interface PickFileInput {
  filters?: { name: string; extensions: string[] }[]
  properties?: Array<'openFile' | 'openDirectory'>
}

export interface SaveFileInput {
  defaultName: string
  filters?: { name: string; extensions: string[] }[]
}

export interface SaveFileResult {
  path: string | null
}

export interface ExportProductsResult {
  path: string
  rows: number
}

/* ------------------------------------------------------------- ipc contract */

export interface IpcMap {
  'auth:login': { req: LoginInput; res: LoginResult }
  'auth:logout': { req: void; res: { ok: true } }
  'auth:session': { req: void; res: SessionUser | null }
  'auth:changePassword': { req: ChangePasswordInput; res: SessionUser }

  'users:list': { req: void; res: User[] }
  'users:create': { req: CreateUserInput; res: User }
  'users:update': { req: UpdateUserInput; res: User }
  'users:setActive': { req: SetActiveInput; res: User }
  'users:resetPassword': { req: ResetPasswordInput; res: { ok: true } }

  'categories:list': { req: void; res: Category[] }
  'categories:create': { req: { name: string }; res: Category }
  'categories:update': { req: { id: number; name: string }; res: Category }
  'categories:delete': { req: IdInput; res: { ok: true } }

  'products:list': { req: ProductQuery; res: Paginated<Product> }
  'products:get': { req: IdInput; res: Product }
  'products:search': { req: ProductSearchInput; res: Product[] }
  'products:create': { req: ProductInput; res: Product }
  'products:update': { req: { id: number; patch: ProductInput }; res: Product }
  'products:setActive': { req: { id: number; isActive: boolean }; res: Product }
  'products:importCsv': { req: ImportCsvInput; res: CsvImportReport }
  'products:exportCsv': { req: ExportCsvInput; res: ExportProductsResult }
  'products:pickImage': { req: void; res: { imagePath: string | null } }

  'stock:adjust': { req: StockAdjustInput; res: { product: Product; movement: StockMovement } }
  'stock:movements': { req: StockMovementsQuery; res: StockMovement[] }

  'sales:create': { req: SaleInput; res: SaleDetail }
  'sales:list': { req: SaleQuery; res: Paginated<SaleSummary> }
  'sales:get': { req: IdInput; res: SaleDetail }
  'sales:void': { req: SaleVoidInput; res: SaleDetail }

  'reports:dashboard': { req: void; res: DashboardData }
  'reports:trend': { req: ReportRange & { groupBy: TrendGroupBy }; res: SalesTrendPoint[] }
  'reports:topProducts': { req: ReportRange & { limit: number }; res: TopProductRow[] }
  'reports:profit': { req: ReportRange; res: ProfitSummary }
  'reports:valuation': { req: void; res: StockValuation }
  'reports:exportCsv': { req: ExportReportInput; res: ExportProductsResult }
  'reports:exportPdf': { req: ExportReportPdfInput; res: { path: string } }

  'settings:get': { req: void; res: Settings }
  'settings:update': { req: SettingsPatch; res: Settings }

  'backup:export': { req: ExportCsvInput; res: BackupResult }
  'backup:import': { req: { filePath: string }; res: BackupResult }
  'backup:pickFolder': { req: void; res: SaveFileResult }
  'backup:runAuto': { req: void; res: BackupResult | null }

  'print:receipt': { req: PrintReceiptInput; res: { path?: string } }
  'app:info': { req: void; res: AppInfo }

  'dialog:pickFile': { req: PickFileInput; res: SaveFileResult }
  'dialog:saveFile': { req: SaveFileInput; res: SaveFileResult }
}

export type IpcChannel = keyof IpcMap

export type IpcRequest<K extends IpcChannel> = IpcMap[K]['req']
export type IpcResponse<K extends IpcChannel> = IpcMap[K]['res']

/** `call('auth:session')` takes no payload, every other channel takes its request. */
export type IpcArgs<K extends IpcChannel> = [IpcRequest<K>] extends [void] ? [] : [req: IpcRequest<K>]

export const PUBLIC_CHANNELS = ['auth:login', 'auth:session', 'app:info'] as const satisfies readonly IpcChannel[]

const OWNER: readonly Role[] = ['owner']
const ANY_USER: readonly Role[] = ['owner', 'cashier']

/**
 * Role policy. `'public'` means "no session required"; anything else must list
 * the roles allowed to call the channel. Enforced in the main process.
 */
export const IPC_ROLES = {
  'auth:login': 'public',
  'auth:session': 'public',
  'auth:logout': ANY_USER,
  'auth:changePassword': ANY_USER,

  'users:list': OWNER,
  'users:create': OWNER,
  'users:update': OWNER,
  'users:setActive': OWNER,
  'users:resetPassword': OWNER,

  'categories:list': ANY_USER,
  'categories:create': OWNER,
  'categories:update': OWNER,
  'categories:delete': OWNER,

  'products:list': ANY_USER,
  'products:get': ANY_USER,
  'products:search': ANY_USER,
  'products:create': OWNER,
  'products:update': OWNER,
  'products:setActive': OWNER,
  'products:importCsv': OWNER,
  'products:exportCsv': OWNER,
  'products:pickImage': OWNER,

  'stock:adjust': OWNER,
  'stock:movements': OWNER,

  'sales:create': ANY_USER,
  'sales:list': ANY_USER,
  'sales:get': ANY_USER,
  'sales:void': OWNER,

  'reports:dashboard': OWNER,
  'reports:trend': OWNER,
  'reports:topProducts': OWNER,
  'reports:profit': OWNER,
  'reports:valuation': OWNER,
  'reports:exportCsv': OWNER,
  'reports:exportPdf': OWNER,

  'settings:get': ANY_USER,
  'settings:update': OWNER,

  'backup:export': OWNER,
  'backup:import': OWNER,
  'backup:pickFolder': OWNER,
  'backup:runAuto': OWNER,

  'print:receipt': ANY_USER,
  'app:info': 'public',

  'dialog:pickFile': OWNER,
  'dialog:saveFile': OWNER
} as const satisfies Record<IpcChannel, 'public' | readonly Role[]>

export const IPC_CHANNEL_NAMES = Object.keys(IPC_ROLES) as IpcChannel[]

export function isIpcChannel(value: string): value is IpcChannel {
  return Object.prototype.hasOwnProperty.call(IPC_ROLES, value)
}

/** Channels a session with the given role may call ('public' channels are always allowed). */
export function allowedChannels(role: Role | null): Set<string> {
  const allowed = new Set<string>()
  for (const channel of IPC_CHANNEL_NAMES) {
    const policy = IPC_ROLES[channel]
    if (policy === 'public' || (role !== null && (policy as readonly Role[]).includes(role))) {
      allowed.add(channel)
    }
  }
  return allowed
}
