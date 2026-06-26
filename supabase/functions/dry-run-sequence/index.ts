import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'

function evaluateRule(rule: any, data: any): boolean {
  if ('combinator' in rule) {
    return evaluateQuery(rule, data);
  }
  const { field, operator, value } = rule;
  const dataValue = data[field];
  
  if (value === 'true' || value === true) return dataValue === true || String(dataValue).toLowerCase() === 'true';
  if (value === 'false' || value === false) return dataValue === false || String(dataValue).toLowerCase() === 'false';

  switch (operator) {
    case '=': return dataValue == value;
    case '!=': return dataValue != value;
    case '<': return Number(dataValue) < Number(value);
    case '>': return Number(dataValue) > Number(value);
    case '<=': return Number(dataValue) <= Number(value);
    case '>=': return Number(dataValue) >= Number(value);
    case 'contains': 
      if (Array.isArray(dataValue)) return dataValue.includes(value);
      return String(dataValue).toLowerCase().includes(String(value).toLowerCase());
    case 'doesNotContain':
      if (Array.isArray(dataValue)) return !dataValue.includes(value);
      return !String(dataValue).toLowerCase().includes(String(value).toLowerCase());
    case 'beginsWith': return String(dataValue).toLowerCase().startsWith(String(value).toLowerCase());
    case 'endsWith': return String(dataValue).toLowerCase().endsWith(String(value).toLowerCase());
    case 'null': return dataValue === null || dataValue === undefined;
    case 'notNull': return dataValue !== null && dataValue !== undefined;
    default: return false;
  }
}

