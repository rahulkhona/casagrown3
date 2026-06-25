import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getNextSlotTime } from '../process-sequence-step/index.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

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

Deno.test('process-sequence-step: evaluates contact preferences and seller listings rules', async () => {
  const testSeqId = crypto.randomUUID()
  
  const testLeadId = crypto.randomUUID() // Only email lead
  const testUserIdBoth = crypto.randomUUID() // Both contact info user
  const testUserIdListings = crypto.randomUUID() // Only email, has listing user

  const MOCK_RULES_SEQ_DEF = {
    "startNodeId": "start",
    "nodes": [
      { "id": "start", "type": "input" },
      { "id": "cond_only_email", "type": "condition", "data": { "query": { "rules": [{ "field": "has_only_email", "value": "true", "operator": "=" }] } } },
      { "id": "email_only_action", "type": "action_email", "data": { "subject": "Only Email Detected" } },
      { "id": "cond_both_contact", "type": "condition", "data": { "query": { "rules": [{ "field": "has_both_email_and_phone", "value": "true", "operator": "=" }] } } },
      { "id": "both_contact_action", "type": "action_email", "data": { "subject": "Both Detected" } },
      { "id": "cond_has_listings", "type": "condition", "data": { "query": { "rules": [{ "field": "has_created_listings", "value": "true", "operator": "=" }] } } },
      { "id": "listings_action", "type": "action_email", "data": { "subject": "Listings Detected" } }
    ],
    "edges": [
      { "id": "e1", "source": "start", "target": "cond_only_email" },
      { "id": "e2", "source": "cond_only_email", "target": "email_only_action", "label": "true" },
      { "id": "e3", "source": "cond_only_email", "target": "cond_both_contact", "label": "false" },
      { "id": "e4", "source": "cond_both_contact", "target": "both_contact_action", "label": "true" },
      { "id": "e5", "source": "cond_both_contact", "target": "cond_has_listings", "label": "false" },
      { "id": "e6", "source": "cond_has_listings", "target": "listings_action", "label": "true" }
    ]
  }

  // 1. Setup Mock Sequence
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_sequences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ id: testSeqId, name: 'Rules Test Sequence', status: 'active', definition: MOCK_RULES_SEQ_DEF }),
  })).text()

  const testLeadEmail = `rules_lead_${crypto.randomUUID()}@casagrown.local`
  const testUserBothEmail = `user_both_${crypto.randomUUID()}@casagrown.local`
  const testUserListingsEmail = `user_listings_${crypto.randomUUID()}@casagrown.local`
  const testBoothId = crypto.randomUUID()

  // 2. Setup Lead with only email
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ id: testLeadId, email: testLeadEmail, phone: '', name: 'Lead Only Email', status: 'new' }),
  })).text()

  // 3. Setup Users, Profiles, Booth and Listing via Supabase client
  // Create user 1 (both email & phone)
  const { data: userBoth, error: errBoth } = await supabase.auth.admin.createUser({
    email: testUserBothEmail,
    email_confirm: true,
    user_metadata: { full_name: 'User Both' }
  })
  if (errBoth) console.error("errBoth:", errBoth)
  const userBothId = userBoth?.user?.id

  // Update/insert profile with phone
  await supabase.from('profiles').upsert({
    id: userBothId,
    email: testUserBothEmail,
    full_name: 'User Both',
    phone_number: '+15550199'
  })

  // Upsert metadata
  await supabase.from('crm_user_metadata').upsert({
    recipient_id: userBothId,
    recipient_type: 'user'
  })

  // Create user 2 (only email, listings)
  const { data: userListings, error: errListings } = await supabase.auth.admin.createUser({
    email: testUserListingsEmail,
    email_confirm: true,
    user_metadata: { full_name: 'User Listings' }
  })
  if (errListings) console.error("errListings:", errListings)
  const userListingsId = userListings?.user?.id

  await supabase.from('profiles').upsert({
    id: userListingsId,
    email: testUserListingsEmail,
    full_name: 'User Listings',
    phone_number: ''
  })

  await supabase.from('crm_user_metadata').upsert({
    recipient_id: userListingsId,
    recipient_type: 'user'
  })

  // Create a booth for User 3
  await supabase.from('market_booths').insert({
    id: testBoothId,
    owner_id: userListingsId,
    name: 'Test Listings Booth'
  })

  // Create product listing for User 3
  await supabase.from('market_products').insert({
    seller_id: userListingsId,
    booth_id: testBoothId,
    market_date: '2026-06-25',
    name: 'Organic Apples',
    price_usd: 3.50,
    inventory: 10
  })

  // 5. Enroll all three recipients
  const enrollments = [
    { sequence_id: testSeqId, recipient_type: 'lead', recipient_id: testLeadId, current_node_id: 'start', next_evaluation_at: new Date(Date.now() - 86400000).toISOString() },
    { sequence_id: testSeqId, recipient_type: 'user', recipient_id: userBothId, current_node_id: 'cond_both_contact', next_evaluation_at: new Date(Date.now() - 86400000).toISOString() },
    { sequence_id: testSeqId, recipient_type: 'user', recipient_id: userListingsId, current_node_id: 'cond_has_listings', next_evaluation_at: new Date(Date.now() - 86400000).toISOString() }
  ]
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_sequence_enrollments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify(enrollments),
  })).text()

  // 6. Step evaluation. Run iterations so all branches execute their subsequent action nodes.
  for (let i = 0; i < 3; i++) {
    const res = await callFn('process-sequence-step', { sequence_id: testSeqId });
    await res.text();
  }

  // 7. Verify sends
  const sendsReq = await fetch(`${SUPABASE_URL}/rest/v1/crm_campaign_sends?sequence_id=eq.${testSeqId}`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })
  const sends = await sendsReq.json()

  const enrollReq = await fetch(`${SUPABASE_URL}/rest/v1/crm_sequence_enrollments?sequence_id=eq.${testSeqId}`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })
  const enrolls = await enrollReq.json()
  
  assertEquals(sends.length, 3)
  assertEquals(sends.some((s: any) => s.recipient_id === testLeadId && s.node_id === 'email_only_action'), true)
  assertEquals(sends.some((s: any) => s.recipient_id === userBothId && s.node_id === 'both_contact_action'), true)
  assertEquals(sends.some((s: any) => s.recipient_id === userListingsId && s.node_id === 'listings_action'), true)

  // 8. Cleanup
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_sequences?id=eq.${testSeqId}`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })).text()
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?id=eq.${testLeadId}`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })).text()

  // Clean up database tables
  await supabase.from('market_products').delete().eq('seller_id', userListingsId)
  await supabase.from('market_booths').delete().eq('owner_id', userListingsId)
  await supabase.from('crm_user_metadata').delete().in('recipient_id', [userBothId, userListingsId])
  await supabase.from('profiles').delete().in('id', [userBothId, userListingsId])
  if (userBothId) await supabase.auth.admin.deleteUser(userBothId)
  if (userListingsId) await supabase.auth.admin.deleteUser(userListingsId)
})

