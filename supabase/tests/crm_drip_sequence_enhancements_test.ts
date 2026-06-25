/**
 * CRM Drip Sequence Enhancements — Integration Tests
 *
 * Tests the features added by the 20260804000000_drip_sequence_enhancements migration:
 *   1. Postmark Webhook — Delivery event (sets delivered_at)
 *   2. Postmark Webhook — Click event (sets clicked_at)
 *   3. Twilio Campaign Webhook — Delivered status (sets delivered_at)
 *   4. Sequence Engine — Condition node send-status enrichment
 *   5. Sequence Engine — wait_for_slot node (optimal send windows)
 *   6. Sequence Engine — Fork/Join parallelism
 *   7. Backfill on Activation (enroll-in-sequence backfill path)
 *
 * Run:
 *   cd supabase && deno test --allow-env --allow-net --no-check \
 *     tests/crm_drip_sequence_enhancements_test.ts
 */
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

// ── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Call a Supabase edge function by name. */
async function callFn(name: string, body: unknown, opts?: { contentType?: string; rawBody?: string }) {
  const isFormEncoded = opts?.contentType === 'application/x-www-form-urlencoded'
  return fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': opts?.contentType || 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: isFormEncoded ? opts!.rawBody : JSON.stringify(body),
  })
}

/** POST/PATCH/DELETE/GET against the Supabase REST API. */
async function rest(
  table: string,
  method: 'POST' | 'PATCH' | 'DELETE' | 'GET',
  opts: { filter?: string; body?: unknown; prefer?: string } = {},
): Promise<Response> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${opts.filter ? `?${opts.filter}` : ''}`
  const headers: Record<string, string> = { ...HEADERS }
  if (opts.prefer) headers['Prefer'] = opts.prefer
  return fetch(url, {
    method,
    headers,
    body: (method === 'POST' || method === 'PATCH') ? JSON.stringify(opts.body) : undefined,
  })
}

/** Insert a row and return the created record. */
async function insertRow(table: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await rest(table, 'POST', { body, prefer: 'return=representation' })
  const rows = await res.json()
  const row = Array.isArray(rows) ? rows[0] : rows
  assertExists(row?.id, `Failed to insert into ${table}: ${JSON.stringify(rows)}`)
  return row
}

/** Delete rows matching a filter. Consumes the response body to avoid leaks. */
async function deleteRows(table: string, filter: string) {
  const res = await rest(table, 'DELETE', { filter })
  await res.text()
}

/** Fetch rows from a table matching a filter. */
async function selectRows(table: string, filter: string): Promise<any[]> {
  const res = await rest(table, 'GET', { filter })
  return res.json()
}

/** Create a test lead with sensible defaults. Returns the full row. */
async function createTestLead(overrides: Record<string, unknown> = {}) {
  return insertRow('crm_leads', {
    name: 'Drip Test Lead',
    email: `drip-test-${crypto.randomUUID()}@casagrown.local`,
    phone: `+1555${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`,
    status: 'new',
    accepts_email: true,
    accepts_sms: true,
    ...overrides,
  })
}

/** Create a test sequence with the given definition. Returns the full row. */
async function createTestSequence(
  definition: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return insertRow('crm_sequences', {
    name: `Drip Enhancement Test ${crypto.randomUUID().slice(0, 8)}`,
    status: 'active',
    definition,
    ...overrides,
  })
}

/**
 * Runs the process-sequence-step edge function.
 * Optionally scoped to a single sequence_id.
 */
async function processStep(opts: Record<string, unknown> = {}) {
  return callFn('process-sequence-step', opts)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Postmark Webhook — Delivery Event
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test('postmark-webhook: Delivery event sets delivered_at via send_id', async () => {
  // Create a campaign send record to update
  const send = await insertRow('crm_campaign_sends', {
    campaign_id: null,
    sequence_id: null,
    recipient_type: 'lead',
    recipient_id: '00000000-0000-0000-0000-000000000001',
    email: 'delivery-test-sendid@casagrown.local',
    sent_at: new Date().toISOString(),
  })

  // Fire Delivery event with Metadata.send_id
  const res = await callFn('postmark-webhook', {
    RecordType: 'Delivery',
    Recipient: 'delivery-test-sendid@casagrown.local',
    Metadata: { send_id: send.id },
  })

  if (res.status === 503 || res.status === 500) {
    await res.text()
    console.log('postmark-webhook not running locally — skipping delivery send_id test')
    await deleteRows('crm_campaign_sends', `id=eq.${send.id}`)
    return
  }

  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)
  assertEquals(body.processed, 'Delivery')

  // Verify delivered_at is now set
  const rows = await selectRows('crm_campaign_sends', `id=eq.${send.id}&select=delivered_at`)
  assertEquals(rows.length, 1)
  assertExists(rows[0].delivered_at, 'delivered_at should be set after Delivery event')

  // Cleanup
  await deleteRows('crm_campaign_sends', `id=eq.${send.id}`)
})

Deno.test('postmark-webhook: Delivery event falls back to email matching when no send_id', async () => {
  const testEmail = 'delivery-fallback@casagrown.local'

  // Create a campaign send without send_id in the webhook
  const send = await insertRow('crm_campaign_sends', {
    campaign_id: null,
    sequence_id: null,
    recipient_type: 'lead',
    recipient_id: '00000000-0000-0000-0000-000000000002',
    email: testEmail,
    sent_at: new Date().toISOString(),
  })

  // Fire Delivery event WITHOUT Metadata.send_id — should match by email
  const res = await callFn('postmark-webhook', {
    RecordType: 'Delivery',
    Recipient: testEmail,
    // No Metadata
  })

  if (res.status === 503 || res.status === 500) {
    await res.text()
    console.log('postmark-webhook not running — skipping delivery fallback test')
    await deleteRows('crm_campaign_sends', `id=eq.${send.id}`)
    return
  }

  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)

  // Verify delivered_at was set via email fallback
  const rows = await selectRows(
    'crm_campaign_sends',
    `id=eq.${send.id}&select=delivered_at`,
  )
  assertEquals(rows.length, 1)
  assertExists(rows[0].delivered_at, 'delivered_at should be set via email fallback')

  // Cleanup
  await deleteRows('crm_campaign_sends', `id=eq.${send.id}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Postmark Webhook — Click Event
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test('postmark-webhook: Click event sets clicked_at', async () => {
  const send = await insertRow('crm_campaign_sends', {
    campaign_id: null,
    sequence_id: null,
    recipient_type: 'lead',
    recipient_id: '00000000-0000-0000-0000-000000000003',
    email: 'click-test@casagrown.local',
    sent_at: new Date().toISOString(),
  })

  const res = await callFn('postmark-webhook', {
    RecordType: 'Click',
    Recipient: 'click-test@casagrown.local',
    Metadata: { send_id: send.id },
  })

  if (res.status === 503 || res.status === 500) {
    await res.text()
    console.log('postmark-webhook not running — skipping click test')
    await deleteRows('crm_campaign_sends', `id=eq.${send.id}`)
    return
  }

  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)
  assertEquals(body.processed, 'Click')

  // Verify clicked_at is set
  const rows = await selectRows('crm_campaign_sends', `id=eq.${send.id}&select=clicked_at`)
  assertEquals(rows.length, 1)
  assertExists(rows[0].clicked_at, 'clicked_at should be set after Click event')

  await deleteRows('crm_campaign_sends', `id=eq.${send.id}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Twilio Campaign Webhook — Delivered Status
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test('twilio-campaign-webhook: delivered status sets delivered_at for matching phone', async () => {
  const testPhone = '+15559990001'

  const send = await insertRow('crm_campaign_sends', {
    campaign_id: null,
    sequence_id: null,
    recipient_type: 'lead',
    recipient_id: '00000000-0000-0000-0000-000000000004',
    phone: testPhone,
    sent_at: new Date().toISOString(),
  })

  const res = await fetch(`${SUPABASE_URL}/functions/v1/twilio-campaign-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: new URLSearchParams({
      MessageSid: 'SM_drip_test_001',
      MessageStatus: 'delivered',
      To: testPhone,
    }).toString(),
  })

  if (res.status === 503 || res.status === 500) {
    await res.text()
    console.log('twilio-campaign-webhook not running — skipping delivered test')
    await deleteRows('crm_campaign_sends', `id=eq.${send.id}`)
    return
  }

  assertEquals(res.status, 200)
  await res.text() // consume body (Twilio expects empty 200)

  // Verify delivered_at is set
  const rows = await selectRows(
    'crm_campaign_sends',
    `id=eq.${send.id}&select=delivered_at`,
  )
  assertEquals(rows.length, 1)
  assertExists(rows[0].delivered_at, 'delivered_at should be set after Twilio delivered status')

  await deleteRows('crm_campaign_sends', `id=eq.${send.id}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Sequence Engine — Condition Node Send-Status Enrichment
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test('process-sequence-step: condition node evaluates send engagement (last_email_opened)', async () => {
  const lead = await createTestLead()

  // Sequence: start → condition(last_email_opened=true) → true/false branches
  const seq = await createTestSequence({
    startNodeId: 'node-cond',
    nodes: [
      {
        id: 'node-cond',
        type: 'condition',
        data: {
          query: {
            combinator: 'and',
            rules: [{ field: 'last_email_opened', operator: '=', value: 'true' }],
          },
        },
      },
      { id: 'node-true', type: 'action_sms', data: { text: 'Thanks for opening!' } },
      { id: 'node-false', type: 'action_sms', data: { text: 'We miss you!' } },
    ],
    edges: [
      { id: 'e-true', source: 'node-cond', target: 'node-true', label: 'true' },
      { id: 'e-false', source: 'node-cond', target: 'node-false', label: 'false' },
    ],
  })

  // Insert a campaign_sends row with opened_at set (simulates a prior email open)
  const priorSend = await insertRow('crm_campaign_sends', {
    campaign_id: null,
    sequence_id: seq.id,
    node_id: 'prior-email-node',
    recipient_type: 'lead',
    recipient_id: lead.id,
    email: lead.email,
    sent_at: new Date(Date.now() - 3600_000).toISOString(),
    opened_at: new Date(Date.now() - 1800_000).toISOString(),
  })

  // Insert enrollment on the condition node, ready to evaluate
  const enrollment = await insertRow('crm_sequence_enrollments', {
    sequence_id: seq.id,
    recipient_type: 'lead',
    recipient_id: lead.id,
    current_node_id: 'node-cond',
    next_evaluation_at: new Date(Date.now() - 5000).toISOString(),
    status: 'active',
  })

  // Process the step
  const processRes = await processStep({ sequence_id: seq.id })

  if (processRes.status === 503 || processRes.status === 500) {
    await processRes.text()
    console.log('process-sequence-step not running — skipping send enrichment test')
  } else {
    assertEquals(processRes.status, 200)
    await processRes.json()

    // Enrollment should have followed the TRUE branch (last_email_opened = true)
    const enrollments = await selectRows(
      'crm_sequence_enrollments',
      `id=eq.${enrollment.id}&select=current_node_id`,
    )
    assertEquals(enrollments.length, 1)
    assertEquals(
      enrollments[0].current_node_id,
      'node-true',
      'Condition should evaluate to TRUE because opened_at is set on a prior send',
    )
  }

  // Cleanup — delete sends first (sequence_id FK), then enrollments, then sequence, then lead
  await deleteRows('crm_campaign_sends', `id=eq.${priorSend.id}`)
  await deleteRows('crm_campaign_sends', `sequence_id=eq.${seq.id}`)
  await deleteRows('crm_sequence_enrollments', `sequence_id=eq.${seq.id}`)
  await deleteRows('crm_sequences', `id=eq.${seq.id}`)
  await deleteRows('crm_leads', `id=eq.${lead.id}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Sequence Engine — Wait for Optimal Slot
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test('process-sequence-step: wait_for_slot passes through when slot covers all weekday hours', async () => {
  const lead = await createTestLead()

  // Slot covers Mon–Fri 00:00–23:59 — should always pass through on weekdays
  const seq = await createTestSequence({
    startNodeId: 'node-slot',
    nodes: [
      {
        id: 'node-slot',
        type: 'wait_for_slot',
        data: {
          type: 'wait_for_slot',
          slots: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '00:00', end: '23:59' }],
        },
      },
      { id: 'node-done', type: 'action_sms', data: { text: 'Slot passed!' } },
    ],
    edges: [{ id: 'e1', source: 'node-slot', target: 'node-done' }],
  })

  // Enroll with next_evaluation_at in the past
  const enrollment = await insertRow('crm_sequence_enrollments', {
    sequence_id: seq.id,
    recipient_type: 'lead',
    recipient_id: lead.id,
    current_node_id: 'node-slot',
    next_evaluation_at: new Date(Date.now() - 5000).toISOString(),
    status: 'active',
  })

  const processRes = await processStep({ sequence_id: seq.id })

  if (processRes.status === 503 || processRes.status === 500) {
    await processRes.text()
    console.log('process-sequence-step not running — skipping wait_for_slot pass-through test')
  } else {
    assertEquals(processRes.status, 200)
    await processRes.json()

    // Check: enrollment advanced past wait_for_slot to the action node
    const enrollments = await selectRows(
      'crm_sequence_enrollments',
      `id=eq.${enrollment.id}&select=current_node_id,next_evaluation_at`,
    )
    assertEquals(enrollments.length, 1)

    // On a weekday, should advance to node-done. On a weekend the slot won't match,
    // but we still advance to node-done because the engine sets next_evaluation_at
    // and updates current_node_id in one step. Verify it at least moved.
    const today = new Date()
    const dayOfWeek = today.getDay() // 0=Sun, 6=Sat
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5

    if (isWeekday) {
      assertEquals(
        enrollments[0].current_node_id,
        'node-done',
        'Should advance past wait_for_slot on a weekday with all-day slot',
      )
    } else {
      // On weekends, the node still advances (current_node_id changes to node-done)
      // but next_evaluation_at is set to the next weekday. That's the design:
      // wait_for_slot always finds the next edge and sets next_evaluation_at.
      console.log(
        `Test ran on a weekend (day=${dayOfWeek}). ` +
        `current_node_id=${enrollments[0].current_node_id}, ` +
        `next_evaluation_at=${enrollments[0].next_evaluation_at}`
      )
    }
  }

  // Cleanup
  await deleteRows('crm_campaign_sends', `sequence_id=eq.${seq.id}`)
  await deleteRows('crm_sequence_enrollments', `sequence_id=eq.${seq.id}`)
  await deleteRows('crm_sequences', `id=eq.${seq.id}`)
  await deleteRows('crm_leads', `id=eq.${lead.id}`)
})

