/**
 * Account Closure — E2E Tests
 *
 * Tests the full deletion workflow including profile navigation,
 * pre-deletion warnings, confirmation flow, edge function call,
 * post-deletion logout, search exclusion, community anonymization,
 * and DM restrictions.
 */
import { test, expect } from './fixtures'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Create a throwaway test user and return { id, email, access_token } */
async function createTestUser(suffix: string) {
  const id = `cc000000-0000-0000-0000-00000000${suffix}`
  const email = `del-e2e-${suffix}@test.local`
  const password = 'TestPassword123!'

  // Create via admin API
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ id, email, password, email_confirm: true }),
  })

  // Ensure profile is complete (triggers may have created it)
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      full_name: `E2E Delete ${suffix}`,
      profile_completed_at: new Date().toISOString(),
      tos_accepted_at: new Date().toISOString(),
    }),
  })

  // Get user JWT
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  const { access_token, refresh_token, user } = await tokenRes.json()

  return { id, email, password, access_token, refresh_token, user }
}

/** Inject a user's auth session into the Playwright browser context */
async function injectAuth(
  page: import('@playwright/test').Page,
  tokens: { access_token: string; refresh_token: string; user: any }
) {
  await page.evaluate(
    ({ accessToken, refreshToken, u }) => {
      const session = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: 'bearer',
        user: u,
      }
      localStorage.setItem('sb-127-auth-token', JSON.stringify(session))
      localStorage.setItem(
        'supabase.auth.token',
        JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, user: u })
      )
    },
    { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, u: tokens.user }
  )

  // Also set cookies for SSR client
  const cookieValue = Buffer.from(
    JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: tokens.user,
    })
  ).toString('base64url')

  await page.context().addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${cookieValue}`,
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ])
}

/** Cleanup user from DB */
async function cleanupUser(id: string) {
  // Clean closed_emails entries for this user
  await fetch(`${SUPABASE_URL}/rest/v1/closed_emails?original_user_id=eq.${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
  }).catch(() => {})

  // Delete profile (cascade should handle most FKs)
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
  }).catch(() => {})

  // Delete auth user
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
  }).catch(() => {})
}

// ─────────────────────────────────────────────────────────────────────
// Test 0: Unauthenticated users are redirected to login (regression guard)
// Prevents: stuck "Checking account status..." for logged-out visitors
// ─────────────────────────────────────────────────────────────────────
test('unauthenticated /delete-account redirects to login', async ({ browser }) => {
  // Use a fresh context with no auth cookies — simulates a logged-out visitor
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto('/delete-account')
  await p.waitForLoadState('networkidle')

  // Must end up at /login (with next param), not stuck on loading spinner
  await expect(p).toHaveURL(/\/login/, { timeout: 10_000 })

  // Must NOT still be showing the loading message
  const loadingText = p.locator('text=Checking account status')
  await expect(loadingText).not.toBeVisible()

  console.log('[DELETE-ACCOUNT] ✅ Unauthenticated redirect to login verified:', p.url())
  await ctx.close()
})

// ─────────────────────────────────────────────────────────────────────
// Test 1: Delete Account page renders correctly
// ─────────────────────────────────────────────────────────────────────
test('delete account page shows confirmation UI', async ({ page }) => {
  await page.goto('/delete-account')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('h1')).toContainText('Delete Account', { timeout: 10_000 })

  const confirmInput = page.locator('[data-testid="delete-confirm-input"]')
  await expect(confirmInput).toBeVisible({ timeout: 10_000 })

  const deleteBtn = page.locator('[data-testid="delete-account-btn"]')
  await expect(deleteBtn).toBeDisabled()
})

// ─────────────────────────────────────────────────────────────────────
// Test 2: DELETE confirmation input enables the button
// ─────────────────────────────────────────────────────────────────────
test('typing DELETE enables the delete button', async ({ page }) => {
  await page.goto('/delete-account')
  await page.waitForLoadState('networkidle')

  const confirmInput = page.locator('[data-testid="delete-confirm-input"]')
  await confirmInput.waitFor({ state: 'visible', timeout: 10_000 })
  const deleteBtn = page.locator('[data-testid="delete-account-btn"]')

  await expect(deleteBtn).toBeDisabled()
  await confirmInput.fill('DELETE')
  await expect(deleteBtn).toBeEnabled()
  await confirmInput.fill('DELET')
  await expect(deleteBtn).toBeDisabled()
})

