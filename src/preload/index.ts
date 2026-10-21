import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResult } from '../shared/errors'
import { isIpcChannel, type IpcArgs, type IpcChannel, type IpcMap } from '../shared/ipc'

/**
 * The only bridge exposed to the renderer. It can call whitelisted channels
 * from the shared contract and nothing else — no Node, no SQLite, no arbitrary
 * IPC.
 */
const api = {
  invoke: <K extends IpcChannel>(channel: K, ...args: IpcArgs<K>): Promise<IpcResult<IpcMap[K]['res']>> => {
    if (!isIpcChannel(channel)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${String(channel)}`))
    }
    return ipcRenderer.invoke(channel, args[0]) as Promise<IpcResult<IpcMap[K]['res']>>
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose the API bridge:', error)
  }
} else {
  // contextIsolation is expected to be ON; this is a safety net for dev only.
  ;(globalThis as unknown as { api: typeof api }).api = api
}
