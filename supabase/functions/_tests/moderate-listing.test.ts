/**
 * moderate-listing — Integration Tests
 *
 * Verifies the full AI moderation pipeline end-to-end against a locally
 * running Supabase stack with the moderate-listing Edge Function served.
 *
 * Prerequisites:
 *   supabase start
 *   supabase functions serve moderate-listing --env-file supabase/.env.local
 *
 * Run:
 *   cd supabase && deno test --allow-env --allow-net \
 *     functions/_tests/moderate-listing.test.ts
 *
 * What is tested:
 *   M1  OPTIONS preflight returns 200
 *   M2  Missing required fields returns 400
 *   M3  Clean produce listing is approved (LLM path or no-key auto-approve)
 *   M4  Listing with prohibited keyword is flagged
 *   M5  Price outside sanity range is flagged (no LLM call needed)
 *   M6  Identical content submitted twice skips re-moderation (hash dedup)
 *   M7  Flagged listing triggers an in-app notification for the seller
 *   M8  Flagged listing result updates market_products.moderation_status
 *   M9  Approved listing clears moderation_flags to null
 *   M10 notify-product-flagged accepts ai_flagged payload without error
 */

import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Edge function served locally by `supabase functions serve`
const FN_URL = `${SUPABASE_URL.replace(':54321', ':54321')}/functions/v1/moderate-listing`
const NOTIFY_FN_URL = `${SUPABASE_URL}/functions/v1/notify-product-flagged`

const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

// Local Supabase seed data — matches supabase/seed.sql
const SEED_SELLER_ID = '11111111-1111-1111-1111-111111111111'
const SEED_BOOTH_ID  = '0db8ff02-9d47-468f-8480-399d3e2bef69'

/** Insert a minimal market_products row and return its id. Cleaned up after test. */
async function seedProduct(overrides: Record<string, unknown> = {}): Promise<string> {
  const payload = {
    seller_id: SEED_SELLER_ID,
    name: 'Test Cherry Tomatoes',
    description: 'Fresh picked this morning',
    price_usd: 4.0,
    unit: 'per lb',
    category: 'produce',
    inventory: 5,
    market_date: new Date().toISOString().split('T')[0],
    is_active: false,
    moderation_status: 'pending',
    ...overrides,
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/market_products`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  const rows = await res.json()
  assertExists(rows[0]?.id, `Seed product insert failed: ${JSON.stringify(rows)}`)
  return rows[0].id as string
}

async function deleteProduct(id: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/market_products?id=eq.${id}`, {
    method: 'DELETE',
    headers: AUTH_HEADERS,
  })
}

async function getProduct(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/market_products?id=eq.${id}&select=*`,
    { headers: AUTH_HEADERS },
  )
  const rows = await res.json()
  return rows[0] ?? {}
}

async function getLatestNotification(user_id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${user_id}&order=created_at.desc&limit=1`,
    { headers: AUTH_HEADERS },
  )
  const rows = await res.json()
  return rows[0] ?? null
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// M1 — OPTIONS preflight
Deno.test({
  name: 'M1 — OPTIONS preflight returns 200',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(FN_URL, { method: 'OPTIONS' })
    assertEquals(res.status, 200)
    await res.text()
  },
})

// M2 — Missing required fields
Deno.test({
  name: 'M2 — missing product_id or name returns 400',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ seller_id: 'a1111111-1111-1111-1111-111111111111' }),
    })
    assertEquals(res.status, 400)
    const body = await res.json()
    assertExists(body.error)
  },
})

// M3 — Clean produce listing approved
Deno.test({
  name: 'M3 — clean produce listing is approved',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const product_id = await seedProduct()
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          product_id,
          seller_id: SEED_SELLER_ID,
          name: 'Fresh Cherry Tomatoes',
          description: 'Sun-ripened cherry tomatoes from our backyard garden, picked this morning.',
          price_usd: 4.0,
          category: 'produce',
          photo_url: null,
        }),
      })
      assertEquals(res.status, 200)
      const body = await res.json()
      // Either approved by LLM, or auto-approved when no API key configured
      assert(
        body.status === 'approved' || body.skipped === true,
        `Expected approved or skipped, got: ${JSON.stringify(body)}`,
      )

      // Verify DB updated
      const product = await getProduct(product_id)
      assert(
        product.moderation_status === 'approved' || product.moderation_content_hash != null,
        'moderation_status or hash should be set',
      )
    } finally {
      await deleteProduct(product_id)
    }
  },
})

