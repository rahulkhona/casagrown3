/**
 * market-cron — Scheduled edge function for periodic market notifications
 *
 * Handles:
 * (g) Market open reminders — based on market_reminders.remind_at
 * (i) Daily digest — cleared transactions summary email (sales + purchases)
 *
 * Invoke via pg_cron or external scheduler:
 *   POST /functions/v1/market-cron { "action": "market_reminder" | "daily_digest" }
 */

import { serveWithCors, jsonOk } from '../_shared/serve-with-cors.ts'

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const body = await req.json().catch(() => ({ action: 'market_reminder' }))
  const { action } = body

  if (action === 'market_reminder') {
    return await handleMarketReminder(supabase, env, corsHeaders, siteUrl)
  } else if (action === 'daily_digest') {
    return await handleDailyDigest(supabase, env, corsHeaders, siteUrl)
  } else if (action === 'seller_lifecycle') {
    return await handleSellerLifecycle(supabase, env, corsHeaders, siteUrl, body)
  } else if (action === 'grower_digest') {
    return await handleGrowerDigest(supabase, env, corsHeaders, siteUrl)
  } else if (action === 'reconcile_redemptions') {
    return await handleReconcileRedemptions(supabase, env, corsHeaders)
  } else {
    return jsonOk({ error: 'Unknown action: ' + action }, corsHeaders)
  }
})

const FONT = "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif"

function getEmailHeader(siteUrl: string) {
  const logoUrl = `${siteUrl}/logo.png`
  return `
  <div style="text-align:center;padding:20px 0;border-bottom:2px solid #16a34a">
    <img src="${logoUrl}" alt="CasaGrown" style="height:40px;width:40px;vertical-align:middle;margin-right:8px">
    <span style="color:#166534;font-size:22px;font-weight:700;font-family:'Inter',system-ui,sans-serif;vertical-align:middle">CasaGrown</span>
    <p style="color:#4b5563;font-size:11px;letter-spacing:2px;margin:4px 0 0;font-weight:500">FRESH • LOCAL • TRUSTED</p>
  </div>`
}

const EMAIL_FOOTER = `
  <div style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:11px;text-align:center">
    CasaGrown — Fresh. Local. Trusted.
  </div>`

