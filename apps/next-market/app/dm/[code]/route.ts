import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /dm/[code]?ref=facebook
 *
 * Permanent seller DM deep link.
 * Looks up seller from profiles.dm_short_code,
 * logs click with channel attribution, redirects to
 * /messages/new?userId={seller_id}.
 *
 * The seller UUID is never exposed in the external URL.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://casagrown.com'

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('dm_short_code', code)
    .single()

  if (error || !profile) {
    return NextResponse.redirect(new URL('/market', siteUrl), { status: 302 })
  }

  const channel = req.nextUrl.searchParams.get('ref') || 'direct'
  const referrer = req.headers.get('referer') || null

  // Log click (fire-and-forget)
  Promise.resolve(
    supabase
      .from('short_link_clicks')
      .insert({
        link_type: 'dm',
        short_code: code,
        target_id: profile.id,
        channel,
        referrer,
      })
  ).catch((err) => console.error('[DM-LINK] Click log failed:', err))

  const dmUrl = new URL('/messages/new', siteUrl)
  dmUrl.searchParams.set('userId', profile.id)

  return NextResponse.redirect(dmUrl.toString(), { status: 302 })
}