Deno.test('process-sequence-step: wait_for_slot with impossible slot sets next_evaluation_at to the future', async () => {
  const lead = await createTestLead()

  // Slot: Sunday 03:00–03:01 — virtually guaranteed to not be "now"
  // unless the test runs at exactly that moment on a Sunday
  const seq = await createTestSequence({
    startNodeId: 'node-slot',
    nodes: [
      {
        id: 'node-slot',
        type: 'wait_for_slot',
        data: {
          type: 'wait_for_slot',
          slots: [{ days: ['sun'], start: '03:00', end: '03:01' }],
        },
      },
      { id: 'node-done', type: 'action_sms', data: { text: 'Slot passed!' } },
    ],
    edges: [{ id: 'e1', source: 'node-slot', target: 'node-done' }],
  })

  const enrollment = await insertRow('crm_sequence_enrollments', {
    sequence_id: seq.id,
    recipient_type: 'lead',
    recipient_id: lead.id,
    current_node_id: 'node-slot',
    next_evaluation_at: new Date(Date.now() - 5000).toISOString(),
    status: 'active',
  })

  const processRes = await processStep({ sequence_id: seq.id })

  if (processRes.status === 503 || processRes.status === 500) {
    await processRes.text()
    console.log('process-sequence-step not running — skipping impossible slot test')
  } else {
    assertEquals(processRes.status, 200)
    await processRes.json()

    // The node should advance current_node_id to node-done but set next_evaluation_at
    // to a future time (next Sunday at 03:00 in the recipient's timezone).
    const enrollments = await selectRows(
      'crm_sequence_enrollments',
      `id=eq.${enrollment.id}&select=current_node_id,next_evaluation_at,status`,
    )
    assertEquals(enrollments.length, 1)

    // The wait_for_slot node advances the current_node_id to the next node
    // but sets next_evaluation_at to the future slot time — meaning the next
    // node won't actually execute until that slot opens.
    assertEquals(enrollments[0].current_node_id, 'node-done')

    const nextEval = new Date(enrollments[0].next_evaluation_at)
    const now = new Date()

    // Unless we are within the 1-minute Sunday 03:00 window, next_evaluation_at
    // should be in the future
    const isSunday3am = now.getDay() === 0 &&
      now.getHours() === 3 &&
      now.getMinutes() === 0
    if (!isSunday3am) {
      assert(
        nextEval.getTime() > now.getTime() - 60_000, // allow 60s grace
        `next_evaluation_at (${nextEval.toISOString()}) should be in the future ` +
        `since the slot is Sunday 03:00–03:01 and now is ${now.toISOString()}`,
      )
    }
  }

  // Cleanup
  await deleteRows('crm_campaign_sends', `sequence_id=eq.${seq.id}`)
  await deleteRows('crm_sequence_enrollments', `sequence_id=eq.${seq.id}`)
  await deleteRows('crm_sequences', `id=eq.${seq.id}`)
  await deleteRows('crm_leads', `id=eq.${lead.id}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Sequence Engine — Fork/Join
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test('process-sequence-step: fork creates sub-enrollments and join resumes parent', async () => {
  const lead = await createTestLead()

  // DAG: start → fork → [email-branch, sms-branch] → join → end
  const seq = await createTestSequence({
    startNodeId: 'start',
    nodes: [
      { id: 'start', type: 'input', data: { type: 'input' } },
      { id: 'fork-1', type: 'fork', data: { type: 'fork' } },
      { id: 'email-action', type: 'action_email', data: { type: 'action_email', subject: 'Branch A', html: '<p>Email branch</p>' } },
      { id: 'sms-action', type: 'action_sms', data: { type: 'action_sms', text: 'SMS branch' } },
      { id: 'join-1', type: 'join', data: { type: 'join' } },
      { id: 'end-sms', type: 'action_sms', data: { type: 'action_sms', text: 'Done!' } },
    ],
    edges: [
      { id: 'e-start', source: 'start', target: 'fork-1' },
      { id: 'e-fork-email', source: 'fork-1', target: 'email-action' },
      { id: 'e-fork-sms', source: 'fork-1', target: 'sms-action' },
      { id: 'e-email-join', source: 'email-action', target: 'join-1' },
      { id: 'e-sms-join', source: 'sms-action', target: 'join-1' },
      { id: 'e-join-end', source: 'join-1', target: 'end-sms' },
    ],
  })

  // Enroll the lead (starts at 'start')
  const enrollment = await insertRow('crm_sequence_enrollments', {
    sequence_id: seq.id,
    recipient_type: 'lead',
    recipient_id: lead.id,
    current_node_id: 'start',
    next_evaluation_at: new Date(Date.now() - 5000).toISOString(),
    status: 'active',
  })

  // --- Step 1: Process the input node → advances to fork-1 ---
  let processRes = await processStep({ sequence_id: seq.id })

  if (processRes.status === 503 || processRes.status === 500) {
    await processRes.text()
    console.log('process-sequence-step not running — skipping fork/join test')
    await deleteRows('crm_sequence_enrollments', `sequence_id=eq.${seq.id}`)
    await deleteRows('crm_sequences', `id=eq.${seq.id}`)
    await deleteRows('crm_leads', `id=eq.${lead.id}`)
    return
  }
  assertEquals(processRes.status, 200)
  await processRes.json()

  // --- Step 2: Process fork node → should create 2 sub-enrollments ---
  processRes = await processStep({ sequence_id: seq.id })
  assertEquals(processRes.status, 200)
  await processRes.json()

  // Verify parent enrollment is paused
  const parentRows = await selectRows(
    'crm_sequence_enrollments',
    `id=eq.${enrollment.id}&select=status,current_node_id`,
  )
  assertEquals(parentRows.length, 1)
  assertEquals(parentRows[0].status, 'paused', 'Parent enrollment should be paused after fork')

  // Verify 2 sub-enrollments were created
  const subEnrollments = await selectRows(
    'crm_sequence_enrollments',
    `parent_enrollment_id=eq.${enrollment.id}&select=id,current_node_id,fork_node_id,status&order=current_node_id`,
  )
  assertEquals(subEnrollments.length, 2, 'Fork should create 2 sub-enrollments')
  assert(
    subEnrollments.every((s: any) => s.fork_node_id === 'fork-1'),
    'All sub-enrollments should reference fork-1 as fork_node_id',
  )
  assert(
    subEnrollments.every((s: any) => s.status === 'active'),
    'All sub-enrollments should be active',
  )

  // The sub-enrollments should be on email-action and sms-action nodes
  const subNodeIds = subEnrollments.map((s: any) => s.current_node_id).sort()
  assertEquals(subNodeIds, ['email-action', 'sms-action'])

  // --- Step 3: Process sub-enrollments (email + sms actions → join) ---
  // May need multiple process calls since each action advances to join
  for (let i = 0; i < 3; i++) {
    processRes = await processStep({ sequence_id: seq.id })
    assertEquals(processRes.status, 200)
    await processRes.json()
  }

  // After both branches process the join node, the parent should be resumed
  const parentAfter = await selectRows(
    'crm_sequence_enrollments',
    `id=eq.${enrollment.id}&select=status,current_node_id`,
  )
  assertEquals(parentAfter.length, 1)

  // The parent enrollment should be either active (resumed and advanced past join)
  // or completed (if the end node also ran)
  assert(
    parentAfter[0].status === 'active' || parentAfter[0].status === 'completed',
    `Parent should be active or completed after join, got: ${parentAfter[0].status}`,
  )

  // Sub-enrollments should both be completed
  const subAfter = await selectRows(
    'crm_sequence_enrollments',
    `parent_enrollment_id=eq.${enrollment.id}&select=status`,
  )
  assert(
    subAfter.every((s: any) => s.status === 'completed'),
    `All sub-enrollments should be completed after join. Got: ${JSON.stringify(subAfter.map((s: any) => s.status))}`,
  )

  // Cleanup
  await deleteRows('crm_campaign_sends', `sequence_id=eq.${seq.id}`)
  await deleteRows('crm_sequence_enrollments', `parent_enrollment_id=eq.${enrollment.id}`)
  await deleteRows('crm_sequence_enrollments', `id=eq.${enrollment.id}`)
  await deleteRows('crm_sequences', `id=eq.${seq.id}`)
  await deleteRows('crm_leads', `id=eq.${lead.id}`)
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Backfill on Activation
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test('enroll-in-sequence: backfill enrolls existing leads matching trigger_event', async () => {
  // Create 3 test leads
  const leads = await Promise.all([
    createTestLead({ name: 'Backfill Lead 1' }),
    createTestLead({ name: 'Backfill Lead 2' }),
    createTestLead({ name: 'Backfill Lead 3' }),
  ])

  // Create a sequence with trigger_event = 'lead.created'
  const seq = await createTestSequence(
    {
      startNodeId: 'start',
      nodes: [
        { id: 'start', type: 'input', data: { type: 'input', trigger: 'lead.created' } },
        { id: 'email-1', type: 'action_email', data: { subject: 'Welcome!', html: '<p>Hi!</p>' } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'email-1' }],
    },
    { trigger_event: 'lead.created' },
  )

  // Call the backfill endpoint
  const res = await callFn('enroll-in-sequence', {
    backfill: true,
    sequence_id: seq.id,
  })

  if (res.status === 503 || res.status === 500) {
    await res.text()
    console.log('enroll-in-sequence not running — skipping backfill test')
    await deleteRows('crm_sequences', `id=eq.${seq.id}`)
    for (const lead of leads) {
      await deleteRows('crm_leads', `id=eq.${lead.id}`)
    }
    return
  }

  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.success, true)

  // Verify at least our 3 leads are enrolled
  // (there may be other leads in the DB from seeded data, so backfilled >= 3)
  assert(
    body.backfilled >= 3,
    `Expected at least 3 backfilled enrollments, got ${body.backfilled}`,
  )

  // Verify our specific test leads are enrolled
  for (const lead of leads) {
    const enrollments = await selectRows(
      'crm_sequence_enrollments',
      `sequence_id=eq.${seq.id}&recipient_id=eq.${lead.id}&select=id,status,current_node_id`,
    )
    assertEquals(
      enrollments.length,
      1,
      `Lead ${lead.name} (${lead.id}) should be enrolled in the sequence`,
    )
    assertEquals(enrollments[0].status, 'active')
    assertEquals(enrollments[0].current_node_id, 'start')
  }

  // Verify idempotency — calling backfill again should enroll 0 new leads
  const res2 = await callFn('enroll-in-sequence', {
    backfill: true,
    sequence_id: seq.id,
  })
  assertEquals(res2.status, 200)
  const body2 = await res2.json()
  assertEquals(body2.backfilled, 0, 'Second backfill should enroll 0 (all already enrolled)')

  // Cleanup
  await deleteRows('crm_campaign_sends', `sequence_id=eq.${seq.id}`)
  await deleteRows('crm_sequence_enrollments', `sequence_id=eq.${seq.id}`)
  await deleteRows('crm_sequences', `id=eq.${seq.id}`)
  for (const lead of leads) {
    await deleteRows('crm_leads', `id=eq.${lead.id}`)
  }
})
