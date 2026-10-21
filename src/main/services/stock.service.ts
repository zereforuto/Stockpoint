import { AppError, ErrorCodes } from '../../shared/errors'
import { localNow } from '../../shared/times'
import type { Product, StockAdjustInput, StockMovement } from '../../shared/types'
import { transact, type Db } from '../db/database'
import * as productsRepo from '../repos/products.repo'
import * as stockRepo from '../repos/stock.repo'
import { requireOwner } from '../session'

export type MovementsQuery = { productId?: number | null; limit?: number }

/** Manual stock correction. Every change is recorded as a movement row. */
export function adjustStock(
  db: Db,
  input: StockAdjustInput,
  userId: number
): { product: Product; movement: StockMovement } {
  requireOwner()
  return transact(db, () => {
    const product = productsRepo.findProductById(db, input.productId)
    if (!product) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found')
    }
    const now = localNow()

    if (input.delta < 0) {
      const requested = Math.abs(input.delta)
      const ok = productsRepo.tryDecrementStock(db, input.productId, requested, now)
      if (!ok) {
        throw new AppError(
          ErrorCodes.INSUFFICIENT_STOCK,
          `Only ${product.stockQty} unit(s) of "${product.name}" are in stock`,
          { meta: { productId: product.id, available: product.stockQty, requested } }
        )
      }
    } else if (input.delta > 0) {
      productsRepo.incrementStock(db, input.productId, input.delta, now)
    }

    const movement = stockRepo.insertStockMovement(db, {
      productId: input.productId,
      delta: input.delta,
      type: input.type,
      reason: input.reason ?? null,
      userId,
      createdAt: now
    })

    return { product: productsRepo.findProductById(db, input.productId) as Product, movement }
  })
}

export function listMovements(db: Db, query: MovementsQuery): StockMovement[] {
  requireOwner()
  return stockRepo.listStockMovements(db, query)
}

export function listLowStock(db: Db, limit = 50): Product[] {
  requireOwner()
  return productsRepo.listLowStockProducts(db, limit)
}
