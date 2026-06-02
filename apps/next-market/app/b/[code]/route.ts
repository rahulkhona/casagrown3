import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /b/[code]?ref=facebook
 *
 * Permanent booth deep link.
 * Looks up booth from market_booths.short_code,
 * logs click with channel attribution, redirects to
 * /market/booth/{booth_id}.
 *
 * The booth UUID is never exposed in the external URL.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://casagrown.com'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data: booth, error } = await supabase
    .from('market_booths')
    .select('id')
    .eq('short_code', code)
    .single()

  if (error || !booth) {
    return NextResponse.redirect(new URL('/market', siteUrl), { status: 302 })
  }

  const channel = req.nextUrl.searchParams.get('ref') || 'direct'
  const referrer = req.headers.get('referer') || null

  // Log click (fire-and-forget)
  Promise.resolve(
    supabase
      .from('short_link_clicks')
      .insert({
        link_type: 'booth',
        short_code: code,
        target_id: booth.id,
        channel,
        referrer,
      })
  ).catch((err) => console.error('[BOOTH-LINK] Click log failed:', err))

  return NextResponse.redirect(
    new URL(`/market/booth/${booth.id}`, siteUrl).toString(),
    { status: 302 },
  )
}
