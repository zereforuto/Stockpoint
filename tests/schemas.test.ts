import { describe, expect, it } from 'vitest'
import { allowedChannels, isIpcChannel, PUBLIC_CHANNELS, IPC_CHANNEL_NAMES, IPC_ROLES } from '../src/shared/ipc'
import { parseRequest, passwordSchema, productInputSchema, SCHEMAS, usernameSchema } from '../src/shared/schemas'

describe('schema coverage', () => {
  it('has a schema for every channel and no extras', () => {
    expect(Object.keys(SCHEMAS).sort()).toEqual([...IPC_CHANNEL_NAMES].sort())
  })
})

describe('parseRequest', () => {
  it('accepts a valid login payload and trims the username', () => {
    const parsed = parseRequest('auth:login', { username: '  owner  ', password: 'owner123' })
    expect(parsed).toEqual({ username: 'owner', password: 'owner123' })
  })

  it('rejects malformed login payloads', () => {
    expect(() => parseRequest('auth:login', { username: '', password: 'x' })).toThrow()
    expect(() => parseRequest('auth:login', { username: 'owner' })).toThrow()
    expect(() => parseRequest('auth:login', null)).toThrow()
  })

  it('accepts undefined for payload-free channels', () => {
    expect(parseRequest('auth:session', undefined)).toBeUndefined()
    expect(parseRequest('settings:get', undefined)).toBeUndefined()
  })

  it('validates the sale payload end to end', () => {
    const parsed = parseRequest('sales:create', {
      items: [{ productId: 3, quantity: 2 }],
      discount: { type: 'percent', value: 10 },
      payment: { method: 'cash', amountTenderedCent: 5000 }
    })
    expect(parsed.items[0]).toEqual({ productId: 3, quantity: 2 })

    expect(() =>
      parseRequest('sales:create', {
        items: [],
        discount: { type: 'none', value: 0 },
        payment: { method: 'cash', amountTenderedCent: 0 }
      })
    ).toThrow()
    expect(() =>
      parseRequest('sales:create', {
        items: [{ productId: 1, quantity: 0 }],
        discount: { type: 'none', value: 0 },
        payment: { method: 'cash', amountTenderedCent: 0 }
      })
    ).toThrow()
    expect(() =>
      parseRequest('sales:create', {
        items: [{ productId: 1, quantity: 1 }],
        discount: { type: 'none', value: 0 },
        payment: { method: 'bitcoin', amountTenderedCent: 0 }
      })
    ).toThrow()
  })

  it('rejects a zero stock delta with the dedicated message', () => {
    expect(() => parseRequest('stock:adjust', { productId: 1, delta: 0, type: 'restock' })).toThrow(
      /Delta cannot be zero/
    )
    expect(parseRequest('stock:adjust', { productId: 1, delta: -4, type: 'damaged' })).toEqual({
      productId: 1,
      delta: -4,
      type: 'damaged'
    })
  })

  it('requires a source for CSV import', () => {
    expect(() => parseRequest('products:importCsv', {})).toThrow(/file path or CSV content/i)
    expect(parseRequest('products:importCsv', { content: 'name,sku' })).toEqual({ content: 'name,sku' })
  })

  it('bounds settings updates', () => {
    expect(parseRequest('settings:update', { taxRatePercent: 12, taxMode: 'inclusive' })).toEqual({
      taxRatePercent: 12,
      taxMode: 'inclusive'
    })
    expect(() => parseRequest('settings:update', { taxRatePercent: 150 })).toThrow()
    expect(() => parseRequest('settings:update', { taxMode: 'weird' })).toThrow()
    expect(() => parseRequest('settings:update', { shopName: '' })).toThrow()
  })

  it('requires YYYY-MM-DD date keys on reports', () => {
    expect(parseRequest('reports:profit', { from: '2026-10-01', to: '2026-10-20' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-20'
    })
    expect(() => parseRequest('reports:profit', { from: '01/10/2026', to: '2026-10-20' })).toThrow(
      /YYYY-MM-DD/
    )
    expect(() => parseRequest('reports:trend', { from: '2026-10-01', to: '2026-10-20', groupBy: 'hour' })).toThrow()
  })
})

describe('field schemas', () => {
  it('enforces username rules', () => {
    expect(usernameSchema.parse('  owner  ')).toBe('owner')
    expect(() => usernameSchema.parse('ab')).toThrow()
    expect(() => usernameSchema.parse('has space')).toThrow()
    expect(() => usernameSchema.parse('bad!char')).toThrow()
    expect(usernameSchema.parse('cashier_1.a-b')).toBe('cashier_1.a-b')
  })

  it('enforces password length', () => {
    expect(passwordSchema.parse('12345678')).toBe('12345678')
    expect(() => passwordSchema.parse('1234567')).toThrow()
    expect(() => passwordSchema.parse('x'.repeat(129))).toThrow()
  })

  it('enforces product money and stock fields', () => {
    const valid = {
      name: 'Something',
      sku: 'SOM-1',
      barcode: null,
      categoryId: null,
      costPriceCent: 100,
      sellingPriceCent: 150,
      stockQty: 0,
      reorderLevel: 0
    }
    expect(productInputSchema.parse(valid)).toMatchObject({ sku: 'SOM-1' })
    expect(() => productInputSchema.parse({ ...valid, costPriceCent: -1 })).toThrow()
    expect(() => productInputSchema.parse({ ...valid, stockQty: 1.5 })).toThrow()
    expect(() => productInputSchema.parse({ ...valid, name: '   ' })).toThrow()
  })
})

describe('role policy', () => {
  it('recognises known channels only', () => {
    expect(isIpcChannel('sales:create')).toBe(true)
    expect(isIpcChannel('evil:channel')).toBe(false)
    expect(isIpcChannel('toString')).toBe(false)
  })

  it('exposes only public channels to a signed-out caller', () => {
    const anonymous = allowedChannels(null)
    expect([...anonymous].sort()).toEqual([...PUBLIC_CHANNELS].sort())
    expect(anonymous.has('sales:create')).toBe(false)
  })

  it('lets cashiers sell but not void, report or manage users', () => {
    const cashier = allowedChannels('cashier')
    expect(cashier.has('sales:create')).toBe(true)
    expect(cashier.has('products:list')).toBe(true)
    expect(cashier.has('sales:void')).toBe(false)
    expect(cashier.has('reports:dashboard')).toBe(false)
    expect(cashier.has('users:create')).toBe(false)
    expect(cashier.has('settings:update')).toBe(false)
  })

  it('lets owners call every channel', () => {
    expect(allowedChannels('owner').size).toBe(IPC_CHANNEL_NAMES.length)
    expect(IPC_ROLES['sales:void']).toEqual(['owner'])
  })
})
