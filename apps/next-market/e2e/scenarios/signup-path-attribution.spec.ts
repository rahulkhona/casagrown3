import { test, expect } from '@playwright/test'
import {
  execSql,
  BASE_URL,
  MAILPIT_URL,
} from './scenario-helpers'

const TEST_EMAIL_PREFIX = 'path-test'
const TEST_EMAIL_DOMAIN = 'test.local'

function generateTestEmail(): string {
  return `${TEST_EMAIL_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@${TEST_EMAIL_DOMAIN}`
}

async function getOtpFromMailpit(recipientEmail: string): Promise<string> {
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    try {
      const res = await fetch(
        `${MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(recipientEmail)}&limit=1`
      )
      const data = await res.json()
      const msg = data.messages?.[0]
      if (msg) {
        const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)
        const msgData = await msgRes.json()
        const body = msgData.Text || msgData.HTML || ''
        const match = body.match(/\b(\d{6})\b/)
        if (match) return match[1]
      }
    } catch {}
  }
  return ''
}

test.describe('Signup Path Attribution E2E', () => {
  // Clear auth states before test to run as guest
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Guest user signing up from /join attributes profile.signup_source to /join', async ({ page }) => {
    const email = generateTestEmail()

    // 1. Visit /join page
    await page.goto(`${BASE_URL}/join`)
    await page.waitForTimeout(2000)

    // Verify first-touch landing page is captured in localStorage
    const firstPage = await page.evaluate(() => localStorage.getItem('casagrown_first_page'))
    expect(firstPage).toBe('/join')

    // 2. Complete Step 1 (profile form with all fields)
    await expect(page.locator('#join-name')).toBeVisible({ timeout: 10000 })
    await page.locator('#join-name').fill('Path Test User')
    await page.locator('#join-email').fill(email)
    await page.locator('#join-street').fill('100 Main St')
    await page.locator('#join-city').fill('San Jose')
    await page.locator('#join-state').fill('CA')
    await page.locator('#join-zip').fill('95120')
    
    // Submit Step 1
    await page.locator('form button[type="submit"]').click()

    // 3. Retrieve OTP from Mailpit
    const otp = await getOtpFromMailpit(email)
    expect(otp).not.toBe('')

    // 4. Enter OTP and verify
    await expect(page.locator('#join-otp')).toBeVisible({ timeout: 10000 })
    await page.locator('#join-otp').fill(otp)
    await page.locator('form button[type="submit"]').click()

    // Wait for signup success screen or redirection
    await page.waitForTimeout(3000)

    // 5. Query DB directly to assert profile signup_source matches /join
    let dbSource = ''
    for (let i = 0; i < 10; i++) {
      dbSource = execSql(`SELECT signup_source FROM profiles WHERE email = '${email}'`).trim()
      if (dbSource) break
      await page.waitForTimeout(1000)
    }
    expect(dbSource).toBe('/join')

    // Clean up DB
    execSql(`DELETE FROM point_ledger WHERE user_id IN (SELECT id FROM auth.users WHERE email = '${email}')`)
    execSql(`DELETE FROM profiles WHERE email = '${email}'`)
    execSql(`DELETE FROM auth.users WHERE email = '${email}'`)
  })

  test('Guest user landing on /growbot then signing up from /join attributes signup_source to /growbot', async ({ page }) => {
    const email = generateTestEmail()

    // 1. Visit /growbot page first
    await page.goto(`${BASE_URL}/growbot`)
    await page.waitForTimeout(2000)

    // Verify first-touch landing page is captured in localStorage as /growbot
    const firstPage = await page.evaluate(() => localStorage.getItem('casagrown_first_page'))
    expect(firstPage).toBe('/growbot')

    // 2. Go to /join to register
    await page.goto(`${BASE_URL}/join`)
    await page.waitForTimeout(2000)

    // Verify first-touch landing page is STILL /growbot (first touch preserved!)
    const firstPage2 = await page.evaluate(() => localStorage.getItem('casagrown_first_page'))
    expect(firstPage2).toBe('/growbot')

    // 3. Complete Step 1 (profile form with all fields)
    await expect(page.locator('#join-name')).toBeVisible({ timeout: 10000 })
    await page.locator('#join-name').fill('Path Test User 2')
    await page.locator('#join-email').fill(email)
    await page.locator('#join-street').fill('200 Main St')
    await page.locator('#join-city').fill('San Jose')
    await page.locator('#join-state').fill('CA')
    await page.locator('#join-zip').fill('95120')
    
    // Submit Step 1
    await page.locator('form button[type="submit"]').click()

    // 4. Retrieve OTP from Mailpit
    const otp = await getOtpFromMailpit(email)
    expect(otp).not.toBe('')

    // 5. Enter OTP and verify
    await expect(page.locator('#join-otp')).toBeVisible({ timeout: 10000 })
    await page.locator('#join-otp').fill(otp)
    await page.locator('form button[type="submit"]').click()

    // Wait for signup success screen or redirection
    await page.waitForTimeout(3000)

    // 6. Query DB directly to assert profile signup_source matches /growbot
    let dbSource = ''
    for (let i = 0; i < 10; i++) {
      dbSource = execSql(`SELECT signup_source FROM profiles WHERE email = '${email}'`).trim()
      if (dbSource) break
      await page.waitForTimeout(1000)
    }
    expect(dbSource).toBe('/growbot')

    // Clean up DB
    execSql(`DELETE FROM point_ledger WHERE user_id IN (SELECT id FROM auth.users WHERE email = '${email}')`)
    execSql(`DELETE FROM profiles WHERE email = '${email}'`)
    execSql(`DELETE FROM auth.users WHERE email = '${email}'`)
  })
})
