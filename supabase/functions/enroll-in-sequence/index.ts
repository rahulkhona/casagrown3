import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { sequence_id, recipients } = await req.json()

    if (!sequence_id || !recipients || !Array.isArray(recipients)) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 })
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'recipients array must not be empty' }), { status: 400 })
    }

    // Get sequence to find the startNodeId and channel
    const { data: sequence, error: seqError } = await supabase
      .from('crm_sequences')
      .select('definition, status')
      .eq('id', sequence_id)
      .single()

    if (seqError || !sequence) {
      return new Response(JSON.stringify({ error: 'Sequence not found' }), { status: 404 })
    }

    if (sequence.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Cannot enroll in a non-active sequence' }), { status: 400 })
    }

    const startNodeId = sequence.definition?.startNodeId

    // Determine the channel from the sequence definition's first action node
    const nodes = sequence.definition?.nodes ?? []
    const firstActionNode = nodes.find((n: any) =>
      n.type === 'action_email' || n.data?.type === 'action_email' ||
      n.type === 'action_sms'   || n.data?.type === 'action_sms'
    )
    const channelType: 'email' | 'sms' | null = firstActionNode
      ? ((firstActionNode.type === 'action_email' || firstActionNode.data?.type === 'action_email') ? 'email' : 'sms')
      : null

    // ── Consent Filtering ────────────────────────────────────────────────────
    // For lead recipients, fetch consent fields and skip non-consenting recipients.
    const leadIds = recipients
      .filter((r: any) => r.recipient_type === 'lead')
      .map((r: any) => r.recipient_id)

    let consentedLeadIds = new Set<string>(leadIds)

    if (leadIds.length > 0 && channelType) {
      const consentField = channelType === 'email' ? 'accepts_email' : 'accepts_sms'
      const { data: leads } = await supabase
        .from('crm_leads')
        .select(`id, ${consentField}`)
        .in('id', leadIds)

      if (leads) {
        consentedLeadIds = new Set(
          leads.filter((l: any) => l[consentField] === true).map((l: any) => l.id)
        )
      }
    }

    const consented: any[] = []
    let skipped = 0

    for (const r of recipients) {
      if (r.recipient_type === 'lead' && !consentedLeadIds.has(r.recipient_id)) {
        skipped++
        continue
      }
      consented.push(r)
    }
    // ────────────────────────────────────────────────────────────────────────

    if (consented.length === 0) {
      return new Response(
        JSON.stringify({ success: true, enrolled: 0, skipped }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const enrollments = consented.map((r: any) => ({
      sequence_id,
      recipient_type: r.recipient_type,
      recipient_id: r.recipient_id,
      current_node_id: startNodeId,
      next_evaluation_at: new Date().toISOString(),
      status: 'active'
    }))

    const { data, error } = await supabase
      .from('crm_sequence_enrollments')
      .insert(enrollments)
      .select()

    if (error) {
      // Unique constraint violation = already enrolled
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(
      JSON.stringify({ success: true, enrolled: data?.length, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
