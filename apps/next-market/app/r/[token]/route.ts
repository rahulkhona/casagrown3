import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /r/[token]
 *
 * Branded short link redirect.
 * Looks up token in crm_short_links, increments click_count, sets clicked_at,
 * updates crm_campaign_sends.clicked_at for the recipient, then 301 redirects.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // Use service role key — anon can select but this needs to write
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Look up the link
  const { data: link, error } = await supabase
    .from('crm_short_links')
    .select('id, destination_url, campaign_id, recipient_id, recipient_type, clicked_at, click_count')
    .eq('token', token)
    .single()

  if (error || !link) {
    // Redirect to home rather than 404 for graceful degradation
    return NextResponse.redirect(
      new URL('/', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://casagrown.com'),
      { status: 301 },
    )
  }

  const now = new Date().toISOString()

  // Update click tracking (fire-and-forget)
  await supabase
    .from('crm_short_links')
    .update({
      clicked_at: link.clicked_at ?? now, // only set first click
      click_count: (link.click_count ?? 0) + 1,
    })
    .eq('id', link.id)

  // Update crm_campaign_sends.clicked_at for this recipient
  if (link.campaign_id && link.recipient_id) {
    await supabase
      .from('crm_campaign_sends')
      .update({ clicked_at: now })
      .eq('campaign_id', link.campaign_id)
      .eq('recipient_id', link.recipient_id)
      .is('clicked_at', null)
  }

  return NextResponse.redirect(link.destination_url, { status: 301 })
}
