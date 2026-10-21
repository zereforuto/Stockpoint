import * as usersService from '../../services/users.service'
import type { Db } from '../../db/database'
import type { HandlerMap } from '../policy'

export function userHandlers(
  db: Db
): Pick<
  HandlerMap,
  'users:list' | 'users:create' | 'users:update' | 'users:setActive' | 'users:resetPassword'
> {
  return {
    'users:list': () => usersService.listUsers(db),
    'users:create': (request) => usersService.createUser(db, request),
    'users:update': (request) => usersService.updateUser(db, request),
    'users:setActive': (request) => usersService.setActive(db, request),
    'users:resetPassword': (request) => usersService.resetPassword(db, request)
  }
}
