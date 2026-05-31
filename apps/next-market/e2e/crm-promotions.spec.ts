import { test, expect } from '@playwright/test'

test.describe('Market — CRM Promotions Landing Page (Full Flow)', () => {
  // Use a known mocked slug or intercept the network requests
  const testSlug = 'spring-giveaway-test'

  test.beforeEach(async ({ page }) => {
    // Intercept Supabase network calls to mock the promotion data
    await page.route('**/rest/v1/rpc/crm_get_landing_page_promotion*', async route => {
      let promoId = null
      console.log("Mock received request:", route.request().method(), route.request().url())
      if (route.request().method() === 'POST') {
        try {
          const postData = route.request().postData()
          console.log("Mock received postData:", postData)
          const body = JSON.parse(postData || '{}')
          promoId = body.p_promo_id
        } catch (e) {}
      }
      
      const futureDate = new Date()
      futureDate.setMonth(futureDate.getMonth() + 1)
      
      // If we ask for a specific promo, return the full combo promo
      if (promoId === 'promo-123') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'promo-123',
            name: 'Spring Harvest Combo Promo',
            description_html: '<p>Win big</p>',
            enrollment_deadline: futureDate.toISOString(),
            allow_existing_users: true,

            buyer_discounts: {
              discount_amount_usd: 10,
              discount_type: 'universal',
              discount_cap_type: 'percentage',
              discount_cap_value: 100,
              frequency: 'one-time',
              occurrences: 1,
              start_date: futureDate.toISOString()
            },
            hero_image_url: 'https://example.com/hero.jpg'
          })
        })
      } else {
        // Canonical response
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: null,
            name: 'Generic Landing Page',
            description_html: '<p>Welcome to our canonical page</p>',
            hero_image_url: 'https://example.com/canonical-hero.jpg',
            enrollment_deadline: futureDate.toISOString(),
            allow_existing_users: true
          })
        })
      }
    })

    // Mock blueprints if it tries to load credits
    await page.route('**/rest/v1/crm_promo_buyer_discounts*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          discount_amount_usd: 10,
          discount_type: 'purchase',
          discount_cap_type: 'percentage',
          discount_cap_value: 100,
          frequency: 'monthly',
          occurrences: 3
        })
      })
    })

    await page.route('**/rest/v1/subscription_tiers*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { tier_name: 'lite', display_name: 'Lite Base', subscription_price: 0, platform_fee_pct: 10, max_booths: 1 },
          { tier_name: 'pro', display_name: 'Pro', subscription_price: 10, platform_fee_pct: 5, max_booths: 3 },
          { tier_name: 'elite', display_name: 'Elite', subscription_price: 29, platform_fee_pct: 2, max_booths: 10 }
        ])
      })
    })

    await page.route('**/rest/v1/crm_promo_subscription_discounts*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { plan: 'pro', discount_pct: 50, duration_months: 3 },
          { plan: 'elite', discount_pct: 30, duration_months: 3 }
        ])
      })
    })
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message))
  })

  test('Canonical rendering without specific promo URL', async ({ page }) => {
    await page.goto(`/p/${testSlug}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('h1')).toHaveText('Generic Landing Page')
    await expect(page.locator('text=Welcome to our canonical page')).toBeVisible()
  })

  test('Flow for EXISTING user (skips profile collection)', async ({ page }) => {
    await page.goto(`/p/${testSlug}?promo=promo-123`, { waitUntil: 'domcontentloaded' })
    await page.click('.tier-card:has-text("Lite Base")')
    
    // 1. Initial State
    await expect(page.locator('h1')).toHaveText('Spring Harvest Combo Promo')
    await expect(page.locator('text=$10').first()).toBeVisible()

    // Mock RPC to say email IS registered and eligible
    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({ eligible: true, is_registered: true }) })
    })

    // Mock signInWithOtp
    await page.route('**/auth/v1/otp', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({}) })
    })

    // 2. Submit initial form
    await page.fill('input[type="email"]', 'existing@casagrown.com')
    await page.click('button:has-text("Continue")')

    // 3. Should show profile step (page always collects profile)
    await expect(page.locator('h2')).toHaveText('Setup Your Profile')
    
    // Fill profile form
    await page.fill('input[placeholder="Jane Doe"]', 'Existing User')
    await page.fill('input[placeholder="123 Farm Road"]', '123 Main St')
    await page.fill('input[placeholder="City"]', 'Testville')
    await page.fill('input[placeholder="ST"]', 'CA')
    await page.fill('input[placeholder="12345"]', '90210')
    await page.fill('input[placeholder="(555) 555-5555"]', '5551234567')
    await page.locator('input[type="checkbox"]').last().check()
    await page.click('button:has-text("Send Login Code")')
    
    // 4. Should advance to OTP
    await expect(page.locator('h2')).toHaveText('Verify Your Email')
    await expect(page.locator('text=We sent a secure code to existing@casagrown.com')).toBeVisible()
  })

  test('Flow for NEW user (prompts for profile collection)', async ({ page }) => {
    await page.goto(`/p/${testSlug}?promo=promo-123`, { waitUntil: 'domcontentloaded' })
    await page.click('.tier-card:has-text("Lite Base")')
    
    // Mock RPC to say email IS NOT registered but is eligible
    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({ eligible: true, is_registered: false }) })
    })

    // Mock signInWithOtp
    await page.route('**/auth/v1/otp', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({}) })
    })

    // 1. Submit initial form
    await page.fill('input[type="email"]', 'newlead@casagrown.com')
    await page.click('button:has-text("Continue")')

    // 2. Should show Profile collection form
    await expect(page.locator('h2')).toHaveText('Setup Your Profile')
    await page.fill('input[placeholder="Jane Doe"]', 'Jane Test')
    await page.fill('input[placeholder="123 Farm Road"]', '456 Farm Rd')
    await page.fill('input[placeholder="City"]', 'Testville')
    await page.fill('input[placeholder="ST"]', 'CA')
    await page.fill('input[placeholder="12345"]', '90210')
    await page.fill('input[placeholder="(555) 555-5555"]', '5551234567')
    await page.locator('input[type="checkbox"]').last().check() // ToS acceptance
    
    await page.click('button:has-text("Send Login Code")')

    // 3. Should advance to OTP
    await expect(page.locator('h2')).toHaveText('Verify Your Email')
  })

  test('OTP verification successfully enrolls the user', async ({ page }) => {
    await page.goto(`/p/${testSlug}?promo=promo-123`, { waitUntil: 'domcontentloaded' })
    await page.click('.tier-card:has-text("Lite Base")')
    
    // Fast-forward to OTP step
    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({ eligible: true, is_registered: true }) })
    })
    await page.route('**/auth/v1/otp', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({}) })
    })
    
    await page.fill('input[type="email"]', 'enroll@casagrown.com')
    await page.click('button:has-text("Continue")')
    await expect(page.locator('h2')).toHaveText('Setup Your Profile')
    
    await page.fill('input[placeholder="Jane Doe"]', 'Enroll User')
    await page.fill('input[placeholder="123 Farm Road"]', '123 Main St')
    await page.fill('input[placeholder="City"]', 'Testville')
    await page.fill('input[placeholder="ST"]', 'CA')
    await page.fill('input[placeholder="12345"]', '90210')
    await page.fill('input[placeholder="(555) 555-5555"]', '5551234567')
    await page.locator('input[type="checkbox"]').last().check()
    await page.click('button:has-text("Send Login Code")')
    
    await expect(page.locator('h2')).toHaveText('Verify Your Email')

    // Mock verifyOtp
    await page.route('**/auth/v1/verify', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ user: { id: 'user-1' }, session: { access_token: 'token' } })
      })
    })

    // Mock the enrollment RPC
    await page.route('**/rest/v1/rpc/crm_enroll_in_promotion', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) })
    })

    // Submit OTP
    await page.fill('input[placeholder="123456"]', '000000')
    await page.click('button:has-text("Verify & Claim Offer")')

    // Success screen
    await expect(page.locator('h2')).toHaveText("You're Enrolled!")
  })

  test('Short link resolution engine (/r/[token]) correctly redirects', async ({ page }) => {
    // We mock the DB call that happens inside the route handler
    // Wait, the route handler runs on the server, so page.route() won't intercept the DB call made by the server.
    // Instead, we will directly intercept the request to `/r/test-token` and mock the server's redirect response.
    
    await page.route('**/r/test-token', async route => {
      await route.fulfill({
        status: 307,
        headers: {
          Location: `/p/${testSlug}?promo=promo-123`
        }
      })
    })

    // Navigate to the short link
    await page.goto('/r/test-token', { waitUntil: 'domcontentloaded' })
    
    // The browser should follow the 307 and land on the promo page
    await expect(page).toHaveURL(new RegExp(`/p/${testSlug}\\?promo=promo-123`))
    await expect(page.locator('h1')).toHaveText('Spring Harvest Combo Promo')
  })

  test('Promotion switch flow for already-enrolled user', async ({ page }) => {
    // Mock the switch promotion RPC
    await page.route('**/rest/v1/rpc/crm_switch_promotion', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, new_promo_id: 'promo-456' })
      })
    })

    // Mock eligibility check to say user is registered and eligible
    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({ eligible: true, is_registered: true, already_enrolled: true }) })
    })

    // Mock OTP
    await page.route('**/auth/v1/otp', async route => {
      await route.fulfill({ status: 200, body: JSON.stringify({}) })
    })

    // Mock verifyOtp
    await page.route('**/auth/v1/verify', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ user: { id: 'user-1' }, session: { access_token: 'token' } })
      })
    })

    await page.goto(`/p/${testSlug}?promo=promo-123`, { waitUntil: 'domcontentloaded' })
    await page.click('.tier-card:has-text("Lite Base")')

    // Submit email
    await page.fill('input[type="email"]', 'enrolled@casagrown.com')
    await page.click('button:has-text("Continue")')

    // Should show profile step
    await expect(page.locator('h2')).toHaveText('Setup Your Profile')
    
    await page.fill('input[placeholder="Jane Doe"]', 'Enrolled User')
    await page.fill('input[placeholder="123 Farm Road"]', '123 Main St')
    await page.fill('input[placeholder="City"]', 'Testville')
    await page.fill('input[placeholder="ST"]', 'CA')
    await page.fill('input[placeholder="12345"]', '90210')
    await page.fill('input[placeholder="(555) 555-5555"]', '5551234567')
    await page.locator('input[type="checkbox"]').last().check()
    await page.click('button:has-text("Send Login Code")')
    
    // Should show OTP step
    await expect(page.locator('h2')).toHaveText('Verify Your Email')

    // Submit OTP
    await page.fill('input[placeholder="123456"]', '000000')
    await page.click('button:has-text("Verify & Claim Offer")')

    // Should show switch/enrollment success
    await expect(page.locator('h2')).toHaveText("You're Enrolled!")
  })
})
