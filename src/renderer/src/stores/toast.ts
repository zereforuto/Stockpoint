import { create } from 'zustand'
import { errorMessage } from '../api/client'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastStore {
  toasts: Toast[]
  push: (kind: ToastKind, message: string) => void
  /** Convenience for caught errors: shows the server-side message. */
  pushError: (error: unknown) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],

  push: (kind, message) => {
    const id = nextId++
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
    }, kind === 'error' ? 8000 : 4500)
  },

  pushError: (error) => {
    const id = nextId++
    const message = errorMessage(error)
    set((state) => ({ toasts: [...state.toasts, { id, kind: 'error', message }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
    }, 8000)
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}))
