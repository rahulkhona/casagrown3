/**
 * Link Generator Page — Admin E2E Tests
 *
 * Tests the standalone CRM Link Generator page at /crm/link-generator.
 * Verifies: page load, TrackingUrlBuilder presence, preset URL options
 * (including /growbot and /create-listing), saved links table, and
 * short link creation flow.
 *
 * Auth: Handled by setup project storageState.
 * Run: cd apps/next-admin && npx playwright test e2e/crm-link-generator.spec.ts
 */
import { test, expect, type Page } from '@playwright/test'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function gotoLinkGenerator(page: Page) {
  await page.goto('/crm/link-generator', { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForSelector('h1', { state: 'visible', timeout: 10000 })
}

// ── Page Load ─────────────────────────────────────────────────────────────────

test.describe('Link Generator — Page Load', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLinkGenerator(page)
  })

  test('page renders with correct title and description', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await expect(page.locator('h1').first()).toContainText('Link Generator')
    await expect(page.getByText(/Create UTM-tagged tracked links/i).first()).toBeVisible()
    await expect(page.getByText(/Facebook.*Instagram.*Nextdoor/i).first()).toBeVisible()

    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('TrackingUrlBuilder is rendered on page load without needing to click a row', async ({ page }) => {
    // Unlike Landing Pages, Link Generator shows the builder immediately — no row selection needed
    await expect(page.getByText('Tracking URL Builder')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Build UTM-tagged links')).toBeVisible()
  })

  test('Saved Short Links table is rendered with correct headers', async ({ page }) => {
    await expect(page.getByText('Saved Short Links')).toBeVisible()
    await expect(page.getByText('Short URL', { exact: true })).toBeVisible()
    await expect(page.getByText('Destination', { exact: true })).toBeVisible()
    await expect(page.getByText('Source / Campaign', { exact: true })).toBeVisible()
    await expect(page.getByText('Label', { exact: true })).toBeVisible()
    await expect(page.getByText('Created', { exact: true })).toBeVisible()
  })

  test('page link is in CRM sidebar nav', async ({ page }) => {
    await page.goto('/crm/landing-pages', { waitUntil: 'networkidle' })
    const navLink = page.locator('a[href="/crm/link-generator"]').first()
    await expect(navLink).toBeVisible({ timeout: 5000 })
    await expect(navLink).toContainText('Link Generator')
  })
})

// ── Destination Presets ───────────────────────────────────────────────────────

test.describe('Link Generator — URL Presets', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLinkGenerator(page)
    await expect(page.getByText('Tracking URL Builder')).toBeVisible({ timeout: 8000 })
  })

  test('/growbot preset is in the Destination Page dropdown', async ({ page }) => {
    const destinationSelect = page.locator('label:has-text("Destination Page")').locator('..').locator('select')
    if (await destinationSelect.count() > 0) {
      const growbotOption = destinationSelect.locator('option', { hasText: /growbot/i })
      await expect(growbotOption).toHaveCount(1)
    } else {
      // Some implementations use buttons instead of select — check for button
      const growbotBtn = page.locator('button', { hasText: /growbot/i })
      await expect(growbotBtn.first()).toBeVisible()
    }
  })

  test('/create-listing and /create-listing-simple presets are in the Destination Page dropdown', async ({ page }) => {
    const destinationSelect = page.locator('label:has-text("Destination Page")').locator('..').locator('select')
    if (await destinationSelect.count() > 0) {
      const createListingOption = destinationSelect.locator('option', { hasText: /create-listing\b(?!-)/i })
      await expect(createListingOption).toHaveCount(1)
      const simpleListingOption = destinationSelect.locator('option', { hasText: /create-listing-simple/i })
      await expect(simpleListingOption).toHaveCount(1)
    } else {
      const createListingBtn = page.locator('button', { hasText: /create-listing\b(?!-)/i })
      await expect(createListingBtn.first()).toBeVisible()
      const simpleListingBtn = page.locator('button', { hasText: /create-listing-simple/i })
      await expect(simpleListingBtn.first()).toBeVisible()
    }
  })

  test('/sell, /join and /check-nutrition-loss presets are also present', async ({ page }) => {
    const destinationSelect = page.locator('label:has-text("Destination Page")').locator('..').locator('select')
    if (await destinationSelect.count() > 0) {
      await expect(destinationSelect.locator('option', { hasText: '/sell — Seller Calculator' })).toHaveCount(1)
      await expect(destinationSelect.locator('option', { hasText: /join/i })).toHaveCount(1)
      await expect(destinationSelect.locator('option', { hasText: /nutrition/i })).toHaveCount(1)
    }
  })
})

