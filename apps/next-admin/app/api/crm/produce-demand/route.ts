import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * GET /api/crm/produce-demand
 * Service-role endpoint providing all canonical produce interests, profiles, and listings
 * for the Produce Demand & Supply Radar dashboard.
 */
export async function GET() {
  try {
    const supabase = getAdminClient()

    // 1. Fetch Canonical CRM Produce Interests
    const { data: crmInterests, error: intErr } = await supabase
      .from('crm_produce_interests')
      .select('produce_name, interest_type, zipcodes, lead_id, user_id, status')
      .eq('status', 'active')

    if (intErr) throw intErr

    // 2. Fetch Profiles for city/state metadata
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, zip_code, city, state_code')

    // 3. Fetch Market Products & Booths (live active marketplace listings)
    const { data: marketProducts } = await supabase
      .from('market_products')
      .select('name, category, seller_id')
      .eq('is_active', true)

    const { data: marketBooths } = await supabase
      .from('market_booths')
      .select('owner_id, booth_zip, pickup_zip, booth_city, booth_state')
      .eq('status', 'active')

    return NextResponse.json({
      crmInterests: crmInterests || [],
      profiles: profiles || [],
      marketProducts: marketProducts || [],
      marketBooths: marketBooths || [],
    })
  } catch (err: any) {
    console.error('[API /api/crm/produce-demand] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