// ═══════════════════════════════════════════════
// (g) Market Open Reminder — based on market_reminders table
// ═══════════════════════════════════════════════
async function handleMarketReminder(
  supabase: any,
  env: (k: string) => string | undefined,
  corsHeaders: Record<string, string>,
  siteUrl: string,
) {
  const now = new Date().toISOString()

  // Find reminders that are due (remind_at <= now, not yet sent)
  const { data: dueReminders } = await supabase
    .from('market_reminders')
    .select('id, user_id, market_date, reminder_minutes')
    .lte('remind_at', now)
    .is('sent_at', null)
    .limit(200)

  if (!dueReminders || dueReminders.length === 0) {
    return jsonOk({ sent: 0, message: 'No reminders due' }, corsHeaders)
  }

  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || ''
  const emailUrl = (env('SUPABASE_URL') || 'http://host.docker.internal:54321') +
    '/functions/v1/send-market-email'
  const pushUrl = (env('SUPABASE_URL') || 'http://host.docker.internal:54321') +
    '/functions/v1/send-push-notification'

  let sentCount = 0

  for (const reminder of dueReminders) {
    const mDate = new Date(reminder.market_date)
    const dateStr = mDate.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })
    const timeStr = mDate.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    })
    const isTomorrow = mDate.toDateString() !== new Date().toDateString()
    const whenLabel = isTomorrow ? 'Opens Tomorrow!' : 'Open Today!'

    // Get user info
    const { data: authUser } = await supabase.auth.admin.getUserById(reminder.user_id)
    const email = authUser?.user?.email
    if (!email) continue

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', reminder.user_id)
      .single()

    const name = profile?.full_name || email.split('@')[0]

    // Get booths for this market date
    const marketDateStr = mDate.toISOString().slice(0, 10)
    const { data: products } = await supabase
      .from('market_products')
      .select('seller_id, name, price_usd, unit')
      .eq('market_date', marketDateStr)
      .eq('is_active', true)
      .limit(5)

    const sellerIds = [...new Set((products || []).map((p: any) => p.seller_id))]
    const { data: booths } = await supabase
      .from('market_booths')
      .select('name')
      .in('owner_id', sellerIds.length > 0 ? sellerIds : ['none'])

    const boothNames = (booths || []).map((b: any) => b.name).slice(0, 3).join(', ')
    const extra = (booths || []).length > 3 ? ` and ${(booths || []).length - 3} more` : ''

    // Build product preview
    let productRows = ''
    for (const p of (products || []).slice(0, 3)) {
      productRows += `<p style="font-size:13px;color:#1f2937;margin:4px 0;font-family:${FONT}"><strong>${p.name}</strong> — $${parseFloat(p.price_usd).toFixed(2)}/${p.unit}</p>`
    }
    const moreCount = (products || []).length > 3 ? (products || []).length - 3 : 0

    // Push notification
    await fetch(pushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: [reminder.user_id],
        title: `🛒 Market ${whenLabel}`,
        body: `${dateStr} at ${timeStr}. ${boothNames}${extra} will be selling fresh items!`,
        url: '/market',
        tag: 'market-reminder',
      }),
    }).catch(e => console.warn('Push failed:', e))

    // Email
    await fetch(emailUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        to: email,
        subject: `🛒 CasaGrown Market ${whenLabel} — ${dateStr}`,
        html: `
          <div style="font-family:${FONT};max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
            ${getEmailHeader(siteUrl)}
            <div style="padding:24px 0">
              <p style="font-size:14px">Hi ${name},</p>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:16px 0">
                <p style="color:#166534;font-size:16px;margin:0;font-weight:600">🛒 Market ${whenLabel}</p>
                <p style="font-size:13px;margin:8px 0 0"><strong>${dateStr} · ${timeStr}</strong></p>
                <p style="font-size:13px;margin:4px 0 0">${boothNames}${extra} will be selling fresh items.</p>
              </div>
              ${productRows ? `<div style="background:#f9fafb;border-radius:12px;padding:12px;margin:16px 0">${productRows}${moreCount > 0 ? `<p style="font-size:12px;color:#6b7280;margin:8px 0 0">+ ${moreCount} more items</p>` : ''}</div>` : ''}
              <a href="${siteUrl}/market" style="display:inline-block;background:#16a34a;color:white;padding:10px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Browse Market</a>
            </div>
            ${EMAIL_FOOTER}
          </div>`,
      }),
    }).catch(e => console.warn('Email failed:', e))

    // Mark as sent
    await supabase
      .from('market_reminders')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', reminder.id)

    sentCount++
  }

  // Clean up sent reminders
  await supabase.rpc('cleanup_sent_reminders').catch(() => {})

  return jsonOk({ sent: sentCount }, corsHeaders)
}

