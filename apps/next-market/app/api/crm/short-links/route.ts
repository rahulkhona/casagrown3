import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/crm/short-links
 *
 * Creates a new short link in crm_short_links and returns the token.
 * Body: { destination_url, campaign_id?, label? }
 * Returns: { token, short_url }
 *
 * Uses service role key — only callable server-side or from trusted admin contexts.
 */
export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { destination_url, campaign_id, label } = body as {
    destination_url?: string
    campaign_id?: string
    label?: string
  }

  if (!destination_url) {
    return NextResponse.json({ error: 'destination_url is required' }, { status: 400 })
  }

  // Generate an 8-char alphanumeric token — retry once on collision
  const generateToken = () =>
    Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6)

  let token = generateToken()

  const { data, error } = await supabase
    .from('crm_short_links')
    .insert({
      token,
      destination_url,
      campaign_id: campaign_id || null,
      label: label || null,
    })
    .select('token')
    .single()

  // Handle rare token collision with one retry
  if (error && error.code === '23505') {
    token = generateToken()
    const retry = await supabase
      .from('crm_short_links')
      .insert({ token, destination_url, campaign_id: campaign_id || null, label: label || null })
      .select('token')
      .single()
    if (retry.error) {
      return NextResponse.json({ error: retry.error.message }, { status: 500 })
    }
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const finalToken = data?.token || token
  const host = process.env.NEXT_PUBLIC_MARKET_URL || 'https://casagrown.com'

  return NextResponse.json({
    token: finalToken,
    short_url: `${host}/r/${finalToken}`,
  })
}
