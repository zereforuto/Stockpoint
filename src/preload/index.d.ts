import type { IpcResult } from '../shared/errors'
import type { IpcArgs, IpcChannel, IpcMap } from '../shared/ipc'

export interface StockPointApi {
  invoke: <K extends IpcChannel>(channel: K, ...args: IpcArgs<K>) => Promise<IpcResult<IpcMap[K]['res']>>
}

declare global {
  interface Window {
    api: StockPointApi
  }
}