// ═══════════════════════════════════════════════
// (i) Daily Digest — Sales + Purchases
// ═══════════════════════════════════════════════
async function handleDailyDigest(
  supabase: any,
  env: (k: string) => string | undefined,
  corsHeaders: Record<string, string>,
  siteUrl: string,
) {
  const today = new Date().toISOString().slice(0, 10)

  // Find settlements that cleared today
  const { data: clearedSettlements } = await supabase
    .from('market_settlements')
    .select('id, market_date')
    .eq('status', 'cleared')
    .gte('updated_at', today + 'T00:00:00Z')

  if (!clearedSettlements || clearedSettlements.length === 0) {
    return jsonOk({ sent: 0, message: 'No settlements cleared today' }, corsHeaders)
  }

  const settlementIds = clearedSettlements.map((s: any) => s.id)

  // Get user settlements (seller side)
  const { data: userSettlements } = await supabase
    .from('user_settlements')
    .select('user_id, settlement_id, gross_sales_usd, platform_fee_usd, net_payout_usd, order_count')
    .in('settlement_id', settlementIds)

  // Get all completed orders from these settlements to find buyers too
  const { data: allOrders } = await supabase
    .from('market_orders')
    .select('id, buyer_id, seller_id, product_name, quantity, subtotal_usd, platform_fee_usd, total_usd, status, settlement_id')
    .in('settlement_id', settlementIds)
    .eq('status', 'completed')

  // Collect all unique user IDs (sellers from user_settlements + buyers from orders)
  const allUserIds = new Set<string>()
  for (const us of (userSettlements || [])) allUserIds.add(us.user_id)
  for (const o of (allOrders || [])) allUserIds.add(o.buyer_id)

  const emailUrl = (env('SUPABASE_URL') || 'http://host.docker.internal:54321') +
    '/functions/v1/send-market-email'
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || ''
  let sentCount = 0

  for (const userId of allUserIds) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId)
    const email = authUser?.user?.email
    if (!email) continue

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()

    const name = profile?.full_name || email.split('@')[0]

    // Sales (where this user is seller)
    const sales = (allOrders || []).filter((o: any) => o.seller_id === userId)
    const userSettlement = (userSettlements || []).filter((us: any) => us.user_id === userId)
    const totalGross = userSettlement.reduce((s: number, u: any) => s + parseFloat(u.gross_sales_usd || 0), 0)
    const totalFees = userSettlement.reduce((s: number, u: any) => s + parseFloat(u.platform_fee_usd || 0), 0)
    const totalNet = userSettlement.reduce((s: number, u: any) => s + parseFloat(u.net_payout_usd || 0), 0)

    // Purchases (where this user is buyer)
    const purchases = (allOrders || []).filter((o: any) => o.buyer_id === userId)
    const totalPurchases = purchases.reduce((s: number, o: any) => s + parseFloat(o.total_usd || o.subtotal_usd || 0), 0)

    if (sales.length === 0 && purchases.length === 0) continue

    // Build sales table
    let salesHtml = ''
    if (sales.length > 0) {
      let salesRows = ''
      for (const o of sales) {
        const fee = parseFloat(o.platform_fee_usd || 0)
        const gross = parseFloat(o.subtotal_usd)
        salesRows += `<tr><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:12px">${o.id.substring(0, 8)}</td><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:12px">${o.product_name}</td><td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f3f4f6;font-size:12px">$${gross.toFixed(2)}</td><td style="padding:4px 8px;text-align:right;color:#b45309;border-bottom:1px solid #f3f4f6;font-size:12px">-$${fee.toFixed(2)}</td><td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f3f4f6;font-size:12px">$${(gross - fee).toFixed(2)}</td></tr>`
      }
      salesHtml = `
        <h3 style="color:#166534;font-size:14px;margin:16px 0 8px;font-weight:600">💰 Your Sales</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;font-size:12px;font-family:${FONT}">
          <thead><tr style="background:#f9fafb"><th style="padding:6px 8px;text-align:left;color:#6b7280;font-weight:500">Order</th><th style="padding:6px 8px;text-align:left;color:#6b7280;font-weight:500">Product</th><th style="padding:6px 8px;text-align:right;color:#6b7280;font-weight:500">Gross</th><th style="padding:6px 8px;text-align:right;color:#6b7280;font-weight:500">Fee</th><th style="padding:6px 8px;text-align:right;color:#6b7280;font-weight:500">Net</th></tr></thead>
          <tbody>${salesRows}
            <tr style="background:#f0fdf4;font-weight:600"><td colspan="2" style="padding:6px 8px;color:#166534">Total</td><td style="padding:6px 8px;text-align:right;color:#166534">$${totalGross.toFixed(2)}</td><td style="padding:6px 8px;text-align:right;color:#b45309">-$${totalFees.toFixed(2)}</td><td style="padding:6px 8px;text-align:right;color:#166534">$${totalNet.toFixed(2)}</td></tr>
          </tbody>
        </table>`
    }

    // Build purchases table
    let purchasesHtml = ''
    if (purchases.length > 0) {
      let purchaseRows = ''
      for (const o of purchases) {
        const { data: sellerProfile } = await supabase.from('profiles').select('full_name').eq('id', o.seller_id).single()
        const sellerName = sellerProfile?.full_name || 'Seller'
        purchaseRows += `<tr><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:12px">${o.id.substring(0, 8)}</td><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:12px">${o.product_name}</td><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:12px">${sellerName}</td><td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f3f4f6;font-size:12px">$${parseFloat(o.total_usd || o.subtotal_usd).toFixed(2)}</td></tr>`
      }
      purchasesHtml = `
        <h3 style="color:#1d4ed8;font-size:14px;margin:16px 0 8px;font-weight:600">🛒 Your Purchases</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;font-size:12px;font-family:${FONT}">
          <thead><tr style="background:#f9fafb"><th style="padding:6px 8px;text-align:left;color:#6b7280;font-weight:500">Order</th><th style="padding:6px 8px;text-align:left;color:#6b7280;font-weight:500">Product</th><th style="padding:6px 8px;text-align:left;color:#6b7280;font-weight:500">From</th><th style="padding:6px 8px;text-align:right;color:#6b7280;font-weight:500">Amount</th></tr></thead>
          <tbody>${purchaseRows}
            <tr style="background:#dbeafe;font-weight:600"><td colspan="3" style="padding:6px 8px;color:#1d4ed8">Total Purchases</td><td style="padding:6px 8px;text-align:right;color:#1d4ed8">$${totalPurchases.toFixed(2)}</td></tr>
          </tbody>
        </table>`
    }

    // Net balance change
    const netChange = totalNet - totalPurchases
    const subjectAmount = sales.length > 0 ? `$${totalNet.toFixed(2)} earned` : `$${totalPurchases.toFixed(2)} spent`

    await fetch(emailUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        to: email,
        subject: `CasaGrown — Daily Settlement Summary (${subjectAmount})`,
        html: `
          <div style="font-family:${FONT};max-width:580px;margin:0 auto;padding:24px;color:#1f2937">
            ${getEmailHeader(siteUrl)}
            <div style="padding:24px 0">
              <p style="font-size:14px">Hi ${name},</p>
              ${salesHtml}
              ${purchasesHtml}
              ${(sales.length > 0 && purchases.length > 0) ? `
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px;margin:16px 0">
                  <table style="width:100%"><tr>
                    <td style="color:#166534;font-size:14px;font-weight:600">Net Balance Change</td>
                    <td style="color:${netChange >= 0 ? '#166534' : '#b91c1c'};font-size:14px;font-weight:600;text-align:right">${netChange >= 0 ? '+' : ''}$${netChange.toFixed(2)}</td>
                  </tr></table>
                </div>` : ''}
              <div style="margin-top:20px">
                <a href="${siteUrl}/earnings" style="display:inline-block;background:#16a34a;color:white;padding:10px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">View Full Details</a>
              </div>
            </div>
            ${EMAIL_FOOTER}
          </div>`,
      }),
    }).catch(e => console.warn('Digest email failed:', e))

    sentCount++
  }

  return jsonOk({ sent: sentCount }, corsHeaders)
}

