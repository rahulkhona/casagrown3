import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/crm/track
 *
 * Page visit beacon — called on every marketing page load and on unload.
 * Body:
 *   { type: 'visit', session_id, page_slug, referrer, utm_source, utm_campaign,
 *     utm_content, utm_medium }
 *   { type: 'update', session_id, duration_secs, converted, lead_id }
 */
export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Degrade gracefully in local dev when service role key is not configured
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[CRM-TRACK] Missing Supabase credentials — skipping tracking')
    return NextResponse.json({ ok: true, skipped: true })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = body.type as string

  // Geo from Vercel/CF headers (populated in production; empty locally)
  const country = req.headers.get('x-vercel-ip-country') ??
    req.headers.get('cf-ipcountry') ?? null
  const region = req.headers.get('x-vercel-ip-country-region') ?? null
  const city = req.headers.get('x-vercel-ip-city') ?? req.headers.get('cf-ipcity') ?? null
  const zip_code = req.headers.get('x-vercel-ip-postal-code') ?? req.headers.get('cf-postal-code') ?? null

  if (type === 'visit') {
    const { error } = await supabase.from('crm_page_visits').insert({
      session_id: body.session_id,
      page_slug: body.page_slug,
      referrer: body.referrer ?? null,
      utm_source: body.utm_source ?? null,
      utm_campaign: body.utm_campaign ?? null,
      utm_content: body.utm_content ?? null,
      utm_medium: body.utm_medium ?? null,
      country,
      region,
      city,
      zip_code,
    })

    if (error) {
      console.error('[CRM-TRACK] Insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (type === 'update') {
    // Update the most recent visit for this session with duration + conversion
    const { error } = await supabase
      .from('crm_page_visits')
      .update({
        duration_secs: body.duration_secs ?? null,
        converted: body.converted ?? false,
        lead_id: body.lead_id ?? null,
      })
      .eq('session_id', body.session_id as string)
      .order('visited_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error('[CRM-TRACK] Update error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (type === 'event') {
    const { error } = await supabase.from('crm_page_events').insert({
      session_id: body.session_id,
      page_slug: body.page_slug,
      event_type: body.event_type,
      event_data: body.event_data ?? {},
    })

    if (error) {
      console.error('[CRM-TRACK] Event insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
