import { AppError, ErrorCodes } from '../../shared/errors'
import type { Category } from '../../shared/types'
import type { Db } from '../db/database'
import * as categoriesRepo from '../repos/categories.repo'
import { requireOwner, requireSession } from '../session'

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

export function listCategories(db: Db): Category[] {
  requireSession()
  return categoriesRepo.listCategories(db)
}

export function createCategory(db: Db, name: string): Category {
  requireOwner()
  try {
    return categoriesRepo.insertCategory(db, name, categoriesRepo.nextCategorySortOrder(db))
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(ErrorCodes.CONFLICT, `Category "${name}" already exists`)
    }
    throw error
  }
}

export function updateCategory(db: Db, id: number, name: string): Category {
  requireOwner()
  if (!categoriesRepo.findCategoryById(db, id)) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Category not found')
  }
  try {
    return categoriesRepo.updateCategory(db, id, name)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(ErrorCodes.CONFLICT, `Category "${name}" already exists`)
    }
    throw error
  }
}

export function deleteCategory(db: Db, id: number): { ok: true } {
  requireOwner()
  if (!categoriesRepo.deleteCategory(db, id)) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Category not found')
  }
  return { ok: true }
}

/** Used by the CSV importer: finds or creates a category by name. */
export function ensureCategory(db: Db, name: string | null): number | null {
  if (!name) return null
  const existing = categoriesRepo.findCategoryByName(db, name)
  if (existing) return existing.id
  return categoriesRepo.insertCategory(db, name, categoriesRepo.nextCategorySortOrder(db)).id
}