// M4 — Prohibited content is flagged
Deno.test({
  name: 'M4 — listing with prohibited keyword (cannabis) is flagged',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const product_id = await seedProduct({
      name: 'Cannabis Edibles',
      description: 'Homemade cannabis gummies, 10mg THC each',
      category: 'produce',
      price_usd: 15.0,
    })
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          product_id,
          seller_id: SEED_SELLER_ID,
          name: 'Cannabis Edibles',
          description: 'Homemade cannabis gummies, 10mg THC each',
          price_usd: 15.0,
          category: 'produce',
          photo_url: null,
        }),
      })
      assertEquals(res.status, 200)
      const body = await res.json()

      // If LLM key is configured, this MUST be flagged
      // If no LLM key, function auto-approves — we note this in the test output
      if (Deno.env.get('OPENROUTER_API_KEY')) {
        assertEquals(body.status, 'flagged', 'Cannabis listing should be flagged by LLM')
        assertExists(body.flags?.issues, 'Flagged result should include issues')
        assert(
          (body.flags.issues as string[]).some(i =>
            i.includes('drug') || i.includes('cannabis') || i.includes('banned')
          ),
          `Expected drug-related issue code, got: ${JSON.stringify(body.flags.issues)}`,
        )
      } else {
        console.warn('⚠️  OPENROUTER_API_KEY not set — LLM flagging not exercised in M4')
      }
    } finally {
      await deleteProduct(product_id)
    }
  },
})

// M5 — Price outside sanity range flagged without LLM
Deno.test({
  name: 'M5 — price outside sanity range is flagged (no LLM call)',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const product_id = await seedProduct({
      name: 'Herbs',
      description: 'Fresh basil',
      category: 'produce',
      price_usd: 999.0,   // way above any produce ceiling
    })
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          product_id,
          seller_id: SEED_SELLER_ID,
          name: 'Herbs',
          description: 'Fresh basil',
          price_usd: 999.0,
          category: 'produce',
          photo_url: null,
        }),
      })
      assertEquals(res.status, 200)
      const body = await res.json()
      // Price sanity runs regardless of LLM — should always flag this
      assertEquals(body.status, 'flagged', 'Unrealistic price should always be flagged')
      assert(
        (body.flags?.issues as string[] ?? []).includes('price_unrealistic'),
        `Expected price_unrealistic issue, got: ${JSON.stringify(body.flags?.issues)}`,
      )
    } finally {
      await deleteProduct(product_id)
    }
  },
})

// M6 — Identical content skips re-moderation (hash dedup)
Deno.test({
  name: 'M6 — identical content submitted twice skips second moderation',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const product_id = await seedProduct()
    const payload = {
      product_id,
      seller_id: SEED_SELLER_ID,
      name: 'Test Cherry Tomatoes',
      description: 'Fresh picked this morning',
      price_usd: 4.0,
      category: 'produce',
      photo_url: null,
    }

    try {
      // First call — should moderate
      const res1 = await fetch(FN_URL, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify(payload),
      })
      assertEquals(res1.status, 200)
      const body1 = await res1.json()
      // Must have been moderated (not skipped) on first call
      assert(body1.skipped !== true, 'First call should not be skipped')

      // Only run dedup test if first call set status=approved (skip if no LLM key set flagged)
      const product = await getProduct(product_id)
      if (product.moderation_status === 'approved') {
        // Second call with identical content
        const res2 = await fetch(FN_URL, {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify(payload),
        })
        assertEquals(res2.status, 200)
        const body2 = await res2.json()
        assertEquals(body2.skipped, true, 'Second identical submission should be skipped')
        assertEquals(body2.status, 'approved')
      } else {
        console.warn('⚠️  M6 dedup check skipped — first call did not result in approved status')
      }
    } finally {
      await deleteProduct(product_id)
    }
  },
})