// ═══════════════════════════════════════════════
// (j) Seller Lifecycle — Prep, Launch, Closed
// ═══════════════════════════════════════════════
async function handleSellerLifecycle(
  supabase: any,
  env: (k: string) => string | undefined,
  corsHeaders: Record<string, string>,
  siteUrl: string,
  body: any
) {
  const { type, userIds } = body
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return jsonOk({ sent: 0, message: 'No userIds provided' }, corsHeaders)
  }

  // Find users with push subscriptions
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('user_id')
    .in('user_id', userIds)

  const pushUsers = new Set((subscriptions || []).map((s: any) => s.user_id))
  
  const targetPushUserIds = Array.from(pushUsers)
  // If type is launch, NO EMAILS at all
  // If user has push, NO EMAIL
  const targetEmailUserIds = type === 'launch' 
    ? [] 
    : userIds.filter((id: string) => !pushUsers.has(id))

  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || ''
  const emailUrl = (env('SUPABASE_URL') || 'http://host.docker.internal:54321') + '/functions/v1/send-market-email'
  const pushUrl = (env('SUPABASE_URL') || 'http://host.docker.internal:54321') + '/functions/v1/send-push-notification'

  let pushSent = false
  let emailSentCount = 0

  // 1. Send Push
  if (targetPushUserIds.length > 0) {
    let title = ''
    let pushBody = ''
    if (type === 'prep') {
      title = '🌱 The Market opens tomorrow!'
      pushBody = 'Review your local harvest and restock your booth shelves now.'
    } else if (type === 'launch') {
      title = '⏰ The Market opens in 1 hour!'
      pushBody = 'Quickly review your inventory to safely unlock your storefront to the neighborhood.'
    } else if (type === 'closed') {
      title = '🔒 Market Closed'
      pushBody = 'The market has officially closed for the day. Your storefront has been safely locked.'
    }

    if (title) {
      await fetch(pushUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({
          userIds: targetPushUserIds,
          title,
          body: pushBody,
          url: '/my-booth',
          tag: 'seller-lifecycle'
        }),
      }).catch(e => console.warn('Seller push failed:', e))
      pushSent = true
    }
  }

  // 2. Send Emails (Only if not launch, and only to users without push)
  if (targetEmailUserIds.length > 0) {
    for (const userId of targetEmailUserIds) {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId)
      const email = authUser?.user?.email
      if (!email) continue

      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).single()
      const name = profile?.full_name || email.split('@')[0]

      let subject = ''
      let headline = ''
      let textBody = ''
      let buttonText = ''

      if (type === 'prep') {
        subject = '🌱 The Market opens tomorrow!'
        headline = 'The Market opens tomorrow!'
        textBody = 'Review your local harvest and restock your booth shelves now.'
        buttonText = 'Restock Booth'
      } else if (type === 'closed') {
        subject = '🔒 Market Closed'
        headline = 'Market Closed!'
        textBody = 'The market has officially closed for the day. Your storefront has been safely locked.'
        buttonText = 'View Storefront'
      }

      if (subject) {
        await fetch(emailUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({
            to: email,
            subject: subject,
            html: `
              <div style="font-family:${FONT};max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
                ${getEmailHeader(siteUrl)}
                <div style="padding:24px 0">
                  <p style="font-size:14px">Hi ${name},</p>
                  <div style="${type === 'closed' ? 'background:#f9fafb;border:1px solid #e5e7eb;' : 'background:#f0fdf4;border:1px solid #bbf7d0;'}border-radius:12px;padding:16px;margin:16px 0">
                    <p style="color:${type === 'closed' ? '#374151' : '#166534'};font-size:15px;margin:0"><strong>${headline}</strong><br><br>${textBody}</p>
                  </div>
                  <a href="${siteUrl}/my-booth" style="display:inline-block;background:#16a34a;color:white;padding:10px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">${buttonText}</a>
                </div>
                ${EMAIL_FOOTER}
              </div>`
          }),
        }).catch(e => console.warn('Seller email failed:', e))
        emailSentCount++
      }
    }
  }

  return jsonOk({ pushSent, emailSentCount }, corsHeaders)
}
// ═══════════════════════════════════════════════
// Unified Daily Digest — 1x/day ~10am local time
// Combines:
//   (A) Seller side: neighbors searching for produce you can list
//   (B) Buyer side: products matching your interests/searches now available
// One email per user with both sections (if applicable)
// ═══════════════════════════════════════════════
export async function handleGrowerDigest(
  supabase: any,
  env: (k: string) => string | undefined,
  corsHeaders: Record<string, string>,
  siteUrl: string,
) {
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || ''
  const baseUrl = env('SUPABASE_URL') || 'http://host.docker.internal:54321'
  const pushUrl = baseUrl + '/functions/v1/send-push-notification'
  const emailUrl = baseUrl + '/functions/v1/send-market-email'
  
  // 1. Atomically Claim 500 users
  const { data: batch, error } = await supabase.rpc('claim_daily_digest_batch', { batch_size: 500 })
  if (error) {
    console.error('Failed to claim digest batch:', error)
    return jsonOk({ sent: 0, emails: 0, message: 'DB Error' }, corsHeaders)
  }

  if (!batch || batch.length === 0) {
    return jsonOk({ sent: 0, emails: 0, message: 'Queue completely empty / finished' }, corsHeaders)
  }

  const postmarkToken = env('POSTMARK_BROADCAST_TOKEN');
  const fromEmail = env('POSTMARK_FROM_EMAIL') || 'no-reply@casagrown.com'
  const messageStream = env('POSTMARK_BROADCAST_STREAM') || 'broadcast'

  const emailBatchPayloads = [];
  let pushCount = 0;

  for (const user of batch) {
    const { user_id, seller_claims, buyer_claims } = user;
    if (!seller_claims.length && !buyer_claims.length) continue;

    // Get Auth Email + Profile
    const { data: authUser } = await supabase.auth.admin.getUserById(user_id)
    const email = authUser?.user?.email
    const { data: profile } = await supabase.from('profiles').select('email, full_name').eq('id', user_id).single()

    // Build Push for Sellers
    if (seller_claims.length > 0) {
       const kws = seller_claims.map((c:any) => c.keyword).slice(0,3).join(', ');
       const extra = seller_claims.length > 3 ? ' and more' : '';
       await fetch(pushUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ userIds: [user_id], title: '🔍 Neighbors are looking for your produce!', body: `People are searching for ${kws}${extra}. List yours on the market!`, url: '/my-booth/products/new', tag: 'grower-search-match' })
        }).catch(e => console.warn('Seller push failed:', e))
        pushCount++;
    }

    // Build Push for Buyers
    if (buyer_claims.length > 0) {
       const first = buyer_claims[0];
       await fetch(pushUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ userIds: [user_id], title: '🎉 Products you want are now available!', body: `"${first.keyword}" is now listed. Check it out!`, url: '/market', tag: 'buyer-product-match' })
        }).catch(e => console.warn('Buyer push failed:', e))
        pushCount++;
    }

    if (!email && !profile?.email) continue;
    const targetEmail = email || profile?.email;
    const firstName = profile?.full_name?.split(' ')[0] || 'Neighbor'

    let sellSection = '';
    let buySection = '';

    if (seller_claims.length > 0) {
      const sellCards = seller_claims.map((c: any) => `
          <div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:16px;margin:12px 0">
            <div style="font-size:14px;color:#854d0e;font-weight:600;margin-bottom:4px">🌱 Someone is searching for "<strong>${c.keyword}</strong>"</div>
            <a href="${siteUrl}/my-booth/products/new" style="display:inline-block;background:#ca8a04;color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">List on Market →</a>
          </div>`);
      sellSection = `<div style="margin-top:20px"><div style="background:#166534;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;font-size:15px;font-weight:600">🏪 Selling Opportunities</div><div style="border:1px solid #d1d5db;border-top:none;border-radius:0 0 8px 8px;padding:4px 12px 12px">${sellCards.join('')}</div></div>`;
    }

    if (buyer_claims.length > 0) {
      const buyCards = buyer_claims.map((c: any) => `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin:12px 0">
          <div style="font-size:14px;color:#1e40af;font-weight:600;margin-bottom:4px">🎉 "${c.keyword}" is now available!</div>
          <a href="${siteUrl}/market" style="display:inline-block;background:#2563eb;color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">View Product →</a>
        </div>`);
      buySection = `<div style="margin-top:20px"><div style="background:#1e40af;color:#fff;padding:10px 16px;border-radius:8px 8px 0 0;font-size:15px;font-weight:600">🛒 Products You're Looking For</div><div style="border:1px solid #d1d5db;border-top:none;border-radius:0 0 8px 8px;padding:4px 12px 12px">${buyCards.join('')}</div></div>`;
    }

    const emailHtml = `<div style="max-width:560px;margin:0 auto;font-family:system-ui, -apple-system, sans-serif"><div style="padding:24px 16px"><h2 style="color:#166534;font-size:20px;margin:0 0 8px">Hi ${firstName}! 🌿</h2><p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px">We found new opportunities for you based on your activity on CasaGrown.</p>${sellSection}${buySection}</div></div>`;

    // Local Mailpit Fallback OR Postmark Batch payload
    if (!postmarkToken) {
      await fetch(emailUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ to: targetEmail, subject: `🌿 ${firstName}, your local daily digest is here!`, html: emailHtml }),
      }).catch(e => console.warn('Digest fallback email failed:', e))
    } else {
      emailBatchPayloads.push({
        From: fromEmail,
        To: targetEmail,
        Subject: `🌿 ${firstName}, your local daily digest is here!`,
        HtmlBody: emailHtml,
        MessageStream: messageStream
      });
    }
  }

  // Send batch to Postmark if we have a token
  if (postmarkToken && emailBatchPayloads.length > 0) {
    await fetch("https://api.postmarkapp.com/email/batch", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": postmarkToken },
        body: JSON.stringify(emailBatchPayloads)
    }).catch(e => console.error('Postmark Batch Failed:', e));
  }

  // INFINITE SCALE: Self-recursion trigger
  if (batch.length === 500) {
    // We maxed out the database pull. There are likely more users pending.
    // Trigger the exact same function immediately in the background (fire and forget)
    fetch(baseUrl + '/functions/v1/market-cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({ action: 'grower_digest' })
    }).catch(e => console.error('Recursion trigger failed:', e));
  }

  return jsonOk({ sent: pushCount, emails: emailBatchPayloads.length, users: batch.length, batchSize: batch.length, forkedNext: batch.length === 500 }, corsHeaders)
}

