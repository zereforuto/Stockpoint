import type { Settings } from '../../shared/types'

/** Every settings key the app understands, plus its default value. */
export const DEFAULT_SETTINGS: Settings = {
  shopName: 'My Store',
  address: '',
  currency: 'PHP',
  currencySymbol: '₱',
  taxRatePercent: 12,
  taxMode: 'inclusive',
  receiptFooter: 'Thank you! Please come again.',
  autoBackupEnabled: false,
  backupDir: null,
  lastBackupAt: null,
  retainBackups: 30
}
