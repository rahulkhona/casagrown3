/**
 * create-pro-checkout — Creates a Stripe Checkout Session for Pro subscription
 *
 * POST /functions/v1/create-pro-checkout
 * Body: { promo_code?: string }
 * Auth: Bearer token (user JWT)
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { getStripeApiBase } from '../_shared/stripe.ts'

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth
  const userId = auth

  if (userId === 'service_role') {
    return jsonError('User auth required', corsHeaders, 403)
  }

  const { promo_code, return_path } = await req.json()
  const returnTo = return_path || '/profile'
  const STRIPE_SECRET_KEY = env('STRIPE_SECRET_KEY', true)!
  const STRIPE_PRO_PRICE_ID = env('STRIPE_PRO_PRICE_ID', true)!
  const stripeBase = getStripeApiBase()

  // 1. Check if already subscribed
  const { data: existingSub } = await supabase
    .from('seller_subscriptions')
    .select('id, plan, status, stripe_customer_id')
    .eq('user_id', userId)
    .single()

  if (existingSub?.plan === 'pro' && ['active', 'trialing'].includes(existingSub.status)) {
    return jsonError('You already have an active Pro subscription', corsHeaders, 409)
  }

  // 2. Validate promo code (if provided)
  let stripeCouponId: string | null = null
  if (promo_code) {
    const { data: promo, error: promoErr } = await supabase
      .from('subscription_promos')
      .select('*')
      .eq('code', promo_code.toUpperCase())
      .eq('is_active', true)
      .single()

    if (promoErr || !promo) {
      return jsonError('Invalid promo code', corsHeaders, 400)
    }

    if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
      return jsonError('This promo code has expired', corsHeaders, 400)
    }

    if (promo.max_uses && promo.used_count >= promo.max_uses) {
      return jsonError('This promo code has been fully redeemed', corsHeaders, 400)
    }

    stripeCouponId = promo.stripe_coupon_id
  }

  // 3. Get or create Stripe customer
  let stripeCustomerId = existingSub?.stripe_customer_id

  if (!stripeCustomerId) {
    // Get user email for Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    // Create Stripe customer
    const customerRes = await fetch(`${stripeBase}/v1/customers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email: profile?.email || '',
        name: profile?.full_name || '',
        'metadata[user_id]': userId,
      }),
    })

    if (!customerRes.ok) {
      const errText = await customerRes.text()
      console.error('Stripe customer creation failed:', errText)
      return jsonError('Failed to create billing account', corsHeaders)
    }

    const customer = await customerRes.json()
    stripeCustomerId = customer.id
  }

  // 4. Build Checkout Session params
  const params = new URLSearchParams({
    'mode': 'subscription',
    'customer': stripeCustomerId!,
    'line_items[0][price]': STRIPE_PRO_PRICE_ID,
    'line_items[0][quantity]': '1',
    'subscription_data[trial_period_days]': '14',
    'subscription_data[metadata][user_id]': userId,
    'ui_mode': 'embedded',
    'return_url': `${siteUrl}${returnTo}?upgraded=true&session_id={CHECKOUT_SESSION_ID}`,
  })

  if (stripeCouponId) {
    params.append('discounts[0][coupon]', stripeCouponId)
  }

  // 5. Create Checkout Session
  const sessionRes = await fetch(`${stripeBase}/v1/checkout/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  if (!sessionRes.ok) {
    const errText = await sessionRes.text()
    console.error('Stripe session creation failed:', errText)
    return jsonError('Failed to create checkout session', corsHeaders)
  }

  const session = await sessionRes.json()

  // 6. Upsert subscription record (inactive until webhook confirms)
  await supabase
    .from('seller_subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      plan: 'pro',
      status: 'inactive',
      promo_code: promo_code?.toUpperCase() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  // Also set is_pro on profile so it's reflected immediately
  // (In production, the Stripe webhook also sets this after payment confirmation)
  await supabase.from('profiles').update({ is_pro: true }).eq('id', userId)

  // 7. Increment promo used_count
  if (promo_code) {
    await supabase.rpc('increment_promo_used', { p_code: promo_code.toUpperCase() })
      .then(({ error }) => {
        // Fallback: direct update if RPC doesn't exist yet
        if (error) {
          supabase
            .from('subscription_promos')
            .update({ used_count: (existingSub as any)?.used_count + 1 || 1 })
            .eq('code', promo_code.toUpperCase())
        }
      })
  }

  return jsonOk({ clientSecret: session.client_secret }, corsHeaders)
})
