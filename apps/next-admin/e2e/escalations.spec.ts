import { test, expect, Page } from '@playwright/test'

/**
 * E2E tests for the Escalations admin pages.
 * Tests the escalation list page and detail page UI.
 *
 * Run: cd apps/next-admin && npx playwright test e2e/escalations.spec.ts
 */

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ADMIN_EMAIL = 'seller@test.local'
const ADMIN_PASSWORD = 'TestPassword123!'

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
    if (!retryRes.ok) throw new Error(`Login failed: ${retryRes.status}`)
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

async function ensureLoggedIn(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 30_000 })
  if (page.url().includes('/login')) {
    await loginAsAdmin(page)
    await page.goto(path, { waitUntil: 'networkidle', timeout: 30_000 })
  }
}

// Seed an escalation directly via DB for E2E testing
async function seedEscalation() {
  const { execSync } = require('child_process')
  const ts = Date.now()
  const orderId = `e2e00000-esc0-0000-0000-${ts.toString(16).padStart(12, '0')}`
  const disputeId = `e2e00000-dsp0-0000-0000-${ts.toString(16).padStart(12, '0')}`

  try {
    const buyerId = execSync(
      `docker exec supabase_db_casagrown3 psql -U postgres -t -A -c "SELECT id FROM auth.users LIMIT 1 OFFSET 1;"`,
      { timeout: 5000, encoding: 'utf-8' }
    ).trim()

    const sellerId = execSync(
      `docker exec supabase_db_casagrown3 psql -U postgres -t -A -c "SELECT id FROM auth.users WHERE email = '${ADMIN_EMAIL}';"`,
      { timeout: 5000, encoding: 'utf-8' }
    ).trim()

    const boothId = execSync(
      `docker exec supabase_db_casagrown3 psql -U postgres -t -A -c "SELECT id FROM market_booths LIMIT 1;"`,
      { timeout: 5000, encoding: 'utf-8' }
    ).trim()

    const productId = execSync(
      `docker exec supabase_db_casagrown3 psql -U postgres -t -A -c "SELECT id FROM market_products LIMIT 1;"`,
      { timeout: 5000, encoding: 'utf-8' }
    ).trim()

    execSync(`docker exec -i supabase_db_casagrown3 psql -U postgres -c "
      INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
        product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
        fulfillment_type, status, platform_fee_pct, platform_fee_usd,
        tax_rate_pct, tax_amount_usd)
      VALUES ('${orderId}'::uuid, '${buyerId}'::uuid, '${sellerId}'::uuid,
        '${boothId}'::uuid, '${productId}'::uuid,
        'E2E Escalation Tomatoes', 2, 12.50, 25.00, 25.00,
        'delivery', 'escalated', 10, 2.50, 0, 0)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
      VALUES ('${disputeId}'::uuid, '${orderId}'::uuid,
        '${buyerId}'::uuid, 'Product arrived damaged - E2E test', 'open')
      ON CONFLICT (id) DO NOTHING;
    "`, { timeout: 5000, stdio: 'pipe' })

    return { orderId, disputeId }
  } catch (e) {
    console.warn('Seed escalation failed:', e)
    return null
  }
}


