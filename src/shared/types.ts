/** Core entity / DTO types shared by the main process, preload and renderer. */

export type Role = 'owner' | 'cashier'

export type TaxMode = 'exclusive' | 'inclusive'

export type DiscountType = 'none' | 'percent' | 'fixed'

export type PaymentMethod = 'cash' | 'card' | 'e_wallet'

export type SaleStatus = 'completed' | 'voided'

export type StockMovementType =
  | 'sale'
  | 'void'
  | 'restock'
  | 'damaged'
  | 'correction'
  | 'adjustment'
  | 'import'

export interface User {
  id: number
  username: string
  fullName: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
  lastLoginAt: string | null
}

export interface SessionUser {
  id: number
  username: string
  fullName: string
  role: Role
  mustChangePassword: boolean
}

export interface LoginResult {
  user: SessionUser
}

export interface Category {
  id: number
  name: string
  sortOrder: number
}

export interface Product {
  id: number
  name: string
  sku: string
  barcode: string | null
  categoryId: number | null
  categoryName: string | null
  costPriceCent: number
  sellingPriceCent: number
  stockQty: number
  reorderLevel: number
  imagePath: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface StockMovement {
  id: number
  productId: number
  productName: string
  delta: number
  type: StockMovementType
  reason: string | null
  refType: string | null
  refId: number | null
  userId: number | null
  userName: string | null
  createdAt: string
}

export interface SaleItem {
  id: number
  productId: number
  productName: string
  sku: string
  costPriceCent: number
  unitPriceCent: number
  quantity: number
  lineTotalCent: number
}

export interface Payment {
  id: number
  method: PaymentMethod
  amountCent: number
  reference: string | null
}

export interface Sale {
  id: number
  receiptNo: string
  cashierId: number
  cashierName: string
  createdAt: string
  subtotalCent: number
  discountType: DiscountType
  discountValueCent: number
  discountCent: number
  taxCent: number
  totalCent: number
  paymentMethod: PaymentMethod
  amountTenderedCent: number
  changeCent: number
  status: SaleStatus
  voidReason: string | null
  voidedBy: number | null
  voidedByName: string | null
  voidedAt: string | null
}

export interface SaleSummary extends Sale {
  itemCount: number
}

export interface SaleDetail extends Sale {
  items: SaleItem[]
  payments: Payment[]
}

export interface Settings {
  shopName: string
  address: string
  currency: string
  currencySymbol: string
  taxRatePercent: number
  taxMode: TaxMode
  receiptFooter: string
  autoBackupEnabled: boolean
  backupDir: string | null
  lastBackupAt: string | null
  retainBackups: number
}

export interface ProductQuery {
  search?: string
  categoryId?: number | null
  includeInactive?: boolean
  lowStockOnly?: boolean
  limit?: number
  offset?: number
}

export interface SaleQuery {
  from?: string
  to?: string
  status?: SaleStatus | 'all'
  method?: PaymentMethod | 'all'
  cashierId?: number | null
  search?: string
  limit?: number
  offset?: number
}

export interface Paginated<T> {
  items: T[]
  total: number
}

export interface StockAdjustInput {
  productId: number
  delta: number
  type: StockMovementType
  reason?: string
}

export interface DiscountInput {
  type: DiscountType
  /** percent (0-100, up to 2 decimals) or fixed amount in minor units */
  value: number
}

export interface SaleLineInput {
  productId: number
  quantity: number
}

export interface SaleInput {
  items: SaleLineInput[]
  discount: DiscountInput
  payment: {
    method: PaymentMethod
    amountTenderedCent: number
    reference?: string
  }
}

export interface CsvImportReport {
  created: number
  updated: number
  skipped: number
  errors: { line: number; message: string }[]
}

export interface SalesTrendPoint {
  date: string
  salesCount: number
  revenueCent: number
  profitCent: number
}

export interface TopProductRow {
  productId: number
  productName: string
  sku: string
  quantitySold: number
  revenueCent: number
  profitCent: number
}

export interface ProfitSummary {
  from: string
  to: string
  salesCount: number
  voidedCount: number
  revenueCent: number
  costCent: number
  profitCent: number
  discountCent: number
  taxCent: number
}

export interface StockValuation {
  productCount: number
  totalUnits: number
  costValueCent: number
  retailValueCent: number
}

export interface DashboardData {
  today: {
    salesCount: number
    revenueCent: number
    profitCent: number
  }
  lowStock: Product[]
  recentSales: SaleSummary[]
  productCount: number
  outOfStockCount: number
  stockValuation: StockValuation
}

export interface BackupResult {
  path: string
  bytes: number
  at: string
}

export interface AppInfo {
  version: string
  platform: string
  dataDir: string
  dbPath: string
  isPackaged: boolean
}
