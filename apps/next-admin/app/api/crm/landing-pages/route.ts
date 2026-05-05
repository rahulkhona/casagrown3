import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * POST /api/crm/landing-pages
 * Creates a new landing page registration (service role bypasses RLS).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { title, slug, description, is_active } = body

    if (!title || !slug) {
      return NextResponse.json({ error: 'title and slug are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('crm_landing_pages')
      .insert({
        title,
        slug,
        description: description || null,
        is_active: is_active ?? true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
