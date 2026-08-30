/**
 * stripe-subscription-webhook — Handles Stripe subscription lifecycle events
 *
 * Events: checkout.session.completed, invoice.paid, invoice.payment_failed,
 *         customer.subscription.deleted, customer.subscription.updated
 *
 * POST /functions/v1/stripe-subscription-webhook
 * Auth: Stripe webhook signature
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { getStripeApiBase } from '../_shared/stripe.ts'
import { backfillProfileFromStripeDetails } from '../_shared/profile-backfill.ts'

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  const WEBHOOK_SECRET = env('STRIPE_SUBSCRIPTION_WEBHOOK_SECRET')

  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  let event: Record<string, any>
  try {
    event = JSON.parse(body)
  } catch {
    return jsonError('Invalid JSON body', corsHeaders, 400)
  }

  // Verify signature — webhook secret is MANDATORY
  if (!WEBHOOK_SECRET) {
    console.error('[SUB-WEBHOOK] CRITICAL: STRIPE_SUBSCRIPTION_WEBHOOK_SECRET is not configured. Refusing to process unverified webhook.')
    return jsonError('Webhook secret not configured', corsHeaders, 500)
  }

  if (!signature) {
    return jsonError('Missing signature', corsHeaders, 401)
  }

  const isValid = await verifyStripeSignature(body, signature, WEBHOOK_SECRET)
  if (!isValid) {
    console.error('Invalid Stripe subscription webhook signature')
    return jsonError('Invalid signature', corsHeaders, 401)
  }

  console.log(`[SUB-WEBHOOK] ${event.type}, id: ${event.id}`)

  switch (event.type) {
    // ── Checkout completed → Activate subscription ──
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode !== 'subscription') {
        return jsonOk({ received: true, skipped: 'not_subscription' }, corsHeaders)
      }

      const userId = session.metadata?.user_id || session.subscription_data?.metadata?.user_id
      const customerId = session.customer
      const subscriptionId = session.subscription

      if (!userId) {
        // Try to find user by customer email
        const { data: sub } = await supabase
          .from('seller_subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!sub) {
          console.error(`[SUB-WEBHOOK] Cannot find user for customer ${customerId}`)
          return jsonOk({ received: true, warning: 'user_not_found' }, corsHeaders)
        }
      }

      const targetUserId = userId || (await supabase
        .from('seller_subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single()
        .then(r => r.data?.user_id))

      if (!targetUserId) {
        return jsonOk({ received: true, warning: 'user_not_found' }, corsHeaders)
      }

      // Determine if trial
      const status = session.payment_status === 'paid' ? 'active' : 'trialing'
      
      const plan = (session.metadata?.plan as 'pro' | 'elite') || 'pro'

      const { error: updateErr } = await supabase
        .from('seller_subscriptions')
        .upsert({
          user_id: targetUserId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan,
          status,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (updateErr) {
        console.error('[SUB-WEBHOOK] Failed to update subscription:', updateErr)
      }

      // Activate Pro flag on profile
      await supabase.from('profiles').update({ is_pro: true }).eq('id', targetUserId)

      // Contextual Data Capture: Backfill profile address/phone from Stripe checkout details
      try {
        const customerDetails = session.customer_details
        const shippingDetails = session.shipping_details
        const addr = customerDetails?.address || shippingDetails?.address
        const phone = customerDetails?.phone || shippingDetails?.phone
        if (targetUserId && (addr || phone)) {
          await backfillProfileFromStripeDetails(supabase, targetUserId, { address: addr, phone })
        }
      } catch (backfillErr) {
        console.warn('[SUB-WEBHOOK] Contextual profile backfill warning:', backfillErr)
      }

      // Notify user (in-app)
      await supabase.from('notifications').insert({
        user_id: targetUserId,
        content: '🎉 Welcome to CasaGrown Pro! Your subscription is active. Enjoy lower fees, Facebook catalog sync, and more.',
        link_url: '/profile',
      })

      // ── Send subscription_change welcome email with user guide ──
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', targetUserId)
          .single()

        if (profile?.email) {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'subscription_change',
              recipients: [{ email: profile.email, name: profile.full_name || 'there' }],
              plan: 'pro',
              action: 'signup',
            },
          })
          console.log(`[SUB-WEBHOOK] Welcome email sent to ${profile.email} for Pro signup`)
        }
      } catch (emailErr) {
        console.warn('[SUB-WEBHOOK] Welcome email failed:', emailErr)
      }

      console.log(`[SUB-WEBHOOK] Activated Pro for user ${targetUserId}`)
      return jsonOk({ received: true, action: 'activated' }, corsHeaders)
    }

    // ── Invoice paid → Confirm active status + send receipt ──
    case 'invoice.paid': {
      const invoice = event.data.object
      const subscriptionId = invoice.subscription
      const customerId = invoice.customer
      const invoiceAmountUsd = (invoice.amount_paid || 0) / 100
      const invoiceId = invoice.id || 'N/A'
      const invoiceUrl = invoice.hosted_invoice_url || null

      const { data: sub } = await supabase
        .from('seller_subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (sub) {
        // H-10: Check if invoice already processed (idempotent)
        const { data: existing } = await supabase
          .from('subscription_receipts').select('id')
          .eq('stripe_invoice_id', invoice.id).maybeSingle()
        if (existing) {
          console.log(`[SUB-WEBHOOK] Duplicate invoice.paid for ${invoice.id}, skipping.`)
          return jsonOk({ received: true, duplicate: true }, corsHeaders)
        }

        await supabase
          .from('seller_subscriptions')
          .update({
            status: 'active',
            current_period_start: invoice.period_start
              ? new Date(invoice.period_start * 1000).toISOString()
              : null,
            current_period_end: invoice.period_end
              ? new Date(invoice.period_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', sub.user_id)

        // Ensure Pro flag is active
        await supabase.from('profiles').update({ is_pro: true }).eq('id', sub.user_id)

        // ── Subscription Receipt: Email + Push + In-App + Ledger ──

        // 1. Get profile for email/name
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', sub.user_id)
          .single()

        const sellerName = profile?.full_name || 'Seller'
        const sellerEmail = profile?.email
        const formattedDate = new Date().toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })

        // 2. In-app notification
        await supabase.from('notifications').insert({
          user_id: sub.user_id,
          content: `✅ Your CasaGrown Pro subscription payment of $${invoiceAmountUsd.toFixed(2)} was processed successfully.`,
          link_url: '/earnings',
        })

        // 3. Push notification
        try {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              userIds: [sub.user_id],
              title: '✅ Pro Payment Received',
              body: `Your CasaGrown Pro payment of $${invoiceAmountUsd.toFixed(2)} was processed.`,
              url: '/earnings',
            },
          })
        } catch (pushErr) {
          console.warn('[SUB-WEBHOOK] Push notification failed:', pushErr)
        }

        // 4. Email receipt
        if (sellerEmail) {
          try {
            await supabase.functions.invoke('send-notification-email', {
              body: {
                type: 'subscription_receipt',
                recipients: [{ email: sellerEmail, name: sellerName }],
                subscriptionData: {
                  planName: 'CasaGrown Pro (Monthly)',
                  amount: invoiceAmountUsd,
                  date: formattedDate,
                  invoiceId: invoiceId.substring(0, 20),
                  invoiceUrl,
                  periodStart: invoice.period_start
                    ? new Date(invoice.period_start * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : null,
                  periodEnd: invoice.period_end
                    ? new Date(invoice.period_end * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : null,
                },
              },
            })
            console.log(`[SUB-WEBHOOK] Subscription receipt email sent to ${sellerEmail}`)
          } catch (emailErr) {
            console.warn('[SUB-WEBHOOK] Subscription receipt email failed:', emailErr)
          }
        }

        // 5. SMS notification
        try {
          await supabase.functions.invoke('send-sms-notification', {
            body: {
              userId: sub.user_id,
              message: `CasaGrown: Your Pro subscription payment of $${invoiceAmountUsd.toFixed(2)} was processed. Thank you! View receipt: /earnings`,
            },
          })
        } catch (smsErr) {
          console.warn('[SUB-WEBHOOK] SMS notification failed:', smsErr)
        }

        // 6. Subscription receipt record
        if (invoiceAmountUsd > 0) {
          try {
            await supabase.from('subscription_receipts').insert({
              user_id: sub.user_id,
              amount_usd: invoiceAmountUsd,
              description: 'CasaGrown Pro — Monthly subscription',
              stripe_invoice_id: invoiceId,
              invoice_url: invoiceUrl,
              period_start: invoice.period_start
                ? new Date(invoice.period_start * 1000).toISOString()
                : new Date().toISOString(),
              period_end: invoice.period_end
                ? new Date(invoice.period_end * 1000).toISOString()
                : null,
            })
            console.log(`[SUB-WEBHOOK] Receipt record created for $${invoiceAmountUsd}`)
          } catch (receiptErr) {
            console.warn('[SUB-WEBHOOK] Receipt record failed:', receiptErr)
          }

          // 7. Market ledger entry (pro_subscription debit)
          // BUG-42: Use atomic RPC to prevent race conditions where two webhooks
          // read the same balance_after value before inserting
          try {
            const { data: ledgerResult, error: ledgerRpcErr } = await supabase.rpc('append_market_ledger_entry', {
              p_user_id: sub.user_id,
              p_event_type: 'pro_subscription',
              p_amount_usd: invoiceAmountUsd,
              p_direction: 'debit',
              p_metadata: {
                description: `CasaGrown Pro — Monthly subscription ($${invoiceAmountUsd.toFixed(2)})`,
                stripe_invoice_id: invoiceId,
              },
            })

            if (ledgerRpcErr) {
              console.warn('[SUB-WEBHOOK] Ledger RPC error:', ledgerRpcErr)
            } else {
              console.log(`[SUB-WEBHOOK] Ledger entry: pro_subscription debit $${invoiceAmountUsd}, balance: ${ledgerResult?.balance_after}`)
            }
          } catch (ledgerErr) {
            console.warn('[SUB-WEBHOOK] Ledger entry failed:', ledgerErr)
          }
        }

        console.log(`[SUB-WEBHOOK] Invoice paid for user ${sub.user_id}: $${invoiceAmountUsd}`)
      }

      return jsonOk({ received: true, action: 'invoice_confirmed' }, corsHeaders)
    }

    // ── Invoice payment failed → Mark past due ──
    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const customerId = invoice.customer

      const { data: sub } = await supabase
        .from('seller_subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (sub) {
        await supabase
          .from('seller_subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('user_id', sub.user_id)

        const attemptCount = invoice.attempt_count ?? 1
        if (attemptCount >= 3) {
          await supabase.from('profiles').update({ is_pro: false }).eq('id', sub.user_id)
        }

        await supabase.from('notifications').insert({
          user_id: sub.user_id,
          content: '⚠️ Your CasaGrown Pro payment failed. Please update your payment method to keep Pro features.',
          link_url: '/profile',
        })
      }

      return jsonOk({ received: true, action: 'marked_past_due' }, corsHeaders)
    }

    // ── Subscription deleted → Cancel ──
    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      const customerId = subscription.customer

      const { data: sub } = await supabase
        .from('seller_subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (sub) {
        await supabase
          .from('seller_subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', sub.user_id)

        // Revoke Pro flag
        await supabase.from('profiles').update({ is_pro: false }).eq('id', sub.user_id)

        // Archive non-default booths (seller reverts to single-booth free tier)
        await supabase
          .from('market_booths')
          .update({ is_open: false, updated_at: new Date().toISOString() })
          .eq('owner_id', sub.user_id)
          .eq('is_default', false)

        await supabase.from('notifications').insert({
          user_id: sub.user_id,
          content: 'Your CasaGrown Pro subscription has ended. Your additional booths have been archived. You can upgrade again anytime from your profile.',
          link_url: '/profile',
        })

        // ── Send cancellation confirmation email with Lite guide ──
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', sub.user_id)
            .single()

          if (profile?.email) {
            await supabase.functions.invoke('send-notification-email', {
              body: {
                type: 'subscription_change',
                recipients: [{ email: profile.email, name: profile.full_name || 'there' }],
                plan: 'lite',
                action: 'cancel',
              },
            })
            console.log(`[SUB-WEBHOOK] Cancellation email sent to ${profile.email}`)
          }
        } catch (emailErr) {
          console.warn('[SUB-WEBHOOK] Cancellation email failed:', emailErr)
        }

        console.log(`[SUB-WEBHOOK] Revoked Pro for user ${sub.user_id}, archived non-default booths`)
      }

      return jsonOk({ received: true, action: 'canceled' }, corsHeaders)
    }

    // ── Subscription updated → Sync state ──
    case 'customer.subscription.updated': {
      const subscription = event.data.object
      const customerId = subscription.customer
      const STRIPE_SECRET_KEY = env('STRIPE_SECRET_KEY', true)!
      const stripeBase = getStripeApiBase()

      const { data: sub } = await supabase
        .from('seller_subscriptions')
        .select('user_id, plan')
        .eq('stripe_customer_id', customerId)
        .single()

      if (sub) {
        let status = 'active'
        if (subscription.status === 'trialing') status = 'trialing'
        else if (subscription.status === 'past_due') status = 'past_due'
        else if (subscription.status === 'canceled') status = 'canceled'
        // BUG-35: Preserve 'canceling' status when Stripe reports active + cancel_at_period_end
        else if (subscription.cancel_at_period_end) status = 'canceling'

        const stripePlan = await getSubscriptionPlanFromStripe(subscription.id, STRIPE_SECRET_KEY, stripeBase, subscription)

        await supabase
          .from('seller_subscriptions')
          .update({
            status,
            plan: stripePlan,
            current_period_start: subscription.current_period_start
              ? new Date(subscription.current_period_start * 1000).toISOString()
              : null,
            current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
            trial_ends_at: subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toISOString()
              : null,
            canceled_at: subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', sub.user_id)

        // Sync is_pro flag based on subscription status and plan
        // BUG-35: 'canceling' users retain Pro until period end
        const isActive = ['active', 'trialing', 'canceling'].includes(status) && stripePlan !== 'lite'
        await supabase.from('profiles').update({ is_pro: isActive }).eq('id', sub.user_id)

        // Detect plan change direction for email
        const oldPlan = sub.plan || 'lite'
        const planChanged = oldPlan !== stripePlan

        // If downgrading to Lite or if plan revoked, archive all non-default booths
        if (stripePlan === 'lite' || !isActive) {
          await supabase
            .from('market_booths')
            .update({ is_open: false, marked_for_archival: false, updated_at: new Date().toISOString() })
            .eq('owner_id', sub.user_id)
            .eq('is_default', false)

          console.log(`[SUB-WEBHOOK] Revoked/Downgraded user ${sub.user_id} to Lite, archived non-default booths`)
        } else {
          // Process any pending archivals at rollover/renewals
          const { data: updatedBooths } = await supabase
            .from('market_booths')
            .update({ is_open: false, marked_for_archival: false, updated_at: new Date().toISOString() })
            .eq('owner_id', sub.user_id)
            .eq('marked_for_archival', true)
            .select('id')
          
          if (updatedBooths && updatedBooths.length > 0) {
            console.log(`[SUB-WEBHOOK] Rollover downgrade completed for user ${sub.user_id}: archived ${updatedBooths.length} stands marked for archival`)
          }
        }

        // ── Send subscription_change email on plan upgrade/downgrade ──
        if (planChanged && ['active', 'trialing'].includes(status)) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', sub.user_id)
              .single()

            if (profile?.email) {
              const planRank: Record<string, number> = { lite: 0, pro: 1, elite: 2 }
              const action = (planRank[stripePlan] || 0) > (planRank[oldPlan] || 0) ? 'upgrade' : 'downgrade'

              await supabase.functions.invoke('send-notification-email', {
                body: {
                  type: 'subscription_change',
                  recipients: [{ email: profile.email, name: profile.full_name || 'there' }],
                  plan: stripePlan,
                  action,
                },
              })
              console.log(`[SUB-WEBHOOK] ${action} email sent to ${profile.email}: ${oldPlan} → ${stripePlan}`)
            }
          } catch (emailErr) {
            console.warn('[SUB-WEBHOOK] Subscription change email failed:', emailErr)
          }
        }
      }

      return jsonOk({ received: true, action: 'updated' }, corsHeaders)
    }

    default:
      console.log(`[SUB-WEBHOOK] Unhandled: ${event.type}`)
      return jsonOk({ received: true }, corsHeaders)
  }
}, { extraCorsHeaders: 'stripe-signature', errorStatus: 500 })

// ── Stripe Signature Verification (HMAC-SHA256) ──
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts = signature.split(',')
    const timestampPart = parts.find((p) => p.startsWith('t='))
    const signaturePart = parts.find((p) => p.startsWith('v1='))

    if (!timestampPart || !signaturePart) return false

    const timestampStr = timestampPart.split('=')[1]
    const expectedSig = signaturePart.split('=')[1]

    // Reject webhooks older than 5 minutes (replay protection)
    const timestampSeconds = parseInt(timestampStr, 10)
    if (isNaN(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
      console.error(`Webhook timestamp rejected — possible replay`)
      return false
    }

    const signedPayload = `${timestampStr}.${payload}`

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const mac = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(signedPayload),
    )

    const computedSig = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return computedSig === expectedSig
  } catch (e) {
    console.error('Signature verification error:', e)
    return false
  }
}

// ── Retrieve Active Subscription Plan Tier from Stripe ──
async function getSubscriptionPlanFromStripe(
  subscriptionId: string,
  stripeSecretKey: string,
  stripeBase: string,
  subscriptionObj?: any,
): Promise<string> {
  try {
    if (subscriptionId.startsWith('sub_test') || subscriptionId.startsWith('sub_sim')) {
      if (subscriptionObj?.metadata?.plan) {
        return subscriptionObj.metadata.plan
      }
      return 'pro'
    }
    const res = await fetch(`${stripeBase}/v1/subscriptions/${subscriptionId}`, {
      headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
    })
    if (!res.ok) {
      console.error('[SUB-WEBHOOK] Failed to fetch subscription details from Stripe:', await res.text())
      return 'pro'
    }
    const subscription = await res.json()

    // 1. Prioritize metadata 'plan' attribute
    if (subscription.metadata?.plan) {
      return subscription.metadata.plan
    }

    // 2. Fetch corresponding Product resource to parse product name
    const productId = subscription.items?.data?.[0]?.price?.product
    if (productId) {
      const prodRes = await fetch(`${stripeBase}/v1/products/${productId}`, {
        headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
      })
      if (prodRes.ok) {
        const product = await prodRes.json()
        const productName = (product.name || '').toLowerCase()
        if (productName.includes('elite')) return 'elite'
        if (productName.includes('pro')) return 'pro'
      }
    }

    return 'pro'
  } catch (e) {
    console.error('[SUB-WEBHOOK] Error retrieving subscription details from Stripe:', e)
    return 'pro'
  }
}
