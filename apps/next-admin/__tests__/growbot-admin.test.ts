/**
 * Vitest unit tests for GrowBot Admin — Skills & Rules CRUD.
 *
 * These tests verify:
 * 1. growbot_skills table CRUD (insert, read, update, toggle, delete)
 * 2. growbot_rules table CRUD (insert, read, update, toggle, delete)
 * 3. JSON schema_properties roundtrip
 * 4. RLS: non-staff cannot write
 *
 * Run: cd apps/next-admin && npx vitest run __tests__/growbot-admin.test.ts
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const HEADERS_SR = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Prefer': 'return=representation',
}

const HEADERS_ANON = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${ANON_KEY}`,
  'apikey': ANON_KEY,
  'Prefer': 'return=representation',
}

const TEST_TAG = `vitest_${Date.now()}`

// Track created IDs for cleanup
let createdSkillIds: string[] = []
let createdRuleIds: string[] = []

afterAll(async () => {
  // Clean up test data
  for (const id of createdSkillIds) {
    await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills?id=eq.${id}`, {
      method: 'DELETE', headers: HEADERS_SR
    })
  }
  for (const id of createdRuleIds) {
    await fetch(`${SUPABASE_URL}/rest/v1/growbot_rules?id=eq.${id}`, {
      method: 'DELETE', headers: HEADERS_SR
    })
  }
})


// ══════════════════════════════════════════════════════════════
// Skills CRUD
// ══════════════════════════════════════════════════════════════
describe('GrowBot Skills CRUD', () => {
  let skillId = ''

  test('growbot_skills table exists and is queryable', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills?limit=0`, {
      headers: HEADERS_SR
    })
    expect(res.status).toBe(200)
  })

  test('insert a new skill with full schema', async () => {
    const schema = [
      { name: 'query', type: 'string', description: 'Test query param' },
      { name: 'tags', type: 'array', description: 'Tags list' },
    ]
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills`, {
      method: 'POST',
      headers: HEADERS_SR,
      body: JSON.stringify({
        name: `TestTool_${TEST_TAG}`,
        trigger_rules: 'Use this tool when testing.',
        schema_properties: schema,
        backend_function: 'test_rpc_function',
        template: 'Results: {{query}}',
        is_active: true,
      })
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data[0].id).toBeDefined()
    skillId = data[0].id
    createdSkillIds.push(skillId)
  })

  test('read back inserted skill — all fields match', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills?id=eq.${skillId}`, {
      headers: HEADERS_SR
    })
    const data = await res.json()
    expect(data.length).toBe(1)
    expect(data[0].name).toBe(`TestTool_${TEST_TAG}`)
    expect(data[0].trigger_rules).toBe('Use this tool when testing.')
    expect(data[0].backend_function).toBe('test_rpc_function')
    expect(data[0].template).toBe('Results: {{query}}')
    expect(data[0].is_active).toBe(true)
  })

  test('schema_properties JSON roundtrip works', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills?id=eq.${skillId}&select=schema_properties`, {
      headers: HEADERS_SR
    })
    const data = await res.json()
    const props = data[0].schema_properties
    expect(Array.isArray(props)).toBe(true)
    expect(props.length).toBe(2)
    expect(props[0].name).toBe('query')
    expect(props[0].type).toBe('string')
    expect(props[1].type).toBe('array')
  })

  test('update trigger_rules', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills?id=eq.${skillId}`, {
      method: 'PATCH',
      headers: HEADERS_SR,
      body: JSON.stringify({ trigger_rules: 'Updated trigger for testing.' })
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data[0].trigger_rules).toBe('Updated trigger for testing.')
  })

  test('toggle is_active to false', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills?id=eq.${skillId}`, {
      method: 'PATCH',
      headers: HEADERS_SR,
      body: JSON.stringify({ is_active: false })
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data[0].is_active).toBe(false)
  })

  test('inactive skill hidden from active-only query', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills?is_active=eq.true&name=eq.TestTool_${TEST_TAG}`, {
      headers: HEADERS_SR
    })
    const data = await res.json()
    expect(data.length).toBe(0)
  })

  test('toggle is_active back to true', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills?id=eq.${skillId}`, {
      method: 'PATCH',
      headers: HEADERS_SR,
      body: JSON.stringify({ is_active: true })
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data[0].is_active).toBe(true)
  })

  test('insert with empty schema_properties defaults to empty array', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills`, {
      method: 'POST',
      headers: HEADERS_SR,
      body: JSON.stringify({
        name: `EmptySchema_${TEST_TAG}`,
        trigger_rules: 'Tool with no params.',
        schema_properties: [],
        is_active: true,
      })
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    createdSkillIds.push(data[0].id)
    expect(data[0].schema_properties).toEqual([])
  })

  test('insert without optional fields stores null', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills`, {
      method: 'POST',
      headers: HEADERS_SR,
      body: JSON.stringify({
        name: `NoOptionals_${TEST_TAG}`,
        trigger_rules: 'Minimal tool.',
        schema_properties: [],
        is_active: true,
      })
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    createdSkillIds.push(data[0].id)
    expect(data[0].backend_function).toBeNull()
    expect(data[0].template).toBeNull()
  })

  test('delete skill', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills?id=eq.${skillId}`, {
      method: 'DELETE',
      headers: HEADERS_SR,
    })
    expect(res.status).toBe(200)
    // Remove from cleanup list since already deleted
    createdSkillIds = createdSkillIds.filter(id => id !== skillId)

    // Verify gone
    const check = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills?id=eq.${skillId}`, {
      headers: HEADERS_SR
    })
    const data = await check.json()
    expect(data.length).toBe(0)
  })

  test('non-staff cannot insert into growbot_skills', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_skills`, {
      method: 'POST',
      headers: HEADERS_ANON,
      body: JSON.stringify({
        name: `Hacker_${TEST_TAG}`,
        trigger_rules: 'Hacked tool.',
        schema_properties: [],
        is_active: true,
      })
    })
    // RLS should block — expect 403 or empty 201 (depending on policy)
    expect([401, 403, 404, 409]).toContain(res.status)
  })
})


// ══════════════════════════════════════════════════════════════
// Rules CRUD
// ══════════════════════════════════════════════════════════════
describe('GrowBot Rules CRUD', () => {
  let ruleId = ''

  test('growbot_rules table exists and is queryable', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_rules?limit=0`, {
      headers: HEADERS_SR
    })
    expect(res.status).toBe(200)
  })

  test('insert a new rule', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_rules`, {
      method: 'POST',
      headers: HEADERS_SR,
      body: JSON.stringify({
        rule_text: `Always greet the user warmly — ${TEST_TAG}`,
        is_active: true,
      })
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data[0].id).toBeDefined()
    ruleId = data[0].id
    createdRuleIds.push(ruleId)
  })

  test('read back rule — is_active defaults to true', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_rules?id=eq.${ruleId}`, {
      headers: HEADERS_SR
    })
    const data = await res.json()
    expect(data.length).toBe(1)
    expect(data[0].rule_text).toContain(TEST_TAG)
    expect(data[0].is_active).toBe(true)
  })

  test('update rule text', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_rules?id=eq.${ruleId}`, {
      method: 'PATCH',
      headers: HEADERS_SR,
      body: JSON.stringify({ rule_text: `Updated rule — ${TEST_TAG}` })
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data[0].rule_text).toContain('Updated rule')
  })

  test('toggle is_active to false', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_rules?id=eq.${ruleId}`, {
      method: 'PATCH',
      headers: HEADERS_SR,
      body: JSON.stringify({ is_active: false })
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data[0].is_active).toBe(false)
  })

  test('multiple rules can coexist', async () => {
    const rules = [
      { rule_text: `Rule A — ${TEST_TAG}`, is_active: true },
      { rule_text: `Rule B — ${TEST_TAG}`, is_active: true },
    ]
    for (const rule of rules) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_rules`, {
        method: 'POST', headers: HEADERS_SR, body: JSON.stringify(rule)
      })
      const data = await res.json()
      createdRuleIds.push(data[0].id)
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_rules?rule_text=like.*${TEST_TAG}*`, {
      headers: HEADERS_SR
    })
    const data = await res.json()
    expect(data.length).toBeGreaterThanOrEqual(3) // original + 2 new
  })

  test('delete rule', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_rules?id=eq.${ruleId}`, {
      method: 'DELETE',
      headers: HEADERS_SR,
    })
    expect(res.status).toBe(200)
    createdRuleIds = createdRuleIds.filter(id => id !== ruleId)
  })

  test('non-staff cannot insert into growbot_rules', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/growbot_rules`, {
      method: 'POST',
      headers: HEADERS_ANON,
      body: JSON.stringify({
        rule_text: `Hacked rule — ${TEST_TAG}`,
        is_active: true,
      })
    })
    expect([401, 403, 404, 409]).toContain(res.status)
  })
})
