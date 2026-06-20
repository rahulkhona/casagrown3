/**
 * CRM Sequences — Integration Tests
 *
 * Tests:
 * 1. Sequences support adding test_emails and test_phones fields.
 * 2. Short links support sequence_id and node_id tracking columns.
 *
 * Run: cd apps/next-admin && npx vitest run __tests__/crm-sequences.test.ts
 */
import { describe, test, expect, afterAll } from 'vitest'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const HEADERS_SR = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Prefer': 'return=representation',
}

const createdSequenceIds: string[] = []
const createdShortLinks: string[] = []

afterAll(async () => {
  // Clean up short links
  for (const token of createdShortLinks) {
    await fetch(`${SUPABASE_URL}/rest/v1/crm_short_links?token=eq.${token}`, {
      method: 'DELETE',
      headers: HEADERS_SR,
    })
  }

  // Clean up sequences
  for (const id of createdSequenceIds) {
    await fetch(`${SUPABASE_URL}/rest/v1/crm_sequences?id=eq.${id}`, {
      method: 'DELETE',
      headers: HEADERS_SR,
    })
  }
})

describe('CRM Sequences Integration', () => {
  let seqId = ''

  test('creates a sequence with test emails and phone numbers', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_sequences`, {
      method: 'POST',
      headers: HEADERS_SR,
      body: JSON.stringify({
        name: `Integration Test Sequence - ${Date.now()}`,
        status: 'active',
        trigger_event: null,
        test_emails: ['test_seq_email@social.com', 'admin_seq_email@social.com'],
        test_phones: ['+15559876', '+15551234'],
        definition: {
          nodes: [
            { id: 'start', type: 'input', data: { label: 'Start (Trigger)' } }
          ],
          edges: [],
          startNodeId: 'start'
        }
      }),
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data[0].id).toBeDefined()
    seqId = data[0].id
    createdSequenceIds.push(seqId)

    expect(data[0].test_emails).toContain('test_seq_email@social.com')
    expect(data[0].test_phones).toContain('+15559876')
  })

  test('updates sequence test emails and phone numbers', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_sequences?id=eq.${seqId}`, {
      method: 'PATCH',
      headers: HEADERS_SR,
      body: JSON.stringify({
        test_emails: ['new_seq_email@social.com'],
        test_phones: ['+15550000'],
      }),
    })

    expect(res.status).toBe(200)

    const fetchRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_sequences?id=eq.${seqId}`, {
      headers: HEADERS_SR,
    })
    const data = await fetchRes.json()
    expect(data[0].test_emails).toEqual(['new_seq_email@social.com'])
    expect(data[0].test_phones).toEqual(['+15550000'])
  })

  test('creates a crm short link with sequence_id and node_id', async () => {
    const token = `tslink_${Math.floor(Math.random() * 100000)}`
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_short_links`, {
      method: 'POST',
      headers: HEADERS_SR,
      body: JSON.stringify({
        token,
        destination_url: 'https://casagrown.com/growbot',
        sequence_id: seqId,
        node_id: 'action_node_1',
        label: 'Test Link for Sequence node'
      }),
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data[0].token).toBe(token)
    createdShortLinks.push(token)

    expect(data[0].sequence_id).toBe(seqId)
    expect(data[0].node_id).toBe('action_node_1')
  })
})
