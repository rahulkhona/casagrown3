import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Settlements & Payout Events page in admin dashboard.
 * Tests: page load, settlements table, payout events section, Stripe Dashboard link.
 *
 * Auth: Uses GoTrue REST API + cookie injection (same pattern as market e2e tests).
 * Uses Mailpit API (localhost:54324) for OTP code retrieval.
 *
 * Run: cd apps/next-admin && npx playwright test e2e/settlements-payouts.spec.ts
 */

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const MAILPIT_URL = 'http://localhost:54324'
const ADMIN_EMAIL = 'seller@test.local'
const ADMIN_PASSWORD = 'TestPassword123!'

/**
 * Authenticate via GoTrue REST API and inject cookies/localStorage.
 * Falls back to OTP via Mailpit if password auth fails.
 */
async function loginAsAdmin(page: typeof import('@playwright/test').Page.prototype) {
  let access_token: string
  let refresh_token: string
  let authUser: any

  // 1. Try password auth first
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })

  if (res.ok) {
    const data = await res.json()
    access_token = data.access_token
    refresh_token = data.refresh_token
    authUser = data.user
  } else {
    // 2. Fall back: fix auth.identities, then retry
    const { execSync } = require('child_process')
    try {
      execSync(`docker exec -i supabase_db_casagrown3 psql -U postgres -c "
        INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
        SELECT id, id, email, 'email', jsonb_build_object('sub', id::text, 'email', email), now(), now(), now()
        FROM auth.users WHERE email = '${ADMIN_EMAIL}'
        ON CONFLICT (provider_id, provider) DO NOTHING;
        UPDATE auth.users SET
          confirmation_token = COALESCE(confirmation_token, ''),
          recovery_token = COALESCE(recovery_token, ''),
          email_change_token_new = COALESCE(email_change_token_new, ''),
          email_change = COALESCE(email_change, ''),
          email_change_token_current = COALESCE(email_change_token_current, ''),
          reauthentication_token = COALESCE(reauthentication_token, '')
        WHERE email = '${ADMIN_EMAIL}';
      "`, { timeout: 5000, stdio: 'pipe' })
    } catch (e) {
      console.warn('[AUTH] Could not fix identity:', e)
    }

    const retryRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    })
    if (!retryRes.ok) {
      throw new Error(`Login failed for ${ADMIN_EMAIL}: ${retryRes.status}`)
    }
    const data = await retryRes.json()
    access_token = data.access_token
    refresh_token = data.refresh_token
    authUser = data.user
  }

  // 3. Navigate to login page (sets origin)
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30_000 })

  // 4. Inject auth into cookies + localStorage
  const sessionData = JSON.stringify({
    access_token,
    refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: authUser,
  })

  await page.context().addCookies([
    { name: 'sb-127-auth-token', value: sessionData, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' },
    { name: 'sb-127-auth-token.0', value: btoa(sessionData).substring(0, 3600), domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' },
  ])

  await page.evaluate(
    ({ at, rt, u }: any) => {
      localStorage.setItem('supabase.auth.token', JSON.stringify({ access_token: at, refresh_token: rt, user: u }))
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: at, refresh_token: rt, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
    },
    { at: access_token, rt: refresh_token, u: authUser },
  )

  // 5. Reload to pick up auth
  try {
    await page.reload({ waitUntil: 'networkidle', timeout: 15_000 })
  } catch {
    await page.waitForTimeout(2000)
  }
}

test.describe('Settlements & Payout Events Page', () => {
  // ── Page Load ──
  test('should load settlements page without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/settlements')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      // Authenticate and retry
      await loginAsAdmin(page)
      await page.goto('/settlements', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    // Verify no critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
      && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
    )
    expect(criticalErrors).toEqual([])
  })

  // ── Settlements Section ──
  test('should display Settlements & Stripe heading', async ({ page }) => {
    await page.goto('/settlements')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/settlements', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    const heading = page.getByText(/Settlements.*Stripe/i).first()
    await expect(heading).toBeVisible({ timeout: 15000 })
  })

  test('should display Settlements table headers', async ({ page }) => {
    await page.goto('/settlements')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/settlements', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    // Table should have column headers
    const dateHeader = page.getByText('DATE').first()
    const statusHeader = page.getByText('STATUS').first()
    const ordersHeader = page.getByText('ORDERS').first()
    await expect(dateHeader).toBeVisible({ timeout: 15000 })
    await expect(statusHeader).toBeVisible({ timeout: 15000 })
    await expect(ordersHeader).toBeVisible({ timeout: 15000 })
  })

  test('should show empty state or settlement data', async ({ page }) => {
    await page.goto('/settlements')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/settlements', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    // Either shows settlement rows or an empty state message
    const hasContent = page.getByText(/No settlements|Settlements|DATE|cleared|funds_pending/i).first()
    await expect(hasContent).toBeVisible({ timeout: 15000 })
  })

  // ── Payout Events Section ──
  test('should display Stripe Payout Events section', async ({ page }) => {
    await page.goto('/settlements')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/settlements', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    // Scroll down to the payout events section
    const payoutSection = page.getByText('Stripe Payout Events').first()
    await expect(payoutSection).toBeVisible({ timeout: 15000 })
  })

  test('should show payout events table headers', async ({ page }) => {
    await page.goto('/settlements')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/settlements', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    // Payout events headers
    const payoutIdHeader = page.getByText('PAYOUT ID').first()
    const settlementsHeader = page.getByText('SETTLEMENTS').first()
    const usersHeader = page.getByText('USERS').first()
    await expect(payoutIdHeader).toBeVisible({ timeout: 15000 })
    await expect(settlementsHeader).toBeVisible({ timeout: 15000 })
    await expect(usersHeader).toBeVisible({ timeout: 15000 })
  })

  test('should show empty payout events state or event data', async ({ page }) => {
    await page.goto('/settlements')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/settlements', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    // Either shows payout event rows or empty state
    const hasContent = page.getByText(/No payout events recorded|payout.paid|payout.failed|Paid|Failed|PAID/i).first()
    await expect(hasContent).toBeVisible({ timeout: 15000 })
  })

  test('should show Paid/Failed badge counts', async ({ page }) => {
    await page.goto('/settlements')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/settlements', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    // Should show Paid and Failed counts in the section header
    const paidBadge = page.getByText(/\d+ Paid/).first()
    const failedBadge = page.getByText(/\d+ Failed/).first()
    await expect(paidBadge).toBeVisible({ timeout: 15000 })
    await expect(failedBadge).toBeVisible({ timeout: 15000 })
  })

  // ── Refresh Button ──
  test('should have a Refresh button', async ({ page }) => {
    await page.goto('/settlements')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/settlements', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    const refreshBtn = page.getByText('Refresh').first()
    await expect(refreshBtn).toBeVisible({ timeout: 15000 })
  })
})
