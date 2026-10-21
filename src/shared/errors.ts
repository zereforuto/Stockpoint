/** Error codes and the IPC result envelope shared by both processes. */

export const ErrorCodes = {
  VALIDATION: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  BACKUP_INVALID: 'BACKUP_INVALID',
  MIGRATION: 'MIGRATION',
  PRINT_FAILED: 'PRINT_FAILED',
  INTERNAL: 'INTERNAL'
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

export interface FieldIssue {
  path: string
  message: string
}

export interface IpcErrorInfo {
  code: ErrorCode
  message: string
  issues?: FieldIssue[]
  /** Extra machine-readable payload (e.g. stockQty for INSUFFICIENT_STOCK). */
  meta?: Record<string, unknown>
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorInfo }

/**
 * Thrown by services/handlers in the main process. The IPC layer converts it
 * into an `IpcResult` failure so no non-clonable value crosses the bridge.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly issues?: FieldIssue[]
  readonly meta?: Record<string, unknown>

  constructor(code: ErrorCode, message: string, options?: { issues?: FieldIssue[]; meta?: Record<string, unknown>; cause?: unknown }) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.issues = options?.issues
    this.meta = options?.meta
    if (options?.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }
}

/** Thrown by the renderer-side API wrapper when a call fails. */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly issues?: FieldIssue[]
  readonly meta?: Record<string, unknown>

  constructor(error: IpcErrorInfo) {
    super(error.message)
    this.name = 'ApiError'
    this.code = error.code
    this.issues = error.issues
    this.meta = error.meta
  }
}

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function fail<T>(error: IpcErrorInfo): IpcResult<T> {
  return { ok: false, error }
}

export function validationError(message: string, issues?: FieldIssue[]): AppError {
  return new AppError(ErrorCodes.VALIDATION, message, { issues })
}