// ═══════════════════════════════════════════════
// Reconcile Stale Redemptions (safety net for missed webhooks)
// Runs every 5 minutes, picks up pending redemptions > 10 min old
// Queries provider API by external_id to check real status
// ═══════════════════════════════════════════════
async function handleReconcileRedemptions(
  supabase: any,
  env: (k: string) => string | undefined,
  corsHeaders: Record<string, string>,
) {
  const TEN_MIN_AGO = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  // Find stale pending redemptions
  const { data: stale, error } = await supabase
    .from('redemptions')
    .select('id, user_id, status, point_cost, provider, provider_order_id, metadata')
    .eq('status', 'pending')
    .lt('created_at', TEN_MIN_AGO)
    .limit(20)

  if (error || !stale || stale.length === 0) {
    return jsonOk({ reconciled: 0, message: 'No stale redemptions' }, corsHeaders)
  }

  console.log(`[RECONCILE] Found ${stale.length} stale pending redemptions`)

  let completed = 0
  let refunded = 0

  for (const r of stale) {
    const provider = r.provider || r.metadata?.provider_name || r.metadata?.type
    const orderId = r.provider_order_id || r.metadata?.provider_order_id

    try {
      if (provider === 'tremendous' || r.metadata?.source === 'market') {
        // Query Tremendous by external_id (our redemption.id)
        const apiKey = env('TREMENDOUS_API_KEY')
        if (!apiKey) { await refundStale(supabase, r, 'No API key'); refunded++; continue }

        const res = await fetch(
          `https://testflight.tremendous.com/api/v2/orders?external_id=${r.id}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        )

        if (res.ok) {
          const data = await res.json() as any
          const order = data.orders?.[0]
          if (order && order.status === 'EXECUTED') {
            const reward = order.rewards?.[0]
            await supabase.from('redemptions').update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              provider: 'tremendous',
              provider_order_id: order.id,
              metadata: {
                ...r.metadata,
                card_code: reward?.credential?.code || '',
                card_url: reward?.credential?.link || '',
                provider_order_id: order.id,
                completed_via: 'reconciliation',
              },
            }).eq('id', r.id)
            completed++
            console.log(`[RECONCILE] ✅ Completed ${r.id} (Tremendous order ${order.id})`)
          } else {
            await refundStale(supabase, r, `Tremendous order status: ${order?.status || 'not found'}`)
            refunded++
          }
        } else {
          await refundStale(supabase, r, `Tremendous API error: ${res.status}`)
          refunded++
        }
      } else if (provider === 'paypal' || r.metadata?.type === 'paypal_cashout') {
        // Query PayPal by batch_id
        const batchId = orderId || r.metadata?.batch_id
        if (!batchId) {
          // No batch_id means API call never went through
          await refundStale(supabase, r, 'No PayPal batch_id — API call likely never completed')
          refunded++
          continue
        }

        const clientId = env('PAYPAL_CLIENT_ID')
        const secret = env('PAYPAL_SECRET')
        if (!clientId || !secret) { await refundStale(supabase, r, 'No PayPal API keys'); refunded++; continue }

        const IS_PROD = env('SUPABASE_URL')?.includes('casagrown') && !env('SUPABASE_URL')?.includes('localhost')
        const BASE = IS_PROD ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

        // Get token
        const authRes = await fetch(`${BASE}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        })
        if (!authRes.ok) { await refundStale(supabase, r, 'PayPal auth failed'); refunded++; continue }
        const { access_token } = await authRes.json()

        const batchRes = await fetch(`${BASE}/v1/payments/payouts/${batchId}`, {
          headers: { Authorization: `Bearer ${access_token}` },
        })

        if (batchRes.ok) {
          const batch = await batchRes.json() as any
          const item = batch.items?.[0]
          const status = item?.transaction_status

          if (status === 'SUCCESS') {
            await supabase.from('redemptions').update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              provider: 'paypal',
              provider_order_id: item.payout_item_id || batchId,
              metadata: { ...r.metadata, completed_via: 'reconciliation', transaction_status: status },
            }).eq('id', r.id)
            completed++
            console.log(`[RECONCILE] ✅ Completed ${r.id} (PayPal batch ${batchId})`)
          } else if (['FAILED', 'BLOCKED', 'RETURNED'].includes(status)) {
            await refundStale(supabase, r, `PayPal status: ${status}`)
            refunded++
          }
          // else PENDING/UNCLAIMED — leave it, check next cycle
        } else {
          console.warn(`[RECONCILE] PayPal batch lookup failed: ${batchRes.status}`)
        }
      } else {
        // Unknown provider or no provider info — refund if old enough
        await refundStale(supabase, r, 'Unknown provider, no provider_order_id')
        refunded++
      }
    } catch (err) {
      console.error(`[RECONCILE] Error processing ${r.id}:`, err)
    }
  }

  return jsonOk({ reconciled: completed + refunded, completed, refunded, total_stale: stale.length }, corsHeaders)
}

async function refundStale(supabase: any, redemption: any, reason: string) {
  const refundUsd = redemption.point_cost / 100
  const brandName = redemption.metadata?.brand_name || 'Payout'

  await supabase.from('redemptions').update({
    status: 'failed',
    failed_reason: `Reconciliation: ${reason}`,
    metadata: { ...redemption.metadata, failed_via: 'reconciliation', failure_reason: reason },
  }).eq('id', redemption.id)

  await supabase.rpc('credit_market_balance', {
    p_user_id: redemption.user_id,
    p_amount_usd: refundUsd,
    p_event_type: 'refund_issued',
    p_metadata: {
      description: `Auto-refund: ${brandName} (${reason})`,
      redemption_id: redemption.id,
    },
  })

  await supabase.from('market_notifications').insert({
    user_id: redemption.user_id,
    content: `❌ Your ${brandName} withdrawal of $${refundUsd.toFixed(2)} could not be completed. Funds have been refunded.`,
    link_url: '/earnings',
  })

  console.log(`[RECONCILE] ❌ Refunded ${redemption.id}: $${refundUsd} — ${reason}`)
}
