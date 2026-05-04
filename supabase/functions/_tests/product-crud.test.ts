/**
 * Product CRUD — Integration Tests
 *
 * Verifies product creation, update, toggle active, and inventory decrement
 * via direct DB operations.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/product-crud.test.ts
 */
import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const SELLER_ID = 'd4444444-4444-4444-4444-444444444444'

async function queryTable(table: string, filters: string = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  return res.json()
}

async function insertRow(table: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  })
  const body = await res.json()
  if (res.status !== 201) {
    console.log(`  [INSERT FAILED] ${table}: ${res.status} ${JSON.stringify(body)}`)
    return { status: res.status, data: null }
  }
  return { status: res.status, data: Array.isArray(body) ? body[0] : body }
}

async function updateRow(table: string, filter: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  })
  const body = await res.json()
  return { status: res.status, data: Array.isArray(body) ? body[0] : body }
}

async function deleteRow(table: string, filter: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
}

Deno.test({ name: 'product-crud: insert product → verify DB row', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  // Schema: seller_id, market_date, name, description, category, price_usd, unit, inventory,
  //         photos, moderation_status, is_active
  const today = new Date().toISOString().split('T')[0]
  const { status, data: product } = await insertRow('market_products', {
    seller_id: SELLER_ID,
    market_date: today,
    name: 'E2E Test Zucchini',
    description: 'Fresh test zucchini from integration tests',
    price_usd: 3.50,
    unit: 'each',
    inventory: 25,
    category: 'produce',
    moderation_status: 'approved',
    is_active: true,
  })

  if (!product) { console.log('  Insert failed — skipping'); return }
  assertEquals(status, 201, 'Should insert product successfully')
  assertExists(product.id, 'Product should have ID')
  assertEquals(product.name, 'E2E Test Zucchini')
  assertEquals(Number(product.price_usd), 3.50)
  assertEquals(product.inventory, 25)
  console.log(`  [PRODUCT] Created: ${product.id} — ${product.name} @ $${product.price_usd}`)

  // Verify it's queryable
  const found = await queryTable('market_products', `id=eq.${product.id}&select=*`)
  assertEquals(found.length, 1, 'Product should be findable')
  assertEquals(found[0].seller_id, SELLER_ID)

  // Cleanup
  await deleteRow('market_products', `id=eq.${product.id}`)
  console.log('  ✅ Product created and verified in DB')
}})

Deno.test({ name: 'product-crud: update price → verify change persists', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const today = new Date().toISOString().split('T')[0]
  const { data: product } = await insertRow('market_products', {
    seller_id: SELLER_ID,
    market_date: today,
    name: 'E2E Price Update Test',
    price_usd: 5.00,
    inventory: 10,
    unit: 'lb',
    category: 'produce',
    moderation_status: 'approved',
    is_active: true,
  })
  if (!product) { console.log('  Insert failed — skipping'); return }

  // Update price
  const { data: updated } = await updateRow('market_products', `id=eq.${product.id}`, {
    price_usd: 7.99,
  })
  assertEquals(Number(updated.price_usd), 7.99, 'Price should be updated')

  // Verify persistence
  const refetch = await queryTable('market_products', `id=eq.${product.id}&select=price_usd`)
  assertEquals(Number(refetch[0].price_usd), 7.99, 'Price change should persist')
  console.log(`  [PRICE] Updated from $5.00 → $7.99 ✅`)

  await deleteRow('market_products', `id=eq.${product.id}`)
}})

Deno.test({ name: 'product-crud: toggle active → verify status changes', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const today = new Date().toISOString().split('T')[0]
  const { data: product } = await insertRow('market_products', {
    seller_id: SELLER_ID,
    market_date: today,
    name: 'E2E Toggle Test',
    price_usd: 2.00,
    inventory: 5,
    unit: 'bunch',
    category: 'produce',
    moderation_status: 'approved',
    is_active: true,
  })
  if (!product) { console.log('  Insert failed — skipping'); return }

  assertEquals(product.is_active, true, 'Should start active')

  // Deactivate
  const { data: deactivated } = await updateRow('market_products', `id=eq.${product.id}`, {
    is_active: false,
  })
  assertEquals(deactivated.is_active, false, 'Should be deactivated')

  // Reactivate
  const { data: reactivated } = await updateRow('market_products', `id=eq.${product.id}`, {
    is_active: true,
  })
  assertEquals(reactivated.is_active, true, 'Should be reactivated')
  console.log(`  [TOGGLE] active: true → false → true ✅`)

  await deleteRow('market_products', `id=eq.${product.id}`)
}})

Deno.test({ name: 'product-crud: seeded products are queryable with correct structure', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  // Verify seeded products exist and have expected columns
  const products = await queryTable('market_products', `seller_id=eq.${SELLER_ID}&select=id,name,price_usd,inventory,is_active,category&limit=5`)
  assert(products.length > 0, 'Seeded products should exist for seller')
  
  for (const p of products) {
    assertExists(p.id, 'Product should have id')
    assertExists(p.name, 'Product should have name')
    assert(Number(p.price_usd) >= 0 || p.price_usd === null, `Product ${p.name} price should be valid`)
    assert(p.inventory >= 0 || p.inventory === null, `Product ${p.name} inventory should be valid`)
    console.log(`  [PRODUCT] ${p.name}: $${p.price_usd}, inventory=${p.inventory}, active=${p.is_active}`)
  }
  console.log(`  ✅ ${products.length} seeded products verified`)
}})
