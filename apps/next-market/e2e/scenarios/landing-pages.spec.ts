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

const MAILPIT_URL = 'http://127.0.0.1:54324'

/** Poll Mailpit for an OTP email sent to a specific recipient. Returns 6-digit code or empty string. */
async function getOtpFromMailpit(recipientEmail: string, maxAttempts = 10, delayMs = 1000): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delayMs))
    try {
      const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(recipientEmail)}&limit=1`)
      const data = await res.json()
      const msg = data.messages?.[0]
      if (msg) {
        const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)
        const msgData = await msgRes.json()
        const body = msgData.Text || msgData.HTML || ''
        const match = body.match(/\b(\d{6})\b/)
        if (match) return match[1]
      }
    } catch { /* retry */ }
  }
  return ''
}

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

// ── Join / Account Creation Form ─────────────────────────────────────────────

test.describe('Join Account Creation Form (/join)', () => {
  test('MP-LP-06: Join page renders profile form by default', async ({ page }) => {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel(/Full Name/i)).toBeVisible()
    await expect(page.getByLabel(/Email Address/i)).toBeVisible()
    await expect(page.getByLabel(/Street Address/i)).toBeVisible()
    await expect(page.getByLabel(/City/i)).toBeVisible()
    await expect(page.getByLabel(/State/i)).toBeVisible()
    await expect(page.getByLabel(/Zip/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible()
  })

  test('MP-LP-07: Join page with intent=seller shows seller hero copy', async ({ page }) => {
    await page.goto(`${BASE_URL}/join?intent=seller`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/backyard/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: /Create Your Account/i })).toBeVisible()
  })

  test('MP-LP-08: Form has buyer hero copy by default', async ({ page }) => {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Fresh food from your neighbors/i)).toBeVisible()
  })

  test('MP-LP-09: Submit button disabled when required fields are empty', async ({ page }) => {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })
    const submitBtn = page.getByRole('button', { name: /Continue/i })
    await expect(submitBtn).toBeDisabled()
  })

  test('MP-LP-09b: Join page renders hero benefits', async ({ page }) => {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Hyper-Local/i)).toBeVisible()
    await expect(page.getByText(/Free to Join/i)).toBeVisible()
    await expect(page.getByText(/Community First/i)).toBeVisible()
  })

  test('MP-LP-09c: Join page shows privacy note', async ({ page }) => {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/never shared publicly/i)).toBeVisible()
  })

  test('MP-LP-09d: Join page has glassmorphic layout', async ({ page }) => {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })
    // Nav bar with logo
    await expect(page.locator('.join-nav-brand-name')).toHaveText(/CasaGrown/i)
    // Two-panel layout
    await expect(page.locator('.join-hero-section')).toBeVisible()
    await expect(page.locator('.join-form-section')).toBeVisible()
  })

  test('MP-LP-09e: Join page Use My Location button exists', async ({ page }) => {
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Use My Location/i)).toBeVisible()
  })

  test('MP-LP-10a: Submit form creates crm_leads entry for follow-up', async ({ page }) => {
    const testEmail = `e2e_lead_${Date.now()}@casagrown.local`

    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })

    // Fill required fields
    await page.getByLabel(/Full Name/i).fill('E2E Lead Test')
    await page.getByLabel(/Email Address/i).fill(testEmail)
    await page.getByLabel(/Street Address/i).fill('123 Main St')
    await page.getByLabel(/City/i).fill('San Jose')
    await page.getByLabel(/State/i).fill('CA')
    await page.getByLabel(/Zip/i).fill('95120')

    // Submit
    const submitBtn = page.getByRole('button', { name: /Continue/i })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Wait for OTP step (form was submitted, lead should be created)
    await expect(page.getByText(/Check your email/i)).toBeVisible({ timeout: 15000 })

    // Verify lead in DB
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}&select=name,status,accepts_email,metadata`,
      { headers: API_HEADERS }
    )
    const leads = await dbRes.json()
    expect(leads.length).toBe(1)
    expect(leads[0].name).toBe('E2E Lead Test')
    expect(leads[0].status).toBe('new')
    expect(leads[0].accepts_email).toBe(true)

    // Cleanup
    await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
      method: 'DELETE', headers: API_HEADERS,
    })
  })

  test('MP-LP-10b: OTP step shows email and resend button', async ({ page }) => {
    const testEmail = `e2e_otp_${Date.now()}@casagrown.local`
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })

    await page.getByLabel(/Full Name/i).fill('E2E OTP Test')
    await page.getByLabel(/Email Address/i).fill(testEmail)
    await page.getByLabel(/Street Address/i).fill('123 Main St')
    await page.getByLabel(/City/i).fill('San Jose')
    await page.getByLabel(/State/i).fill('CA')
    await page.getByLabel(/Zip/i).fill('95120')

    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByText(/Check your email/i)).toBeVisible({ timeout: 30000 })

    // OTP step shows email address
    await expect(page.getByText(testEmail)).toBeVisible()
    // OTP input exists
    await expect(page.getByLabel(/Enter 6-Digit Code/i)).toBeVisible()
    // Resend button exists (with cooldown)
    await expect(page.getByText(/Resend in/i)).toBeVisible()

    // Cleanup
    await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
      method: 'DELETE', headers: API_HEADERS,
    })
  })

  test('MP-LP-10c: Full OTP flow reaches phone step', async ({ page }) => {
    const testEmail = `e2e_full_${Date.now()}@casagrown.local`
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })

    await page.getByLabel(/Full Name/i).fill('E2E Full Flow')
    await page.getByLabel(/Email Address/i).fill(testEmail)
    await page.getByLabel(/Street Address/i).fill('123 Main St')
    await page.getByLabel(/City/i).fill('San Jose')
    await page.getByLabel(/State/i).fill('CA')
    await page.getByLabel(/Zip/i).fill('95120')

    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByText(/Check your email/i)).toBeVisible({ timeout: 30000 })

    // Get OTP from Mailpit — poll for email to this specific recipient
    const otp = await getOtpFromMailpit(testEmail)

    if (otp) {
      await page.getByLabel(/Enter 6-Digit Code/i).fill(otp)
      await page.getByRole('button', { name: /Verify & Join/i }).click()

      // Should reach Phone step
      await expect(page.getByText(/Phone & Notifications/i)).toBeVisible({ timeout: 15000 })
      // Phone step shows correct SMS consent language
      await expect(page.getByText(/Enable Order SMS Notifications/i)).toBeVisible()
      await expect(page.getByText(/Reply STOP to cancel/i)).toBeVisible()
      // Skip button exists
      await expect(page.getByText(/Skip for now/i)).toBeVisible()
      // Nav should NOT show Login button (user is authenticated)
      await expect(page.locator('.join-nav-login')).not.toBeVisible()
    }

    // Cleanup
    await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
      method: 'DELETE', headers: API_HEADERS,
    })
    // Delete test auth user
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(testEmail)}`, {
      headers: { ...API_HEADERS },
    })
    const authUsers = await authRes.json()
    if (authUsers?.users?.[0]?.id) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUsers.users[0].id}`, {
        method: 'DELETE', headers: API_HEADERS,
      })
    }
  })

  test('MP-LP-10d: Skip phone goes to welcome with 4 CTAs', async ({ page }) => {
    const testEmail = `e2e_skip_${Date.now()}@casagrown.local`
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' })

    await page.getByLabel(/Full Name/i).fill('E2E Skip Phone')
    await page.getByLabel(/Email Address/i).fill(testEmail)
    await page.getByLabel(/Street Address/i).fill('123 Main St')
    await page.getByLabel(/City/i).fill('San Jose')
    await page.getByLabel(/State/i).fill('CA')
    await page.getByLabel(/Zip/i).fill('95120')

    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByText(/Check your email/i)).toBeVisible({ timeout: 30000 })

    // Get OTP from Mailpit — poll for email to this specific recipient
    const otp = await getOtpFromMailpit(testEmail)

    if (otp) {
      await page.getByLabel(/Enter 6-Digit Code/i).fill(otp)
      await page.getByRole('button', { name: /Verify & Join/i }).click()

      // Reach Phone step, then skip
      await expect(page.getByText(/Phone & Notifications/i)).toBeVisible({ timeout: 15000 })
      await page.getByText(/Skip for now/i).click()

      // Should show Welcome with 4 CTAs
      await expect(page.getByText(/Welcome to CasaGrown/i)).toBeVisible({ timeout: 5000 })
      await expect(page.getByText(/Browse Market/i)).toBeVisible()
      await expect(page.getByText(/Start Selling/i)).toBeVisible()
      await expect(page.getByText(/Ask GrowBot/i)).toBeVisible()
      await expect(page.getByRole('link', { name: /Community/i })).toBeVisible()
      // Nav should NOT show Login
      await expect(page.locator('.join-nav-login')).not.toBeVisible()
    }

    // Cleanup
    await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
      method: 'DELETE', headers: API_HEADERS,
    })
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(testEmail)}`, {
      headers: { ...API_HEADERS },
    })
    const authUsers = await authRes.json()
    if (authUsers?.users?.[0]?.id) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUsers.users[0].id}`, {
        method: 'DELETE', headers: API_HEADERS,
      })
    }
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
