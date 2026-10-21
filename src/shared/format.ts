/** Human-readable labels shared by the UI, receipts and exported documents. */

import type {
  DiscountType,
  PaymentMethod,
  Role,
  SaleStatus,
  StockMovementType,
  TaxMode
} from './types'

export function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Cash'
    case 'card':
      return 'Card'
    case 'e_wallet':
      return 'E-Wallet'
  }
}

export function discountTypeLabel(type: DiscountType): string {
  switch (type) {
    case 'none':
      return 'None'
    case 'percent':
      return '% discount'
    case 'fixed':
      return 'Fixed discount'
  }
}

export function taxModeLabel(mode: TaxMode): string {
  return mode === 'inclusive' ? 'VAT (inclusive)' : 'VAT (exclusive)'
}

export function roleLabel(role: Role): string {
  return role === 'owner' ? 'Owner' : 'Cashier'
}

export function saleStatusLabel(status: SaleStatus): string {
  return status === 'voided' ? 'Voided' : 'Completed'
}

export function movementTypeLabel(type: StockMovementType): string {
  switch (type) {
    case 'sale':
      return 'Sale'
    case 'void':
      return 'Sale voided'
    case 'restock':
      return 'Restock'
    case 'damaged':
      return 'Damaged'
    case 'correction':
      return 'Correction'
    case 'adjustment':
      return 'Adjustment'
    case 'import':
      return 'CSV import'
  }
}
