import { test, expect } from '../fixtures'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './scenario-helpers'

const BASE_URL = 'http://localhost:3001'
const API_HEADERS = {
  'apikey': SUPABASE_SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

/** Poll user_analytics for a page view matching session_id and page_path */
async function waitForPageViewRow(sessionId: string, pagePath: string, timeoutMs = 12000): Promise<Record<string, any> | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_analytics?session_id=eq.${sessionId}&page_path=eq.${pagePath}&event_type=eq.page_view&select=*`,
      { headers: API_HEADERS }
    )
    const rows = await res.json()
    if (Array.isArray(rows) && rows.length > 0) return rows[0]
    await new Promise(r => setTimeout(r, 800))
  }
  return null
}

/** Poll user_analytics for a click event matching session_id and event_name */
async function waitForClickRow(sessionId: string, eventName: string, timeoutMs = 12000): Promise<Record<string, any> | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_analytics?session_id=eq.${sessionId}&event_name=eq.${eventName}&event_type=eq.button_click&select=*`,
      { headers: API_HEADERS }
    )
    const rows = await res.json()
    if (Array.isArray(rows) && rows.length > 0) return rows[0]
    await new Promise(r => setTimeout(r, 800))
  }
  return null
}

test.describe('Market App — Analytics & Metrics Tracking E2E', () => {

  test('should track page view metrics on route navigation', async ({ page }) => {
    // 1. Navigate to the marketplace dashboard
    await page.goto(`${BASE_URL}/market`)
    await page.waitForTimeout(3000)

    // 2. Read the cg_session_id generated in sessionStorage
    const sessionId = await page.evaluate(() => sessionStorage.getItem('cg_session_id'))
    expect(sessionId).toBeTruthy()

    // 3. Assert that page_view row is saved in user_analytics table for /market
    const row = await waitForPageViewRow(sessionId!, '/market')
    expect(row).toBeTruthy()
    expect(row!.page_path).toBe('/market')
    expect(row!.event_type).toBe('page_view')

    // 4. Navigate to the profile page
    await page.goto(`${BASE_URL}/profile`)
    await page.waitForTimeout(3000)

    // 5. Assert that a second page_view row is saved for /profile
    const secondRow = await waitForPageViewRow(sessionId!, '/profile')
    expect(secondRow).toBeTruthy()
    expect(secondRow!.page_path).toBe('/profile')
    expect(secondRow!.event_type).toBe('page_view')

    // Cleanup E2E analytics data for this session
    await fetch(`${SUPABASE_URL}/rest/v1/user_analytics?session_id=eq.${sessionId}`, {
      method: 'DELETE',
      headers: API_HEADERS
    })
  })

  test('should track button click metrics on interactions', async ({ page }) => {
    // 1. Navigate to the profile setup page
    await page.goto(`${BASE_URL}/profile-setup`)
    await page.waitForTimeout(3000)

    const sessionId = await page.evaluate(() => sessionStorage.getItem('cg_session_id'))
    expect(sessionId).toBeTruthy()

    // 2. Click the "Use My Location" button which triggers trackClick('use_current_location')
    const locationBtn = page.locator('button:has-text("Use My Location")')
    await expect(locationBtn).toBeVisible({ timeout: 5000 })
    await locationBtn.click({ force: true })
    await page.waitForTimeout(3000)

    // 3. Assert that a button_click row is saved in user_analytics table
    const clickRow = await waitForClickRow(sessionId!, 'use_current_location')
    expect(clickRow).toBeTruthy()
    expect(clickRow!.event_type).toBe('button_click')
    expect(clickRow!.event_name).toBe('use_current_location')

    // Cleanup E2E analytics data for this session
    await fetch(`${SUPABASE_URL}/rest/v1/user_analytics?session_id=eq.${sessionId}`, {
      method: 'DELETE',
      headers: API_HEADERS
    })
  })
})
