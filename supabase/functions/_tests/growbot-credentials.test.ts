/**
 * Deno unit tests for GrowBot seller business credentials.
 *
 * Tests verify:
 * 1. buildSellerSystemPrompt includes a SELLER CREDENTIALS & CERTIFICATIONS
 *    section when businessCredentials are populated
 * 2. Each credential field (businessLicense, foodHandlerPermit, etc.) appears
 *    in the generated prompt
 * 3. The credentials section is omitted when all fields are null/empty
 * 4. sellerName uses farm_name (via SellerContext.sellerName) when provided
 *
 * Run:
 *   cd supabase && deno test --allow-env --no-check functions/_tests/growbot-credentials.test.ts
 */
import {
  assertEquals,
  assertStringIncludes,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

import type { SellerContext } from '../_shared/growbot-seller.ts'
import { buildSellerSystemPrompt } from '../_shared/growbot-seller.ts'

// ── Helpers ─────────────────────────────────────────────────────

/** Build a fully-populated SellerContext for testing */
function makeContext(overrides: Partial<SellerContext> = {}): SellerContext {
  return {
    sellerName: 'Sunny Acres Farm',
    sellerBio: 'Family-run organic farm since 2010.',
    businessCredentials: {
      businessType: 'Certified Organic Farm',
      businessLicense: 'BL-2024-98765',
      foodHandlerPermit: 'FHP-CA-112233',
      cottageFoodPermit: 'CFP-CA-445566',
      insuranceProvider: 'FarmShield Insurance Co.',
    },
    boothName: 'Sunny Acres Stand',
    boothId: 'booth-test-001',
    botInstructions: null,
    products: [
      {
        id: 'prod-001',
        name: 'Organic Tomatoes',
        description: 'Vine-ripened heirlooms',
        price: 5.00,
        unit: 'lb',
        inventory: 20,
        category: 'produce',
        photos: [],
      },
    ],
    fulfillment: {
      offersDelivery: true,
      offersPickup: true,
      deliveryRadius: 10,
      deliveryZipcodes: ['90210', '90211'],
      pickupAddress: '123 Farm Rd, Sunnyville, CA',
      deliveryWindows: null,
      pickupWindows: null,
      fulfillmentWindows: [
        {
          day: 'Saturday',
          startTime: '08:00',
          endTime: '12:00',
          type: 'pickup',
          label: 'Morning pickup',
        },
      ],
    },
    otherBooths: [],
    siteUrl: 'https://casagrown.com',
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════
// Credentials section present when credentials are populated
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: 'credentials: prompt contains SELLER CREDENTIALS & CERTIFICATIONS header when credentials exist',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext()
    const prompt = buildSellerSystemPrompt(ctx)
    assertStringIncludes(prompt, 'SELLER CREDENTIALS & CERTIFICATIONS')
  },
})

Deno.test({
  name: 'credentials: prompt contains Business Type value',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext()
    const prompt = buildSellerSystemPrompt(ctx)
    assertStringIncludes(prompt, 'Business Type: Certified Organic Farm')
  },
})

Deno.test({
  name: 'credentials: prompt contains Business License value',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext()
    const prompt = buildSellerSystemPrompt(ctx)
    assertStringIncludes(prompt, 'Business License: BL-2024-98765')
  },
})

Deno.test({
  name: 'credentials: prompt contains Food Handler Permit value',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext()
    const prompt = buildSellerSystemPrompt(ctx)
    assertStringIncludes(prompt, 'Food Handler Permit: FHP-CA-112233')
  },
})

Deno.test({
  name: 'credentials: prompt contains Cottage Food Permit value',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext()
    const prompt = buildSellerSystemPrompt(ctx)
    assertStringIncludes(prompt, 'Cottage Food Permit: CFP-CA-445566')
  },
})

Deno.test({
  name: 'credentials: prompt contains Insurance Provider value',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext()
    const prompt = buildSellerSystemPrompt(ctx)
    assertStringIncludes(prompt, 'Insurance Provider: FarmShield Insurance Co.')
  },
})

