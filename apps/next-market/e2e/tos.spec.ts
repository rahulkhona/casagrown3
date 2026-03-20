import { test, expect } from '@playwright/test'

test.describe('Terms of Service Page', () => {
  test('renders terms and privacy tabs', async ({ page }) => {
    await page.goto('/terms')
    await page.waitForTimeout(2000)
    const body = await page.locator('body').textContent()
    expect(body).toContain('Legal Agreements')
    expect(body).toContain('Terms of Use')
    expect(body).toContain('Privacy Policy')
  })

  test('accept button is disabled until both checkboxes are checked', async ({
    page,
  }) => {
    // Checkboxes and accept button only render in onboarding mode (with redirect param)
    await page.goto('/terms?redirect=/market')
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

    // Terms tab should show amendments or seller representations
    await expect(
      page.getByText('Seller Representations')
    ).toBeVisible()

    // Switch to privacy tab
    await page.click('text=Privacy Policy')
    await expect(
      page.getByText('Information Collection')
    ).toBeVisible()
  })

  test('checkboxes show check marks on tabs', async ({ page }) => {
    // Checkboxes only render in onboarding mode
    await page.goto('/terms?redirect=/market')
    await page.check('#agree-terms')
    // The ✓ should appear on the terms tab
    await expect(page.locator('text=✓')).toBeVisible()
  })
})
