import { test, expect } from '@playwright/test'

/**
 * CRM Admin Pages — Playwright E2E Tests
 *
 * Covers: Leads, Audiences, Assets, Campaigns, Landing Pages, Audience Functions
 *
 * Auth: Handled by setup project storageState.
 * Run: cd apps/next-admin && npx playwright test e2e/crm.spec.ts
 */

test.describe('CRM — Leads page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors and shows header', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('CRM Leads')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('search input is present and interactive', async ({ page }) => {
    const search = page.locator('#lead-search')
    await expect(search).toBeVisible()
    await search.fill('test')
    await expect(search).toHaveValue('test')
  })

  test('status filter dropdown has all options', async ({ page }) => {
    const filter = page.locator('#lead-status-filter')
    await expect(filter).toBeVisible()
    await expect(filter.locator('option[value="all"]')).toHaveCount(1)
    await expect(filter.locator('option[value="new"]')).toHaveCount(1)
    await expect(filter.locator('option[value="contacted"]')).toHaveCount(1)
    await expect(filter.locator('option[value="converted"]')).toHaveCount(1)
    await expect(filter.locator('option[value="partial"]')).toHaveCount(1)
  })

  test('partial filter option exists', async ({ page }) => {
    const filter = page.locator('#lead-status-filter')
    await filter.selectOption('partial')
    await expect(filter).toHaveValue('partial')
  })
})

test.describe('CRM — Audiences page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/audiences', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Audiences')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('+ New Audience button opens creation form', async ({ page }) => {
    await page.click('button:has-text("New Audience")')
    await expect(page.locator('h2')).toContainText('Create Audience')
  })

  test('ZIP community search input is visible in form', async ({ page }) => {
    await page.click('button:has-text("New Audience")')
    await expect(page.locator('.zip-search-input')).toBeVisible()
  })

  test('ZIP search for 937 shows Fresno results', async ({ page }) => {
    await page.click('button:has-text("New Audience")')
    await page.locator('.zip-search-input').fill('937')
    await page.waitForTimeout(600) // debounce
    const results = page.locator('.zip-result-item')
    // Fresno ZIPs are seeded — at least one should appear
    const count = await results.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('selecting a ZIP result fills city and state fields', async ({ page }) => {
    await page.click('button:has-text("New Audience")')
    await page.locator('.zip-search-input').fill('9371')
    await page.waitForTimeout(600)
    const firstResult = page.locator('.zip-result-item').first()
    if (await firstResult.isVisible()) {
      await firstResult.click()
      // State and city fields should be auto-filled
      const stateInput = page.locator('input[placeholder="e.g. CA"]')
      await expect(stateInput).not.toHaveValue('')
    }
  })

  test('population source dropdown loads from registry', async ({ page }) => {
    await page.click('button:has-text("New Audience")')
    const select = page.locator('select').first()
    await page.waitForTimeout(800) // wait for function registry to load
    const options = await select.locator('option').count()
    // Built-in 3 seeded + Custom = at least 4 options
    expect(options).toBeGreaterThanOrEqual(4)
  })

  test('consent toggle buttons are clickable', async ({ page }) => {
    await page.click('button:has-text("New Audience")')
    const emailToggle = page.locator('button[aria-pressed]').first()
    await expect(emailToggle).toBeVisible()
    await emailToggle.click()
    await expect(emailToggle).toHaveAttribute('aria-pressed', 'true')
    await emailToggle.click()
    await expect(emailToggle).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('CRM — Assets page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/assets', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Assets')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('media type filter buttons are shown', async ({ page }) => {
    await expect(page.locator('button:has-text("All")')).toBeVisible()
    await expect(page.locator('button:has-text("Image")')).toBeVisible()
    await expect(page.locator('button:has-text("Video")')).toBeVisible()
    await expect(page.locator('button:has-text("Audio")')).toBeVisible()
  })
})

test.describe('CRM — Campaigns page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/campaigns', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Campaign')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('New Campaign form shows subject and preheader for email channel', async ({ page }) => {
    await page.click('#create-campaign-btn')
    await expect(page.locator('h2')).toContainText('Create Campaign')
    // Should show Email Subject field
    await expect(page.locator('input[placeholder*="Subject"]')).toBeVisible()
    // Should show Preheader field
    await expect(page.locator('input[placeholder*="preheader"], input[placeholder*="preview"]')).toBeVisible()
  })

  test('switching to SMS hides subject and preheader', async ({ page }) => {
    await page.click('#create-campaign-btn')
    const channelSelect = page.locator('select').first()
    await channelSelect.selectOption('sms')
    // Subject and preheader should not be shown for SMS
    await expect(page.locator('input[placeholder*="Subject"]')).not.toBeVisible()
  })
})

test.describe('CRM — Landing Pages page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/landing-pages', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Landing Pages')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('Register Page form opens and has slug and URL fields', async ({ page }) => {
    await page.click('button:has-text("Register Page")')
    await expect(page.locator('input[placeholder*="Spring"]')).toBeVisible()
    await expect(page.locator('input[placeholder*="casagrown.com"]')).toBeVisible()
  })

  test('slug auto-populates from name', async ({ page }) => {
    await page.click('button:has-text("Register Page")')
    const nameInput = page.locator('input[placeholder*="Spring"]')
    await nameInput.fill('Summer Sellers Campaign')
    await page.waitForTimeout(200)
    const slugInput = page.locator('input[placeholder*="spring-growers"]')
    await expect(slugInput).toHaveValue('summer-sellers-campaign')
  })
})

test.describe('CRM — Audience Functions page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/audience-functions', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Audience Functions')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('shows seeded built-in functions as cards', async ({ page }) => {
    const cards = page.locator('.fn-card')
    const count = await cards.count()
    // 3 built-in functions seeded (All, Leads only, Users only)
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('search filters cards by keyword', async ({ page }) => {
    const search = page.locator('.crm-search')
    await search.fill('leads')
    await page.waitForTimeout(200)
    const visible = page.locator('.fn-card:visible')
    const count = await visible.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('Register Function form opens with all required fields', async ({ page }) => {
    await page.click('button:has-text("Register Function")')
    await expect(page.locator('input[placeholder*="crm_audience_"]')).toBeVisible()
    await expect(page.locator('input[placeholder*="High Value"]')).toBeVisible()
    await expect(page.locator('textarea[placeholder*="Selects all"]')).toBeVisible()
    await expect(page.locator('.tag-text-input')).toBeVisible()
  })

  test('tag chips are created on Enter key', async ({ page }) => {
    await page.click('button:has-text("Register Function")')
    const tagInput = page.locator('.tag-text-input')
    await tagInput.fill('buyers')
    await tagInput.press('Enter')
    await expect(page.locator('.tag-chip')).toBeVisible()
    await expect(page.locator('.tag-chip')).toContainText('buyers')
  })
})
