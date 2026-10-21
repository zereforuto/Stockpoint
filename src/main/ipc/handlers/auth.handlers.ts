import * as authService from '../../services/auth.service'
import { getSession } from '../../session'
import type { Db } from '../../db/database'
import type { HandlerMap } from '../policy'

export function authHandlers(
  db: Db
): Pick<HandlerMap, 'auth:login' | 'auth:logout' | 'auth:session' | 'auth:changePassword'> {
  return {
    'auth:login': (request) => authService.login(db, request),
    'auth:logout': () => authService.logout(),
    'auth:session': () => getSession(),
    'auth:changePassword': (request) => authService.changePassword(db, request)
  }
}