function evaluateQuery(query: any, data: any): boolean {
  if (!query || !query.rules || query.rules.length === 0) return true;
  
  if (query.combinator === 'and') {
    return query.rules.every((r: any) => evaluateRule(r, data));
  } else {
    return query.rules.some((r: any) => evaluateRule(r, data));
  }
}

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
    const { sequence_id } = body

    if (!sequence_id) {
      return new Response(JSON.stringify({ error: 'sequence_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 1. Fetch the sequence
    const { data: sequence, error: seqError } = await supabase
      .from('crm_sequences')
      .select('definition, trigger_event')
      .eq('id', sequence_id)
      .single()

    if (seqError || !sequence) {
      return new Response(JSON.stringify({ error: 'Sequence not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const def = sequence.definition || { nodes: [], edges: [], startNodeId: null }
    const startNodeId = def.startNodeId

    if (!startNodeId) {
      return new Response(JSON.stringify({ success: true, nodes: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Identify candidates based on trigger_event
    type Candidate = { id: string; name: string; email: string | null; phone: string | null; recipient_type: 'lead' | 'user' }
    let candidates: Candidate[] = []
    const triggerEvent = sequence.trigger_event

    if (triggerEvent === 'lead.created') {
      const { data, error } = await supabase.from('crm_leads').select('id, name, email, phone').limit(500)
      if (error) throw error
      candidates = (data ?? []).map((row: any) => ({ id: row.id, name: row.name || 'Unknown Lead', email: row.email, phone: row.phone, recipient_type: 'lead' }))
    } else if (triggerEvent === 'user.first_login') {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, phone_number').limit(500)
      if (error) throw error
      candidates = (data ?? []).map((row: any) => ({ id: row.id, name: row.full_name || 'Unknown User', email: row.email, phone: row.phone_number, recipient_type: 'user' }))
    } else if (triggerEvent === 'market_orders.purchase_completed' || triggerEvent === 'market_orders.sale_completed') {
      const idField = triggerEvent === 'market_orders.purchase_completed' ? 'buyer_id' : 'seller_id'
      const { data, error } = await supabase.from('market_orders').select(`${idField}`).limit(500)
      if (error) throw error
      const seen = new Set<string>()
      const ids = (data ?? []).map((row: any) => row[idField]).filter((id: string) => {
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })
      if (ids.length > 0) {
        const { data: profiles, error: pError } = await supabase.from('profiles').select('id, full_name, email, phone_number').in('id', ids)
        if (pError) throw pError
        candidates = (profiles ?? []).map((row: any) => ({ id: row.id, name: row.full_name || 'Unknown User', email: row.email, phone: row.phone_number, recipient_type: 'user' }))
      }
    } else {
      // Manual trigger: fallback to existing active enrollments, or if none, select first 100 leads
      const { data: enrollRes } = await supabase.from('crm_sequence_enrollments').select('recipient_id, recipient_type').eq('sequence_id', sequence_id).limit(500)
      if (enrollRes && enrollRes.length > 0) {
        const leadIds = enrollRes.filter((r: any) => r.recipient_type === 'lead').map((r: any) => r.recipient_id)
        const userIds = enrollRes.filter((r: any) => r.recipient_type === 'user').map((r: any) => r.recipient_id)
        if (leadIds.length > 0) {
          const { data: leads } = await supabase.from('crm_leads').select('id, name, email, phone').in('id', leadIds)
          if (leads) candidates.push(...leads.map((l: any) => ({ id: l.id, name: l.name || 'Unknown Lead', email: l.email, phone: l.phone, recipient_type: 'lead' as const })))
        }
        if (userIds.length > 0) {
          const { data: users } = await supabase.from('profiles').select('id, full_name, email, phone_number').in('id', userIds)
          if (users) candidates.push(...users.map((u: any) => ({ id: u.id, name: u.full_name || 'Unknown User', email: u.email, phone: u.phone_number, recipient_type: 'user' as const })))
        }
      } else {
        const { data, error } = await supabase.from('crm_leads').select('id, name, email, phone').limit(100)
        if (!error && data) {
          candidates = data.map((row: any) => ({ id: row.id, name: row.name || 'Unknown Lead', email: row.email, phone: row.phone, recipient_type: 'lead' }))
        }
      }
    }

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ success: true, nodes: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Fetch crm_leads and profiles in bulk to build evaluation context
    const candidateIds = candidates.map(c => c.id)
    const userIds = candidates.filter(c => c.recipient_type === 'user').map(c => c.id)

    let metadataList: any[] = []
    if (candidateIds.length > 0) {
      const { data } = await supabase.from('crm_leads').select('*').in('id', candidateIds)
      if (data) metadataList = data
    }
    const metaMap = new Map<string, any>()
    metadataList.forEach(m => metaMap.set(m.id, m))

    let profilesList: any[] = []
    if (userIds.length > 0) {
      const { data } = await supabase.from('profiles').select('*').in('id', userIds)
      if (data) profilesList = data
    }
    const profileMap = new Map<string, any>()
    profilesList.forEach(p => profileMap.set(p.id, p))

    const evalContexts = new Map<string, any>()
    for (const c of candidates) {
      const metadata = metaMap.get(c.id) || {}
      const profile = profileMap.get(c.id) || {}
      
      const now = new Date().getTime()
      const lastActiveTime = metadata.last_active_at ? new Date(metadata.last_active_at).getTime() : now
      const daysSinceActive = Math.floor((now - lastActiveTime) / (1000 * 60 * 60 * 24))
      
      const hasSignedTos = !!profile.tos_accepted_at
      const hasCompletedProfile = !!metadata.profile_completed_at
      
      let macroState = 'unknown'
      if (hasSignedTos && hasCompletedProfile) {
        macroState = 'signup_completed'
      } else if (!hasSignedTos || !hasCompletedProfile) {
        macroState = 'signup_abandoned'
      }
      
      const hasEmail = typeof c.email === 'string' && c.email.trim().length > 0
      const hasPhone = typeof c.phone === 'string' && c.phone.trim().length > 0
      const hasOnlyEmail = hasEmail && !hasPhone
      const hasOnlyPhone = hasPhone && !hasEmail
      const hasBothEmailAndPhone = hasEmail && hasPhone

      evalContexts.set(c.id, {
        ...metadata,
        has_signed_tos: hasSignedTos,
        has_completed_profile: hasCompletedProfile,
        days_since_last_active: daysSinceActive,
        user_macro_state: macroState,
        has_only_email: hasOnlyEmail,
        has_only_phone: hasOnlyPhone,
        has_both_email_and_phone: hasBothEmailAndPhone,
        email_enabled: metadata.accepts_email !== false,
        sms_enabled: metadata.accepts_sms !== false,
      })
    }

    // 4. Run step-by-step virtual simulation in-memory
    const nodeRecipients = new Map<string, Set<string>>()
    let activeVirtuals = candidates.map(c => ({ recipient_id: c.id, current_node_id: startNodeId }))
    let iterations = 0

    while (activeVirtuals.length > 0 && iterations < 50) {
      const nextVirtuals: typeof activeVirtuals = []

      for (const v of activeVirtuals) {
        // Record node visit
        let set = nodeRecipients.get(v.current_node_id)
        if (!set) {
          set = new Set<string>()
          nodeRecipients.set(v.current_node_id, set)
        }
        set.add(v.recipient_id)

        // Process step
        const node = def.nodes.find((n: any) => n.id === v.current_node_id)
        if (!node) continue

        const nodeType = node.data?.type || node.type

        if (nodeType === 'condition') {
          const ctx = evalContexts.get(v.recipient_id)
          const matched = evaluateQuery(node.data?.query, ctx)
          const edge = def.edges.find((e: any) => e.source === node.id && e.label === (matched ? 'true' : 'false'))
          const fallbackEdge = def.edges.find((e: any) => e.source === node.id)
          const targetNodeId = edge ? edge.target : (fallbackEdge ? fallbackEdge.target : null)
          if (targetNodeId) {
            nextVirtuals.push({ recipient_id: v.recipient_id, current_node_id: targetNodeId })
          }
        } else if (nodeType === 'fork') {
          const edges = def.edges.filter((e: any) => e.source === node.id)
          for (const edge of edges) {
            nextVirtuals.push({ recipient_id: v.recipient_id, current_node_id: edge.target })
          }
        } else if (nodeType === 'join') {
          const edge = def.edges.find((e: any) => e.source === node.id)
          if (edge) {
            nextVirtuals.push({ recipient_id: v.recipient_id, current_node_id: edge.target })
          }
        } else if (nodeType !== 'terminal') {
          const edge = def.edges.find((e: any) => e.source === node.id)
          if (edge) {
            nextVirtuals.push({ recipient_id: v.recipient_id, current_node_id: edge.target })
          }
        }
      }

      activeVirtuals = nextVirtuals
      iterations++
    }

    // 5. Structure and return results
    const results: Record<string, { count: number; recipients: typeof candidates }> = {}
    for (const [nodeId, recipientIds] of nodeRecipients.entries()) {
      const nodeCandidates = candidates.filter(c => recipientIds.has(c.id))
      results[nodeId] = {
        count: nodeCandidates.length,
        recipients: nodeCandidates
      }
    }

    return new Response(JSON.stringify({ success: true, nodes: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
