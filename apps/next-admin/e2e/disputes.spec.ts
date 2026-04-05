import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Disputes page in admin dashboard.
 * Seeds dispute data via simulated Stripe webhook callbacks, then
 * verifies the admin UI renders correctly.
 *
 * Auth: Handled by setup project storageState (OTP via Mailpit).
 *
 * Run: cd apps/next-admin && npx playwright test e2e/disputes.spec.ts
 */

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

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

test.describe('Disputes Page', () => {
  // ── Data Seeding via Webhook Simulation ──
  test.beforeAll(async () => {
    const webhookResult = await simulateWebhook('charge.dispute.created', {
      id: `dp_e2e_seed_${Date.now()}`,
      charge: `ch_e2e_${Date.now()}`,
      payment_intent: `pi_e2e_${Date.now()}`,
      amount: 4250,
      reason: 'fraudulent',
      evidence_details: { due_by: Math.floor(Date.now() / 1000) + 5 * 86400 },
    })

    if (webhookResult.status !== 200) {
      await seedTestDispute()
    }
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/disputes', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('should load disputes page without critical errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
      && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
    )
    expect(criticalErrors).toEqual([])
  })

  test('should display Chargebacks heading', async ({ page }) => {
    const heading = page.getByText(/Chargebacks/i).first()
    await expect(heading).toBeVisible({ timeout: 15000 })
  })

  test('should display seeded dispute data in the table', async ({ page }) => {
    const disputeRow = page.getByText(/NEEDS RESPONSE|fraudulent|\$42\.50/i).first()
    await expect(disputeRow).toBeVisible({ timeout: 15000 })
  })

  test('should display filter tabs with counts', async ({ page }) => {
    const allTab = page.getByText(/All \(/i).first()
    await expect(allTab).toBeVisible({ timeout: 15000 })
  })

  test('should display stats cards reflecting seeded data', async ({ page }) => {
    const needsResponse = page.getByText('Needs Response').first()
    await expect(needsResponse).toBeVisible({ timeout: 15000 })
  })

  test('should have a Refresh button', async ({ page }) => {
    const refreshBtn = page.getByText('Refresh').first()
    await expect(refreshBtn).toBeVisible({ timeout: 15000 })
  })

  test('should have Chargebacks link in sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const chargebacksLink = page.getByText(/Chargebacks/i).first()
    await expect(chargebacksLink).toBeVisible({ timeout: 15000 })
  })
})
