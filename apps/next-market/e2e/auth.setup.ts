/**
 * Auth setup for Market Playwright tests.
 *
 * Uses Supabase GoTrue REST API to get a JWT, then injects it into
 * the browser's localStorage AND cookies so tests can run as an authenticated user.
 *
 * The @supabase/ssr createBrowserClient reads session from cookies by default,
 * so we must set cookies in addition to localStorage.
 */
import { test as setup, expect } from '@playwright/test'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// Use the seeded buyer user (from seed.sql — passwords hashed with bcrypt 'TestPassword123!')
const TEST_EMAIL = 'buyer@test.local'
const TEST_PASSWORD = 'TestPassword123!'

const authFile = 'e2e/.auth/user.json'

setup('authenticate market user', async ({ page }) => {
  // 1. Get JWT from Supabase GoTrue API
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    }
  )

  expect(res.ok).toBeTruthy()
  const data = await res.json()
  const { access_token, refresh_token, user } = data

  // 2. Navigate to market login page first (sets correct origin)
  await page.goto('/login')

  // 3. Inject JWT into localStorage (legacy keys)
  await page.evaluate(
    ({ accessToken, refreshToken, user: u }) => {
      const sessionPayload = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: u,
      })
      // Standard Supabase auth keys
      localStorage.setItem('supabase.auth.token', sessionPayload)
      // Variant key used by @supabase/ssr
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: u,
        })
      )
    },
    { accessToken: access_token, refreshToken: refresh_token, user }
  )

  // 4. Set cookies for @supabase/ssr createBrowserClient
  // The SSR client uses cookies with base64url encoding by default.
  // Cookie name defaults to STORAGE_KEY = 'supabase.auth.token'
  const sessionForCookie = {
    access_token,
    refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  }
  const cookieValue = Buffer.from(JSON.stringify(sessionForCookie)).toString('base64url')

  await page.context().addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${cookieValue}`,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
    {
      name: 'supabase.auth.token',
      value: `base64-${cookieValue}`,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ])

  // 5. Save browser storage state (includes both localStorage and cookies)
  await page.context().storageState({ path: authFile })
})

