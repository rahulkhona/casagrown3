import { test, expect } from '@playwright/test'

test.describe('Terms of Service Page', () => {
  test('renders terms and privacy tabs', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByText('Legal Agreements')).toBeVisible()
    await expect(page.getByText('Terms of Use')).toBeVisible()
    await expect(page.getByText('Privacy Policy')).toBeVisible()
  })

  test('accept button is disabled until both checkboxes are checked', async ({
    page,
  }) => {
    await page.goto('/terms')
    const acceptBtn = page.getByRole('button', { name: /accept.*continue/i })
    await expect(acceptBtn).toBeDisabled()

    // Check only terms
    await page.check('#agree-terms')
    await expect(acceptBtn).toBeDisabled()

    // Check privacy too
    await page.check('#agree-privacy')
    await expect(acceptBtn).toBeEnabled()
  })

  test('switching tabs shows different content', async ({ page }) => {
    await page.goto('/terms')

    // Terms tab should show amendments
    await expect(
      page.getByText('Amendments and Modifications')
    ).toBeVisible()

    // Switch to privacy tab
    await page.click('text=Privacy Policy')
    await expect(
      page.getByText('Information Collection')
    ).toBeVisible()
  })

  test('checkboxes show check marks on tabs', async ({ page }) => {
    await page.goto('/terms')
    await page.check('#agree-terms')
    // The ✓ should appear on the terms tab
    await expect(page.locator('text=✓')).toBeVisible()
  })
})
