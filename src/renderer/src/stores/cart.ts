import { create } from 'zustand'
import type { DiscountInput } from '@shared/types'

export interface CartLine {
  productId: number
  name: string
  sku: string
  unitPriceCent: number
  /** On-hand stock shown in the cart so the cashier sees limits before checkout. */
  stockQty: number
  quantity: number
}

export interface CartProduct {
  productId: number
  name: string
  sku: string
  unitPriceCent: number
  stockQty: number
}

interface CartStore {
  lines: CartLine[]
  discount: DiscountInput
  /** Adds one unit, or creates the line. Returns false when stock runs out. */
  add: (product: CartProduct) => boolean
  setQuantity: (productId: number, quantity: number) => void
  remove: (productId: number) => void
  clear: () => void
  setDiscount: (discount: DiscountInput) => void
}

export const useCart = create<CartStore>((set, get) => ({
  lines: [],
  discount: { type: 'none', value: 0 },

  add: (product) => {
    const existing = get().lines.find((line) => line.productId === product.productId)
    if (existing) {
      if (existing.quantity >= existing.stockQty) return false
      set({
        lines: get().lines.map((line) =>
          line.productId === product.productId ? { ...line, quantity: line.quantity + 1 } : line
        )
      })
      return true
    }
    if (product.stockQty < 1) return false
    set({
      lines: [
        ...get().lines,
        {
          productId: product.productId,
          name: product.name,
          sku: product.sku,
          unitPriceCent: product.unitPriceCent,
          stockQty: product.stockQty,
          quantity: 1
        }
      ]
    })
    return true
  },

  setQuantity: (productId, quantity) => {
    if (quantity < 1) {
      get().remove(productId)
      return
    }
    set({
      lines: get().lines.map((line) =>
        line.productId === productId
          ? { ...line, quantity: Math.min(quantity, line.stockQty) }
          : line
      )
    })
  },

  remove: (productId) => set({ lines: get().lines.filter((line) => line.productId !== productId) }),

  clear: () => set({ lines: [], discount: { type: 'none', value: 0 } }),

  setDiscount: (discount) => set({ discount })
}))
