import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * POST /api/crm/promotions
 * Creates or updates a promotion bundle (promotion + optional giveaway + optional credits + short link).
 * Uses service role to bypass RLS.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, ...payload } = body

    if (action === 'upsert_promotion') {
      const { id, ...fields } = payload
      if (id) {
        const { error } = await supabase.from('crm_promotions').update(fields).eq('id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ id })
      } else {
        const { data, error } = await supabase.from('crm_promotions').insert(fields).select().single()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data)
      }
    }

    if (action === 'upsert_giveaway') {
      const { data, error } = await supabase.from('crm_promo_giveaways')
        .upsert(payload, { onConflict: 'promotion_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete_giveaway') {
      await supabase.from('crm_promo_giveaways').delete().eq('promotion_id', payload.promotion_id)
      return NextResponse.json({ ok: true })
    }

    if (action === 'upsert_credits') {
      const { data, error } = await supabase.from('crm_recurring_user_incentives_blueprint')
        .upsert(payload, { onConflict: 'promotion_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete_credits') {
      await supabase.from('crm_recurring_user_incentives_blueprint').delete().eq('promotion_id', payload.promotion_id)
      return NextResponse.json({ ok: true })
    }

    if (action === 'ensure_short_link') {
      const { destination_url, suffix_match } = payload
      // Check if short link already exists
      const { data: existing } = await supabase.from('crm_short_links')
        .select('token')
        .ilike('destination_url', `%${suffix_match}`)
        .is('campaign_id', null)
        .maybeSingle()
      
      if (existing) {
        return NextResponse.json({ token: existing.token, existed: true })
      }

      // Generate token
      const token = 'P-' + Math.random().toString(36).substring(2, 8).toUpperCase()
      const { error } = await supabase.from('crm_short_links').insert({ token, destination_url })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ token, existed: false })
    }

    if (action === 'upsert_sub_discount') {
      const { data, error } = await supabase.from('crm_promo_subscription_discounts')
        .upsert(payload, { onConflict: 'promotion_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete_sub_discount') {
      await supabase.from('crm_promo_subscription_discounts').delete().eq('promotion_id', payload.promotion_id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