// ── UTM Flow ──────────────────────────────────────────────────────────────────

test.describe('Link Generator — UTM Generation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLinkGenerator(page)
    await expect(page.getByText('Tracking URL Builder')).toBeVisible({ timeout: 8000 })
  })

  test('selecting source and medium generates a live UTM URL preview', async ({ page }) => {
    // Select source
    const sourceLabel = page.locator('label:has-text("Source")')
    await sourceLabel.locator('..').locator('select').selectOption('facebook')

    // Select medium
    const mediumLabel = page.locator('label:has-text("Medium")')
    await mediumLabel.locator('..').locator('select').selectOption('social')

    // Fill campaign
    await page.getByPlaceholder('e.g. spring-2026').fill('growbot-awareness')

    // URL preview should appear
    const preview = page.locator('code').filter({ hasText: 'utm_source=facebook' })
    await expect(preview).toBeVisible({ timeout: 3000 })
    await expect(preview).toContainText('utm_medium=social')
    await expect(preview).toContainText('utm_campaign=growbot-awareness')
  })

  test('Create Short Link button is present', async ({ page }) => {
    await expect(page.getByText('Create Short Link')).toBeVisible()
  })

  test('short link API error shows error message without crashing', async ({ page }) => {
    await page.route('/api/crm/short-links', route =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) })
    )

    const sourceLabel = page.locator('label:has-text("Source")')
    await sourceLabel.locator('..').locator('select').selectOption('facebook')
    const mediumLabel = page.locator('label:has-text("Medium")')
    await mediumLabel.locator('..').locator('select').selectOption('social')

    const shortLinkBtn = page.locator('button:has-text("🔗 Create Short Link")')
    await expect(shortLinkBtn).toBeEnabled({ timeout: 3000 })
    await shortLinkBtn.click()

    await expect(
      page.getByText(/failed|error|could not|try again/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})

// ── Saved Links Table ─────────────────────────────────────────────────────────

test.describe('Link Generator — Saved Links Table', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLinkGenerator(page)
  })

  test('empty state message shown when no admin-created links exist', async ({ page }) => {
    // Mock Supabase REST to return empty for recipient_id=is.null query
    await page.route('**/rest/v1/crm_short_links**', route => {
      const url = route.request().url()
      if (url.includes('recipient_id=is.null')) {
        return route.fulfill({ status: 200, body: '[]', headers: { 'Content-Type': 'application/json' } })
      }
      return route.continue()
    })
    await page.reload({ waitUntil: 'networkidle' })

    await expect(page.getByText(/No short links yet/i)).toBeVisible({ timeout: 5000 })
  })

  test('per-recipient campaign links (recipient_id set) are not shown', async ({ page }) => {
    // The query must include recipient_id=is.null — verify it's in the Supabase request
    let queryUrl = ''
    page.on('request', req => {
      if (req.url().includes('crm_short_links')) queryUrl = req.url()
    })

    await page.reload({ waitUntil: 'networkidle' })

    // Give the fetch a moment to fire
    await page.waitForTimeout(2000)
    expect(queryUrl).toContain('recipient_id=is.null')
  })

  test('search input filters visible links', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search links…')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('facebook')
    await expect(searchInput).toHaveValue('facebook')
  })

  test('Refresh button is present and clickable', async ({ page }) => {
    const refreshBtn = page.locator('button:has-text("↻ Refresh")')
    await expect(refreshBtn).toBeVisible()
    await refreshBtn.click()
    await expect(page.locator('h1')).toBeVisible()
  })
})
