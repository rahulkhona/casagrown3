import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  preAuthAllUsers,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe.serial.skip('Phone & SMS Notifications UI (Feature Flagged)', () => {
  let tokens: Record<string, string> = {}
  const uniquePhoneNumber = '555100' + Math.floor(1000 + Math.random() * 9000).toString()
  
  test.beforeAll(async () => {
    tokens = await preAuthAllUsers()
  })

  test('P1 — Phone verification UI flow renders', async ({ browser }) => {
    const bethPage = await loginAsUser(browser, 'beth')
    await navigateTo(bethPage, '/profile')
    await assertPageHealthy(bethPage)

    // Expect the Phone Number section to exist
    await expect(bethPage.locator('h3:has-text("Phone & Notifications")')).toBeVisible()

    // Find the phone input
    const phoneInput = bethPage.locator('input[placeholder="(555) 000-0000"]')
    await expect(phoneInput).toBeVisible()

    // Type a dynamically generated number to avoid seed collisions
    await phoneInput.fill(uniquePhoneNumber)

    // Wait for the UI layout effect to kick in
    await bethPage.waitForTimeout(500)

    // Ensure the checkbox is visible immediately (New UX change)
    const smsCheckbox = bethPage.locator('input#smsEnabled')
    await expect(smsCheckbox).toBeVisible()

    // Depending on Beth's DB seed, ensure we check it to receive SMS
    if (!(await smsCheckbox.isChecked())) {
        await smsCheckbox.check({ force: true })
    }

    // ── Simulate Twilio Mock Verification Flow ──
    const verifyBtn = bethPage.locator('button:has-text("Verify")')
    await expect(verifyBtn).toBeVisible()
    await verifyBtn.click()

    const codeInput = bethPage.locator('input[placeholder="123456"]')
    try {
        await expect(codeInput).toBeVisible({ timeout: 10000 }) // increased timeout
    } catch (e) {
        // Log the text content of the entire Phone section
        const phoneSection = bethPage.locator('h3:has-text("Phone & Notifications")').locator('xpath=..')
        console.error('Code Input Not Visible. Phone Section Text:', await phoneSection.innerText())
        await bethPage.screenshot({ path: 'fail-p1.png' })
        throw e
    }
    await codeInput.fill('123456')

    const confirmBtn = bethPage.locator('button:has-text("Confirm")')
    await confirmBtn.click()

    await expect(bethPage.locator('text=✓ Verified')).toBeVisible({ timeout: 15000 })

    // Clear street to bypass Nominatim hanging during E2E tests
    await bethPage.locator('input#street').fill('')

    // Check that we can verify the phone number
    await expect(bethPage.locator('text=✓ Verified')).toBeVisible({ timeout: 15000 })

    await bethPage.context().close()
  })

  test('P2 — Twilio Webhook handles Carrier Block (STOP)', async ({ browser, request }) => {
    const bethPage = await loginAsUser(browser, 'beth')

    // Fire the Webhook as if Twilio intercepted "STOP"
    const params = new URLSearchParams()
    params.set("From", `+1${uniquePhoneNumber}`)
    params.set("Body", "STOP")

    const res = await request.post('http://127.0.0.1:54321/functions/v1/twilio-inbound?secret=dev-secret-xyz', {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: params.toString()
    })
    expect(res.ok()).toBeTruthy()

    // Edge function inserts notification and updates profile -> give it a brief moment
    await bethPage.waitForTimeout(500)

    // Navigate to profile
    await navigateTo(bethPage, '/profile')
    await assertPageHealthy(bethPage)

    // Ensure SMS is enabled in local state so the banner shows
    const smsCheckbox = bethPage.locator('input#smsEnabled')
    await expect(smsCheckbox).toBeVisible()
    if (!(await smsCheckbox.isChecked())) {
        await smsCheckbox.check({ force: true })
    }

    // Ensure the warning appears!
    await expect(bethPage.locator('text=Carrier Block Detected')).toBeVisible()
    await expect(bethPage.locator('text=You previously replied STOP')).toBeVisible()

    // Fire START back
    const startParams = new URLSearchParams()
    startParams.set("From", `+1${uniquePhoneNumber}`)
    startParams.set("Body", "START")
    await request.post('http://127.0.0.1:54321/functions/v1/twilio-inbound?secret=dev-secret-xyz', {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: startParams.toString()
    })

    // Refresh and ensure it disappeared
    await bethPage.reload()
    await expect(bethPage.locator('text=Carrier Block Detected')).not.toBeVisible()

    await bethPage.context().close()
  })
})
