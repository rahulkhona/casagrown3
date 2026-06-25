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

    const body = await req.json()
    const { sequence_id, backfill } = body

    // ═══════════════════════════════════════════════════════════════════════
    // BACKFILL PATH — bulk-enroll historical recipients who match the
    // sequence's trigger_event but were never enrolled.
    // ═══════════════════════════════════════════════════════════════════════
    if (backfill === true) {
      const BACKFILL_CAP = 5000

      if (!sequence_id) {
        return new Response(
          JSON.stringify({ error: 'sequence_id is required for backfill' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 1. Fetch the sequence, its trigger_event, definition, and status
      const { data: sequence, error: seqError } = await supabase
        .from('crm_sequences')
        .select('definition, status, trigger_event')
        .eq('id', sequence_id)
        .single()

      if (seqError || !sequence) {
        return new Response(
          JSON.stringify({ error: 'Sequence not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (sequence.status !== 'active') {
        return new Response(
          JSON.stringify({ error: 'Cannot backfill a non-active sequence' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const triggerEvent: string | null = sequence.trigger_event ?? null
      if (!triggerEvent) {
        return new Response(
          JSON.stringify({ error: 'Sequence has no trigger_event configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 2. Query matching recipients based on trigger_event
      type Candidate = { id: string; recipient_type: 'lead' | 'user' }
      let candidates: Candidate[] = []

      if (triggerEvent === 'lead.created') {
        const { data, error } = await supabase
          .from('crm_leads')
          .select('id')
          .limit(BACKFILL_CAP)
        if (error) throw error
        candidates = (data ?? []).map((row: any) => ({ id: row.id, recipient_type: 'lead' as const }))

      } else if (triggerEvent === 'user.first_login') {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .not('profile_completed_at', 'is', null)
          .limit(BACKFILL_CAP)
        if (error) throw error
        candidates = (data ?? []).map((row: any) => ({ id: row.id, recipient_type: 'user' as const }))

      } else if (triggerEvent === 'market_orders.purchase_completed') {
        // Distinct buyer_ids from completed market orders
        const { data, error } = await supabase
          .from('market_orders')
          .select('buyer_id')
          .eq('status', 'completed')
          .limit(BACKFILL_CAP)
        if (error) throw error
        // Deduplicate buyer_ids client-side (Supabase JS doesn't support DISTINCT)
        const seen = new Set<string>()
        candidates = (data ?? []).reduce((acc: Candidate[], row: any) => {
          if (!seen.has(row.buyer_id)) {
            seen.add(row.buyer_id)
            acc.push({ id: row.buyer_id, recipient_type: 'user' as const })
          }
          return acc
        }, [])

      } else if (triggerEvent === 'market_orders.sale_completed') {
        // Distinct seller_ids from completed market orders
        const { data, error } = await supabase
          .from('market_orders')
          .select('seller_id')
          .eq('status', 'completed')
          .limit(BACKFILL_CAP)
        if (error) throw error
        const seen = new Set<string>()
        candidates = (data ?? []).reduce((acc: Candidate[], row: any) => {
          if (!seen.has(row.seller_id)) {
            seen.add(row.seller_id)
            acc.push({ id: row.seller_id, recipient_type: 'user' as const })
          }
          return acc
        }, [])

      } else {
        return new Response(
          JSON.stringify({ error: `Unsupported trigger_event for backfill: ${triggerEvent}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (candidates.length === 0) {
        return new Response(
          JSON.stringify({ success: true, backfilled: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 3. Filter out anyone already enrolled in this sequence
      const candidateIds = candidates.map((c) => c.id)
      // Fetch existing enrollments in batches (Supabase `.in()` has limits)
      const alreadyEnrolled = new Set<string>()
      const batchSize = 500
      for (let i = 0; i < candidateIds.length; i += batchSize) {
        const batch = candidateIds.slice(i, i + batchSize)
        const { data: existing } = await supabase
          .from('crm_sequence_enrollments')
          .select('recipient_id')
          .eq('sequence_id', sequence_id)
          .in('recipient_id', batch)
        if (existing) {
          existing.forEach((e: any) => alreadyEnrolled.add(e.recipient_id))
        }
      }

      const newCandidates = candidates.filter((c) => !alreadyEnrolled.has(c.id))

      if (newCandidates.length === 0) {
        return new Response(
          JSON.stringify({ success: true, backfilled: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 4. Consent filtering — same logic as the normal enrollment path
      const startNodeId = sequence.definition?.startNodeId
      const nodes = sequence.definition?.nodes ?? []
      const firstActionNode = nodes.find((n: any) =>
        n.type === 'action_email' || n.data?.type === 'action_email' ||
        n.type === 'action_sms'   || n.data?.type === 'action_sms'
      )
      const channelType: 'email' | 'sms' | null = firstActionNode
        ? ((firstActionNode.type === 'action_email' || firstActionNode.data?.type === 'action_email') ? 'email' : 'sms')
        : null

      // Consent-check for lead-type recipients
      const leadCandidates = newCandidates.filter((c) => c.recipient_type === 'lead')
      const leadCandidateIds = leadCandidates.map((c) => c.id)
      let consentedLeadIds = new Set<string>(leadCandidateIds)

      if (leadCandidateIds.length > 0 && channelType) {
        const consentField = channelType === 'email' ? 'accepts_email' : 'accepts_sms'
        consentedLeadIds = new Set<string>()
        for (let i = 0; i < leadCandidateIds.length; i += batchSize) {
          const batch = leadCandidateIds.slice(i, i + batchSize)
          const { data: leads } = await supabase
            .from('crm_leads')
            .select(`id, ${consentField}`)
            .in('id', batch)
          if (leads) {
            leads
              .filter((l: any) => l[consentField] === true)
              .forEach((l: any) => consentedLeadIds.add(l.id))
          }
        }
      }

      const consented = newCandidates.filter((c) => {
        if (c.recipient_type === 'lead' && !consentedLeadIds.has(c.id)) return false
        return true
      })

      // Enforce the backfill cap after all filtering
      const toEnroll = consented.slice(0, BACKFILL_CAP)

      if (toEnroll.length === 0) {
        return new Response(
          JSON.stringify({ success: true, backfilled: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 5. Batch-enroll using insert (no upsert — we already filtered duplicates)
      const enrollments = toEnroll.map((c) => ({
        sequence_id,
        recipient_type: c.recipient_type,
        recipient_id: c.id,
        current_node_id: startNodeId,
        next_evaluation_at: new Date().toISOString(),
        status: 'active'
      }))

      // Insert in batches to avoid payload limits
      let totalInserted = 0
      const insertBatchSize = 500
      for (let i = 0; i < enrollments.length; i += insertBatchSize) {
        const batch = enrollments.slice(i, i + insertBatchSize)
        const { data: inserted, error: insertError } = await supabase
          .from('crm_sequence_enrollments')
          .insert(batch)
          .select()

        if (insertError) {
          // Log but continue — some may fail due to race-condition duplicates
          console.error(`Backfill insert batch error: ${insertError.message}`)
          continue
        }
        totalInserted += inserted?.length ?? 0
      }

      return new Response(
        JSON.stringify({ success: true, backfilled: totalInserted }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NORMAL ENROLLMENT PATH — original logic
    // ═══════════════════════════════════════════════════════════════════════
    const { recipients, reset } = body

    if (!sequence_id || !recipients || !Array.isArray(recipients)) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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

    const isTest = body.is_test === true
    if (sequence.status !== 'active' && !isTest) {
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

    if (reset === true) {
      const recipientIds = consented.map((r: any) => r.recipient_id)
      const { error: deleteError } = await supabase
        .from('crm_sequence_enrollments')
        .delete()
        .eq('sequence_id', sequence_id)
        .is('parent_enrollment_id', null)
        .in('recipient_id', recipientIds)

      if (deleteError) {
        return new Response(JSON.stringify({ error: `Failed to clear existing test enrollments: ${deleteError.message}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

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
