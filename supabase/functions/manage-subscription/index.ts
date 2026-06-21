/**
 * manage-subscription — User-facing subscription management
 *
 * POST /functions/v1/manage-subscription
 * Body: { action: 'status' | 'cancel' | 'portal' }
 * Auth: Bearer token (user JWT)
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { getStripeApiBase } from '../_shared/stripe.ts'
import { sendTransactionEmail, getUserEmail } from '../_shared/postmark.ts'
import { wrapInBrandedTemplate } from '../_shared/email-templates.ts'
import { createTwilioSubaccount, provisionWhatsAppNumber, releasePhoneNumber } from '../_shared/twilio.ts'

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth
  let userId = auth

  // Allow service_role to impersonate a user (for integration tests)
  const body = await req.json()
  if (userId === 'service_role' && body.user_id) {
    userId = body.user_id
  } else if (userId === 'service_role') {
    return jsonError('User auth required', corsHeaders, 403)
  }

  const { action, return_path, session_id } = body
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
        isPro: sub.plan === 'pro' && ['active', 'trialing', 'canceling'].includes(sub.status),
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

      // BUG-35: Set status to 'canceling' — user keeps Pro features until period end.
      // When Stripe fires customer.subscription.deleted, the webhook handler
      // sets status='canceled' and is_pro=false (see stripe-subscription-webhook).
      await supabase
        .from('seller_subscriptions')
        .update({ status: 'canceling', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId)

      // Automatically release and cleanup Twilio number if it was provisioned by us
      await cleanupTwilioNumber(supabase, userId)

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

      // Check if upgrading/downgrading from an existing active paid plan and calculate proration credit
      const targetPlan = body.plan || 'pro'
      if (
        sub &&
        sub.stripe_subscription_id &&
        sub.stripe_subscription_id.startsWith('sub_') &&
        !sub.stripe_subscription_id.startsWith('sub_sim_') &&
        ['active', 'trialing'].includes(sub.status)
      ) {
        const now = new Date()
        const start = sub.current_period_start ? new Date(sub.current_period_start) : null
        const end = sub.current_period_end ? new Date(sub.current_period_end) : null

        if (start && end && end > now && now >= start) {
          const totalDuration = end.getTime() - start.getTime()
          const remainingDuration = end.getTime() - now.getTime()
          const ratio = remainingDuration / totalDuration

          if (ratio > 0 && ratio <= 1) {
            // Get previous tier price
            const { data: prevTier } = await supabase
              .from('subscription_tiers')
              .select('subscription_price')
              .eq('tier_name', sub.plan)
              .maybeSingle()

            const prevPrice = prevTier?.subscription_price ?? (sub.plan === 'elite' ? 29.00 : 10.00)
            const creditAmountUsd = prevPrice * ratio
            const creditAmountCents = Math.round(creditAmountUsd * 100)

            if (creditAmountCents > 0) {
              console.log(`[PRORATION] Crediting customer ${customerId} with $${creditAmountUsd.toFixed(2)} for remaining ${Math.round(ratio * 100)}% of plan ${sub.plan}`)
              try {
                // Add balance credit to Stripe Customer (negative amount represents a credit in Stripe)
                const balanceRes = await fetch(`${stripeBase}/v1/customers/${customerId}/balance_transactions`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                    amount: String(-creditAmountCents),
                    currency: 'usd',
                    description: `Prorated credit for remaining time on ${sub.plan} subscription switch to ${targetPlan}`,
                  }),
                })

                if (!balanceRes.ok) {
                  console.error('Failed to apply Stripe customer balance credit:', await balanceRes.text())
                } else {
                  console.log(`Successfully credited customer balance for proration: $${creditAmountUsd.toFixed(2)}`)
                }
              } catch (balErr) {
                console.error('Error applying Stripe balance credit:', balErr)
              }
            }
          }
        }
      }

      // Determine plan - accept pro or elite
      const plan = targetPlan

      // Get plan price dynamically from subscription_tiers
      const { data: tier } = await supabase
        .from('subscription_tiers')
        .select('subscription_price, display_name')
        .eq('tier_name', plan)
        .maybeSingle()

      const monthlyPriceUsd = tier?.subscription_price ?? (plan === 'elite' ? 29.00 : 10.00)
      const displayName = tier?.display_name ?? (plan === 'elite' ? 'CasaGrown Elite' : 'CasaGrown Pro')
      
      // Check for user-specific active discounts for the selected plan (highest discount first)
      const { data: discounts } = await supabase
        .from('user_subscription_discounts')
        .select('id, discount_pct, duration_months, discount_id, crm_promo_subscription_discounts!inner(plan, stripe_coupon_id)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('crm_promo_subscription_discounts.plan', plan)
        .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
        .order('discount_pct', { ascending: false })
        .limit(1)

      const discount = discounts?.[0] ?? null
      const priceInCents = Math.round(monthlyPriceUsd * 100)

      // Always create Stripe Price at FULL price — discounts are handled via Stripe Coupons
      const priceParams = new URLSearchParams({
        'unit_amount': String(priceInCents),
        'currency': 'usd',
        'recurring[interval]': 'month',
        'product_data[name]': displayName,
      })
      const priceRes = await fetch(`${stripeBase}/v1/prices`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: priceParams,
      })
      if (!priceRes.ok) {
        console.error('Failed to create dynamic price:', await priceRes.text())
        return jsonError('Failed to set up pricing', corsHeaders)
      }
      const priceData = await priceRes.json()
      const priceId = priceData.id

      // If discount exists, create or reuse a Stripe Coupon
      let stripeCouponId: string | null = null
      if (discount) {
        const blueprint = (discount as any).crm_promo_subscription_discounts
        stripeCouponId = blueprint?.stripe_coupon_id ?? null

        if (!stripeCouponId) {
          // Create a new Stripe Coupon for this promotion blueprint
          const couponParams: Record<string, string> = {
            'percent_off': String(discount.discount_pct),
            'currency': 'usd',
            'name': `${displayName} — ${discount.discount_pct}% off`,
          }

          if (discount.duration_months) {
            // Add +1 month to cover the prorated partial first billing month
            // User sees "3 months" but coupon lasts 4 invoices so they get at least 3 full months
            couponParams['duration'] = 'repeating'
            couponParams['duration_in_months'] = String(discount.duration_months + 1)
          } else {
            // NULL duration = perpetual discount
            couponParams['duration'] = 'forever'
          }

          const couponRes = await fetch(`${stripeBase}/v1/coupons`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(couponParams),
          })

          if (couponRes.ok) {
            const couponData = await couponRes.json()
            stripeCouponId = couponData.id
            console.log(`[CHECKOUT] Created Stripe Coupon ${stripeCouponId}: ${discount.discount_pct}% off for ${discount.duration_months ? discount.duration_months + 1 : 'forever'} months`)

            // Store the coupon ID back on the blueprint for reuse
            if (discount.discount_id) {
              await supabase
                .from('crm_promo_subscription_discounts')
                .update({ stripe_coupon_id: stripeCouponId })
                .eq('id', discount.discount_id)
            }
          } else {
            console.error('[CHECKOUT] Failed to create Stripe Coupon:', await couponRes.text())
            // Fall through — checkout will proceed without coupon (full price)
          }
        }

        // Also store coupon ID on the user's discount record
        if (stripeCouponId) {
          await supabase
            .from('user_subscription_discounts')
            .update({ stripe_coupon_id: stripeCouponId })
            .eq('id', discount.id)
        }
      }

      // Build checkout session params
      const params: Record<string, string> = {
        'mode': 'subscription',
        'customer': customerId,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'metadata[supabase_user_id]': userId,
        'subscription_data[metadata][supabase_user_id]': userId,
        'subscription_data[metadata][plan]': plan,
      }

      // Attach Stripe Coupon if available — Stripe handles duration/expiration automatically
      if (stripeCouponId) {
        params['discounts[0][coupon]'] = stripeCouponId
        console.log(`[CHECKOUT] Attaching coupon ${stripeCouponId} to checkout for user ${userId}`)
      }

      // Embedded mode: renders checkout inline in the page
      params['ui_mode'] = 'embedded'
      params['return_url'] = `${siteUrl}${returnTo}?pro=success&session_id={CHECKOUT_SESSION_ID}`

      // Billing cycle anchor: all users billed on the 1st of every month
      // First charge is prorated for remainder of current month
      const nextFirst = new Date()
      nextFirst.setMonth(nextFirst.getMonth() + 1, 1)
      nextFirst.setHours(0, 0, 0, 0)
      const anchorTimestamp = Math.floor(nextFirst.getTime() / 1000)
      params['subscription_data[billing_cycle_anchor]'] = String(anchorTimestamp)
      params['subscription_data[proration_behavior]'] = 'create_prorations'

      if (trialDays > 0) {
        params['subscription_data[trial_period_days]'] = String(trialDays)
        // After trial ends, billing anchors to the 1st of the following month
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
        let errMsg = 'Failed to create checkout session'
        try { errMsg = JSON.parse(errText)?.error?.message || errMsg } catch {}
        return jsonError(errMsg, corsHeaders)
      }

      const session = await checkoutRes.json()

      // Store pending checkout — don't overwrite an active subscription's plan/status
      const now = new Date().toISOString()
      const { data: existingSub } = await supabase
        .from('seller_subscriptions')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle()

      if (existingSub && ['active', 'trialing'].includes(existingSub.status)) {
        // User already has an active sub — just store the pending session for confirmation
        const { error: updateErr } = await supabase
          .from('seller_subscriptions')
          .update({
            stripe_customer_id: customerId,
            updated_at: now,
          })
          .eq('user_id', userId)
        if (updateErr) console.error("❌ [DB-UPDATE] Failed:", JSON.stringify(updateErr))
        else console.log("✅ [DB-UPDATE] Kept active sub, stored customer ID.")
      } else {
        // No active sub — create pending record
        const { error: upsertErr } = await supabase
          .from('seller_subscriptions')
          .upsert({
            user_id: userId,
            plan: plan,
            status: 'inactive',
            stripe_customer_id: customerId,
            stripe_subscription_id: `pending_${session.id}`,
            created_at: now,
            updated_at: now,
          }, { onConflict: 'user_id' })
        if (upsertErr) console.error("❌ [DB-UPSERT] Failed:", JSON.stringify(upsertErr))
        else console.log("✅ [DB-UPSERT] Created pending subscription.")
      }

      return jsonOk({ clientSecret: session.client_secret }, corsHeaders)
    }

    // ── Confirm checkout (called from return URL after payment) ──
    case 'confirm': {
      // Get pending subscription to check which plan was selected
      const { data: pendingSub } = await supabase
        .from('seller_subscriptions')
        .select('plan')
        .eq('user_id', userId)
        .maybeSingle()

      // Use plan from: 1) request body, 2) existing subscription, 3) fallback to 'pro'
      let confirmedPlan = body.plan || pendingSub?.plan || 'pro'

      // Get pricing info for receipt
      const { data: tierReceipt } = await supabase
        .from('subscription_tiers')
        .select('subscription_price')
        .eq('tier_name', confirmedPlan)
        .maybeSingle()
      const receiptPrice = tierReceipt?.subscription_price ?? (confirmedPlan === 'elite' ? 29.00 : 10.00)

      let confirmed = false
      let amountPaid = receiptPrice

      if (session_id && session_id.startsWith('cs_')) {
        // Verify session with Stripe
        const sessionRes = await fetch(`${stripeBase}/v1/checkout/sessions/${session_id}`, {
          headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
        })

        if (sessionRes.ok) {
          const sessionData = await sessionRes.json()
          // Extract plan from Stripe session/subscription metadata (most authoritative source)
          if (sessionData.metadata?.plan) {
            confirmedPlan = sessionData.metadata.plan
          }
          if (sessionData.payment_status === 'paid' || sessionData.status === 'complete') {
            const now = new Date().toISOString()
            const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

            const oldSubscriptionId = sub?.stripe_subscription_id
            const newSubscriptionId = sessionData.subscription

            // Cancel previous active subscription in Stripe to prevent double billing
            if (
              oldSubscriptionId &&
              oldSubscriptionId.startsWith('sub_') &&
              !oldSubscriptionId.startsWith('sub_sim_') &&
              oldSubscriptionId !== newSubscriptionId
            ) {
              console.log(`[UPGRADE] Cancelling old Stripe subscription: ${oldSubscriptionId}`)
              try {
                const cancelOldRes = await fetch(
                  `${stripeBase}/v1/subscriptions/${oldSubscriptionId}`,
                  {
                    method: 'DELETE',
                    headers: {
                      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                    },
                  }
                )
                if (!cancelOldRes.ok) {
                  console.error('Failed to cancel old Stripe subscription:', await cancelOldRes.text())
                } else {
                  console.log(`Successfully cancelled old Stripe subscription: ${oldSubscriptionId}`)
                }
              } catch (cancelErr) {
                console.error('Error cancelling old Stripe subscription:', cancelErr)
              }
            }

            await supabase
              .from('seller_subscriptions')
              .upsert({
                user_id: userId,
                plan: confirmedPlan,
                status: 'active',
                stripe_customer_id: sessionData.customer,
                stripe_subscription_id: sessionData.subscription || `confirmed_${session_id}`,
                current_period_start: now,
                current_period_end: periodEnd,
                canceled_at: null,
                created_at: now,
                updated_at: now,
              }, { onConflict: 'user_id' })

            await supabase.from('profiles').update({ is_pro: true }).eq('id', userId)

            if (confirmedPlan === 'elite') {
              const { data: fbConn } = await supabase
                .from('seller_fb_connections')
                .select('twilio_wa_phone_sid, wa_number_source')
                .eq('user_id', userId)
                .maybeSingle()

              if (!fbConn?.twilio_wa_phone_sid) {
                try {
                  const subAccount = await createTwilioSubaccount(`CasaGrown Seller - ${userId}`)
                  if (subAccount.success && subAccount.sid && subAccount.authToken) {
                    const phone = await provisionWhatsAppNumber(subAccount.sid, subAccount.authToken)
                    if (phone.success && phone.phoneNumber && phone.phoneSid) {
                      await supabase
                        .from('seller_fb_connections')
                        .upsert({
                          user_id: userId,
                          status: 'connected',
                          wa_number_source: 'twilio_provisioned',
                          twilio_sub_account_sid: subAccount.sid,
                          twilio_wa_phone_sid: phone.phoneSid,
                          wa_phone_number_id: phone.phoneSid,
                          wa_display_phone: phone.phoneNumber,
                          wa_auto_reply_enabled: true,
                          updated_at: new Date().toISOString(),
                        }, { onConflict: 'user_id' })
                      console.log(`[TWILIO] Successfully provisioned phone ${phone.phoneNumber} for seller ${userId}`)
                    }
                  }
                } catch (tErr: any) {
                  console.error('[TWILIO] Failed to provision phone:', tErr.message)
                }
              }
            }

            amountPaid = (sessionData.amount_total || receiptPrice * 100) / 100
            confirmed = true
          }
        }
      }

      // Fallback: check if subscription already exists with incomplete status and activate it
      if (!confirmed && sub?.status === 'inactive') {
        const now = new Date().toISOString()
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        await supabase
          .from('seller_subscriptions')
          .update({
            status: 'active',
            current_period_start: now,
            current_period_end: periodEnd,
            updated_at: now,
          })
          .eq('user_id', userId)

        await supabase.from('profiles').update({ is_pro: true }).eq('id', userId)
        confirmed = true
      }

      if (!confirmed) {
        return jsonOk({ success: false, message: 'Could not confirm checkout' }, corsHeaders)
      }

      // ── Send Subscription Receipt: All channels ──
      const formattedDate = new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })

      // Calculate next billing date (1st of next month)
      const nextBillingDate = new Date()
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1, 1)
      const nextBillingFormatted = nextBillingDate.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })

      // Get profile info
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single()
      const sellerName = profile?.full_name || 'there'

      // Get email from auth
      const sellerEmail = await getUserEmail(supabase, userId)

      // Check for active promotional discount on this plan
      const { data: activeDiscount } = await supabase
        .from('user_subscription_discounts')
        .select('discount_pct, promotion_id, crm_promotions!inner(name)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
        .limit(1)
        .maybeSingle()

      const promoName = (activeDiscount as any)?.crm_promotions?.name ?? null
      const promoDiscountPct = activeDiscount?.discount_pct ?? 0
      const isProrated = amountPaid < receiptPrice && amountPaid > 0

      // Build discount row for receipt
      let discountRow = ''
      if (promoDiscountPct > 0 && promoName) {
        discountRow = `
          <tr><td style="font-size: 13px; color: #6b7280; padding: 3px 0;">Regular Price</td><td style="font-size: 13px; color: #1f2937; text-align: right; padding: 3px 0;">$${receiptPrice.toFixed(2)}/mo</td></tr>
          <tr><td style="font-size: 13px; color: #059669; padding: 3px 0;">Promo Discount (${promoName})</td><td style="font-size: 13px; color: #059669; text-align: right; padding: 3px 0; font-weight: 600;">-${promoDiscountPct}%</td></tr>`
      }

      // Build proration row
      let prorationRow = ''
      if (isProrated) {
        const today = new Date()
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        const prorationPeriod = `${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endOfMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        prorationRow = `
          <tr><td style="font-size: 13px; color: #6b7280; padding: 3px 0;">This Charge (prorated ${prorationPeriod})</td><td style="font-size: 13px; color: #1f2937; text-align: right; padding: 3px 0; font-weight: 600;">$${amountPaid.toFixed(2)}</td></tr>`
      }

      const planDisplayName = confirmedPlan === 'elite' ? 'CasaGrown Elite' : 'CasaGrown Pro'

      // 1. In-app notification
      await supabase.from('notifications').insert({
        user_id: userId,
        content: `🎉 Welcome to ${planDisplayName}! Your payment of $${amountPaid.toFixed(2)} was processed.${promoName ? ` (${promoDiscountPct}% off via ${promoName})` : ''} You'll be billed on the 1st of every month.`,
        link_url: '/pro-manage',
      })

      // 2. Push notification
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            userIds: [userId],
            title: `🎉 Welcome to ${planDisplayName}!`,
            body: `Your payment of $${amountPaid.toFixed(2)} was processed. Pro features are now active.`,
            url: '/pro-manage',
          },
        })
      } catch (pushErr) {
        console.warn('[CONFIRM] Push notification failed:', pushErr)
      }

      // 3. Email receipt with promotional discount and billing info
      if (sellerEmail) {
        try {
          const receiptHtml = wrapInBrandedTemplate({
            title: 'Subscription Receipt',
            greeting: `Hi ${sellerName},`,
            bodyHtml: `
              <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">Thank you for subscribing to ${planDisplayName}! Here's your receipt.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 10px; overflow: hidden;">
                <tr><td style="padding: 16px 20px 8px;"><p style="margin: 0 0 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Subscription Details</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr><td style="font-size: 13px; color: #6b7280; padding: 3px 0;">Plan</td><td style="font-size: 13px; color: #1f2937; text-align: right; padding: 3px 0; font-weight: 600;">${planDisplayName} (Monthly)</td></tr>
                    ${discountRow}
                    <tr><td style="font-size: 13px; color: #6b7280; padding: 3px 0;">Your Price</td><td style="font-size: 13px; color: #1f2937; text-align: right; padding: 3px 0; font-weight: 600;">$${(receiptPrice * (1 - promoDiscountPct / 100)).toFixed(2)}/mo</td></tr>
                    ${prorationRow}
                    <tr><td style="font-size: 13px; color: #6b7280; padding: 3px 0;">Date</td><td style="font-size: 13px; color: #1f2937; text-align: right; padding: 3px 0;">${formattedDate}</td></tr>
                    <tr><td style="font-size: 13px; color: #6b7280; padding: 3px 0;">Next Billing</td><td style="font-size: 13px; color: #1f2937; text-align: right; padding: 3px 0;">${nextBillingFormatted} (1st of every month)</td></tr>
                    <tr><td style="font-size: 13px; color: #6b7280; padding: 3px 0;">Billing Cycle</td><td style="font-size: 13px; color: #1f2937; text-align: right; padding: 3px 0;">Monthly, billed on the 1st</td></tr>
                  </table>
                </td></tr>
              </table>
              <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280; line-height: 1.5;">You can manage your subscription anytime from <a href="${siteUrl}/pro-manage" style="color: #059669; font-weight: 600;">Pro Management</a>.</p>
            `,
            footer: 'This is your official subscription receipt. Keep it for your records.',
          })

          await sendTransactionEmail({
            to: sellerEmail,
            subject: `CasaGrown Pro — Receipt for $${amountPaid.toFixed(2)}`,
            htmlBody: receiptHtml,
          })
          console.log(`[CONFIRM] Receipt email sent to ${sellerEmail}`)
        } catch (emailErr) {
          console.warn('[CONFIRM] Receipt email failed:', emailErr)
        }
      }

      // 4. SMS notification
      try {
        await supabase.functions.invoke('send-sms-notification', {
          body: {
            userId,
            message: `CasaGrown: Welcome to Pro! Your payment of $${amountPaid.toFixed(2)} was processed. Thank you for your support! 🚜`,
          },
        })
      } catch (smsErr) {
        console.warn('[CONFIRM] SMS notification failed:', smsErr)
      }

      // 5. Subscription receipt record
      try {
        const periodEndReceipt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        await supabase.from('subscription_receipts').insert({
          user_id: userId,
          amount_usd: amountPaid,
          description: 'CasaGrown Pro — Monthly subscription',
          stripe_session_id: session_id || null,
          period_start: new Date().toISOString(),
          period_end: periodEndReceipt,
        })
      } catch (receiptErr) {
        console.warn('[CONFIRM] Receipt record failed:', receiptErr)
      }

      // 6. Stripe Connect encouragement email (delayed nudge)
      if (sellerEmail) {
        try {
          // Check if seller already has Stripe Connect
          const { data: connectCheck } = await supabase
            .from('profiles')
            .select('stripe_connect_id')
            .eq('id', userId)
            .single()

          if (!connectCheck?.stripe_connect_id) {
            const connectHtml = wrapInBrandedTemplate({
              title: 'Set Up Your Payouts',
              greeting: `Hi ${sellerName},`,
              bodyHtml: `
                <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">Now that you're a CasaGrown Pro seller, let's make sure you can receive your earnings quickly!</p>
                <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
                  <p style="margin: 0 0 8px; font-size: 14px; font-weight: 700; color: #92400e;">⚡ Set Up Stripe Connect for Faster Payouts</p>
                  <p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.5;">Connect your bank account through Stripe to receive direct deposits from your sales. It only takes 2 minutes.</p>
                </div>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr><td style="padding: 8px 0;">
                    <a href="${siteUrl}/earnings/payout" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #065f46, #059669); color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px;">Set Up Payouts →</a>
                  </td></tr>
                </table>
                <p style="margin: 16px 0 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">Without Stripe Connect, your earnings will accumulate as credits. Setting up payouts lets you withdraw directly to your bank account.</p>
              `,
              footer: 'You received this email because you subscribed to CasaGrown Pro.',
            })

            await sendTransactionEmail({
              to: sellerEmail,
              subject: `${sellerName}, set up your payouts to get paid faster 💰`,
              htmlBody: connectHtml,
            })
            console.log(`[CONFIRM] Stripe Connect encouragement email sent to ${sellerEmail}`)
          }
        } catch (connectErr) {
          console.warn('[CONFIRM] Stripe Connect email failed:', connectErr)
        }
      }

      return jsonOk({ success: true, isPro: true }, corsHeaders)
    }

    // ── Downgrade plan ──
    case 'downgrade': {
      if (!sub || sub.status !== 'active') {
        return jsonError('No active subscription to downgrade', corsHeaders, 400)
      }

      const targetPlan = body.plan
      const keepBoothIds: string[] = body.keep_booth_ids || []

      if (!targetPlan || !['lite', 'pro'].includes(targetPlan)) {
        return jsonError('Invalid target plan', corsHeaders, 400)
      }

      // Validate: can only downgrade, not upgrade
      const planOrder: Record<string, number> = { lite: 0, pro: 1, elite: 2 }
      if (planOrder[targetPlan] >= planOrder[sub.plan]) {
        return jsonError(`Cannot downgrade from ${sub.plan} to ${targetPlan}`, corsHeaders, 400)
      }

      // Booth limits per plan
      const boothLimits: Record<string, number> = { lite: 1, pro: 3, elite: 999 }
      const maxBooths = boothLimits[targetPlan]

      // Get user's non-archived booths
      const { data: booths } = await supabase
        .from('market_booths')
        .select('id, name')
        .eq('owner_id', userId)
        .eq('is_open', true)

      const activeBoothCount = booths?.length || 0

      // If user has more booths than new limit, they must pick which to keep
      if (activeBoothCount > maxBooths) {
        if (keepBoothIds.length === 0) {
          // Return booth list so frontend can show picker
          return jsonOk({
            needs_booth_selection: true,
            max_booths: maxBooths,
            active_booths: booths,
            message: `You have ${activeBoothCount} active booths but ${targetPlan} plan allows only ${maxBooths}. Please select which booths to keep.`,
          }, corsHeaders)
        }

        if (keepBoothIds.length > maxBooths) {
          return jsonError(`You can only keep ${maxBooths} booth(s) on the ${targetPlan} plan`, corsHeaders, 400)
        }

        // Validate that all keepBoothIds are actually owned by user
        const validIds = new Set((booths || []).map((b: any) => b.id))
        for (const id of keepBoothIds) {
          if (!validIds.has(id)) {
            return jsonError(`Booth ${id} not found or not owned by you`, corsHeaders, 400)
          }
        }

        // Archive excess booths by setting to draft
        const archiveIds = (booths || [])
          .filter((b: any) => !keepBoothIds.includes(b.id))
          .map((b: any) => b.id)

        if (archiveIds.length > 0) {
          const { error: archiveErr } = await supabase
            .from('market_booths')
            .update({ is_open: false })
            .in('id', archiveIds)

          if (archiveErr) {
            console.error('[DOWNGRADE] Failed to archive booths:', archiveErr)
            return jsonError('Failed to archive excess booths', corsHeaders, 500)
          }
          console.log(`[DOWNGRADE] Archived ${archiveIds.length} booths for user ${userId}`)
        }
      }

      // Cancel Stripe subscription and apply proration credit
      const isRealStripeSub = sub.stripe_subscription_id?.startsWith('sub_') && !sub.stripe_subscription_id?.startsWith('sub_sim_')
      let creditApplied = 0

      if (isRealStripeSub && sub.stripe_subscription_id) {
        // Calculate prorated credit for remaining time
        const now = new Date()
        const start = sub.current_period_start ? new Date(sub.current_period_start) : null
        const end = sub.current_period_end ? new Date(sub.current_period_end) : null

        if (start && end && end > now && now >= start) {
          const totalDuration = end.getTime() - start.getTime()
          const remainingDuration = end.getTime() - now.getTime()
          const ratio = remainingDuration / totalDuration

          if (ratio > 0 && ratio <= 1) {
            const prevPrice = sub.plan === 'elite' ? 29.00 : 10.00
            const creditAmountUsd = prevPrice * ratio
            const creditAmountCents = Math.round(creditAmountUsd * 100)
            creditApplied = creditAmountUsd

            if (creditAmountCents > 0 && sub.stripe_customer_id) {
              console.log(`[DOWNGRADE] Crediting customer ${sub.stripe_customer_id} with $${creditAmountUsd.toFixed(2)}`)
              try {
                await fetch(`${stripeBase}/v1/customers/${sub.stripe_customer_id}/balance_transactions`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                    amount: String(-creditAmountCents),
                    currency: 'usd',
                    description: `Prorated credit for downgrade from ${sub.plan} to ${targetPlan}`,
                  }),
                })
              } catch (creditErr) {
                console.error('[DOWNGRADE] Failed to apply credit:', creditErr)
              }
            }
          }
        }

        // Cancel the current subscription immediately
        try {
          await fetch(`${stripeBase}/v1/subscriptions/${sub.stripe_subscription_id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
          })
          console.log(`[DOWNGRADE] Cancelled Stripe subscription ${sub.stripe_subscription_id}`)
        } catch (stripeErr) {
          console.error('[DOWNGRADE] Failed to cancel Stripe subscription:', stripeErr)
        }
      }

      // Switch plan immediately in DB
      const updateFields: Record<string, any> = {
        plan: targetPlan,
        downgrade_to_plan: null,
        downgrade_booth_ids: null,
        downgrade_effective_at: null,
        canceled_at: null,
        updated_at: new Date().toISOString(),
      }

      // If downgrading to Lite (free), clear subscription IDs
      if (targetPlan === 'lite') {
        updateFields.status = 'inactive'
        updateFields.stripe_subscription_id = null
      }

      const { error: updateErr } = await supabase
        .from('seller_subscriptions')
        .update(updateFields)
        .eq('user_id', userId)

      if (updateErr) {
        console.error('[DOWNGRADE] DB update failed:', updateErr)
        return jsonError('Failed to downgrade plan', corsHeaders, 500)
      }

      // If downgrading from Elite, cleanup WhatsApp number
      if (sub.plan === 'elite' && targetPlan !== 'elite') {
        await cleanupTwilioNumber(supabase, userId)
      }

      const archivedNames = activeBoothCount > maxBooths
        ? (booths || []).filter((b: any) => !keepBoothIds.includes(b.id)).map((b: any) => b.name)
        : []

      return jsonOk({
        success: true,
        new_plan: targetPlan,
        archived_booths: archivedNames,
        credit_applied: creditApplied > 0 ? `$${creditApplied.toFixed(2)}` : null,
        message: `Plan changed to ${targetPlan === 'lite' ? 'Free' : 'Pro'}.${archivedNames.length > 0 ? ` ${archivedNames.length} booth(s) archived.` : ''}${creditApplied > 0 ? ` $${creditApplied.toFixed(2)} credit applied to your account.` : ''}`,
      }, corsHeaders)
    }

    default:
      return jsonError(`Unknown action: ${action}`, corsHeaders, 400)
  }
})

// Automatically release and cleanup Twilio number if it was provisioned by us
async function cleanupTwilioNumber(supabase: any, userId: string) {
  const { data: fbConn } = await supabase
    .from('seller_fb_connections')
    .select('twilio_sub_account_sid, twilio_wa_phone_sid, wa_number_source')
    .eq('user_id', userId)
    .maybeSingle()

  if (fbConn?.wa_number_source === 'twilio_provisioned' && fbConn?.twilio_wa_phone_sid) {
    try {
      const subSid = fbConn.twilio_sub_account_sid
      const phoneSid = fbConn.twilio_wa_phone_sid
      const mainToken = Deno.env.get('TWILIO_AUTH_TOKEN') || 'mock_auth_token'
      
      const releaseRes = await releasePhoneNumber(subSid, mainToken, phoneSid)
      if (releaseRes.success) {
        await supabase
          .from('seller_fb_connections')
          .update({
            twilio_sub_account_sid: null,
            twilio_wa_phone_sid: null,
            wa_phone_number_id: null,
            wa_display_phone: null,
            wa_number_source: 'twilio_provisioned',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
        console.log(`[TWILIO] Successfully released phone number for user ${userId}`)
      }
    } catch (err: any) {
      console.error('[TWILIO] Failed to release phone number:', err.message)
    }
  }
}
