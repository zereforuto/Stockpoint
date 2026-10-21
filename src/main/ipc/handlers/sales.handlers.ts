import * as salesService from '../../services/sales.service'
import { requireSession } from '../../session'
import type { Db } from '../../db/database'
import type { HandlerMap } from '../policy'

export function salesHandlers(
  db: Db
): Pick<HandlerMap, 'sales:create' | 'sales:list' | 'sales:get' | 'sales:void'> {
  return {
    'sales:create': (request) => salesService.createSale(db, request),
    'sales:list': (request) => salesService.listSales(db, request),
    'sales:get': (request) => salesService.getSaleDetail(db, request.id),
    'sales:void': (request) => salesService.voidSale(db, request.id, request.reason, requireSession().id)
  }
}
