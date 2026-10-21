import type { ReactNode } from 'react'

export interface FieldProps {
  label: string
  error?: string | null
  hint?: string
  required?: boolean
  children: ReactNode
}

/** Label + control + inline validation message. */
export function Field({ label, error, hint, required = false, children }: FieldProps) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span> : null}
      {!error && hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}
