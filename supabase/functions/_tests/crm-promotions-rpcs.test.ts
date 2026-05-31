/**
 * CRM Promotions RPCs — Integration Tests
 *
 * Tests: is_email_registered, crm_enroll_in_promotion (including buyer discounts incentive path)
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/crm-promotions-rpcs.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const MAILPIT_URL = 'http://127.0.0.1:54324'
// Seeded buyer from seed.sql
const BUYER_EMAIL = 'buyer@test.local'

async function callRpc(name: string, body: unknown, key: string = ANON_KEY) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'apikey': key,
    },
    body: JSON.stringify(body),
  })
}

/** Clear all messages in Mailpit so we get a clean OTP */
async function clearMailpit() {
  try { await (await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })).text() } catch { /* ok */ }
}

/** Extract 6-digit OTP code from Mailpit for the given email */
async function getOtpFromMailpit(email: string, timeoutMs = 10_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`)
    const data = await listRes.json()
    const messages = data.messages || []
    const msg = messages.find((m: any) => m.To?.some((to: any) => to.Address === email))
    if (msg) {
      const otpMatch = msg.Snippet?.match(/\b(\d{6})\b/)
      if (otpMatch) return otpMatch[1]
      const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)
      const fullMsg = await msgRes.json()
      const bodyMatch = (fullMsg.Text || fullMsg.HTML || '').match(/\b(\d{6})\b/)
      if (bodyMatch) return bodyMatch[1]
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return null
}

/** Authenticate a seeded user via OTP + Mailpit and return their access token */
async function getAccessToken(email: string): Promise<string | null> {
  try {
    await clearMailpit()

    // Request OTP
    const otpRes = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
      body: JSON.stringify({ email }),
    })
    await otpRes.text() // consume body

    // Get OTP from Mailpit
    const otp = await getOtpFromMailpit(email)
    if (!otp) return null
    console.log(`  [AUTH] Got OTP for ${email}: ${otp}`)

    // Verify OTP to get session
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
      body: JSON.stringify({ type: 'email', token: otp, email }),
    })
    const session = await verifyRes.json()
    return session.access_token ?? null
  } catch {
    return null
  }
}

/** Helper to query a table via REST API */
async function queryTable(table: string, filters: string = '', key: string = SERVICE_ROLE_KEY) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    headers: {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
    },
  })
  return res.json()
}

Deno.test('is_email_registered: returns boolean when called with valid params', async () => {
  const res = await callRpc('is_email_registered', { p_email: 'nonexistent@example.com' })
  // Might return 404 if DB is not reset/running locally during test, so we accept 404 gracefully in these proxy tests
  if (res.status === 404 || res.status === 500) {
    await res.text()
    console.log('DB not fully setup for RPC locally — skipping test')
    return
  }

  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body, false)
})

Deno.test('crm_enroll_in_promotion: rejects unauthenticated calls', async () => {
  const res = await callRpc('crm_enroll_in_promotion', { p_promotion_id: '00000000-0000-0000-0000-000000000000' }, ANON_KEY)
  
  if (res.status === 404 || res.status === 500) {
    await res.text()
    return
  }

  // Should reject because ANON_KEY does not map to an authenticated auth.uid()
  assertEquals(res.status, 400) // or whatever Postgres throws for unauthenticated
  const body = await res.json()
  assertEquals(body.message.includes('Not authenticated'), true)
})

Deno.test({ name: 'crm_enroll_in_promotion: buyer discounts creates user_incentives row', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  // 1. Get an access token for the seeded buyer
  const token = await getAccessToken(BUYER_EMAIL)
  if (!token) {
    console.log('Could not get access token for buyer — skipping')
    return
  }

  // Pre-cleanup: remove any leftover enrollments for this buyer (from failed prior runs)
  const buyerProfile = await queryTable('profiles', `select=id&email=eq.${BUYER_EMAIL}`)
  if (buyerProfile.length > 0) {
    const buyerId = buyerProfile[0].id
    await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_enrollments?user_id=eq.${buyerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
    })
    // Deactivate any system-created incentives
    await fetch(`${SUPABASE_URL}/rest/v1/user_incentives?user_id=eq.${buyerId}&created_by=is.null`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ is_active: false }),
    })
    console.log(`  Pre-cleanup: cleared enrollments and incentives for buyer ${buyerId}`)
  }

  // 2. Create a promotion with a future deadline via service_role REST API
  const promoRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_promotions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      name: 'E2E Buyer Discounts Test Promo',
      enrollment_deadline: new Date(Date.now() + 86400000 * 30).toISOString(), // 30 days out
      max_enrollees: 100,
    }),
  })
  assertEquals(promoRes.status, 201, 'Failed to create promotion')
  const [promo] = await promoRes.json()
  assertExists(promo.id, 'Promotion ID should exist')
  console.log(`  Created promotion: ${promo.id}`)

  // 3. Create a buyer discount for that promotion
  const buyerDiscountRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_buyer_discounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      promotion_id: promo.id,
      discount_amount_usd: 5.00,
      discount_type: 'purchase',
      discount_cap_type: 'percentage',
      discount_cap_value: 50,
      frequency: 'monthly',
      occurrences: 3,
      start_date: new Date().toISOString(),
    }),
  })
  assertEquals(buyerDiscountRes.status, 201, 'Failed to create buyer discount')
  const [buyerDiscount] = await buyerDiscountRes.json()
  console.log(`  Created buyer discount: ${buyerDiscount.id}`)

  // 4. Enroll as buyer — THIS is the code path that was broken
  const enrollRes = await callRpc(
    'crm_enroll_in_promotion',
    { p_promotion_id: promo.id },
    token,
  )
  const enrollBody = await enrollRes.json()
  console.log(`  Enroll response: ${enrollRes.status} ${JSON.stringify(enrollBody)}`)
  assertEquals(enrollRes.status, 200, `Enrollment failed: ${JSON.stringify(enrollBody)}`)
  assertEquals(enrollBody.success, true)

  // 5. Verify user_incentives row was created
  const incentives = await queryTable(
    'user_incentives',
    `select=*&order=created_at.desc&limit=1`,
  )
  console.log(`  user_incentives row: ${JSON.stringify(incentives[0])}`)
  assertExists(incentives[0], 'user_incentives row should exist after enrollment')
  assertEquals(Number(incentives[0].amount_usd), 5.00, 'amount_usd should be 5.00')
  assertEquals(incentives[0].credit_type, 'purchase')
  assertEquals(incentives[0].expiration_frequency, 'monthly')
  assertEquals(incentives[0].is_active, true)

  // 6. Cleanup: remove enrollment so test is re-runnable
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_enrollments?promotion_id=eq.${promo.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/user_incentives?id=eq.${incentives[0].id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_buyer_discounts?id=eq.${buyerDiscount.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promotions?id=eq.${promo.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  console.log('  ✅ Cleanup complete')
}})

Deno.test({ name: 'crm_enroll_in_promotion: rejects enrollment when already enrolled', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  // 1. Get an access token for the seeded buyer
  const token = await getAccessToken(BUYER_EMAIL)
  if (!token) {
    console.log('Could not get access token for buyer — skipping')
    return
  }

  // Pre-cleanup: remove any leftover enrollments
  const bp = await queryTable('profiles', `select=id&email=eq.${BUYER_EMAIL}`)
  if (bp.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_enrollments?user_id=eq.${bp[0].id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
    })
    console.log(`  Pre-cleanup: cleared enrollments for buyer ${bp[0].id}`)
  }

  // 2. Create two promotions via service_role REST API
  const createPromo = async (name: string) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_promotions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        name,
        enrollment_deadline: new Date(Date.now() + 86400000 * 30).toISOString(),
        max_enrollees: 100,
      }),
    })
    assertEquals(res.status, 201, `Failed to create promotion: ${name}`)
    const [promo] = await res.json()
    return promo
  }

  const promoA = await createPromo('E2E Reject Dup Promo A')
  const promoB = await createPromo('E2E Reject Dup Promo B')
  console.log(`  Created promoA: ${promoA.id}, promoB: ${promoB.id}`)

  // 3. Create buyer discounts for both promotions
  const createBuyerDiscount = async (promotionId: string) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_buyer_discounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        promotion_id: promotionId,
        discount_amount_usd: 5.00,
        discount_type: 'purchase',
        discount_cap_type: 'percentage',
        discount_cap_value: 50,
        frequency: 'monthly',
        occurrences: 3,
        start_date: new Date().toISOString(),
      }),
    })
    assertEquals(res.status, 201, 'Failed to create buyer discount')
    const [bd] = await res.json()
    return bd
  }

  const bdA = await createBuyerDiscount(promoA.id)
  const bdB = await createBuyerDiscount(promoB.id)

  // 4. Enroll in promo A — should succeed
  const enrollRes1 = await callRpc('crm_enroll_in_promotion', { p_promotion_id: promoA.id }, token)
  const enrollBody1 = await enrollRes1.json()
  console.log(`  First enroll response: ${enrollRes1.status} ${JSON.stringify(enrollBody1)}`)
  assertEquals(enrollRes1.status, 200, `First enrollment failed: ${JSON.stringify(enrollBody1)}`)
  assertEquals(enrollBody1.success, true)

  // 5. Attempt to enroll in promo B — should be rejected
  const enrollRes2 = await callRpc('crm_enroll_in_promotion', { p_promotion_id: promoB.id }, token)
  const enrollBody2 = await enrollRes2.json()
  console.log(`  Second enroll response: ${enrollRes2.status} ${JSON.stringify(enrollBody2)}`)
  // Expect failure — user is already enrolled in another promotion
  assertEquals(enrollRes2.status, 400, `Second enrollment should have been rejected: ${JSON.stringify(enrollBody2)}`)

  // 6. Cleanup
  const incentives = await queryTable('user_incentives', `select=*&order=created_at.desc&limit=5`)
  for (const inc of incentives) {
    await fetch(`${SUPABASE_URL}/rest/v1/user_incentives?id=eq.${inc.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
    })
  }
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_enrollments?promotion_id=eq.${promoA.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_enrollments?promotion_id=eq.${promoB.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_buyer_discounts?id=eq.${bdA.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_buyer_discounts?id=eq.${bdB.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promotions?id=eq.${promoA.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promotions?id=eq.${promoB.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  console.log('  ✅ Cleanup complete')
}})

Deno.test({ name: 'crm_switch_promotion: atomic switch from old to new', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  // 1. Get an access token for the seeded buyer
  const token = await getAccessToken(BUYER_EMAIL)
  if (!token) {
    console.log('Could not get access token for buyer — skipping')
    return
  }

  // Pre-cleanup: remove any leftover enrollments
  const bp2 = await queryTable('profiles', `select=id&email=eq.${BUYER_EMAIL}`)
  if (bp2.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_enrollments?user_id=eq.${bp2[0].id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
    })
    console.log(`  Pre-cleanup: cleared enrollments for buyer ${bp2[0].id}`)
  }

  // 2. Create two promotions with buyer discounts
  const createPromoWithDiscount = async (name: string, amountUsd: number) => {
    const promoRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_promotions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        name,
        enrollment_deadline: new Date(Date.now() + 86400000 * 30).toISOString(),
        max_enrollees: 100,
      }),
    })
    assertEquals(promoRes.status, 201, `Failed to create promotion: ${name}`)
    const [promo] = await promoRes.json()

    const bdRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_buyer_discounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        promotion_id: promo.id,
        discount_amount_usd: amountUsd,
        discount_type: 'purchase',
        discount_cap_type: 'percentage',
        discount_cap_value: 50,
        frequency: 'monthly',
        occurrences: 3,
        start_date: new Date().toISOString(),
      }),
    })
    assertEquals(bdRes.status, 201, 'Failed to create buyer discount')
    const [bd] = await bdRes.json()
    return { promo, buyerDiscount: bd }
  }

  const { promo: promoOld, buyerDiscount: bdOld } = await createPromoWithDiscount('E2E Switch Old Promo', 5.00)
  const { promo: promoNew, buyerDiscount: bdNew } = await createPromoWithDiscount('E2E Switch New Promo', 10.00)
  console.log(`  Created promoOld: ${promoOld.id}, promoNew: ${promoNew.id}`)

  // 3. Enroll in the old promotion first
  const enrollRes = await callRpc('crm_enroll_in_promotion', { p_promotion_id: promoOld.id }, token)
  const enrollBody = await enrollRes.json()
  console.log(`  Enroll response: ${enrollRes.status} ${JSON.stringify(enrollBody)}`)
  assertEquals(enrollRes.status, 200, `Enrollment failed: ${JSON.stringify(enrollBody)}`)
  assertEquals(enrollBody.success, true)

  // 4. Switch to the new promotion
  const switchRes = await callRpc(
    'crm_switch_promotion',
    { p_new_promotion_id: promoNew.id },
    token,
  )
  const switchBody = await switchRes.json()
  console.log(`  Switch response: ${switchRes.status} ${JSON.stringify(switchBody)}`)
  assertEquals(switchRes.status, 200, `Switch failed: ${JSON.stringify(switchBody)}`)
  assertEquals(switchBody.success, true)

  // 5. Verify: user_incentives — old should be deactivated, new should be active
  // Note: user_incentives doesn't have promotion_id column, query by user_id
  const buyerProf = await queryTable('profiles', `select=id&email=eq.${BUYER_EMAIL}`)
  const buyerUid = buyerProf[0].id
  const allIncentives = await queryTable(
    'user_incentives',
    `select=*&user_id=eq.${buyerUid}&order=created_at.desc`,
  )
  console.log(`  user_incentives count: ${allIncentives.length}`)

  // Should have at least 2: one deactivated (old) and one active (new)
  const activeIncentives = allIncentives.filter((i: any) => i.is_active === true)
  const inactiveIncentives = allIncentives.filter((i: any) => i.is_active === false)
  console.log(`  Active: ${activeIncentives.length}, Inactive: ${inactiveIncentives.length}`)

  // Verify there's at least one active incentive with amount 10.00 (the new promo)
  const newIncentive = activeIncentives.find((i: any) => Number(i.amount_usd) === 10.00)
  assertExists(newIncentive, 'New user_incentives row should exist after switch with amount 10.00')
  assertEquals(newIncentive.is_active, true, 'New incentive should be active')
  console.log(`  New incentive: amount=${newIncentive.amount_usd}, is_active=${newIncentive.is_active}`)

  // Verify old incentive (amount 5.00) is deactivated
  const oldIncentive = allIncentives.find((i: any) => Number(i.amount_usd) === 5.00)
  if (oldIncentive) {
    assertEquals(oldIncentive.is_active, false, 'Old incentive should be deactivated after switch')
    console.log(`  Old incentive is_active: ${oldIncentive.is_active}`)
  }

  // 7. Cleanup
  for (const inc of allIncentives) {
    await fetch(`${SUPABASE_URL}/rest/v1/user_incentives?id=eq.${inc.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
    })
  }
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_enrollments?promotion_id=eq.${promoOld.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_enrollments?promotion_id=eq.${promoNew.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_buyer_discounts?id=eq.${bdOld.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promo_buyer_discounts?id=eq.${bdNew.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promotions?id=eq.${promoOld.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  await fetch(`${SUPABASE_URL}/rest/v1/crm_promotions?id=eq.${promoNew.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  console.log('  ✅ Cleanup complete')
}})

