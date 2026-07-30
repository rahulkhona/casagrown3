import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/crm/short-links
 *
 * Creates a new short link in crm_short_links and returns the token & short_url.
 * Body: { destination_url, campaign_id?, label? }
 */
export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

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

  const generateToken = () =>
    Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6)

  let token = generateToken()

  if (supabaseUrl && serviceRoleKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey)
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

      if (data?.token) {
        token = data.token
      }
    } catch {
      // Fallback to client-generated token if DB unavailable
    }
  }

  const origin = req.nextUrl.origin || 'https://casagrown.com'

  return NextResponse.json({
    token,
    short_url: `${origin}/r/${token}`,
  })
}

export async function PATCH(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, is_shared } = body as {
    token?: string
    is_shared?: boolean
  }

  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  if (supabaseUrl && serviceRoleKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      await supabase
        .from('crm_short_links')
        .update({
          is_shared: is_shared ?? true,
          shared_at: is_shared !== false ? new Date().toISOString() : null,
        })
        .eq('token', token)
    } catch {}
  }

  return NextResponse.json({ success: true })
}
