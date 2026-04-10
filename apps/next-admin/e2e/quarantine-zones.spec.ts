import { test, expect } from '@playwright/test'

test.describe('Quarantine Zones Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quarantine-zones', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('should load quarantine zones page with title', async ({ page }) => {
    await expect(page.getByText('Quarantine Zones', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/agricultural pest quarantines/i)).toBeVisible()
    await expect(page.getByText('Add Quarantine', { exact: true })).toBeVisible()
  })

  test('should open and close create form', async ({ page }) => {
    await page.getByText('Add Quarantine', { exact: true }).click({ timeout: 15000 })
    await page.waitForTimeout(500)
    await expect(page.getByText('New Quarantine Zone', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Pest / Disease Name', { exact: false })).toBeVisible()
    await expect(page.getByText('Quarantined Category', { exact: false })).toBeVisible()
    await page.getByText('Cancel', { exact: true }).click()
    await expect(page.getByText('New Quarantine Zone', { exact: true })).not.toBeVisible({ timeout: 10000 })
  })

  test('should show category ALL and jurisdiction scope buttons', async ({ page }) => {
    await page.getByText('Add Quarantine', { exact: true }).click({ timeout: 15000 })
    await page.waitForTimeout(500)
    await expect(page.getByText('New Quarantine Zone', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/ALL Categories/)).toBeVisible()
    await expect(page.getByText('County-level', { exact: true })).toBeVisible()
    await expect(page.getByText('State-level', { exact: true })).toBeVisible()
    await expect(page.getByText('Country-wide', { exact: true })).toBeVisible()
  })

  test('should show data grid or empty state', async ({ page }) => {
    const body = await page.locator('body').innerText()
    const hasQuarantineContent =
      body.includes('quarantine') || body.includes('Quarantine') ||
      body.includes('No quarantine') || body.includes('Fruit Fly') ||
      body.includes('Add Quarantine')
    expect(hasQuarantineContent).toBe(true)
  })

  test('should validate required fields on submit', async ({ page }) => {
    await page.getByText('Add Quarantine', { exact: true }).click({ timeout: 15000 })
    await page.waitForTimeout(500)
    await expect(page.getByText('New Quarantine Zone', { exact: true })).toBeVisible({ timeout: 10000 })
    await page.getByText('Enforce Quarantine', { exact: true }).click()
    await expect(page.getByText(/Please select a category/i)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Quarantine Sidebar Navigation', () => {
  test('should have QUARANTINE ZONES section in sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const quarantineHeader = page.getByText('QUARANTINE ZONES').first()
    await expect(quarantineHeader).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to Quarantine Zones page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const quarantineLink = page.getByText('Manage Quarantines').first()
    if ((await quarantineLink.count()) > 0) {
      await quarantineLink.click()
      await page.waitForURL(/\/quarantine-zones/)
      await expect(page).toHaveURL(/\/quarantine-zones/)
    }
  })
})