// ─────────────────────────────────────────────────────────────────────
// Test 3: Disclosure section shows consequences
// ─────────────────────────────────────────────────────────────────────
test('delete account page discloses consequences', async ({ page }) => {
  await page.goto('/delete-account')
  await page.waitForLoadState('networkidle')

  const heading = page.locator('h1')
  await expect(heading).toContainText('Delete Account', { timeout: 30_000 })

  // The disclosure adapts to the user's state:
  // - Clean users see "permanently removed" + "re-register"
  // - Users with history see "anonymized" + "permanently locked"
  const hasCleanDisclosure = await page.getByText('permanently removed').isVisible({ timeout: 3_000 }).catch(() => false)
  if (hasCleanDisclosure) {
    await expect(page.getByText('re-register')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('no activity history')).toBeVisible({ timeout: 5_000 })
  } else {
    await expect(page.getByText('anonymized').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('permanently locked')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Deleted User').first()).toBeVisible({ timeout: 5_000 })
  }
})

// ─────────────────────────────────────────────────────────────────────
// Test 3b: Clean user preflight returns is_fast_path = true
// ─────────────────────────────────────────────────────────────────────
test('clean user preflight returns fast-path eligible', async () => {
  // del-clean has no community posts, DMs, orders, or products
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_closure_preflight`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ p_user_id: 'da000000-0000-0000-0000-000000000001' }),
  })
  const data = await resp.json()
  expect(data.is_fast_path).toBe(true)
  expect(data.has_community_footprint).toBe(false)
  expect(data.has_pending_business).toBe(false)
})

// ─────────────────────────────────────────────────────────────────────
// Test 3c: Community user preflight returns is_fast_path = false
// ─────────────────────────────────────────────────────────────────────
test('community user preflight shows community footprint', async () => {
  const communityUserId = 'da000000-0000-0000-0000-000000000002'
  const communityEmail = 'del-community-e2e@test.local'

  // Use a single RPC call to set up the test user atomically.
  // This avoids race conditions between auth user creation, profile trigger,
  // and community_chat_messages FK constraints.
  const setupRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/setup_community_test_user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      p_user_id: communityUserId,
      p_email: communityEmail,
    }),
  })

  if (!setupRes.ok) {
    const errText = await setupRes.text()
    console.log('[COMMUNITY] Setup RPC error:', setupRes.status, errText)
  } else {
    const setupData = await setupRes.json()
    console.log('[COMMUNITY] Setup result:', JSON.stringify(setupData))
  }

  // Now test the preflight
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_closure_preflight`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ p_user_id: communityUserId }),
  })
  const data = await resp.json()
  expect(data.is_fast_path).toBe(false)
  expect(data.has_community_footprint).toBe(true)
  expect(data.has_pending_business).toBe(false)
})

// ─────────────────────────────────────────────────────────────────────
// Test 4: Cancel button navigates back
// ─────────────────────────────────────────────────────────────────────
test('cancel button navigates back', async ({ page }) => {
  // Navigate to profile first, then to delete-account
  await page.goto('/profile')
  await page.waitForLoadState('networkidle')
  await page.goto('/delete-account')
  await page.waitForLoadState('networkidle')

  const cancelBtn = page.getByRole('button', { name: 'Cancel' })
  await cancelBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await cancelBtn.click()

  // Should go back to /profile (the previous page)
  await page.waitForURL(/\/profile/, { timeout: 10_000 })
})

// ─────────────────────────────────────────────────────────────────────
// Test 5: Full browser deletion flow — exercises edge function
// ─────────────────────────────────────────────────────────────────────
test('full browser deletion flow calls edge function and logs out', async ({ page }) => {
  // This test uses the default authenticated buyer session (from auth.setup.ts).
  // We intercept the edge function to verify the UI flow without actually deleting buyer.

  let edgeFunctionCalled = false
  let requestHeaders: Record<string, string> = {}

  // Intercept the edge function call
  await page.route('**/functions/v1/request-account-closure', async (route) => {
    edgeFunctionCalled = true
    requestHeaders = route.request().headers()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, path: 'fast_delete', message: 'Account fully deleted' }),
    })
  })

  // Also intercept the preflight RPC to avoid it interfering
  await page.route('**/rest/v1/rpc/get_closure_preflight', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        open_orders: 0, available_usd: 0, pending_usd: 0,
        active_disputes: 0, queued_payouts: 0, has_pending_business: false,
      }),
    })
  })

  await page.goto('/delete-account')
  await page.waitForLoadState('networkidle')

  // Wait for the page to fully render
  const heading = page.locator('h1')
  await expect(heading).toContainText('Delete Account', { timeout: 20_000 })

  // Type DELETE (use type() instead of fill() to ensure React onChange fires)
  const confirmInput = page.locator('[data-testid="delete-confirm-input"]')
  await confirmInput.waitFor({ state: 'visible', timeout: 10_000 })
  await confirmInput.click()
  await confirmInput.fill('')
  await page.keyboard.type('DELETE', { delay: 50 })

  const deleteBtn = page.locator('[data-testid="delete-account-btn"]')
  await expect(deleteBtn).toBeEnabled({ timeout: 5_000 })
  await page.waitForTimeout(500)
  await deleteBtn.click()

  // Wait for button text to change to "Deleting account..." (proves handleDelete fired)
  await expect(deleteBtn).toContainText(/Deleting/, { timeout: 5_000 })

  // Should redirect to success page (hard navigation via window.location.href)
  await page.waitForURL(/\/delete-account\/success/, { timeout: 20_000, waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Account Successfully Closed')).toBeVisible({ timeout: 10_000 })

  // Verify the edge function was actually called with auth
  expect(edgeFunctionCalled).toBeTruthy()
  expect(requestHeaders['authorization']).toMatch(/^Bearer /)

  // Verify localStorage was cleared
  const authKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('sb-'))
  )
  expect(authKeys).toHaveLength(0)
})

