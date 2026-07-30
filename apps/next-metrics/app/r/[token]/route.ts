import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /r/[token]
 *
 * Branded short link redirect for next-metrics.
 * Looks up token in crm_short_links, increments click_count, and redirects to destination_url.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const defaultUrl = new URL('/', req.nextUrl.origin)

  try {
    const { token } = await params
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: link, error } = await supabase
      .from('crm_short_links')
      .select('id, destination_url, clicked_at, click_count')
      .eq('token', token)
      .single()

    if (error || !link || !link.destination_url) {
      return NextResponse.redirect(defaultUrl, { status: 302 })
    }

    const now = new Date().toISOString()
    void supabase
      .from('crm_short_links')
      .update({
        clicked_at: link.clicked_at ?? now,
        click_count: (link.click_count ?? 0) + 1,
      })
      .eq('id', link.id)
      .then(() => {})

    return NextResponse.redirect(new URL(link.destination_url, req.nextUrl.origin), { status: 302 })
  } catch {
    return NextResponse.redirect(defaultUrl, { status: 302 })
  }
}
