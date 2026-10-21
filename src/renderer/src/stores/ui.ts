import { create } from 'zustand'

export type PageKey =
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'sales'
  | 'stock'
  | 'reports'
  | 'categories'
  | 'users'
  | 'settings'

interface UiStore {
  page: PageKey
  /** Set after login so a cashier never lands on a page they cannot use. */
  setPage: (page: PageKey) => void
}

export const useUi = create<UiStore>((set) => ({
  page: 'pos',
  setPage: (page) => set({ page })
}))
