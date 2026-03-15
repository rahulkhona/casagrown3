/**
 * market-cron — Scheduled edge function for periodic market notifications
 *
 * Handles:
 * (g) Market open reminders — 1hr before market opens
 * (i) Daily digest — cleared transactions summary email
 * (l) 1099K threshold check (also runs after settlement clear)
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

// ═══════════════════════════════════════════════
// (g) Market Open Reminder
// ═══════════════════════════════════════════════
async function handleMarketReminder(
  supabase: any,
  env: (k: string) => string | undefined,
  corsHeaders: Record<string, string>,
) {
  // Find booths that have market activity (products listed for today's date or within 24h)
  const today = new Date().toISOString().slice(0, 10)

  const { data: activeSellers } = await supabase
    .from('market_products')
    .select('seller_id')
    .eq('market_date', today)
    .eq('is_active', true)

  const sellerIds = [...new Set((activeSellers || []).map((s: any) => s.seller_id))]

  if (sellerIds.length === 0) {
    return jsonOk({ sent: 0, message: 'No active booths today' }, corsHeaders)
  }

  // Get all registered users (anyone with a profile)
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email:id')
    .not('id', 'is', null)
    .limit(500)

  if (!users || users.length === 0) {
    return jsonOk({ sent: 0, message: 'No users' }, corsHeaders)
  }

  // Get booth names for the reminder
  const { data: booths } = await supabase
    .from('market_booths')
    .select('name, owner_id')
    .in('owner_id', sellerIds)

  const boothNames = (booths || []).map((b: any) => b.name).slice(0, 3).join(', ')
  const extra = (booths || []).length > 3 ? ` and ${(booths || []).length - 3} more` : ''

  // Send push to all users
  const userIds = users.map((u: any) => u.id)

  const pushUrl = (env('SUPABASE_URL') || 'http://host.docker.internal:54321') +
    '/functions/v1/send-push-notification'
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || ''

  await fetch(pushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      userIds,
      title: '🌱 Market is Open Today!',
      body: `${boothNames}${extra} are selling fresh items. Browse now!`,
      url: '/market',
      tag: 'market-open',
    }),
  }).catch(e => console.warn('Push failed:', e))

  // Send email to all users via send-market-email
  const emailUrl = (env('SUPABASE_URL') || 'http://host.docker.internal:54321') +
    '/functions/v1/send-market-email'

  for (const user of users) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const { data: authUser } = await supabase.auth.admin.getUserById(user.id)
    const email = authUser?.user?.email
    if (!email) continue

    const name = profile?.full_name || email.split('@')[0]

    await fetch(emailUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        to: email,
        subject: '🌱 CasaGrown Market is Open Today!',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <div style="text-align:center;padding:16px 0;border-bottom:2px solid #22c55e">
              <h1 style="color:#166534;font-size:22px;margin:0">🌱 CasaGrown Market</h1>
            </div>
            <div style="padding:24px 0">
              <p style="color:#374151;font-size:14px">Hi ${name},</p>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">
                <p style="color:#166534;font-size:16px;margin:0;font-weight:600">🛒 The market is open today!</p>
                <p style="color:#166534;font-size:14px;margin:8px 0 0">${boothNames}${extra} have fresh items listed.</p>
              </div>
              <a href="https://market.casagrown.com/market" style="display:inline-block;background:#22c55e;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Browse Market</a>
            </div>
            <div style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:11px;text-align:center">
              CasaGrown Market — Fresh from your neighbors
            </div>
          </div>`,
      }),
    }).catch(e => console.warn('Email failed:', e))
  }

  return jsonOk({
    sent: users.length,
    booths: (booths || []).length,
  }, corsHeaders)
}

// ═══════════════════════════════════════════════
// (i) Daily Digest — Cleared Transactions
// ═══════════════════════════════════════════════
async function handleDailyDigest(
  supabase: any,
  env: (k: string) => string | undefined,
  corsHeaders: Record<string, string>,
) {
  // Find settlements that cleared today
  const today = new Date().toISOString().slice(0, 10)

  const { data: clearedSettlements } = await supabase
    .from('market_settlements')
    .select('id, market_date')
    .eq('status', 'cleared')
    .gte('updated_at', today + 'T00:00:00Z')

  if (!clearedSettlements || clearedSettlements.length === 0) {
    return jsonOk({ sent: 0, message: 'No settlements cleared today' }, corsHeaders)
  }

  const settlementIds = clearedSettlements.map((s: any) => s.id)

  // Get user settlements
  const { data: userSettlements } = await supabase
    .from('user_settlements')
    .select('user_id, settlement_id, gross_sales_usd, platform_fee_usd, net_payout_usd, order_count')
    .in('settlement_id', settlementIds)

  if (!userSettlements || userSettlements.length === 0) {
    return jsonOk({ sent: 0, message: 'No user settlements' }, corsHeaders)
  }

  // Group by user
  const byUser = new Map<string, any[]>()
  for (const us of userSettlements) {
    const list = byUser.get(us.user_id) || []
    list.push(us)
    byUser.set(us.user_id, list)
  }

  const emailUrl = (env('SUPABASE_URL') || 'http://host.docker.internal:54321') +
    '/functions/v1/send-market-email'
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || ''

  let sentCount = 0

  for (const [userId, settlements] of byUser) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId)
    const email = authUser?.user?.email
    if (!email) continue

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()

    const name = profile?.full_name || email.split('@')[0]

    // Get orders for these settlements
    const sIds = settlements.map((s: any) => s.settlement_id)
    const { data: orders } = await supabase
      .from('market_orders')
      .select('id, product_name, quantity, subtotal_usd, platform_fee_usd, total_usd, status, created_at')
      .in('settlement_id', sIds)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)

    // Build order rows HTML
    const totalGross = settlements.reduce((s: number, u: any) => s + parseFloat(u.gross_sales_usd || 0), 0)
    const totalFees = settlements.reduce((s: number, u: any) => s + parseFloat(u.platform_fee_usd || 0), 0)
    const totalNet = settlements.reduce((s: number, u: any) => s + parseFloat(u.net_payout_usd || 0), 0)

    let orderRows = ''
    for (const o of (orders || [])) {
      orderRows += `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px">${o.product_name}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">${o.quantity}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">$${parseFloat(o.subtotal_usd).toFixed(2)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center">${o.status}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px">${o.id.substring(0, 8)}...</td>
        </tr>`
    }

    await fetch(emailUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        to: email,
        subject: `CasaGrown Market — Daily Settlement Summary ($${totalNet.toFixed(2)} cleared)`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:580px;margin:0 auto;padding:24px">
            <div style="text-align:center;padding:16px 0;border-bottom:2px solid #22c55e">
              <h1 style="color:#166534;font-size:22px;margin:0">🌱 CasaGrown Market</h1>
              <p style="color:#6b7280;font-size:13px;margin:4px 0 0">Daily Settlement Summary</p>
            </div>
            <div style="padding:24px 0">
              <p style="color:#374151;font-size:14px">Hi ${name},</p>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                  <span style="color:#166534;font-size:13px">Gross Sales</span>
                  <strong style="color:#166534">$${totalGross.toFixed(2)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                  <span style="color:#92400e;font-size:13px">Platform Fees (10%)</span>
                  <span style="color:#92400e">-$${totalFees.toFixed(2)}</span>
                </div>
                <div style="border-top:1px solid #bbf7d0;padding-top:8px;display:flex;justify-content:space-between">
                  <strong style="color:#166534;font-size:15px">Net Cleared</strong>
                  <strong style="color:#166534;font-size:15px">$${totalNet.toFixed(2)}</strong>
                </div>
              </div>
              <h3 style="color:#374151;font-size:14px;margin:20px 0 8px">Transaction Details</h3>
              <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px">
                <thead>
                  <tr style="background:#f9fafb">
                    <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280">Product</th>
                    <th style="padding:8px;text-align:right;font-size:12px;color:#6b7280">Qty</th>
                    <th style="padding:8px;text-align:right;font-size:12px;color:#6b7280">Amount</th>
                    <th style="padding:8px;text-align:center;font-size:12px;color:#6b7280">Status</th>
                    <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280">Order ID</th>
                  </tr>
                </thead>
                <tbody>${orderRows}</tbody>
              </table>
              <div style="margin-top:20px">
                <a href="https://market.casagrown.com/earnings" style="display:inline-block;background:#22c55e;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Full Details</a>
              </div>
            </div>
            <div style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:11px;text-align:center">
              CasaGrown Market — Fresh from your neighbors
            </div>
          </div>`,
      }),
    }).catch(e => console.warn('Digest email failed:', e))

    sentCount++
  }

  return jsonOk({ sent: sentCount }, corsHeaders)
}