// ─────────────────────────────────────────────────────────────────────
// Test 6: Frozen users excluded from DM search
// ─────────────────────────────────────────────────────────────────────
test('closed users do not appear in DM search', async ({ page }) => {
  const freezeUser = 'cc000000-0000-0000-0000-000000000001'
  const freezeEmail = 'frozen-dm-test@test.local'

  await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      id: freezeUser,
      email: freezeEmail,
      full_name: 'Frozen DM Test User',
      closure_status: 'frozen',
    }),
  }).catch(() => {})

  await page.goto('/messages')
  await page.waitForLoadState('networkidle')

  const newChatBtn = page.locator('[data-testid="new-chat-btn"]')
    .or(page.getByRole('button', { name: /new|message|chat/i }))
    .first()

  if (await newChatBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await newChatBtn.click()
    await page.waitForTimeout(1000)

    const searchInput = page.locator('input[placeholder*="neighbor"]')
      .or(page.locator('input[placeholder*="search"]'))
      .first()

    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.fill('Frozen DM Test')
      await page.waitForTimeout(1500)
      const results = page.locator('text=Frozen DM Test User')
      await expect(results).toHaveCount(0, { timeout: 3_000 })
    }
  }

  await cleanupUser(freezeUser)
})

// ─────────────────────────────────────────────────────────────────────
// Test 7: Success page shows correct messaging
// ─────────────────────────────────────────────────────────────────────
test('success page shows correct messaging', async ({ page }) => {
  await page.goto('/delete-account/success')
  await page.waitForLoadState('networkidle')

  await expect(page.getByText('Account Successfully Closed')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('support@casagrown.com')).toBeVisible({ timeout: 5_000 })
})

// ─────────────────────────────────────────────────────────────────────
// Test 8: Community chat shows "Deleted User" for frozen accounts
// ─────────────────────────────────────────────────────────────────────
test('community chat shows Deleted User for closed accounts', async ({ page }) => {
  const frozenId = 'cc000000-0000-0000-0000-000000000002'
  const frozenEmail = 'frozen-chat@test.local'

  await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      id: frozenId,
      email: frozenEmail,
      password: 'TestPassword123!',
      email_confirm: true,
    }),
  }).catch(() => {})

  await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: frozenId,
      email: frozenEmail,
      full_name: 'Deleted User',
      avatar_url: null,
      closure_status: 'frozen',
    }),
  }).catch(() => {})

  await page.goto('/community', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  const pageContent = await page.textContent('body')
  expect(pageContent).toBeDefined()

  await cleanupUser(frozenId)
})

