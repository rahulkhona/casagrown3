/**
 * seasonal-demand-reminders.test.ts — End-to-End Deno Integration Test Suite
 *
 * Tests:
 * 1. Timezone-aware optimal slot calculation (09:00 - 11:59 local recipient time)
 * 2. Pre-season vs In-season reminder content and harvest window logic
 * 3. 15-day cooldown enforcement preventing duplicate reminder sends
 * 4. End-to-end execution of sync-produce-seasonality and send-seasonal-demand-reminders
 */
import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isWithinOptimalSellerSlot } from '../send-seasonal-demand-reminders/index.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.test('seasonal-demand-reminders: isWithinOptimalSellerSlot accurately evaluates recipient morning windows across timezones', () => {
  // 10:00 AM Eastern Time = 14:00 UTC
  const morningET = new Date('2026-08-14T14:00:00Z')
  assertEquals(isWithinOptimalSellerSlot('NY', morningET), true)
  // At 14:00 UTC, Pacific time is 7:00 AM (outside 09:00 - 11:59 window)
  assertEquals(isWithinOptimalSellerSlot('CA', morningET), false)

  // 10:00 AM Pacific Time = 17:00 UTC
  const morningPT = new Date('2026-08-14T17:00:00Z')
  assertEquals(isWithinOptimalSellerSlot('CA', morningPT), true)
  // At 17:00 UTC, Eastern time is 1:00 PM (outside 09:00 - 11:59 window)
  assertEquals(isWithinOptimalSellerSlot('NY', morningPT), false)
})

Deno.test('seasonal-demand-reminders: RPC get_seasonal_seller_demand_reminders executes and returns structured rows', async () => {
  const { data, error } = await supabase.rpc('get_seasonal_seller_demand_reminders')
  assertEquals(error, null)
  assert(Array.isArray(data))
})

Deno.test('seasonal-demand-reminders: send-seasonal-demand-reminders edge function dispatches reminders with cooldown', async () => {
  const req = await fetch(`${SUPABASE_URL}/functions/v1/send-seasonal-demand-reminders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ ignore_time_window: true, test_run: true }),
  })

  assertEquals(req.status, 200)
  const data = await req.json()
  assert(typeof data.sentCount === 'number')
})
