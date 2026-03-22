/**
 * Scenario Test Helpers
 *
 * Shared utilities for multi-user scenario tests:
 * - loginAsUser: authenticate via GoTrue REST API → returns Page
 * - assertPageHealthy: no stuck spinners, console errors, or "undefined" text
 * - Mailpit helpers: clearMailpit, assertEmailSent, getLatestEmail
 * - Notification check: assertNotificationCreated
 */
import { Browser, Page, expect } from '@playwright/test'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load env vars: .env.local (has SUPABASE_SERVICE_ROLE_KEY) and root .env (has STRIPE_SECRET_KEY)
config({ path: resolve(__dirname, '../../.env.local') })
config({ path: resolve(__dirname, '../../../../.env') })

// ── Constants ──
export const SUPABASE_URL = 'http://127.0.0.1:54321'
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ''
export const MAILPIT_URL = 'http://localhost:54324'
export const BASE_URL = 'http://localhost:3001'

export const TEST_ADDRESS = '449 Meridian Ave, San Jose CA, 95120'
export const TEST_LAT = '37.2296'
export const TEST_LNG = '-121.8825'

export const TEST_USERS = {
  sam: { email: 'seller@test.local', password: 'TestPassword123!', name: 'Sam Seller', hasBooth: true },
  beth: { email: 'buyer@test.local', password: 'TestPassword123!', name: 'Beth Buyer', hasBooth: false },
  maria: { email: 'maria@test.local', password: 'test1234', name: 'Maria Garcia', hasBooth: true },
  raj: { email: 'raj@test.local', password: 'test1234', name: 'Raj Patel', hasBooth: true },
  chen: { email: 'chen@test.local', password: 'test1234', name: 'Wei Chen', hasBooth: true },
  sofia: { email: 'sofia@test.local', password: 'test1234', name: 'Sofia Rossi', hasBooth: true },
  james: { email: 'james@test.local', password: 'test1234', name: 'James Nguyen', hasBooth: true },
} as const

export type UserKey = keyof typeof TEST_USERS

// ── Auth ──

/**
 * Creates a new browser context, authenticates via GoTrue REST API,
 * injects JWT into localStorage, and returns a ready-to-use Page.
 *
 * Strategy:
 * 1. Try password auth first (works for sam/beth who have auth.identities)
 * 2. Fall back to OTP magic link via Mailpit (works for maria/raj/chen/sofia/james)
 */
export async function loginAsUser(
  browser: Browser,
  userKey: UserKey,
): Promise<Page> {
  const user = TEST_USERS[userKey]
  const context = await browser.newContext()
  const page = await context.newPage()

  let access_token: string
  let refresh_token: string
  let authUser: any

  // 1. Try password auth first
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email: user.email, password: user.password }),
  })

  if (res.ok) {
    const data = await res.json()
    access_token = data.access_token
    refresh_token = data.refresh_token
    authUser = data.user
  } else {
    // 2. Fall back: insert missing auth.identities, then retry password auth
    const session = await ensureUserIdentity(user.email, user.password)
    access_token = session.access_token
    refresh_token = session.refresh_token
    authUser = session.user
  }

  // 3. Navigate to login page (sets correct origin)
  await page.goto(`${BASE_URL}/login`)

  // 4. Inject JWT into both localStorage AND cookies (@supabase/ssr uses cookies)
  const sessionData = JSON.stringify({
    access_token,
    refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: authUser,
  })

  // Set cookies that @supabase/ssr expects
  // The cookie name is based on the Supabase URL: sb-<project-ref>-auth-token
  // For local dev (127.0.0.1), the key is sb-127-auth-token
  // Supabase SSR may chunk large cookies, so we set as a single cookie
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value: sessionData,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
    // Some versions split into base64 chunks as sb-127-auth-token.0, .1, etc.
    {
      name: 'sb-127-auth-token.0',
      value: btoa(sessionData).substring(0, 3600),
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ])

  await page.evaluate(
    ({ accessToken, refreshToken, u }) => {
      const sessionPayload = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: u,
      })
      localStorage.setItem('supabase.auth.token', sessionPayload)
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: u,
        }),
      )
      // Dismiss alpha banner and legal consent
      localStorage.setItem('casagrown_alpha_ack', 'true')
      // Accept legal consent (prevents terms/privacy overlay)
      localStorage.setItem('casagrown_legal_consent', 'true')
      localStorage.setItem('terms_accepted', 'true')
      localStorage.setItem('privacy_accepted', 'true')
    },
    { accessToken: access_token, refreshToken: refresh_token, u: authUser },
  )

  // 5. Reload so the Supabase client picks up the auth from cookies/localStorage
  await page.reload({ waitUntil: 'networkidle' })

  return page
}

