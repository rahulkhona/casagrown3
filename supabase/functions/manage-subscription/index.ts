/**
 * manage-subscription — User-facing subscription management
 *
 * POST /functions/v1/manage-subscription
 * Body: { action: 'status' | 'cancel' | 'portal' }
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

  const { action, return_path } = await req.json()
  const returnTo = return_path || '/profile'
  const STRIPE_SECRET_KEY = env('STRIPE_SECRET_KEY', true)!
  const stripeBase = getStripeApiBase()

  // Get subscription record
  const { data: sub } = await supabase
    .from('seller_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  switch (action) {
    // ── Status check ──
    case 'status': {
      if (!sub) {
        return jsonOk({
          plan: 'free',
          status: 'inactive',
          isPro: false,
        }, corsHeaders)
      }

      return jsonOk({
        plan: sub.plan,
        status: sub.status,
        isPro: sub.plan === 'pro' && ['active', 'trialing'].includes(sub.status),
        trialEndsAt: sub.trial_ends_at,
        currentPeriodEnd: sub.current_period_end,
        currentPeriodStart: sub.current_period_start,
        canceledAt: sub.canceled_at,
      }, corsHeaders)
    }

    // ── Cancel subscription (at period end) ──
    case 'cancel': {
      if (!sub?.stripe_subscription_id) {
        return jsonError('No active subscription to cancel', corsHeaders, 400)
      }

      // Only call Stripe API if we have a real Stripe subscription ID
      const isRealStripeSub = sub.stripe_subscription_id.startsWith('sub_') && !sub.stripe_subscription_id.startsWith('sub_sim_')
      if (isRealStripeSub) {
        const cancelRes = await fetch(
          `${stripeBase}/v1/subscriptions/${sub.stripe_subscription_id}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ cancel_at_period_end: 'true' }),
          },
        )

        if (!cancelRes.ok) {
          const errText = await cancelRes.text()
          console.error('Stripe cancel failed:', errText)
          return jsonError('Failed to cancel subscription', corsHeaders)
        }
      }

      await supabase
        .from('seller_subscriptions')
        .update({ canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId)

      return jsonOk({ success: true, canceledAt: new Date().toISOString() }, corsHeaders)
    }

    // ── Resume subscription (undo pending cancellation) ──
    case 'resume': {
      if (!sub?.stripe_subscription_id) {
        return jsonError('No subscription to resume', corsHeaders, 400)
      }

      // Only call Stripe API if we have a real Stripe subscription ID
      const isRealSub = sub.stripe_subscription_id.startsWith('sub_') && !sub.stripe_subscription_id.startsWith('sub_sim_')
      if (isRealSub) {
        const resumeRes = await fetch(
          `${stripeBase}/v1/subscriptions/${sub.stripe_subscription_id}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ cancel_at_period_end: 'false' }),
          },
        )

        if (!resumeRes.ok) {
          const errText = await resumeRes.text()
          console.error('Stripe resume failed:', errText)
          return jsonError('Failed to resume subscription', corsHeaders)
        }
      }

      await supabase
        .from('seller_subscriptions')
        .update({ canceled_at: null, updated_at: new Date().toISOString() })
        .eq('user_id', userId)

      return jsonOk({ success: true }, corsHeaders)
    }

    // ── Billing portal ──
    case 'portal': {
      if (!sub?.stripe_customer_id) {
        return jsonError('No billing account found', corsHeaders, 400)
      }

      const portalRes = await fetch(`${stripeBase}/v1/billing_portal/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          customer: sub.stripe_customer_id,
          return_url: `${siteUrl}${returnTo}`,
        }),
      })

      if (!portalRes.ok) {
        const errText = await portalRes.text()
        console.error('Stripe portal failed:', errText)
        return jsonError('Failed to create billing portal', corsHeaders)
      }

      const portal = await portalRes.json()
      return jsonOk({ url: portal.url }, corsHeaders)
    }

    // ── Create checkout session ──
    case 'checkout': {
      // Get user email — try auth admin first, fall back to profiles table
      let userEmail: string | null = null
      try {
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)
        userEmail = authUser?.email ?? null
      } catch { /* admin API may not be available */ }

      if (!userEmail) {
        // Fallback: get email from auth.users via service role
        const { data: authRow } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .single()
        // Try raw SQL query for auth.users
        const { data: emailRow } = await supabase.rpc('get_user_email', { uid: userId }).maybeSingle()
        userEmail = emailRow?.email ?? `${userId}@placeholder.local`
      }

      // Get platform settings for trial days
      const { data: settings } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'pro_free_trial_days')
        .maybeSingle()
      const trialDays = settings?.value ? parseInt(settings.value, 10) : 0

      // Get or create Stripe customer
      let customerId = sub?.stripe_customer_id
      if (!customerId) {
        const custRes = await fetch(`${stripeBase}/v1/customers`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            email: userEmail,
            'metadata[supabase_user_id]': userId,
          }),
        })
        if (!custRes.ok) {
          const errText = await custRes.text()
          console.error('Stripe customer creation failed:', errText)
          return jsonError('Failed to create billing account', corsHeaders)
        }
        const cust = await custRes.json()
        customerId = cust.id
      }

      // Get the Pro price ID from env
      const PRICE_ID = env('STRIPE_PRO_PRICE_ID', true)!

      // Build checkout session params
      const params: Record<string, string> = {
        'mode': 'subscription',
        'customer': customerId,
        'line_items[0][price]': PRICE_ID,
        'line_items[0][quantity]': '1',
        'metadata[supabase_user_id]': userId,
        'subscription_data[metadata][supabase_user_id]': userId,
      }

      // Embedded mode: renders checkout inline in the page
      params['ui_mode'] = 'embedded'
      params['return_url'] = `${siteUrl}${returnTo}?pro=success&session_id={CHECKOUT_SESSION_ID}`

      if (trialDays > 0) {
        params['subscription_data[trial_period_days]'] = String(trialDays)
      }

      const checkoutRes = await fetch(`${stripeBase}/v1/checkout/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params),
      })

      if (!checkoutRes.ok) {
        const errText = await checkoutRes.text()
        console.error('Stripe checkout failed:', errText)
        return jsonError('Failed to create checkout session', corsHeaders)
      }

      const session = await checkoutRes.json()

      // Create subscription record immediately so Pro status reflects right away.
      // The Stripe webhook will update it later with the real subscription ID.
      const now = new Date().toISOString()
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      await supabase
        .from('seller_subscriptions')
        .upsert({
          user_id: userId,
          plan: 'pro',
          status: trialDays > 0 ? 'trialing' : 'active',
          stripe_customer_id: customerId,
          stripe_subscription_id: session.subscription || `pending_${session.id}`,
          current_period_start: now,
          current_period_end: periodEnd,
          trial_ends_at: trialDays > 0 ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString() : null,
          canceled_at: null,
          created_at: now,
          updated_at: now,
        }, { onConflict: 'user_id' })

      // Set is_pro on profile immediately
      await supabase.from('profiles').update({ is_pro: true }).eq('id', userId)

      return jsonOk({ clientSecret: session.client_secret }, corsHeaders)
    }

    default:
      return jsonError(`Unknown action: ${action}`, corsHeaders, 400)
  }
})
