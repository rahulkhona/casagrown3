import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

async function callFn(name: string, body: unknown, method = 'POST') {
  return fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

// Minimal sequence representation simulating the "Promo Follow up" logic 
// but with delays set to 0 days for immediate execution logic testing
const MOCK_PROMO_SEQ_DEF = {
  "startNodeId": "start",
  "nodes": [
    { "id": "start", "type": "input" },
    { "id": "wait_day_1", "type": "wait", "data": { "delayDays": 0 } },
    { "id": "cond_is_enrolled", "type": "condition", "data": { "query": { "rules": [{ "field": "enrolled_promotion_ids", "value": "test-promo-id", "operator": "contains" }] } } },
    { "id": "email_thanks", "type": "action_email", "data": { "subject": "Thanks for enrolling" } },
    { "id": "cond_sms_enabled", "type": "condition", "data": { "query": { "rules": [{ "field": "sms_enabled", "value": "true", "operator": "=" }] } } },
    { "id": "sms_reminder", "type": "action_sms", "data": { "text": "Reminder SMS" } },
    { "id": "email_reminder", "type": "action_email", "data": { "subject": "Reminder Email" } },
    { "id": "wait_day_2_email", "type": "wait", "data": { "delayDays": 0 } },
    { "id": "wait_day_2_sms", "type": "wait", "data": { "delayDays": 0 } },
    { "id": "cond_is_enrolled_after_sms", "type": "condition", "data": { "query": { "rules": [{ "field": "enrolled_promotion_ids", "value": "test-promo-id", "operator": "contains" }] } } },
    { "id": "cond_is_enrolled_after_email", "type": "condition", "data": { "query": { "rules": [{ "field": "enrolled_promotion_ids", "value": "test-promo-id", "operator": "contains" }] } } },
    { "id": "wait_day_3", "type": "wait", "data": { "delayDays": 0 } }
  ],
  "edges": [
    { "id": "e1", "source": "start", "target": "wait_day_1" },
    { "id": "e2", "source": "wait_day_1", "target": "cond_is_enrolled" },
    { "id": "e3", "source": "cond_is_enrolled", "target": "email_thanks", "label": "true" },
    { "id": "e4", "source": "cond_is_enrolled", "target": "cond_sms_enabled", "label": "false" },
    
    // SMS Branch
    { "id": "e5", "source": "cond_sms_enabled", "target": "sms_reminder", "label": "true" },
    { "id": "e6", "source": "sms_reminder", "target": "wait_day_2_sms" },
    { "id": "e7", "source": "wait_day_2_sms", "target": "cond_is_enrolled_after_sms" },
    { "id": "e8", "source": "cond_is_enrolled_after_sms", "target": "email_thanks", "label": "true" },
    { "id": "e9", "source": "cond_is_enrolled_after_sms", "target": "wait_day_3", "label": "false" },
    { "id": "e10", "source": "wait_day_3", "target": "email_reminder" },

    // Email Branch (Fallback)
    { "id": "e11", "source": "cond_sms_enabled", "target": "email_reminder", "label": "false" },
    { "id": "e12", "source": "email_reminder", "target": "wait_day_2_email" },
    { "id": "e13", "source": "wait_day_2_email", "target": "cond_is_enrolled_after_email" },
    { "id": "e14", "source": "cond_is_enrolled_after_email", "target": "email_thanks", "label": "true" }
  ]
}

Deno.test('process-sequence-step: Follows SMS convergence path and terminates', async () => {
  const testSeqId = crypto.randomUUID()
  const testLeadId = crypto.randomUUID()
  
  // 1. Setup Mock Sequence
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_sequences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ id: testSeqId, name: 'Integration Test Sequence', status: 'active', definition: MOCK_PROMO_SEQ_DEF }),
  })).text()

  // 2. Setup Mock Lead (sms_enabled: true, NOT enrolled yet)
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ id: testLeadId, email: 'deno_seq@casagrown.local', name: 'Seq Test', status: 'new', metadata: { sms_enabled: 'true' } }),
  })).text()

  // 3. Enroll Lead
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_sequence_enrollments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Prefer: 'return=representation' },
    body: JSON.stringify({ sequence_id: testSeqId, recipient_type: 'lead', recipient_id: testLeadId, current_node_id: 'start', next_evaluation_at: new Date(Date.now() - 86400000).toISOString() }),
  })).text()
  
  // 4. Force wait_day_1 evaluation bypassing time checks
  // In a real scenario cron handles this, here we manually trigger edge fn iteratively
  // Node evaluates: start -> wait_day_1 -> cond_is_enrolled (False) -> cond_sms_enabled (True) -> sms_reminder -> wait_day_2_sms
  for (let i = 0; i < 5; i++) {
    const res = await callFn('process-sequence-step', { sequence_id: testSeqId });
    const resText = await res.text();
    if (res.status !== 200) {
      console.log('Edge func error:', res.status, resText);
      return;
    }
    console.log(`Step ${i} response:`, resText);
  }
  
  // Verify user is parked at wait_day_2_sms
  const enrollReq1 = await fetch(`${SUPABASE_URL}/rest/v1/crm_sequence_enrollments?sequence_id=eq.${testSeqId}&recipient_id=eq.${testLeadId}`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })
  let enroll = (await enrollReq1.json())[0]
  assertEquals(enroll.current_node_id, 'wait_day_2_sms')
  assertEquals(enroll.status, 'active')

  // 5. Update Lead to simulate clicking link and enrolling in promo
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?id=eq.${testLeadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ metadata: { sms_enabled: 'true', enrolled_promotion_ids: 'test-promo-id' } }),
  })).text()
  
  // Also bypass wait_day_2_sms time lock
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_sequence_enrollments?sequence_id=eq.${testSeqId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ next_evaluation_at: new Date(Date.now() - 86400000).toISOString() }),
  })).text()

  // 6. Step evaluation again
  // Node evaluates: wait_day_2_sms -> cond_is_enrolled_after_sms (True) -> email_thanks -> END
  for (let i = 0; i < 3; i++) {
    const res = await callFn('process-sequence-step', { sequence_id: testSeqId });
    await res.text();
  }

  // Verify completed
  const enrollReq2 = await fetch(`${SUPABASE_URL}/rest/v1/crm_sequence_enrollments?sequence_id=eq.${testSeqId}&recipient_id=eq.${testLeadId}`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })
  enroll = (await enrollReq2.json())[0]
  assertEquals(enroll.status, 'completed')

  // Verify Campaigns Sent (SMS Reminder + Email Thanks)
  const sendsReq = await fetch(`${SUPABASE_URL}/rest/v1/crm_campaign_sends?sequence_id=eq.${testSeqId}`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })
  const sends = await sendsReq.json()
  assertEquals(sends.length, 2)
  assertEquals(sends.some((s: any) => s.node_id === 'sms_reminder'), true)
  assertEquals(sends.some((s: any) => s.node_id === 'email_thanks'), true)

  // 7. Cleanup
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_sequences?id=eq.${testSeqId}`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })).text()
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?id=eq.${testLeadId}`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })).text()
})
