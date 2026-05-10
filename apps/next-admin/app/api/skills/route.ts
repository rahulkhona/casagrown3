import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data, error } = await supabase.from('growbot_skills').select('*').order('created_at', { ascending: true })
    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const payload = await req.json()
    
    // Ensure schema_properties is JSONB format
    let schemaProps = payload.schema_properties;
    if (typeof schemaProps === 'string') {
        try { schemaProps = JSON.parse(schemaProps); } catch(e){}
    }
    
    let result;
    if (payload.id) {
       // Update
       const { data, error } = await supabase.from('growbot_skills').update({
           name: payload.name,
           trigger_rules: payload.trigger_rules,
           schema_properties: schemaProps,
           template: payload.template,
           is_active: payload.is_active,
           updated_at: new Date().toISOString()
       }).eq('id', payload.id).select().single()
       if (error) throw error
       result = data
    } else {
       // Insert
       const { data, error } = await supabase.from('growbot_skills').insert({
           name: payload.name,
           trigger_rules: payload.trigger_rules,
           schema_properties: schemaProps || [],
           template: payload.template,
           is_active: payload.is_active !== undefined ? payload.is_active : true
       }).select().single()
       if (error) throw error
       result = data
    }
    
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
