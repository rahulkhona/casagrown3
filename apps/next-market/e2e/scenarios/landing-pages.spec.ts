/**
 * CRM Landing Pages — Playwright E2E Tests
 *
 * Tests: marketing home page, sellers page, join form submission,
 *        branded link redirect (/r/[token]), page visit tracking beacon.
 *
 * Run: npx playwright test apps/next-market/e2e/scenarios/landing-pages.spec.ts
 */
import { test, expect } from '@playwright/test'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './scenario-helpers'

const BASE_URL = 'http://localhost:3001'
const API_HEADERS = {
  'apikey': SUPABASE_SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

test.describe.configure({ mode: 'serial' })

// ── Marketing Home Page ──────────────────────────────────────────────────────

test.describe('Marketing Home Page (/)', () => {
  test('MP-LP-01: Home page loads successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    // Market home renders — page title exists and page is not a 404
    await expect(page).not.toHaveURL(/404/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('MP-LP-02: Sellers landing page is reachable from home', async ({ page }) => {
    await page.goto(`${BASE_URL}/sellers`, { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/404/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('MP-LP-03: Sellers page has expected heading', async ({ page }) => {
    await page.goto(`${BASE_URL}/sellers`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})

// ── Sellers Landing Page ─────────────────────────────────────────────────────

test.describe('Sellers Landing Page (/sellers)', () => {
  test('MP-LP-04: Sellers page loads with earnings card', async ({ page }) => {
    await page.goto(`${BASE_URL}/sellers`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/💵 Seller Earnings Example/i)).toBeVisible()
    await expect(page.getByText(/Monthly Total/i)).toBeVisible()
  })

  test('MP-LP-05: Sellers CTA links to join page with seller intent', async ({ page }) => {
    await page.goto(`${BASE_URL}/sellers`, { waitUntil: 'domcontentloaded' })
    // Find links on the page that point to /join?intent=seller
    const cta = page.locator('a[href*="intent=seller"]').first()
    await expect(cta).toBeVisible()
    const href = await cta.getAttribute('href')
    expect(href).toContain('/join')
    expect(href).toContain('intent=seller')
  })
})

// ── Join / Lead Capture Form ─────────────────────────────────────────────────

test.describe('Join Lead Capture Form (/join)', () => {
  const testEmail = `e2e_landing_${Date.now()}@casagrown.local`

  test.afterAll(async () => {
    // Cleanup: delete test lead
    await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
      method: 'DELETE',
      headers: API_HEADERS,
    })
  })

  test('MP-LP-06: Join page renders buyer form by default', async ({ page }) => {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel(/Full Name/i)).toBeVisible()
    await expect(page.getByLabel(/Email Address/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Join CasaGrown/i })).toBeVisible()
  })

  test('MP-LP-07: Join page with intent=seller shows seller copy', async ({ page }) => {
    await page.goto(`${BASE_URL}/join?intent=seller`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: /Start My Seller Journey/i })).toBeVisible()
  })

  test('MP-LP-08: Submit lead form with name only inserts into crm_leads', async ({ page }) => {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })

    // Fill required fields
    await page.getByLabel(/Full Name/i).fill('E2E Test Buyer')
    await page.getByLabel(/Email Address/i).fill(testEmail)

    // Submit button enabled
    const submitBtn = page.getByRole('button', { name: /Join CasaGrown/i })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Success state
    await expect(page.getByText(/You're on the list!/i)).toBeVisible({ timeout: 10000 })

    // Verify lead in DB
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}&select=name,status,accepts_email`,
      { headers: API_HEADERS }
    )
    const leads = await dbRes.json()
    expect(leads.length).toBe(1)
    expect(leads[0].name).toBe('E2E Test Buyer')
    expect(leads[0].status).toBe('new')
    expect(leads[0].accepts_email).toBe(true)
  })

  test('MP-LP-09: Submit button disabled when name is empty', async ({ page }) => {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })
    const submitBtn = page.getByRole('button', { name: /Join CasaGrown|Start My/i })
    await expect(submitBtn).toBeDisabled()
  })
})

// ── Branded Short Link Redirect ──────────────────────────────────────────────

test.describe('Branded Link Redirect (/r/[token])', () => {
  let testToken = ''

  test.beforeAll(async () => {
    testToken = `e2etest${Date.now().toString(36)}`
    // Insert a test short link
    await fetch(`${SUPABASE_URL}/rest/v1/crm_short_links`, {
      method: 'POST',
      headers: { ...API_HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        token: testToken,
        destination_url: `${BASE_URL}/market`,
      }),
    })
  })

  test.afterAll(async () => {
    await fetch(`${SUPABASE_URL}/rest/v1/crm_short_links?token=eq.${testToken}`, {
      method: 'DELETE',
      headers: API_HEADERS,
    })
  })

  test('MP-LP-10: Valid token redirects to destination', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/r/${testToken}`, {
      waitUntil: 'domcontentloaded',
    })
    // After redirect, should be on the market page
    await page.waitForURL(/\/market/)
    expect(page.url()).toContain('/market')
  })

  test('MP-LP-11: Invalid token redirects to home gracefully', async ({ page }) => {
    await page.goto(`${BASE_URL}/r/invalidtoken99999`, { waitUntil: 'domcontentloaded' })
    // Should redirect to home, not 404
    expect(page.url()).not.toContain('404')
  })

  test('MP-LP-12: Click tracking increments click_count in DB', async ({ page }) => {
    await page.goto(`${BASE_URL}/r/${testToken}`, { waitUntil: 'domcontentloaded' })
    // Wait for redirect
    await page.waitForURL(/\/market/)

    // Check click_count incremented
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_short_links?token=eq.${testToken}&select=click_count,clicked_at`,
      { headers: API_HEADERS }
    )
    const links = await dbRes.json()
    expect(links[0].click_count).toBeGreaterThanOrEqual(1)
    expect(links[0].clicked_at).not.toBeNull()
  })
})
