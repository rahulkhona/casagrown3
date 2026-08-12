import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.test('Campaign MAB Thompson Sampling & Reporting RPC Test', async (t) => {
  const testCampaignId = crypto.randomUUID()

  await t.step('Setup test MAB campaign and 3 variants', async () => {
    // Insert campaign
    const { error: campError } = await supabase.from('crm_campaigns').insert({
      id: testCampaignId,
      name: `MAB Test Campaign ${Date.now()}`,
      channel: 'push',
      is_mab_experiment: true,
      mab_experiment_mode: 'matrix',
    })
    assertEquals(campError, null)

    // Insert 3 MAB variants (Morning, Afternoon, Evening)
    const variants = [
      {
        campaign_id: testCampaignId,
        variant_name: 'Variant A - Morning 09:00',
        experiment_mode: 'matrix',
        push_title: '☀️ Morning Produce Drop',
        push_body: 'Fresh morning berries arrived near you!',
        send_window_start: '09:00:00',
        send_window_end: '11:00:00',
        sends_count: 50,
        conversions_count: 15, // 30% CVR
      },
      {
        campaign_id: testCampaignId,
        variant_name: 'Variant B - Afternoon 14:00',
        experiment_mode: 'matrix',
        push_title: '🌤️ Afternoon Market Special',
        push_body: 'Check out afternoon garden listings.',
        send_window_start: '14:00:00',
        send_window_end: '16:00:00',
        sends_count: 50,
        conversions_count: 5, // 10% CVR
      },
      {
        campaign_id: testCampaignId,
        variant_name: 'Variant C - Evening 18:00',
        experiment_mode: 'matrix',
        push_title: '🌙 Evening Dinner Fresh Pick',
        push_body: 'Pick up fresh dinner produce tonight.',
        send_window_start: '18:00:00',
        send_window_end: '20:00:00',
        sends_count: 50,
        conversions_count: 2, // 4% CVR
      },
    ]

    const { error: varError } = await supabase.from('crm_campaign_mab_variants').insert(variants)
    assertEquals(varError, null)
  })

  await t.step('Sample variant via get_campaign_mab_variant RPC', async () => {
    const { data, error } = await supabase.rpc('get_campaign_mab_variant', { p_campaign_id: testCampaignId })
    assertEquals(error, null)
    assertExists(data)
    assertEquals(data.length, 1)

    const sampled = data[0]
    assertExists(sampled.variant_id)
    assertExists(sampled.variant_name)
  })

  await t.step('Attribute conversion via attribute_campaign_mab_conversion RPC', async () => {
    // Fetch one variant ID
    const { data: vars } = await supabase
      .from('crm_campaign_mab_variants')
      .select('id, conversions_count')
      .eq('campaign_id', testCampaignId)
      .limit(1)

    assertExists(vars)
    const targetVariantId = vars[0].id
    const initialConvs = vars[0].conversions_count

    const { error: attrError } = await supabase.rpc('attribute_campaign_mab_conversion', {
      p_variant_id: targetVariantId,
      p_event_type: 'conversion',
    })
    assertEquals(attrError, null)

    const { data: updatedVars } = await supabase
      .from('crm_campaign_mab_variants')
      .select('conversions_count')
      .eq('id', targetVariantId)
      .single()

    assertEquals(updatedVars.conversions_count, initialConvs + 1)
  })

  await t.step('Fetch report via get_mab_campaign_report RPC', async () => {
    const { data: report, error } = await supabase.rpc('get_mab_campaign_report', { p_campaign_id: testCampaignId })
    assertEquals(error, null)
    assertExists(report)
    assertEquals(report.length, 3)

    // Leading variant should be Variant A (highest CVR)
    assertEquals(report[0].variant_name, 'Variant A - Morning 09:00')
  })

  await t.step('Fetch global summary via get_all_mab_experiments_summary RPC', async () => {
    const { data: summary, error } = await supabase.rpc('get_all_mab_experiments_summary')
    assertEquals(error, null)
    assertExists(summary)

    const testSummary = summary.find((s: any) => s.experiment_id === testCampaignId)
    assertExists(testSummary)
    assertEquals(testSummary.total_variants, 3)
    assertEquals(testSummary.leading_variant_name, 'Variant A - Morning 09:00')
  })

  await t.step('Cleanup test campaign data', async () => {
    await supabase.from('crm_campaigns').delete().eq('id', testCampaignId)
  })
})
