import * as stockService from '../../services/stock.service'
import { requireSession } from '../../session'
import type { Db } from '../../db/database'
import type { HandlerMap } from '../policy'

export function stockHandlers(db: Db): Pick<HandlerMap, 'stock:adjust' | 'stock:movements'> {
  return {
    'stock:adjust': (request) => stockService.adjustStock(db, request, requireSession().id),
    'stock:movements': (request) => stockService.listMovements(db, request)
  }
}
