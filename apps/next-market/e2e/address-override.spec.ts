import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env') })

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const MAILPIT_URL = 'http://127.0.0.1:54324'

async function getOtpFromMailpit(recipientEmail: string, maxAttempts = 15, delayMs = 1000): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delayMs))
    try {
      const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(recipientEmail)}&limit=1`)
      const data = await res.json()
      const msg = data.messages?.[0]
      if (msg) {
        const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)
        const msgData = await msgRes.json()
        const body = msgData.Text || msgData.HTML || ''
        const match = body.match(/\b(\d{6})\b/)
        if (match) return match[1]
      }
    } catch { /* retry */ }
  }
  return ''
}

test.describe('Fulfillment Base Address and Pickup Override', () => {
  test.beforeEach(async ({ page }) => {
    // Enable Mobile app WebView emulation
    await page.addInitScript(() => {
      (window as any).IS_NATIVE_APP = true;
      if (document.documentElement) {
        document.documentElement.classList.add('native-app');
      }
      window.addEventListener('DOMContentLoaded', () => {
        document.documentElement.classList.add('native-app');
      });
    });
  });

  // Use authed state for the seller interactions
  test.describe('Seller Authed Interactions', () => {
    test.use({ 
      storageState: 'e2e/.auth/user.json',
      viewport: { width: 375, height: 812 }
    })

    test('renders inherited read-only base address and handles pickup address override', async ({ page }) => {
      // Go to new listing page
      await page.goto('/my-booth/products/new')
      await page.waitForLoadState('networkidle')

      // 1. Verify that inherited base address card displays the correct address
      const baseAddressCard = page.locator('[data-testid="inherited-base-address"]')
      await expect(baseAddressCard).toBeVisible({ timeout: 10000 })
      await expect(baseAddressCard).toContainText('1247 Minnesota Ave, San Jose, CA 95125')

      // 2. Click pickup fulfillment card if not already selected
      const pickupCard = page.locator('button:has-text("Pickup Available")')
      // If it doesn't have active class, click it
      const classList = await pickupCard.evaluate(el => Array.from(el.classList))
      if (!classList.some(c => c.includes('Active'))) {
        await pickupCard.click()
      }

      // 3. Fill in alternate pickup address override using structured inputs
      // Locate the input inside Alternate/Override pickup section
      const streetInput = page.locator('input[placeholder="Street Address"]').last()
      const cityInput = page.locator('input[placeholder="City"]').last()
      const stateInput = page.locator('input[placeholder="ST"]').last()
      const zipInput = page.locator('input[placeholder="ZIP"]').last()

      await streetInput.fill('300 California St')
      await cityInput.fill('San Francisco')
      await stateInput.fill('CA')
      await zipInput.fill('94104')

      // 4. Fill in other required fields (Name, Price, Quantity) to submit successfully
      await page.locator('input[placeholder*="Tomatoes"]').fill('E2E Test Override Apple')
      // Select category
      await page.locator('label:has-text("Category") + select').selectOption({ index: 1 })

      await page.locator('input[placeholder*="4.50"]').fill('3.50')
      await page.locator('input[placeholder="10"]').fill('15')

      // Choose today window to pass validation
      const windowCheckbox = page.locator('input[type="checkbox"]').first()
      if (await windowCheckbox.isVisible()) {
        await windowCheckbox.check().catch(() => {})
      } else {
        const firstTimeSlot = page.locator('[class*="slot"], [class*="chip"]').first()
        if (await firstTimeSlot.isVisible()) {
          await firstTimeSlot.click()
        }
      }

      // Submit the form
      const submitBtn = page.locator('button[type="submit"]')
      await submitBtn.click()

      // Wait for listing creation and success popup
      await page.waitForTimeout(3000)

      // Query database via service role client to verify
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const { data: products, error } = await supabase
        .from('market_products')
        .select('*')
        .eq('name', 'E2E Test Override Apple')
        .order('created_at', { ascending: false })

      expect(error).toBeNull()
      expect(products).not.toBeNull()
      expect(products!.length).toBeGreaterThan(0)
      
      const product = products![0]
      expect(product.pickup_address).toBe('300 California St, San Francisco, CA 94104')

      // Query and verify the booth decomposed fields updated successfully
      const { data: boothData, error: boothError } = await supabase
        .from('market_booths')
        .select('*')
        .eq('id', product.booth_id)
        .single()

      expect(boothError).toBeNull()
      expect(boothData).not.toBeNull()
      expect(boothData.pickup_zip).toBe('94104')
      expect(boothData.pickup_street).toBe('300 California St')
      expect(boothData.pickup_city).toBe('San Francisco')
      expect(boothData.pickup_state).toBe('CA')
    })
  })

  test.describe('First-time Seller Inline Setup (No Booth)', () => {
    // Run WITHOUT auth state to simulate a user/guest completing wizard or new seller
    test.use({ 
      storageState: { cookies: [], origins: [] },
      viewport: { width: 375, height: 812 }
    })

    test('renders editable base address and auto-creates stand with geocoding', async ({ page }) => {
      page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
      page.on('pageerror', err => console.error('BROWSER ERROR:', err.message))

      // Generate randomized email for new user registration
      const email = `new-seller-${Date.now()}@test.local`

      await page.goto('/create-listing')
      await page.waitForLoadState('networkidle')

      // Step 1: Basics
      await page.locator('input[type="email"]').fill(email)
      await page.locator('input[placeholder*="Tomatoes"]').fill('E2E First Time Tomato')
      await page.locator('textarea').fill('First time seller tomatoes')
      await page.locator('select').first().selectOption({ index: 1 })
      await page.locator('button:has-text("Next")').click()

      // Step 2: Fulfillment (Wizard has structured widgets)
      await page.locator('input[placeholder="Street Address"]').first().fill('500 Howard St')
      await page.locator('input[placeholder="City"]').first().fill('San Francisco')
      await page.locator('input[placeholder="ST"]').first().fill('CA')
      await page.locator('input[placeholder="ZIP"]').first().fill('94105')

      // Enable alternate pickup address in wizard
      const offersPickupCheckbox = page.locator('div:has-text("Pickup Available") input[type="checkbox"]').first()
      if (await offersPickupCheckbox.isVisible()) {
        const checked = await offersPickupCheckbox.isChecked()
        if (!checked) {
          await page.locator('text=Pickup Available').first().click()
        }
      }

      // Let's specify alternate pickup address
      await page.locator('input[placeholder*="Corner Store"]').fill('600 Montgomery St')
      await page.locator('input[placeholder="City"]').last().fill('San Francisco')
      await page.locator('input[placeholder="ST"]').last().fill('CA')
      await page.locator('input[placeholder="ZIP"]').last().fill('94111')

      // Select a time window for both delivery and pickup
      await page.getByText(/^Today/i).first().click()
      await page.getByText(/^Today/i).last().click()

      await page.locator('button:has-text("Next")').click()

      // Step 3: Pricing
      await page.locator('input[type="number"]').first().fill('10') // Quantity
      await page.locator('input[type="number"]').last().fill('4.99') // Price
      await page.locator('button:has-text("Next")').click()

      // Step 4: Secure Listing (Submit & Auth)
      await page.locator('input[placeholder="Jane Doe"]').fill('New Seed Seller')
      await page.locator('button:has-text("Send Verification Code")').click()

      // Fetch OTP from Mailpit
      const otp = await getOtpFromMailpit(email)
      expect(otp).not.toBe('')

      // Fill and verify OTP
      await page.locator('input[placeholder="1 2 3 4 5 6"]').fill(otp)
      await page.locator('button:has-text("Verify & Continue →")').click()

      // Step 5: Review & Publish
      // Check the Terms of Service checkbox
      await page.locator('input[type="checkbox"]').check()

      // Click Publish
      await page.locator('button:has-text("Publish Product")').click()

      // Wait for listing creation and redirection
      await page.waitForTimeout(5000)

      // Verify DB creation
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      
      // Get the user ID via direct SQL query to bypass GoTrue local signature issues
      const { execSync } = require('child_process')
      const userId = execSync(
        `docker exec supabase_db_casagrown3 psql -U postgres -t -c "SELECT id FROM auth.users WHERE email = '${email}';"`,
        { encoding: 'utf-8' }
      ).trim()
      expect(userId).not.toBe('')

      // Verify the booth was auto-created with all decomposed address fields populated
      const { data: booth, error } = await supabase
        .from('market_booths')
        .select('*')
        .eq('owner_id', userId)
        .single()

      expect(error).toBeNull()
      expect(booth).not.toBeNull()

      expect(booth.booth_address).toBe('500 Howard St, San Francisco, CA 94105')
      expect(booth.booth_street).toBe('500 Howard St')
      expect(booth.booth_city).toBe('San Francisco')
      expect(booth.booth_state).toBe('CA')
      expect(booth.booth_zip).toBe('94105')

      expect(booth.pickup_address).toBe('600 Montgomery St, San Francisco, CA 94111')
      expect(booth.pickup_street).toBe('600 Montgomery St')
      expect(booth.pickup_city).toBe('San Francisco')
      expect(booth.pickup_state).toBe('CA')
      expect(booth.pickup_zip).toBe('94111')

      // Verification of geocoding
      expect(booth.booth_location).not.toBeNull()
      expect(booth.pickup_location).not.toBeNull()

      // Verify product was created and associated with correct booth and addresses
      const { data: createdProducts, error: pErr } = await supabase
        .from('market_products')
        .select('*')
        .eq('name', 'E2E First Time Tomato')
        .eq('booth_id', booth.id)
      expect(pErr).toBeNull()
      expect(createdProducts).not.toBeNull()
      expect(createdProducts!.length).toBeGreaterThan(0)
      expect(createdProducts![0].pickup_address).toBe('600 Montgomery St, San Francisco, CA 94111')
    })
  })
})
