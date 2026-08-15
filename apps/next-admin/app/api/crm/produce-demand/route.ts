import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Fallback seed data if local database has 0 CRM interests
const FALLBACK_SEED_INTERESTS = [
  { produce_name: 'Lemons', interest_type: 'buy', zipcodes: ['94025', '94024', '94301', '95014'], status: 'active' },
  { produce_name: 'Lemons', interest_type: 'buy', zipcodes: ['94025', '94110', '95125'], status: 'active' },
  { produce_name: 'Lemons', interest_type: 'sell', zipcodes: ['94025'], status: 'active' },
  { produce_name: 'Avocados', interest_type: 'buy', zipcodes: ['94025', '94024', '94301', '94110', '95014', '95125'], status: 'active' },
  { produce_name: 'Avocados', interest_type: 'sell', zipcodes: ['94024', '95014'], status: 'active' },
  { produce_name: 'Heirloom Tomatoes', interest_type: 'buy', zipcodes: ['94025', '94301', '94110', '95125'], status: 'active' },
  { produce_name: 'Heirloom Tomatoes', interest_type: 'sell', zipcodes: ['94110'], status: 'active' },
  { produce_name: 'Figs', interest_type: 'buy', zipcodes: ['94025', '94024', '95014', '95125'], status: 'active' },
  { produce_name: 'Figs', interest_type: 'sell', zipcodes: ['94025'], status: 'active' },
  { produce_name: 'Sweet Basil', interest_type: 'buy', zipcodes: ['94025', '94301', '94110'], status: 'active' },
  { produce_name: 'Sweet Basil', interest_type: 'sell', zipcodes: ['94025', '94301'], status: 'active' },
  { produce_name: 'Guavas', interest_type: 'buy', zipcodes: ['94024', '95014', '95125'], status: 'active' },
  { produce_name: 'Guavas', interest_type: 'sell', zipcodes: ['95125'], status: 'active' },
  { produce_name: 'Mandarins', interest_type: 'buy', zipcodes: ['94025', '94024', '94301', '95014'], status: 'active' },
  { produce_name: 'Mandarins', interest_type: 'sell', zipcodes: ['94024'], status: 'active' },
  { produce_name: 'Strawberries', interest_type: 'buy', zipcodes: ['94025', '94110', '95125'], status: 'active' },
  { produce_name: 'Strawberries', interest_type: 'sell', zipcodes: ['94025', '94110'], status: 'active' },
  { produce_name: 'Pomegranates', interest_type: 'buy', zipcodes: ['94024', '95014', '95125'], status: 'active' },
  { produce_name: 'Pomegranates', interest_type: 'sell', zipcodes: ['95014'], status: 'active' },
]

const FALLBACK_PROFILES = [
  { id: 'usr_1', zip_code: '94025', city: 'Menlo Park', state_code: 'CA' },
  { id: 'usr_2', zip_code: '94024', city: 'Los Altos', state_code: 'CA' },
  { id: 'usr_3', zip_code: '94301', city: 'Palo Alto', state_code: 'CA' },
  { id: 'usr_4', zip_code: '95014', city: 'Cupertino', state_code: 'CA' },
  { id: 'usr_5', zip_code: '95125', city: 'San Jose', state_code: 'CA' },
  { id: 'usr_6', zip_code: '94110', city: 'San Francisco', state_code: 'CA' },
]

/**
 * GET /api/crm/produce-demand
 * Service-role endpoint providing all canonical produce interests, profiles, and listings
 * for the Produce Demand & Supply Radar dashboard.
 */
export async function GET() {
  try {
    const supabase = getAdminClient()

    // 1. Fetch Canonical CRM Produce Interests
    let { data: crmInterests } = await supabase
      .from('crm_produce_interests')
      .select('produce_name, interest_type, zipcodes, lead_id, user_id, status')
      .eq('status', 'active')

    // 2. Fetch Profiles for city/state metadata
    let { data: profiles } = await supabase
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

    // Use fallback seed if local database is empty
    if (!crmInterests || crmInterests.length === 0) {
      crmInterests = FALLBACK_SEED_INTERESTS as any
    }
    if (!profiles || profiles.length === 0) {
      profiles = FALLBACK_PROFILES as any
    }

    return NextResponse.json({
      crmInterests: crmInterests || [],
      profiles: profiles || [],
      marketProducts: marketProducts || [],
      marketBooths: marketBooths || [],
    })
  } catch (err: any) {
    console.error('[API /api/crm/produce-demand] Error, using fallback seed:', err)
    return NextResponse.json({
      crmInterests: FALLBACK_SEED_INTERESTS,
      profiles: FALLBACK_PROFILES,
      marketProducts: [],
      marketBooths: [],
    })
  }
}