// M7 — Flagged listing inserts in-app notification
Deno.test({
  name: 'M7 — flagged listing inserts in-app notification for seller',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Only run with LLM key or force a price violation (always flagged)
    const seller_id = SEED_SELLER_ID
    const product_id = await seedProduct({
      name: 'Basil',
      description: 'Fresh basil',
      category: 'produce',
      price_usd: 9999.0,    // always triggers price_unrealistic flag
    })
    try {
      // Clean any existing notifications for this seller first
      await fetch(
        `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${seller_id}&content=like.*needs some edits*`,
        { method: 'DELETE', headers: AUTH_HEADERS },
      )

      const before = Date.now()
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          product_id,
          seller_id: SEED_SELLER_ID,
          name: 'Basil',
          description: 'Fresh basil',
          price_usd: 9999.0,
          category: 'produce',
          photo_url: null,
        }),
      })
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.status, 'flagged')

      // Small settle
      await new Promise(r => setTimeout(r, 500))

      const notif = await getLatestNotification(seller_id)
      assertExists(notif, 'Should have created a notification for the seller')
      assert(
        (notif.content as string).includes('Basil') || (notif.content as string).includes('edits'),
        `Notification should mention the product, got: ${notif.content}`,
      )
      assertExists(notif.link_url, 'Notification should have a link_url')
      assert(
        (notif.link_url as string).includes(product_id),
        'link_url should point to the product',
      )
      console.log(`✅ M7 notification: "${notif.content}"`)
    } finally {
      await deleteProduct(product_id)
    }
  },
})

// M8 — moderation_status updated in DB
Deno.test({
  name: 'M8 — moderation_status is written to market_products',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const product_id = await seedProduct({
      name: 'Test Lemons',
      category: 'produce',
      price_usd: 3.0,
    })
    try {
      const before = await getProduct(product_id)
      assertEquals(before.moderation_status, 'pending')

      await fetch(FN_URL, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          product_id,
          seller_id: SEED_SELLER_ID,
          name: 'Test Lemons',
          description: 'Home-grown Meyer lemons',
          price_usd: 3.0,
          category: 'produce',
          photo_url: null,
        }),
      })

      const after = await getProduct(product_id)
      assert(
        after.moderation_status === 'approved' || after.moderation_status === 'flagged',
        `Expected approved or flagged, got: ${after.moderation_status}`,
      )
      assertExists(after.moderation_content_hash, 'Content hash should be saved')
      assertExists(after.moderation_checked_at, 'Checked timestamp should be saved')
      console.log(`✅ M8 final status: ${after.moderation_status}`)
    } finally {
      await deleteProduct(product_id)
    }
  },
})

// M9 — Approved listing clears moderation_flags
Deno.test({
  name: 'M9 — approved listing has null moderation_flags in DB',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const product_id = await seedProduct({
      name: 'Fresh Kale',
      category: 'produce',
      price_usd: 3.0,
    })
    try {
      await fetch(FN_URL, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          product_id,
          seller_id: SEED_SELLER_ID,
          name: 'Fresh Kale',
          description: 'Organic backyard kale, no pesticides.',
          price_usd: 3.0,
          category: 'produce',
          photo_url: null,
        }),
      })

      const product = await getProduct(product_id)
      if (product.moderation_status === 'approved') {
        assertEquals(
          product.moderation_flags,
          null,
          'Approved listings should have null moderation_flags',
        )
        console.log('✅ M9 passed: approved listing has null flags')
      } else {
        console.warn('⚠️  M9 skipped — product was flagged (no LLM key or LLM flagged it)')
      }
    } finally {
      await deleteProduct(product_id)
    }
  },
})

// M10 — notify-product-flagged accepts ai_flagged payload
Deno.test({
  name: 'M10 — notify-product-flagged handles ai_flagged=true without error',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // This tests the email function in isolation — it may fail to send
    // (Postmark not configured locally) but should not return 500 on bad parsing
    const res = await fetch(NOTIFY_FN_URL, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        seller_id: 'a1111111-1111-1111-1111-111111111111',
        seller_email: 'test@example.com',
        seller_name: 'Sam Test',
        product_name: 'Test Tomatoes',
        product_id: '00000000-0000-0000-0000-000000000001',
        flag_count: 0,
        ai_flagged: true,
        ai_reason: 'Product description contains prohibited content.',
      }),
    })
    // Accept 200 (sent) or any non-500 (Postmark not configured locally is OK)
    const body = await res.text()
    assert(
      res.status !== 500,
      `notify-product-flagged returned 500 — parsing error: ${body}`,
    )
    console.log(`✅ M10 notify-product-flagged response: ${res.status}`)
  },
})
