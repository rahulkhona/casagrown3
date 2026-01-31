import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Simple deterministic hash function (djb2)
function getHash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return Math.abs(hash)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { experiment_id, device_id, profile_id, context } = await req.json()

    if (!experiment_id || !device_id) {
       throw new Error('experiment_id and device_id are required')
    }

    // 1. Check for existing assignment
    const { data: existingAssignment, error: fetchError } = await supabase
      .from('experiment_assignments')
      .select('variant_id, experiment_variants(name, config)')
      .eq('experiment_id', experiment_id)
      .or(`profile_id.eq.${profile_id},device_id.eq.${device_id}`)
      .order('user_id', { ascending: false }) // Prioritize logged-in assignment
      .maybeSingle()

    if (existingAssignment) {
      return new Response(JSON.stringify(existingAssignment), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. Fetch Experiment & Variants
    const { data: experiment, error: expError } = await supabase
      .from('experiments')
      .select('*, experiment_variants(*)')
      .eq('id', experiment_id)
      .single()

    if (expError || !experiment) throw new Error('Experiment not found')
    if (experiment.status !== 'running') throw new Error('Experiment is not running')

    // 3. TARGETING: Check criteria (Platform, OS, etc)
    const criteria = experiment.target_criteria || {}
    const matches = Object.entries(criteria).every(([key, value]) => {
        return context[key] === value
    })

    if (!matches) {
       return new Response(JSON.stringify({ variant: null, reason: 'targeting_mismatch' }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 200,
       })
    }

    // 4. BUCKETING: Hash identifier + experiment_id
    const identifier = profile_id || device_id
    const bucket = getHash(`${experiment_id}:${identifier}`) % 100
    
    // Find variant based on weights
    let累累 = 0
    let selectedVariant = null
    const totalWeight = experiment.experiment_variants.reduce((acc, v) => acc + v.weight, 0)
    const normalizedBucket = (bucket / 100) * totalWeight

    for (const v of experiment.experiment_variants) {
      累累 += v.weight
      if (normalizedBucket < 累累) {
        selectedVariant = v
        break
      }
    }

    if (!selectedVariant) throw new Error('Failed to allocate variant')

    // 5. PERSIST: Save assignment with snapshot
    const { error: insertError } = await supabase
      .from('experiment_assignments')
      .insert({
        experiment_id,
        user_id: profile_id,
        device_id,
        variant_id: selectedVariant.id,
        context: context
      })

    if (insertError) throw insertError

    return new Response(JSON.stringify({
      variant_id: selectedVariant.id,
      experiment_variants: {
        name: selectedVariant.name,
        config: selectedVariant.config
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