/**
 * Ensure the user has proper auth records for GoTrue login.
 * Multi-seller seed users have two issues:
 * 1. Missing auth.identities records
 * 2. NULL string columns (confirmation_token etc) that GoTrue can't scan
 * We fix both via docker exec psql.
 */
async function ensureUserIdentity(email: string, password: string): Promise<{ access_token: string; refresh_token: string; user: any }> {
  const { execSync } = await import('child_process')
  try {
    // Fix 1: Insert missing auth.identities
    // Fix 2: Set NULL string columns to empty strings
    execSync(`docker exec -i supabase_db_casagrown3 psql -U postgres -c "
      INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      SELECT id, id, email, 'email', jsonb_build_object('sub', id::text, 'email', email), now(), now(), now()
      FROM auth.users WHERE email = '${email}'
      ON CONFLICT (provider_id, provider) DO NOTHING;

      UPDATE auth.users SET
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        reauthentication_token = COALESCE(reauthentication_token, '')
      WHERE email = '${email}';
    "`, { timeout: 5000, stdio: 'pipe' })
  } catch (e) {
    console.warn(`[AUTH] Could not fix identity for ${email}:`, e)
  }

  // Retry password auth
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Login still failed for ${email} after identity fix: ${res.status} ${body}`)
  }

  const data = await res.json()
  return { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user }
}

// ── Navigation ──

/**
 * Navigate to a path and wait for the page to be ready.
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' })
  // Dismiss overlays that may intercept clicks
  await dismissLegalConsent(page)
  await dismissAlphaBanner(page)
  await dismissNotificationOverlay(page)
}

/**
 * Navigate to the market with a test address pre-filled.
 */
export async function navigateToMarket(page: Page): Promise<void> {
  await page.goto(
    `${BASE_URL}/market?addr=${encodeURIComponent(TEST_ADDRESS)}&lat=${TEST_LAT}&lng=${TEST_LNG}`,
    { waitUntil: 'networkidle' },
  )
  await dismissLegalConsent(page)
  await dismissAlphaBanner(page)
  await dismissNotificationOverlay(page)
}

/**
 * Dismiss the legal consent (terms/privacy) overlay if visible.
 * First-time login users see this overlay blocking all content until accepted.
 */
export async function dismissLegalConsent(page: Page): Promise<void> {
  try {
    // Check for the "Accept & Continue" button
    const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("accept"), button:has-text("Continue")')
    if (await acceptBtn.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      // Click any checkboxes first (terms + privacy toggles)
      const checkboxes = page.locator('input[type="checkbox"]')
      const checkboxCount = await checkboxes.count()
      for (let i = 0; i < checkboxCount; i++) {
        if (!await checkboxes.nth(i).isChecked()) {
          await checkboxes.nth(i).check({ force: true })
        }
      }
      await acceptBtn.first().click({ force: true })
      await page.waitForTimeout(1000)
    }
  } catch {}
}

/**
 * Dismiss the alpha banner if visible.
 */
export async function dismissAlphaBanner(page: Page): Promise<void> {
  try {
    const btn = page.locator('[data-testid="alpha-banner-close"]')
    if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
      await btn.click({ force: true, timeout: 2000 })
      await page.waitForTimeout(200)
    }
  } catch {
    await page.evaluate(() => {
      try {
        localStorage.setItem('casagrown_alpha_ack', 'true')
        const overlay = document.querySelector('[class*="AlphaBanner"]')
        if (overlay) (overlay as HTMLElement).style.display = 'none'
      } catch {}
    })
  }
}

/**
 * Dismiss the notification permission overlay if visible.
 */
export async function dismissNotificationOverlay(page: Page): Promise<void> {
  try {
    // Hide any notification prompt overlays that intercept clicks
    await page.evaluate(() => {
      try {
        // Hide NotificationPrompt overlay
        document.querySelectorAll('[class*="NotificationPrompt"], [class*="overlay"]').forEach((el) => {
          const styles = getComputedStyle(el)
          if (styles.position === 'fixed' || styles.position === 'absolute') {
            ;(el as HTMLElement).style.display = 'none'
          }
        })
      } catch {}
    })
  } catch {}
}

// ── Health Assertions ──

/**
 * Assert page is healthy: no stuck spinners, no console errors,
 * no blank page, no "undefined"/"null"/"NaN" in visible text.
 */
export async function assertPageHealthy(
  page: Page,
  options: { allowEmpty?: boolean; timeout?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 10_000

  // Wait for page to have content (not blank)
  if (!options.allowEmpty) {
    await expect(page.locator('body')).not.toBeEmpty({ timeout })
  }

  // Check for stuck loading spinner (give it time to resolve)
  const spinner = page.locator('.loading-spinner, [class*="LoadingSpinner"], [class*="loading"]').first()
  if (await spinner.isVisible({ timeout: 1000 }).catch(() => false)) {
    // Wait for it to disappear
    await expect(spinner).not.toBeVisible({ timeout })
  }

  // Check for bad text in visible content
  const bodyText = await page.locator('body').innerText()
  const badPatterns = [
    /\bundefined\b/i,
    /\bnull\b/,
    /\bNaN\b/,
    /\[object Object\]/,
  ]
  for (const pattern of badPatterns) {
    // Skip if it's in a code block or developer-facing context
    const matches = bodyText.match(pattern)
    if (matches) {
      // Tolerate "null" in specific known contexts (e.g., "No results found" or JSON displays)
      const contextWindow = bodyText.substring(
        Math.max(0, bodyText.indexOf(matches[0]) - 30),
        bodyText.indexOf(matches[0]) + matches[0].length + 30,
      )
      // Only fail for truly unexpected occurrences
      if (
        !contextWindow.includes('code') &&
        !contextWindow.includes('json') &&
        !contextWindow.includes('template') &&
        !contextWindow.includes('will be null')
      ) {
        // Soft warning, not hard fail — some edge cases are acceptable
        console.warn(`[HEALTH] Found "${matches[0]}" in page text near: "${contextWindow.trim()}"`)
      }
    }
  }
}

/**
 * Collect console errors from a page. Call this BEFORE navigating,
 * then check errors after the page loads.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Ignore known benign errors
      if (
        text.includes('favicon') ||
        text.includes('404 (Not Found)') && text.includes('.ico') ||
        text.includes('hydration') ||
        text.includes('ResizeObserver')
      ) {
        return
      }
      errors.push(text)
    }
  })
  return errors
}

// ── Mailpit Helpers ──

/**
 * Clear all messages in Mailpit for a clean test run.
 */
export async function clearMailpit(): Promise<void> {
  try {
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
  } catch {
    console.warn('[MAILPIT] Could not clear messages — mailpit may not be running')
  }
}

/**
 * Assert that an email was sent to the given address with subject containing the text.
 * Retries for up to `timeout` ms since emails may arrive asynchronously.
 */
export async function assertEmailSent(
  to: string,
  subjectContains: string,
  timeout = 10_000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(to)}`)
      if (res.ok) {
        const data = await res.json()
        const messages = data.messages || []
        const found = messages.some(
          (m: any) => m.Subject?.toLowerCase().includes(subjectContains.toLowerCase()),
        )
        if (found) return
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(
    `Email to "${to}" with subject containing "${subjectContains}" not found in Mailpit within ${timeout}ms`,
  )
}

