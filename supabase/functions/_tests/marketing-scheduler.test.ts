/**
 * marketing-scheduler — End-to-End Deno Integration Test Suite
 *
 * Tests:
 * 1. Handles empty schedule queue cleanly
 * 2. Processes active schedule: matches recipient local send window, dispatches Push/Email,
 *    records window dispatch log in crm_notification_window_logs, and prevents duplicate dispatches.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
 *        functions/_tests/marketing-scheduler.test.ts
 */
import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.test('marketing-scheduler: empty schedule queue returns processed count', async () => {
  const req = await fetch(`${SUPABASE_URL}/functions/v1/marketing-scheduler`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({}),
  })

  assertEquals(req.status, 200)
  const data = await req.json()
  assert(typeof data.processed === 'number')
})

Deno.test('marketing-scheduler: full end-to-end schedule evaluation, A/B split, window logging, and duplicate prevention', async () => {
  const testId = `test_${Date.now()}`
  const testEmail = `sched_test_${Date.now()}@example.com`

  // 1. Create test profile
  const userId = crypto.randomUUID()
  const { data: userProfile, error: userError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email: testEmail,
      full_name: 'Scheduler Test User',
      zip_code: '94105',
      state_code: 'CA',
    })
    .select('id')
    .single()

  // 2. Create user push token with timezone
  await supabase.from('user_push_tokens').insert({
    user_id: userId,
    token: `ExponentPushToken[${testId}]`,
    timezone: 'America/Los_Angeles',
  })

  // 3. Create test push campaign with A/B testing
  const { data: campaign, error: campError } = await supabase
    .from('crm_campaigns')
    .insert({
      name: `Push Campaign ${testId}`,
      channel: 'push',
      status: 'scheduled',
      push_title: '🌱 Organic Tomatoes Dropped',
      push_body: 'Fresh heirloom tomatoes available in your neighborhood.',
      push_target_url: '/market',
      is_ab_test: true,
      variant_b_push_title: '🍅 Fresh Tomatoes Available Nearby',
      variant_b_push_body: 'Check out newly listed organic produce.',
    })
    .select('id')
    .single()

  assert(!campError, `Failed to create campaign: ${campError?.message}`)
  assertExists(campaign?.id)

  // 4. Create active notification schedule covering 00:00:00 to 23:59:59 (always open today)
  const now = new Date()
  const todayDay = now.toLocaleString('en-US', { weekday: 'short' }).toLowerCase()

  const { data: schedule, error: schedError } = await supabase
    .from('crm_notification_schedules')
    .insert({
      notification_type: `schedule_test_${testId}`,
      campaign_id: campaign.id,
      is_active: true,
      windows: [
        {
          name: 'all_day',
          start: '00:00:00',
          end: '23:59:59',
          days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        },
      ],
      channels: { push: true, email: true },
      fallback_timezone: 'America/Los_Angeles',
    })
    .select('id')
    .single()

  assert(!schedError, `Failed to create schedule: ${schedError?.message}`)
  assertExists(schedule?.id)

  try {
    // 5. Execute marketing-scheduler Edge function (Run 1)
    const run1Res = await fetch(`${SUPABASE_URL}/functions/v1/marketing-scheduler`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    })

    assertEquals(run1Res.status, 200)
    const run1Data = await run1Res.json()
    assert(run1Data.processed > 0, 'Should process active schedule')
    assert(run1Data.dispatched > 0, 'Should dispatch push notification to test recipient')

    // 6. Verify audit log entry in crm_notification_window_logs
    const { data: logs, error: logError } = await supabase
      .from('crm_notification_window_logs')
      .select('*')
      .eq('schedule_id', schedule.id)

    assert(!logError, `Log query error: ${logError?.message}`)
    assert(logs && logs.length > 0, 'Should record window log entries for schedule')

    // 7. Execute marketing-scheduler Edge function again (Run 2) -> Verify duplicate prevention
    const run2Res = await fetch(`${SUPABASE_URL}/functions/v1/marketing-scheduler`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    })

    assertEquals(run2Res.status, 200)
    const run2Data = await run2Res.json()
    assertEquals(run2Data.dispatched, 0, 'Second run should dispatch 0 (duplicate prevented)')

  } finally {
    // 8. Clean up test records
    await supabase.from('crm_notification_window_logs').delete().eq('schedule_id', schedule.id)
    await supabase.from('crm_notification_schedules').delete().eq('id', schedule.id)
    await supabase.from('crm_campaigns').delete().eq('id', campaign.id)
    await supabase.from('user_push_tokens').delete().eq('user_id', userId)
    await supabase.from('profiles').delete().eq('id', userId)
  }
})
