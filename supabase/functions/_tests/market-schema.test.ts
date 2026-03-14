/**
 * Market Schema Integration Tests
 *
 * Verifies market_booths and market_products CRUD operations and
 * constraints against the local Supabase instance.
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/market-schema.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Service role client for setup/teardown
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.test({
  name: 'market_booths: insert and verify',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { data: users } = await adminClient.auth.admin.listUsers()
    assertExists(users?.users?.[0], 'Need at least one user in auth.users')
    const userId = users.users[0].id

    await adminClient.from('market_booths').delete().eq('owner_id', userId)

    const { data: booth, error } = await adminClient
      .from('market_booths')
      .insert({
        owner_id: userId,
        name: 'Test Market Booth',
        description: 'Integration test booth',
        decorative_theme: 'rustic',
        market_day_of_week: 6, // Saturday
      })
      .select()
      .single()

    assertEquals(error, null, `Insert should succeed: ${error?.message}`)
    assertExists(booth)
    assertEquals(booth.name, 'Test Market Booth')
    assertEquals(booth.market_day_of_week, 6)

    await adminClient.from('market_booths').delete().eq('id', booth.id)
  },
})

Deno.test({
  name: 'market_booths: unique constraint on owner_id',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { data: users } = await adminClient.auth.admin.listUsers()
    const userId = users!.users[0].id

    await adminClient.from('market_booths').delete().eq('owner_id', userId)

    const { data: booth1 } = await adminClient
      .from('market_booths')
      .insert({ owner_id: userId, name: 'Booth 1' })
      .select()
      .single()
    assertExists(booth1)

    const { error } = await adminClient
      .from('market_booths')
      .insert({ owner_id: userId, name: 'Booth 2' })
      .select()
      .single()

    assertExists(error, 'Duplicate owner_id should fail')

    await adminClient.from('market_booths').delete().eq('id', booth1!.id)
  },
})

Deno.test({
  name: 'market_products: per-market-day product CRUD',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { data: users } = await adminClient.auth.admin.listUsers()
    const userId = users!.users[0].id

    await adminClient.from('market_booths').delete().eq('owner_id', userId)

    const { data: booth } = await adminClient
      .from('market_booths')
      .insert({ owner_id: userId, name: 'Product Test Booth' })
      .select()
      .single()
    assertExists(booth)

    // market_date is required
    const { data: product, error } = await adminClient
      .from('market_products')
      .insert({
        booth_id: booth!.id,
        market_date: '2026-03-15', // Next Saturday
        name: 'Fresh Tomatoes',
        category: 'produce',
        price_usd: 3.50,
        unit: 'lb',
        inventory: 20,
      })
      .select()
      .single()

    assertEquals(error, null, `Product insert: ${error?.message}`)
    assertExists(product)
    assertEquals(product.name, 'Fresh Tomatoes')
    assertEquals(product.market_date, '2026-03-15')

    // Cascade deletes products
    await adminClient.from('market_booths').delete().eq('id', booth!.id)
  },
})

Deno.test({
  name: 'market_products: requires market_date',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { data: users } = await adminClient.auth.admin.listUsers()
    const userId = users!.users[0].id

    await adminClient.from('market_booths').delete().eq('owner_id', userId)

    const { data: booth } = await adminClient
      .from('market_booths')
      .insert({ owner_id: userId, name: 'Date Test Booth' })
      .select()
      .single()
    assertExists(booth)

    // Omitting market_date should fail (NOT NULL)
    const { error } = await adminClient
      .from('market_products')
      .insert({
        booth_id: booth!.id,
        name: 'No Date Product',
        price_usd: 5.00,
      })
      .select()
      .single()

    assertExists(error, 'Missing market_date should fail')

    await adminClient.from('market_booths').delete().eq('id', booth!.id)
  },
})