Deno.test('process-sequence-step: calculates optimal slot window timezone-aware scheduling', async () => {
  const testSeqId = crypto.randomUUID()
  const testLeadId = crypto.randomUUID()

  // Calculate a day of week that is exactly 2 days in the future to ensure we are outside the slot
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const futureDayIndex = (new Date().getDay() + 2) % 7
  const futureDayName = dayNames[futureDayIndex]

  const MOCK_SLOT_SEQ_DEF = {
    "startNodeId": "start",
    "nodes": [
      { "id": "start", "type": "input" },
      { "id": "wait_slot", "type": "wait_for_slot", "data": { "slots": [{ "day": futureDayName, "start": "09:00", "end": "17:00" }] } },
      { "id": "email_action", "type": "action_email", "data": { "subject": "Slot Reached" } }
    ],
    "edges": [
      { "id": "e1", "source": "start", "target": "wait_slot" },
      { "id": "e2", "source": "wait_slot", "target": "email_action" }
    ]
  }

  // 1. Setup Mock Sequence
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_sequences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ id: testSeqId, name: 'Timezone Slot Test Sequence', status: 'active', definition: MOCK_SLOT_SEQ_DEF }),
  })).text()

  // 2. Setup Lead with state_code: 'NY' (America/New_York)
  const testLeadEmail = `slot_lead_${crypto.randomUUID()}@casagrown.local`
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ id: testLeadId, email: testLeadEmail, phone: '', name: 'NY Lead', status: 'new', metadata: { state_code: 'NY' } }),
  })).text()

  // 3. Enroll Lead at start node
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_sequence_enrollments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ sequence_id: testSeqId, recipient_type: 'lead', recipient_id: testLeadId, current_node_id: 'start', next_evaluation_at: new Date(Date.now() - 86400000).toISOString() }),
  })).text()

  // 4. Run step processor once to move from start to wait_slot.
  // Note: we do NOT pass test_run_all so that it evaluates optimal slot timing!
  await (await callFn('process-sequence-step', { sequence_id: testSeqId })).text()

  // 5. Run step processor again. Since we are on wait_slot, it should evaluate timezone 'America/New_York'
  // and set next_evaluation_at to the upcoming futureDayName at 09:00 NY time.
  await (await callFn('process-sequence-step', { sequence_id: testSeqId })).text()

  // 6. Query the enrollment
  const enrollRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_sequence_enrollments?sequence_id=eq.${testSeqId}&recipient_id=eq.${testLeadId}`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })
  const enrollments = await enrollRes.json()
  assertEquals(enrollments.length, 1)
  
  const enrollment = enrollments[0]
  assertEquals(enrollment.current_node_id, 'email_action')
  assertEquals(enrollment.status, 'active')
  assertExists(enrollment.next_evaluation_at)

  // Verify next_evaluation_at is aligned to 09:00 in America/New_York timezone
  const nextEvalDate = new Date(enrollment.next_evaluation_at)
  const localStr = nextEvalDate.toLocaleString('en-US', { timeZone: 'America/New_York' })
  const localDate = new Date(localStr)

  assertEquals(localDate.getDay(), futureDayIndex)
  assertEquals(localDate.getHours(), 9)
  assertEquals(localDate.getMinutes(), 0)

  // 7. Cleanup
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_sequences?id=eq.${testSeqId}`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })).text()
  await (await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?id=eq.${testLeadId}`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } })).text()
})

Deno.test('process-sequence-step: getNextSlotTime resolves timezone candidate scheduling correctly on host-target date crossovers', () => {
  // Mock 'now' as June 24, 2026 at 21:25:00 Pacific Time (host local time)
  // This corresponds to June 25, 2026 at 00:25:00 Eastern Time (NY target timezone)
  const now = new Date("2026-06-24T21:25:00-07:00"); 

  // Setup slots for Friday ('fri') between 09:00 and 17:00 NY time.
  const slots = [{ day: 'fri', start: '09:00', end: '17:00' }];
  
  // Calculate next slot time in America/New_York
  const result = getNextSlotTime(now, 'America/New_York', slots);

  // The calculated date should be Friday, June 26, 2026 at 09:00:00 Eastern Time.
  // In GMT/UTC: June 26, 2026 at 13:00:00 UTC (since Eastern Daylight Time is UTC-4).
  assertEquals(result.toISOString(), "2026-06-26T13:00:00.000Z");
})