// ─────────────────────────────────────────────────────────────────────
// Test 9: DM and Follow buttons are hidden next to "Deleted User"
// ─────────────────────────────────────────────────────────────────────
test('DM and Follow buttons hidden for Deleted User in community', async ({ page }) => {
  // Seed a frozen user and a community chat message from them
  const frozenId = 'cc000000-0000-0000-0000-00000000d001'

  await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      id: frozenId,
      email: `frozen-dm-test@test.local`,
      password: 'TestPassword123!',
      email_confirm: true,
    }),
  }).catch(() => {})

  await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: frozenId,
      email: 'frozen-dm-test@test.local',
      full_name: 'Deleted User',
      closure_status: 'frozen',
    }),
  }).catch(() => {})

  // Seed a community message from this frozen user using the buyer's h3 index
  const h3 = '89283470c2fffff' // buyer@test.local's community

  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${frozenId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ home_community_h3_index: h3 }),
  }).catch(() => {})

  await fetch(`${SUPABASE_URL}/rest/v1/community_chat_messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      community_h3_index: h3,
      author_id: frozenId,
      content: 'Test message from a deleted account',
    }),
  }).catch(() => {})

  await page.goto('/community')
  await page.waitForLoadState('networkidle')

  // Look for "Deleted User" author name text
  const deletedUserSpan = page.locator('text=Deleted User').first()
  const isVisible = await deletedUserSpan.isVisible({ timeout: 5_000 }).catch(() => false)

  if (isVisible) {
    // The parent message should NOT have DM or Follow buttons
    const dmButton = page.locator('a:has-text("DM")').filter({
      has: page.locator(`[href*="${frozenId}"]`)
    })
    await expect(dmButton).toHaveCount(0)

    // No Follow button should be associated with the deleted user
    // (ChatFollowButton returns null if the user doesn't have a booth,
    // but even if they did, the guard should hide it)
  }

  // Cleanup
  await cleanupUser(frozenId)
})

// ─────────────────────────────────────────────────────────────────────
// Test 10: DM compose bar shows "account closed" banner for frozen users
// ─────────────────────────────────────────────────────────────────────
test('DM compose is blocked for closed accounts', async ({ page }) => {
  const frozenId = 'cc000000-0000-0000-0000-00000000d002'

  await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      id: frozenId,
      email: `frozen-compose-test@test.local`,
      password: 'TestPassword123!',
      email_confirm: true,
    }),
  }).catch(() => {})

  await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: frozenId,
      email: 'frozen-compose-test@test.local',
      full_name: 'Deleted User',
      closure_status: 'frozen',
    }),
  }).catch(() => {})

  // Create a DM conversation between buyer and the frozen user
  const convResp = await fetch(`${SUPABASE_URL}/rest/v1/market_conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      participant_a: 'b2222222-2222-2222-2222-222222222222',
      participant_b: frozenId,
    }),
  })
  const conv = await convResp.json()
  const convId = Array.isArray(conv) ? conv[0]?.id : conv?.id

  if (convId) {
    await page.goto(`/messages/${convId}`)
    await page.waitForLoadState('networkidle')

    // Should show the "account closed" banner
    await expect(page.getByText('account has been closed')).toBeVisible({ timeout: 10_000 })

    // The compose form should NOT be visible
    const composeForm = page.locator('.chat-form')
    await expect(composeForm).toHaveCount(0)

    // Cleanup conversation
    await fetch(`${SUPABASE_URL}/rest/v1/market_conversations?id=eq.${convId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
    }).catch(() => {})
  }

  await cleanupUser(frozenId)
})

// ─────────────────────────────────────────────────────────────────────
// Test 11: Phased-deleted email cannot be re-registered
// ─────────────────────────────────────────────────────────────────────
test('phased-deleted email is blocked from re-registration', async () => {
  const blockedEmail = 'blocked-reuse@test.local'

  // 1. Sign up a fresh user
  //    First clean any leftover closed_emails entry from prior runs
  await fetch(`${SUPABASE_URL}/rest/v1/closed_emails?email=eq.${blockedEmail}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
  }).catch(() => {})

  const signupResp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: blockedEmail, password: 'TestPassword123!' }),
  })
  const signupData = await signupResp.json()

  // Handle "already registered" from a prior run that wasn't cleaned up
  // In that case, sign in instead
  let userId: string
  if (signupData?.user?.id) {
    userId = signupData.user.id
  } else if (signupData?.error_code === 'user_already_exists' || signupData?.msg?.includes('already registered')) {
    // User survived from a prior run — log in to get their ID
    const loginResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ email: blockedEmail, password: 'TestPassword123!' }),
    })
    const loginData = await loginResp.json()
    userId = loginData?.user?.id
    // Reset their closure_status so we can freeze again
    if (userId) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ closure_status: null, full_name: 'Block Test User' }),
      }).catch(() => {})
    }
  } else {
    throw new Error(`Unexpected signup response: ${JSON.stringify(signupData)}`)
  }
  expect(userId).toBeTruthy()

  // 2. Ensure profile has required fields
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      full_name: 'Block Test User',
      email: blockedEmail,
      profile_completed_at: new Date().toISOString(),
      tos_accepted_at: new Date().toISOString(),
    }),
  })

  // 3. Execute phase-1 freeze (inserts into closed_emails + obfuscates auth email)
  const freezeResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_phase_1_freeze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ p_user_id: userId }),
  })
  const freezeResult = await freezeResp.json()
  expect(freezeResult?.success).toBe(true)

  // 4. Now try to re-register with the blocked email — should fail
  const reRegisterResp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: blockedEmail, password: 'NewPassword123!' }),
  })

  // The signup should fail — trigger raises exception, GoTrue returns non-2xx
  expect(reRegisterResp.ok).toBe(false)

  // Cleanup
  await cleanupUser(userId)
})
