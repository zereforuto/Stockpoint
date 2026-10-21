/**
 * Renderer-side API. Every call goes through the typed preload bridge and the
 * shared result envelope; failures are re-thrown as `ApiError` so pages can
 * read `.code`, `.issues` and `.meta` without touching IPC details.
 */
import { ApiError } from '@shared/errors'
import type { IpcArgs, IpcChannel, IpcMap } from '@shared/ipc'

export async function call<K extends IpcChannel>(channel: K, ...args: IpcArgs<K>): Promise<IpcMap[K]['res']> {
  const result = await window.api.invoke(channel, ...args)
  if (result.ok) return result.data
  throw new ApiError(result.error)
}

/** Human-readable message for any thrown value, preferring server messages. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}
