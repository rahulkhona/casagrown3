import { test, expect, Page } from '@playwright/test'

/**
 * E2E tests for the Disputes page in admin dashboard.
 * Seeds dispute data via simulated Stripe webhook callbacks, then
 * verifies the admin UI renders correctly.
 *
 * Run: cd apps/next-admin && npx playwright test e2e/disputes.spec.ts
 */

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ADMIN_EMAIL = 'seller@test.local'
const ADMIN_PASSWORD = 'TestPassword123!'

/** Simulate a Stripe webhook callback to seed dispute data */
async function simulateWebhook(eventType: string, disputeObj: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'stripe-signature': 'test_bypass',
    },
    body: JSON.stringify({
      id: `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: eventType,
      data: { object: disputeObj },
    }),
  })
  return { status: res.status, data: await res.json() }
}

/** Seed a test dispute directly via REST (faster fallback if webhook isn't running) */
async function seedTestDispute(overrides: Record<string, unknown> = {}) {
  const ts = Date.now()
  const defaults = {
    stripe_dispute_id: `dp_e2e_${ts}`,
    amount_usd: 42.50,
    status: 'needs_response',
    reason: 'fraudulent',
    evidence_due_by: new Date(Date.now() + 5 * 86400_000).toISOString(),
    market_date: new Date().toISOString().split('T')[0],
  }
  const body = { ...defaults, ...overrides }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stripe_disputes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

async function loginAsAdmin(page: Page) {
  let access_token: string
  let refresh_token: string
  let authUser: any

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

  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30_000 })

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

  try {
    await page.reload({ waitUntil: 'networkidle', timeout: 15_000 })
  } catch {
    await page.waitForTimeout(2000)
  }
}

test.describe('Disputes Page', () => {
  // ── Data Seeding via Webhook Simulation ──
  test.beforeAll(async () => {
    // Try to seed dispute via simulated webhook callback
    const webhookResult = await simulateWebhook('charge.dispute.created', {
      id: `dp_e2e_seed_${Date.now()}`,
      charge: `ch_e2e_${Date.now()}`,
      payment_intent: `pi_e2e_${Date.now()}`,
      amount: 4250,
      reason: 'fraudulent',
      evidence_details: { due_by: Math.floor(Date.now() / 1000) + 5 * 86400 },
    })

    // Fallback: seed directly if webhook isn't running
    if (webhookResult.status !== 200) {
      await seedTestDispute()
    }
  })

  // ── Page Load ──
  test('should load disputes page without critical errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/disputes')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/disputes', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
      && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
    )
    expect(criticalErrors).toEqual([])
  })

  // ── Heading ──
  test('should display Chargeback Disputes heading', async ({ page }) => {
    await page.goto('/disputes')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/disputes', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    const heading = page.getByText(/Chargeback Disputes/i).first()
    await expect(heading).toBeVisible({ timeout: 15000 })
  })

  // ── Seeded Data Visible ──
  test('should display seeded dispute data in the table', async ({ page }) => {
    await page.goto('/disputes')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/disputes', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    // The seeded dispute should appear — look for status badge or amount
    const disputeRow = page.getByText(/NEEDS RESPONSE|fraudulent|\$42\.50/i).first()
    await expect(disputeRow).toBeVisible({ timeout: 15000 })
  })

  // ── Filter Tabs ──
  test('should display filter tabs with counts', async ({ page }) => {
    await page.goto('/disputes')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/disputes', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    const allTab = page.getByText(/All \(/i).first()
    await expect(allTab).toBeVisible({ timeout: 15000 })
  })

  // ── Stats Cards ──
  test('should display stats cards reflecting seeded data', async ({ page }) => {
    await page.goto('/disputes')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/disputes', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    const needsResponse = page.getByText('Needs Response').first()
    await expect(needsResponse).toBeVisible({ timeout: 15000 })
  })

  // ── Refresh Button ──
  test('should have a Refresh button', async ({ page }) => {
    await page.goto('/disputes')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/disputes', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    const refreshBtn = page.getByText('Refresh').first()
    await expect(refreshBtn).toBeVisible({ timeout: 15000 })
  })

  // ── Sidebar Navigation ──
  test('should have Disputes link in sidebar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await loginAsAdmin(page)
      await page.goto('/', { waitUntil: 'networkidle', timeout: 30_000 })
    }

    const disputesLink = page.getByText('Disputes').first()
    await expect(disputesLink).toBeVisible({ timeout: 15000 })
  })
})
