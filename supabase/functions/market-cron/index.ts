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

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  const { action } = await req.json().catch(() => ({ action: 'market_reminder' }))

  if (action === 'market_reminder') {
    return await handleMarketReminder(supabase, env, corsHeaders)
  } else if (action === 'daily_digest') {
    return await handleDailyDigest(supabase, env, corsHeaders)
  } else {
    return jsonOk({ error: 'Unknown action: ' + action }, corsHeaders)
  }
})

const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:3002'
const LOGO_URL = `${SITE_URL}/logo.png`

const EMAIL_HEADER = `
  <div style="text-align:center;padding:20px 0;border-bottom:2px solid #16a34a">
    <img src="${LOGO_URL}" alt="CasaGrown" style="height:40px;width:40px;vertical-align:middle;margin-right:8px">
    <span style="color:#166534;font-size:22px;font-weight:700;font-family:'Inter',system-ui,sans-serif;vertical-align:middle">CasaGrown</span>
    <p style="color:#4b5563;font-size:11px;letter-spacing:2px;margin:4px 0 0;font-weight:500">FRESH • LOCAL • TRUSTED</p>
  </div>`

const EMAIL_FOOTER = `
  <div style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:11px;text-align:center">
    CasaGrown — Fresh. Local. Trusted.
  </div>`

const FONT = "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif"

// ═══════════════════════════════════════════════
// (g) Market Open Reminder — based on market_reminders table
// ═══════════════════════════════════════════════
async function handleMarketReminder(
  supabase: any,
  env: (k: string) => string | undefined,
  corsHeaders: Record<string, string>,
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
            ${EMAIL_HEADER}
            <div style="padding:24px 0">
              <p style="font-size:14px">Hi ${name},</p>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:16px 0">
                <p style="color:#166534;font-size:16px;margin:0;font-weight:600">🛒 Market ${whenLabel}</p>
                <p style="font-size:13px;margin:8px 0 0"><strong>${dateStr} · ${timeStr}</strong></p>
                <p style="font-size:13px;margin:4px 0 0">${boothNames}${extra} will be selling fresh items.</p>
              </div>
              ${productRows ? `<div style="background:#f9fafb;border-radius:12px;padding:12px;margin:16px 0">${productRows}${moreCount > 0 ? `<p style="font-size:12px;color:#6b7280;margin:8px 0 0">+ ${moreCount} more items</p>` : ''}</div>` : ''}
              <a href="${SITE_URL}/market" style="display:inline-block;background:#16a34a;color:white;padding:10px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Browse Market</a>
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
            ${EMAIL_HEADER}
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
                <a href="${SITE_URL}/earnings" style="display:inline-block;background:#16a34a;color:white;padding:10px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">View Full Details</a>
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
