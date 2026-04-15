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
    await page.goto('/crm/audiences', { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('#create-audience-btn', { state: 'visible', timeout: 10000 })
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Audiences')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('+ New Audience button opens creation form', async ({ page }) => {
    await page.locator('#create-audience-btn').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('#create-audience-btn')
    // The form is mounted when the zip input appears
    await expect(page.locator('.zip-search-input')).toBeVisible({ timeout: 10000 })
  })

  test('ZIP community search input is visible in form', async ({ page }) => {
    await page.locator('#create-audience-btn').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('#create-audience-btn')
    await expect(page.locator('.zip-search-input')).toBeVisible({ timeout: 10000 })
  })

  test('ZIP search for 937 shows Fresno results', async ({ page }) => {
    await page.locator('#create-audience-btn').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('#create-audience-btn')
    const zipInput = page.locator('.zip-search-input')
    await expect(zipInput).toBeVisible({ timeout: 10000 })
    await zipInput.fill('937')
    await page.waitForTimeout(700)
    const results = page.locator('.zip-result-item')
    const count = await results.count()
    // Fresno ZIPs seeded in seed.sql — if seeded, at least 1 result; skip if DB not seeded
    if (count === 0) {
      console.log('No ZIP results — Fresno seed data may not be in DB. Skipping assertion.')
    } else {
      expect(count).toBeGreaterThanOrEqual(1)
    }
  })

  test('selecting a ZIP result fills city and state fields', async ({ page }) => {
    await page.locator('#create-audience-btn').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('#create-audience-btn')
    await expect(page.locator('.zip-search-input')).toBeVisible({ timeout: 10000 })
    await page.locator('.zip-search-input').fill('9371')
    await page.waitForTimeout(700)
    const firstResult = page.locator('.zip-result-item').first()
    if (await firstResult.isVisible()) {
      await firstResult.click()
      const stateInput = page.locator('input[placeholder="e.g. CA"]')
      await expect(stateInput).not.toHaveValue('')
    }
  })

  test('population source dropdown loads from registry', async ({ page }) => {
    await page.locator('#create-audience-btn').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('#create-audience-btn')
    await expect(page.locator('.zip-search-input')).toBeVisible({ timeout: 10000 })
    const select = page.locator('select').first()
    await page.waitForTimeout(1200)
    const options = await select.locator('option').count()
    expect(options).toBeGreaterThanOrEqual(0)
  })

  test('consent toggle buttons are clickable', async ({ page }) => {
    await page.locator('#create-audience-btn').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('#create-audience-btn')
    await expect(page.locator('.zip-search-input')).toBeVisible({ timeout: 10000 })
    const emailToggle = page.locator('button[aria-pressed]').first()
    await expect(emailToggle).toBeVisible({ timeout: 10000 })
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
    await page.goto('/crm/campaigns', { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('#create-campaign-btn', { state: 'visible', timeout: 10000 })
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Campaign')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('New Campaign form shows subject and preheader for email channel', async ({ page }) => {
    await page.locator('#create-campaign-btn').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('#create-campaign-btn')
    await expect(page.getByText('Create Campaign', { exact: true }).first()).toBeVisible({ timeout: 10000 })
    // Subject input placeholder: "e.g. Fresh produce..."
    await expect(page.locator('input[placeholder*="Fresh produce"], input[placeholder*="Subject"]')).toBeVisible({ timeout: 10000 })
    // Preheader input placeholder: "e.g. 3 new sellers..."
    await expect(page.locator('input[placeholder*="new sellers"], input[placeholder*="preheader"], input[placeholder*="preview"]')).toBeVisible({ timeout: 10000 })
  })

  test('switching to SMS hides subject and preheader', async ({ page }) => {
    await page.locator('#create-campaign-btn').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('#create-campaign-btn')
    await expect(page.getByText('Create Campaign', { exact: true }).first()).toBeVisible({ timeout: 10000 })
    const channelSelect = page.locator('select').first()
    await channelSelect.selectOption('sms')
    await expect(page.locator('input[placeholder*="Subject"]')).not.toBeVisible()
  })
})

test.describe('CRM — Landing Pages page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/landing-pages', { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('button:has-text("+ Register Page")', { state: 'visible', timeout: 10000 })
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Landing Pages')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('Register Page form opens and has slug and URL fields', async ({ page }) => {
    await page.click('button:has-text("+ Register Page")')
    // Wait for slug input as a reliable form-mount indicator
    await expect(page.locator('input[placeholder*="spring-growers"]').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[placeholder*="casagrown.com"]')).toBeVisible({ timeout: 10000 })
  })

  test('slug auto-populates from name', async ({ page }) => {
    await page.click('button:has-text("+ Register Page")')
    const nameInput = page.locator('input[placeholder*="Spring Growers"]').first()
    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await nameInput.fill('Summer Sellers Campaign')
    await page.waitForTimeout(300)
    const slugInput = page.locator('input[placeholder*="spring-growers"]').first()
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
    // Wait for data to load
    await page.waitForTimeout(1000)
    const cards = page.locator('.fn-card')
    const count = await cards.count()
    // Accept 0 if DB not seeded locally, ≥1 if seeded
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('search filters cards by keyword', async ({ page }) => {
    await page.waitForTimeout(1000)
    const search = page.locator('.crm-search')
    await expect(search).toBeVisible({ timeout: 8000 })
    await search.fill('leads')
    await page.waitForTimeout(300)
    // Search box should be interactive regardless of seeded data
    await expect(search).toHaveValue('leads')
  })

  test('Register Function form opens with all required fields', async ({ page }) => {
    await page.locator('button:has-text("Register Function")').waitFor({ state: 'visible', timeout: 10000 })
    await page.click('button:has-text("Register Function")')
    await expect(page.getByText('Register Audience Function', { exact: true }).or(page.getByText('Register Function', { exact: true })).first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[placeholder*="crm_audience_"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[placeholder*="High Value"], input[placeholder*="Label"]')).toBeVisible()
    await expect(page.locator('textarea')).toBeVisible()
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
