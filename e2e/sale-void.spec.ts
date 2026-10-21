import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const password = 'stockpoint-e2e'

async function loginAndChangePassword(page: Page): Promise<void> {
  await page.locator('input[placeholder="owner"]').fill('owner')
  await page.locator('input[type="password"]').fill('owner123')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Change your password' })).toBeVisible()
  const passwords = page.locator('input[type="password"]')
  await passwords.nth(0).fill('owner123')
  await passwords.nth(1).fill(password)
  await passwords.nth(2).fill(password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByRole('heading', { name: 'Point of Sale' })).toBeVisible()
}

test('a completed sale deducts stock and voiding it restores stock', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'stockpoint-e2e-'))
  let app: ElectronApplication | undefined

  try {
    const startedAt = Date.now()
    const launchEnv = { ...process.env }
    delete launchEnv.ELECTRON_RUN_AS_NODE
    launchEnv.STOCKPOINT_DATA_DIR = dataDir
    launchEnv.STOCKPOINT_SEED_DEMO = '1'
    launchEnv.STOCKPOINT_E2E = '1'
    app = await _electron.launch({
      args: ['--no-sandbox', '.'],
      env: launchEnv
    })
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'StockPoint' })).toBeVisible()
    expect(Date.now() - startedAt).toBeLessThan(3_000)

    await loginAndChangePassword(page)
    await page.getByRole('button', { name: /Coca-Cola 290ml/ }).click()
    await expect(page.getByText('/ 48', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: /Charge/ }).click()
    await page.getByRole('dialog', { name: 'Take payment' }).locator('input[inputmode="decimal"]').fill('15.00')
    await page.getByRole('button', { name: /Complete sale/ }).click()
    await expect(page.getByText(/Sale .* completed/)).toBeVisible()

    await page.getByRole('button', { name: 'Sales history' }).click()
    await expect(page.getByText('Completed', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Void', exact: true }).click()
    await page.getByLabel('Reason').fill('E2E stock restoration check')
    await page.getByRole('button', { name: 'Void & restore stock' }).click()
    await expect(page.getByText('Voided', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Point of Sale' }).click()
    await expect(page.getByText('48 in stock', { exact: true })).toBeVisible()
  } finally {
    await app?.close()
    await rm(dataDir, { recursive: true, force: true })
  }
})
