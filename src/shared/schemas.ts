/**
 * Zod schemas for every IPC request. These run in the main process before any
 * business logic, so the renderer (or anything that can reach the IPC bridge)
 * can never feed malformed data into the services.
 */

import { z, type ZodType } from 'zod'
import type { IpcChannel, IpcMap } from './ipc'

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
const id = z.number().int().positive()
const optionalLimit = z.number().int().min(1).max(1000).optional()
const optionalOffset = z.number().int().min(0).optional()
const fileFilters = z
  .array(z.object({ name: z.string().min(1), extensions: z.array(z.string().min(1)).min(1) }))
  .optional()

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Only letters, numbers, dot, dash and underscore are allowed')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().max(64).nullable(),
  categoryId: z.number().int().nullable(),
  costPriceCent: z.number().int().min(0),
  sellingPriceCent: z.number().int().min(0),
  stockQty: z.number().int().min(0),
  reorderLevel: z.number().int().min(0),
  imagePath: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional()
})

export const SCHEMAS = {
  'auth:login': z.object({
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(128)
  }),
  'auth:logout': z.void(),
  'auth:session': z.void(),
  'auth:changePassword': z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema
  }),

  'users:list': z.void(),
  'users:create': z.object({
    username: usernameSchema,
    fullName: z.string().trim().min(1).max(100),
    password: passwordSchema,
    role: z.enum(['owner', 'cashier'])
  }),
  'users:update': z.object({
    id,
    username: usernameSchema.optional(),
    fullName: z.string().trim().min(1).max(100).optional(),
    role: z.enum(['owner', 'cashier']).optional()
  }),
  'users:setActive': z.object({ id, isActive: z.boolean() }),
  'users:resetPassword': z.object({ id, newPassword: passwordSchema }),

  'categories:list': z.void(),
  'categories:create': z.object({ name: z.string().trim().min(1).max(64) }),
  'categories:update': z.object({ id, name: z.string().trim().min(1).max(64) }),
  'categories:delete': z.object({ id }),

  'products:list': z.object({
    search: z.string().trim().max(200).optional(),
    categoryId: id.nullable().optional(),
    includeInactive: z.boolean().optional(),
    lowStockOnly: z.boolean().optional(),
    limit: optionalLimit,
    offset: optionalOffset
  }),
  'products:get': z.object({ id }),
  'products:search': z.object({
    term: z.string().trim().min(1).max(128),
    limit: z.number().int().min(1).max(50).optional()
  }),
  'products:create': productInputSchema,
  'products:update': z.object({ id, patch: productInputSchema }),
  'products:setActive': z.object({ id, isActive: z.boolean() }),
  'products:importCsv': z
    .object({
      filePath: z.string().min(1).optional(),
      content: z.string().optional()
    })
    .refine((v) => Boolean(v.filePath || typeof v.content === 'string'), {
      message: 'A file path or CSV content is required'
    }),
  'products:exportCsv': z.object({ filePath: z.string().optional() }),
  'products:pickImage': z.void(),

  'stock:adjust': z.object({
    productId: id,
    delta: z
      .number()
      .int()
      .refine((n) => n !== 0, { message: 'Delta cannot be zero' }),
    type: z.enum(['restock', 'damaged', 'correction', 'adjustment']),
    reason: z.string().trim().max(300).optional()
  }),
  'stock:movements': z.object({
    productId: id.nullable().optional(),
    limit: optionalLimit
  }),

  'sales:create': z.object({
    items: z
      .array(
        z.object({
          productId: id,
          quantity: z.number().int().min(1).max(10000)
        })
      )
      .min(1)
      .max(200),
    discount: z.object({
      type: z.enum(['none', 'percent', 'fixed']),
      value: z.number().min(0)
    }),
    payment: z.object({
      method: z.enum(['cash', 'card', 'e_wallet']),
      amountTenderedCent: z.number().int().min(0),
      reference: z.string().trim().max(120).optional()
    })
  }),
  'sales:list': z.object({
    from: dateKey.optional(),
    to: dateKey.optional(),
    status: z.enum(['completed', 'voided', 'all']).optional(),
    method: z.enum(['cash', 'card', 'e_wallet', 'all']).optional(),
    cashierId: id.nullable().optional(),
    search: z.string().trim().max(120).optional(),
    limit: optionalLimit,
    offset: optionalOffset
  }),
  'sales:get': z.object({ id }),
  'sales:void': z.object({ id, reason: z.string().trim().min(1).max(300) }),

  'reports:dashboard': z.void(),
  'reports:trend': z.object({ from: dateKey, to: dateKey, groupBy: z.enum(['day', 'week', 'month']) }),
  'reports:topProducts': z.object({ from: dateKey, to: dateKey, limit: z.number().int().min(1).max(100) }),
  'reports:profit': z.object({ from: dateKey, to: dateKey }),
  'reports:valuation': z.void(),
  'reports:exportCsv': z.object({
    report: z.enum(['sales', 'top_products', 'profit', 'valuation']),
    from: dateKey,
    to: dateKey,
    filePath: z.string().optional()
  }),
  'reports:exportPdf': z.object({
    report: z.enum(['sales', 'top_products', 'profit', 'valuation']),
    from: dateKey,
    to: dateKey,
    title: z.string().trim().max(160).optional(),
    chartSvgs: z.array(z.string().max(2_000_000)).max(10).optional(),
    filePath: z.string().optional()
  }),

  'settings:get': z.void(),
  'settings:update': z.object({
    shopName: z.string().trim().min(1).max(160).optional(),
    address: z.string().trim().max(300).optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    currencySymbol: z.string().trim().min(1).max(8).optional(),
    taxRatePercent: z.number().min(0).max(100).optional(),
    taxMode: z.enum(['exclusive', 'inclusive']).optional(),
    receiptFooter: z.string().max(300).optional(),
    autoBackupEnabled: z.boolean().optional(),
    backupDir: z.string().min(1).nullable().optional(),
    retainBackups: z.number().int().min(1).max(365).optional()
  }),

  'backup:export': z.object({ filePath: z.string().optional() }),
  'backup:import': z.object({ filePath: z.string().min(1) }),
  'backup:pickFolder': z.void(),
  'backup:runAuto': z.void(),

  'print:receipt': z.object({
    saleId: id,
    silent: z.boolean().optional(),
    filePath: z.string().optional()
  }),
  'app:info': z.void(),

  'dialog:pickFile': z.object({
    filters: fileFilters,
    properties: z.array(z.enum(['openFile', 'openDirectory'])).optional()
  }),
  'dialog:saveFile': z.object({
    defaultName: z.string().min(1).max(200),
    filters: fileFilters
  })
} satisfies Record<IpcChannel, ZodType>

/** Channel -> validated request type. Guarantees every channel has a schema. */
export type SchemaMap = { [K in IpcChannel]: ZodType<IpcMap[K]['req']> }

export function parseRequest<K extends IpcChannel>(channel: K, raw: unknown): IpcMap[K]['req'] {
  return SCHEMAS[channel].parse(raw) as IpcMap[K]['req']
}
