import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Generate a short random token (8 chars, URL-safe) */
function generateToken(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789' // no lookalikes (0/o/1/l/i)
  let token = ''
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

export async function POST(request: Request) {
  try {

    const body = await request.json()
    const { destination_url, campaign_id, label, sequence_id, node_id } = body

    if (!destination_url) {
      return NextResponse.json({ error: 'destination_url is required' }, { status: 400 })
    }

    // Generate a unique token (retry on collision)
    let token = generateToken()
    let attempts = 0
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from('crm_short_links')
        .select('id')
        .eq('token', token)
        .maybeSingle()
      if (!existing) break
      token = generateToken()
      attempts++
    }

    const { data, error } = await supabase
      .from('crm_short_links')
      .insert({
        token,
        destination_url,
        campaign_id: campaign_id || null,
        label: label || null,
        sequence_id: sequence_id || null,
        node_id: node_id || null,
      })
      .select('token')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Build the short URL using the market domain
    const marketDomain = process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : 'https://casagrown.com'

    return NextResponse.json({
      token: data.token,
      short_url: `${marketDomain}/r/${data.token}`,
      destination_url,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
