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
  const homeUrl = new URL('/', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://casagrown.com')

  try {
    const { token } = await params

    // Use service role key — anon can select but this needs to write
    // Fall back to anon key in local dev (click tracking won't persist but redirect still works)
    const supabaseUrl = process.env.SUPABASE_URL || process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Look up the link
    const { data: link, error } = await supabase
      .from('crm_short_links')
      .select('id, destination_url, campaign_id, recipient_id, recipient_type, clicked_at, click_count')
      .eq('token', token)
      .single()

    if (error || !link) {
      // Redirect to home rather than 404 for graceful degradation
      return NextResponse.redirect(homeUrl, { status: 301 })
    }

    const now = new Date().toISOString()

    // Update click tracking (fire-and-forget — don't await, don't block redirect)
    void supabase
      .from('crm_short_links')
      .update({
        clicked_at: link.clicked_at ?? now, // only set first click
        click_count: (link.click_count ?? 0) + 1,
      })
      .eq('id', link.id)
      .then(() => {})

    // Update crm_campaign_sends.clicked_at for this recipient
    if (link.campaign_id && link.recipient_id) {
      void supabase
        .from('crm_campaign_sends')
        .update({ clicked_at: now })
        .eq('campaign_id', link.campaign_id)
        .eq('recipient_id', link.recipient_id)
        .is('clicked_at', null)
        .then(() => {})
    }

    let finalUrl = link.destination_url

    // Dynamically inject the campaign_id to automatically attribute the lead
    if (link.campaign_id) {
      try {
        const urlObj = new URL(finalUrl, process.env.NEXT_PUBLIC_SITE_URL ?? 'https://casagrown.com')
        if (!urlObj.searchParams.has('utm_campaign') && !urlObj.searchParams.has('campaign_id')) {
          urlObj.searchParams.set('campaign_id', link.campaign_id)
          finalUrl = urlObj.toString()
        }
      } catch (e) {
        // Ignore URL parsing errors and fallback to original
      }
    }

    return NextResponse.redirect(finalUrl, { status: 301 })
  } catch (e) {
    // Graceful fallback: any uncaught error (bad env vars, DB timeout, etc.)
    // still redirects to the homepage instead of showing a 500 error page
    // which would appear as a blank screen with just the logo in the mobile app WebView.
    console.error('[/r/ redirect] Uncaught error, falling back to home:', e)
    return NextResponse.redirect(homeUrl, { status: 302 })
  }
}