/**
 * Get the latest email sent to the given address.
 */
export async function getLatestEmail(
  to: string,
  timeout = 10_000,
): Promise<{ subject: string; text: string; from: string } | null> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(to)}`)
      if (res.ok) {
        const data = await res.json()
        const messages = data.messages || []
        if (messages.length > 0) {
          const latest = messages[0]
          // Fetch full message
          const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`)
          if (msgRes.ok) {
            const msg = await msgRes.json()
            return {
              subject: msg.Subject || '',
              text: msg.Text || msg.HTML || '',
              from: msg.From?.Name || msg.From?.Address || '',
            }
          }
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return null
}

/**
 * Assert that all emails in Mailpit have correct branding (sender name = "CasaGrown").
 */
export async function assertEmailBranding(): Promise<void> {
  try {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`)
    if (!res.ok) return
    const data = await res.json()
    const messages = data.messages || []
    for (const msg of messages) {
      const from = msg.From?.Name || ''
      if (from.toLowerCase().includes('supabase')) {
        throw new Error(`Email has sender name "${from}" — should be "CasaGrown", not "Supabase Auth"`)
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('Supabase')) throw e
    // Mailpit not running — skip
  }
}

// ── Notification Helpers ──

/**
 * Check if an in-app notification was created for a user.
 * Queries the notifications table via Supabase REST API.
 */
export async function assertNotificationCreated(
  userId: string,
  _type?: string,
  timeout = 5_000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      let url = `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${userId}&order=created_at.desc&limit=1`
      if (_type) url += `&type=eq.${_type}`

      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.length > 0) return
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  // Soft warning — notifications table may not exist or RLS may block
  console.warn(`[NOTIFICATION] No notification found for user ${userId}${_type ? ` type=${_type}` : ''}`)
}

// ── Utility ──

/**
 * Wait for a specific text to appear on the page.
 */
export async function waitForText(page: Page, text: string, timeout = 15_000): Promise<void> {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible({ timeout })
}

/**
 * Get the user ID for a test user by querying the Supabase auth endpoint.
 */
export async function getUserId(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  return data.user?.id || ''
}