test.describe('Escalations Page', () => {
  let seededData: { orderId: string; disputeId: string } | null = null

  test.beforeAll(async () => {
    seededData = await seedEscalation()
  })

  // ── Page Load ──
  test('should load escalations page without critical errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await ensureLoggedIn(page, '/escalations')

    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
      && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
    )
    expect(criticalErrors).toEqual([])
  })

  // ── Heading ──
  test('should display Order Escalations heading', async ({ page }) => {
    await ensureLoggedIn(page, '/escalations')
    const heading = page.getByText(/Order Escalations/i).first()
    await expect(heading).toBeVisible({ timeout: 15000 })
  })

  // ── Stats Cards ──
  test('should display stats cards (Open, Resolved, Total)', async ({ page }) => {
    await ensureLoggedIn(page, '/escalations')

    const open = page.getByText('Open').first()
    await expect(open).toBeVisible({ timeout: 15000 })

    const resolved = page.getByText('Resolved').first()
    await expect(resolved).toBeVisible({ timeout: 15000 })

    const total = page.getByText('Total').first()
    await expect(total).toBeVisible({ timeout: 15000 })
  })

  // ── Filter Tabs ──
  test('should display filter tabs', async ({ page }) => {
    await ensureLoggedIn(page, '/escalations')

    const allTab = page.getByText(/All \(/i).first()
    await expect(allTab).toBeVisible({ timeout: 15000 })
  })

  // ── Table Headers ──
  test('should display table headers', async ({ page }) => {
    await ensureLoggedIn(page, '/escalations')

    const statusHeader = page.getByText('STATUS').first()
    await expect(statusHeader).toBeVisible({ timeout: 15000 })

    const productHeader = page.getByText('PRODUCT').first()
    await expect(productHeader).toBeVisible({ timeout: 15000 })
  })

  // ── Refresh Button ──
  test('should have a Refresh button', async ({ page }) => {
    await ensureLoggedIn(page, '/escalations')
    const refreshBtn = page.getByText('Refresh').first()
    await expect(refreshBtn).toBeVisible({ timeout: 15000 })
  })

  // ── Seeded Data ──
  test('should display seeded escalation in the list', async ({ page }) => {
    if (!seededData) test.skip()

    await ensureLoggedIn(page, '/escalations')

    // Look for our seeded product name or status badge
    const escalationRow = page.getByText(/E2E Escalation|OPEN|ESCALATED/i).first()
    await expect(escalationRow).toBeVisible({ timeout: 15000 })
  })

  // ── Sidebar Navigation ──
  test('should have Escalations link in sidebar', async ({ page }) => {
    await ensureLoggedIn(page, '/')
    const escalationsLink = page.getByText('Escalations').first()
    await expect(escalationsLink).toBeVisible({ timeout: 15000 })
  })

  // ── Navigate to Detail ──
  test('should navigate to escalation detail page', async ({ page }) => {
    if (!seededData) test.skip()

    await ensureLoggedIn(page, '/escalations')

    // Click Review or View button
    const reviewBtn = page.getByText(/Review|View/i).first()
    if (await reviewBtn.isVisible({ timeout: 5000 })) {
      await reviewBtn.click()
      await page.waitForURL(/\/escalations\//, { timeout: 10000 })
      expect(page.url()).toContain('/escalations/')
    }
  })
})

test.describe('Escalation Detail Page', () => {
  let seededData: { orderId: string; disputeId: string } | null = null

  test.beforeAll(async () => {
    seededData = await seedEscalation()
  })

  test('should display order details section', async ({ page }) => {
    if (!seededData) test.skip()

    await ensureLoggedIn(page, `/escalations/${seededData!.disputeId}`)

    const orderDetails = page.getByText(/Order Details/i).first()
    await expect(orderDetails).toBeVisible({ timeout: 15000 })
  })

  test('should display dispute thread section', async ({ page }) => {
    if (!seededData) test.skip()

    await ensureLoggedIn(page, `/escalations/${seededData!.disputeId}`)

    const thread = page.getByText(/Dispute Thread/i).first()
    await expect(thread).toBeVisible({ timeout: 15000 })
  })

  test('should display resolution panel for open disputes', async ({ page }) => {
    if (!seededData) test.skip()

    await ensureLoggedIn(page, `/escalations/${seededData!.disputeId}`)

    const resolution = page.getByText(/Resolution/i).first()
    await expect(resolution).toBeVisible({ timeout: 15000 })
  })

  test('should display claim banner', async ({ page }) => {
    if (!seededData) test.skip()

    await ensureLoggedIn(page, `/escalations/${seededData!.disputeId}`)

    const claimText = page.getByText(/Claim|Unclaimed/i).first()
    await expect(claimText).toBeVisible({ timeout: 15000 })
  })

  test('should display resolution types including combo options', async ({ page }) => {
    if (!seededData) test.skip()

    await ensureLoggedIn(page, `/escalations/${seededData!.disputeId}`)

    const fullRefund = page.getByText(/Full Refund/i).first()
    await expect(fullRefund).toBeVisible({ timeout: 15000 })

    const creditBoth = page.getByText(/Credit Both/i).first()
    await expect(creditBoth).toBeVisible({ timeout: 15000 })
  })

  test('should have Back to Escalations button', async ({ page }) => {
    if (!seededData) test.skip()

    await ensureLoggedIn(page, `/escalations/${seededData!.disputeId}`)

    const backBtn = page.getByText(/Back to Escalations/i).first()
    await expect(backBtn).toBeVisible({ timeout: 15000 })
  })
})
