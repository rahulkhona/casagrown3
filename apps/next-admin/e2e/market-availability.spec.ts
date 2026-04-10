import { test, expect } from '@playwright/test'

test.describe('Market Availability Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/market-availability', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('should load market availability page with Block State button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Block State/i })).toBeVisible({ timeout: 15000 })
  })

  test('should show info box about how it works', async ({ page }) => {
    await expect(page.getByText('How Market Availability Works')).toBeVisible({ timeout: 15000 })
  })

  test('should show page title and description', async ({ page }) => {
    await expect(page.getByText(/States where only free produce sharing/)).toBeVisible({ timeout: 15000 })
  })

  test('should open and close create form', async ({ page }) => {
    await page.getByRole('button', { name: /Block State/i }).click({ timeout: 15000 })
    await expect(page.getByText('Add State Restriction')).toBeVisible()
    await page.getByRole('button', { name: /Cancel/i }).click()
    await expect(page.getByText('Add State Restriction')).not.toBeVisible()
  })

  test('should show validation error for empty state', async ({ page }) => {
    await page.getByRole('button', { name: /Block State/i }).click({ timeout: 15000 })
    await expect(page.getByText('Add State Restriction')).toBeVisible()
    await page.getByRole('button', { name: /Add Restriction/i }).click()
    await expect(page.getByText(/Please select a state/)).toBeVisible()
  })

  test('should display empty state or data', async ({ page }) => {
    const emptyMessage = page.getByText(/No states are restricted/)
    const stateCell = page.getByText(/NY|CT|HI/, { exact: true }).first()
    await expect(emptyMessage.or(stateCell)).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Market Availability Sidebar Navigation', () => {
  test('should navigate to Market Availability from sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: /Market Availability/i }).first().click()
    await page.waitForURL('/market-availability')
    await expect(page.getByRole('button', { name: /Block State/i })).toBeVisible({ timeout: 15000 })
  })
})