// ══════════════════════════════════════════════════════════════
// Credentials section omitted when all fields are null/empty
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: 'credentials: prompt omits credentials section when all fields are null',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext({
      businessCredentials: {
        businessType: null,
        businessLicense: null,
        foodHandlerPermit: null,
        cottageFoodPermit: null,
        insuranceProvider: null,
      },
    })
    const prompt = buildSellerSystemPrompt(ctx)
    assert(
      !prompt.includes('SELLER CREDENTIALS & CERTIFICATIONS'),
      'Credentials section should NOT appear when all fields are null',
    )
  },
})

Deno.test({
  name: 'credentials: prompt omits credentials section when all fields are empty strings',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext({
      businessCredentials: {
        businessType: '',
        businessLicense: '',
        foodHandlerPermit: '',
        cottageFoodPermit: '',
        insuranceProvider: '',
      },
    })
    const prompt = buildSellerSystemPrompt(ctx)
    assert(
      !prompt.includes('SELLER CREDENTIALS & CERTIFICATIONS'),
      'Credentials section should NOT appear when all fields are empty strings',
    )
  },
})

Deno.test({
  name: 'credentials: partial credentials only shows populated fields',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext({
      businessCredentials: {
        businessType: null,
        businessLicense: 'BL-PARTIAL-001',
        foodHandlerPermit: null,
        cottageFoodPermit: 'CFP-PARTIAL-002',
        insuranceProvider: null,
      },
    })
    const prompt = buildSellerSystemPrompt(ctx)
    assertStringIncludes(prompt, 'SELLER CREDENTIALS & CERTIFICATIONS')
    assertStringIncludes(prompt, 'Business License: BL-PARTIAL-001')
    assertStringIncludes(prompt, 'Cottage Food Permit: CFP-PARTIAL-002')
    assert(!prompt.includes('Business Type:'), 'Null fields should be omitted')
    assert(!prompt.includes('Food Handler Permit:'), 'Null fields should be omitted')
    assert(!prompt.includes('Insurance Provider:'), 'Null fields should be omitted')
  },
})

// ══════════════════════════════════════════════════════════════
// Seller name uses farm_name when provided
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: 'credentials: sellerName uses farm_name value in prompt',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext({ sellerName: 'Happy Valley Homestead' })
    const prompt = buildSellerSystemPrompt(ctx)
    assertStringIncludes(
      prompt,
      'on behalf of Happy Valley Homestead',
    )
    assertStringIncludes(
      prompt,
      "Happy Valley Homestead's farm stand",
    )
  },
})

Deno.test({
  name: 'credentials: sellerName fallback value appears in prompt when no farm_name',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    // Simulates the case where loadBoothContext falls back to full_name
    const ctx = makeContext({ sellerName: 'Jane Doe' })
    const prompt = buildSellerSystemPrompt(ctx)
    assertStringIncludes(prompt, 'on behalf of Jane Doe')
  },
})

// ══════════════════════════════════════════════════════════════
// Rules integration with credentials
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: 'credentials: admin rules are appended after credentials section',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    const ctx = makeContext()
    const rules = ['Always recommend organic options', 'Never discuss competitor prices']
    const prompt = buildSellerSystemPrompt(ctx, rules)
    assertStringIncludes(prompt, 'SELLER CREDENTIALS & CERTIFICATIONS')
    assertStringIncludes(prompt, 'RULES (follow strictly)')
    assertStringIncludes(prompt, 'Always recommend organic options')
    assertStringIncludes(prompt, 'Never discuss competitor prices')

    // Credentials should appear before rules in the prompt
    const credsIndex = prompt.indexOf('SELLER CREDENTIALS & CERTIFICATIONS')
    const rulesIndex = prompt.indexOf('RULES (follow strictly)')
    assert(credsIndex < rulesIndex, 'Credentials section should appear before rules section')
  },
})
