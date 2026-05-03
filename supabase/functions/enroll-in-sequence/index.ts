import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
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

    // Get sequence to find the startNodeId
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

    const enrollments = recipients.map((r: any) => ({
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
      // If it's a unique constraint violation, it means they are already enrolled. 
      // We could do an upsert or just ignore. The requirements say "UNIQUE(sequence_id, recipient_type, recipient_id)"
      return new Response(JSON.stringify({ error: error.message }), { status: 400 })
    }

    return new Response(JSON.stringify({ success: true, enrolled: data?.length }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
