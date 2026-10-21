import { useToasts, type ToastKind } from '../../stores/toast'

const STYLES: Record<ToastKind, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-slate-200 bg-white text-slate-700'
}

const LABEL: Record<ToastKind, string> = {
  success: 'Success',
  error: 'Error',
  info: 'Notice'
}

export function ToastHost() {
  const toasts = useToasts((state) => state.toasts)
  const dismiss = useToasts((state) => state.dismiss)

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-md ${STYLES[toast.kind]}`}
          role="status"
        >
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{LABEL[toast.kind]}</div>
            <div className="mt-0.5 break-words">{toast.message}</div>
          </div>
          <button
            type="button"
            className="mt-0.5 rounded p-0.5 opacity-60 hover:opacity-100"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
