import { dialog } from 'electron'
import { copyFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { AppError, ErrorCodes } from '../../../shared/errors'
import { toDateKey } from '../../../shared/times'
import * as categoriesService from '../../services/categories.service'
import * as productsService from '../../services/products.service'
import { imagesDir } from '../../util/paths'
import type { Db } from '../../db/database'
import type { HandlerMap } from '../policy'

async function pickCsvFile(): Promise<string> {
  const result = await dialog.showOpenDialog({
    title: 'Choose a CSV file',
    properties: ['openFile'],
    filters: [{ name: 'CSV files', extensions: ['csv'] }]
  })
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) {
    throw new AppError(ErrorCodes.VALIDATION, 'No file was selected')
  }
  return filePath
}

async function pickSavePath(defaultPath: string, extensions: string[], name: string): Promise<string> {
  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name, extensions }]
  })
  const filePath = result.filePath
  if (result.canceled || !filePath) {
    throw new AppError(ErrorCodes.VALIDATION, 'No save location was selected')
  }
  return filePath
}

export function catalogHandlers(
  db: Db
): Pick<
  HandlerMap,
  | 'categories:list'
  | 'categories:create'
  | 'categories:update'
  | 'categories:delete'
  | 'products:list'
  | 'products:get'
  | 'products:search'
  | 'products:create'
  | 'products:update'
  | 'products:setActive'
  | 'products:importCsv'
  | 'products:exportCsv'
  | 'products:pickImage'
> {
  return {
    'categories:list': () => categoriesService.listCategories(db),
    'categories:create': (request) => categoriesService.createCategory(db, request.name),
    'categories:update': (request) => categoriesService.updateCategory(db, request.id, request.name),
    'categories:delete': (request) => categoriesService.deleteCategory(db, request.id),

    'products:list': (request) => productsService.listProducts(db, request),
    'products:get': (request) => productsService.getProduct(db, request.id),
    'products:search': (request) => productsService.searchProducts(db, request.term, request.limit ?? 20),
    'products:create': (request) => productsService.createProduct(db, request),
    'products:update': (request) => productsService.updateProduct(db, request.id, request.patch),
    'products:setActive': (request) => productsService.setActive(db, request.id, request.isActive),
    'products:importCsv': async (request) => {
      const filePath = request.filePath ?? (await pickCsvFile())
      return productsService.importCsv(db, { filePath })
    },
    'products:exportCsv': async (request) => {
      const filePath =
        request.filePath ?? (await pickSavePath(`products-${toDateKey()}.csv`, ['csv'], 'CSV files'))
      return productsService.exportCsv(db, filePath)
    },
    'products:pickImage': async () => {
      const result = await dialog.showOpenDialog({
        title: 'Choose a product image',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
      })
      const source = result.filePaths[0]
      if (result.canceled || !source) {
        return { imagePath: null }
      }
      mkdirSync(imagesDir(), { recursive: true })
      const target = join(imagesDir(), `${Date.now()}-${basename(source).replace(/[^\w.-]+/g, '_')}`)
      copyFileSync(source, target)
      return { imagePath: target }
    }
  }
}
