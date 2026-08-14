/**
 * Admin Auth Setup — runs once before all admin E2E tests.
 *
 * Flow:
 *   1. Request OTP via GoTrue `/auth/v1/otp`
 *   2. Mailpit (port 54324) captures the email
 *   3. Extract 6-digit code from Mailpit API
 *   4. Verify OTP via `/auth/v1/verify`
 *   5. Inject session into cookies + localStorage
 *   6. Save storage state for reuse by all test specs
 */
import { test as setup } from '@playwright/test'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const MAILPIT_URL = 'http://127.0.0.1:54324'
const ADMIN_EMAIL = 'seller@test.local'
const AUTH_FILE = 'e2e/.auth/admin.json'
const COOKIE_KEY = 'sb-127-auth-token'

/** Clear all messages in Mailpit so we get a clean slate */
async function clearMailpit() {
  try {
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
  } catch {
    // Mailpit may not support DELETE — just continue
  }
}

/** Extract 6-digit OTP code from Mailpit for the given email */
async function getOtpFromMailpit(email: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`)
    const data = await listRes.json()
    const messages = data.messages || []

    // Find the latest message sent to this email
    const msg = messages.find(
      (m: any) => m.To?.some((to: any) => to.Address === email),
    )

    if (msg) {
      // Try to extract 6-digit OTP from Snippet
      const otpMatch = msg.Snippet?.match(/\b(\d{6})\b/)
      if (otpMatch) return otpMatch[1]

      // Fallback: fetch full message body
      const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)
      const fullMsg = await msgRes.json()
      const bodyMatch = (fullMsg.Text || fullMsg.HTML || '').match(/\b(\d{6})\b/)
      if (bodyMatch) return bodyMatch[1]
    }

    await new Promise(r => setTimeout(r, 500))
  }

  throw new Error(`No OTP found in Mailpit for ${email} after ${timeoutMs}ms`)
}

setup('authenticate as admin', async ({ page }) => {
  setup.setTimeout(120_000)

  // 1. Clear Mailpit
  await clearMailpit()

  // 2. Request OTP
  const otpRes = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email: ADMIN_EMAIL }),
  })

  if (!otpRes.ok) {
    throw new Error(`OTP request failed: ${otpRes.status} ${await otpRes.text()}`)
  }

  // 3. Get OTP from Mailpit
  const otp = await getOtpFromMailpit(ADMIN_EMAIL)
  console.log(`[AUTH] Got OTP for ${ADMIN_EMAIL}: ${otp}`)

  // 4. Verify OTP to get session
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      type: 'email',
      token: otp,
      email: ADMIN_EMAIL,
    }),
  })

  if (!verifyRes.ok) {
    throw new Error(`OTP verify failed: ${verifyRes.status} ${await verifyRes.text()}`)
  }

  const session = await verifyRes.json()

  if (!session.access_token) {
    throw new Error(`No access_token in verify response: ${JSON.stringify(session).substring(0, 200)}`)
  }

  // 5. Navigate to login page to set origin
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForTimeout(2000)

  // 6. Inject session into cookies + localStorage
  await page.evaluate(
    ({ cookieKey, accessToken, refreshToken, user }) => {
      const sessionPayload = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      })

      // Cookie for @supabase/ssr
      document.cookie = `${cookieKey}=${encodeURIComponent(sessionPayload)}; path=/; max-age=34560000; samesite=lax`

      // localStorage keys for all Supabase client variants
      const keys = [
        'sb-127.0.0.1-auth-token',
        'sb-127-auth-token',
        'sb-localhost-auth-token',
        'supabase.auth.token',
      ]
      for (const key of keys) {
        localStorage.setItem(key, sessionPayload)
      }

      // Dismiss UI overlays
      localStorage.setItem('casagrown_alpha_ack', 'true')
      localStorage.setItem('casagrown_tutorial_done', new Date().toISOString())
      localStorage.setItem('rating_skip_until', new Date(Date.now() + 365 * 86400000).toISOString())
    },
    {
      cookieKey: COOKIE_KEY,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      user: session.user,
    },
  )

  // 7. Reload to pick up session
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForTimeout(3000)

  // 8. Save storage state
  await page.context().storageState({ path: AUTH_FILE })
})
