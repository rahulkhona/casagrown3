import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { wrapInBrandedTemplate } from '../_shared/email-templates.ts'
import { syncMissingProduceSeasonality } from '../_shared/seasonality.ts'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export const US_STATE_TIMEZONES: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Boise',
  IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago', KS: 'America/Chicago',
  KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago', NV: 'America/Los_Angeles',
  NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York',
  NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York', OK: 'America/Chicago',
  OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York',
  WI: 'America/Chicago', WY: 'America/Denver',
}

export function isWithinOptimalSellerSlot(sellerStateOrTz?: string, now = new Date()): boolean {
  let tz = 'America/Los_Angeles'
  if (sellerStateOrTz) {
    const clean = sellerStateOrTz.trim().toUpperCase()
    if (US_STATE_TIMEZONES[clean]) {
      tz = US_STATE_TIMEZONES[clean]
    } else if (sellerStateOrTz.includes('/')) {
      tz = sellerStateOrTz
    }
  }

  try {
    const localHourStr = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz
    }).format(now)
    const hour = parseInt(localHourStr, 10)
    // Optimal morning window: 09:00 AM to 11:59 AM in recipient local time
    return hour >= 9 && hour < 12
  } catch {
    return true
  }
}

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  try {
    let reqBody: any = {}
    try {
      reqBody = await req.json()
    } catch {
      reqBody = {}
    }
    const ignoreTimeWindow = !!reqBody.ignore_time_window || !!reqBody.test_run

    const rawSiteUrl = env('SITE_URL') ?? 'https://casagrown.com'
    const siteUrl = (rawSiteUrl.includes('localhost') && env('POSTMARK_SERVER_TOKEN'))
      ? 'https://www.casagrown.com'
      : rawSiteUrl

    const createListingUrl = `${siteUrl}/create-listing`
    const postmarkToken = env('POSTMARK_SERVER_TOKEN') || ''
    const senderEmail = env('FROM_EMAIL') || 'notifications@casagrown.com'

    // 1. Pre-flight: Automatically discover and populate harvest windows for any newly added custom produce
    const geminiApiKey = env('GEMINI_API_KEY') || ''
    await syncMissingProduceSeasonality(supabase, geminiApiKey)

    // 2. Ensure campaign record exists for 15-day cooldown tracking
    let { data: campaign } = await supabase
      .from('crm_campaigns')
      .select('id')
      .eq('system_alias', 'seasonal_demand_reminders')
      .single()

    if (!campaign) {
      const { data: newCamp } = await supabase
        .from('crm_campaigns')
        .insert({
          name: 'Seasonal Seller Demand Reminders',
          system_alias: 'seasonal_demand_reminders',
          description: 'Bi-weekly seasonal pre-season and in-season harvest reminders for sellers with unmet local demand',
          target_audience_type: 'sellers',
          status: 'active'
        })
        .select('id')
        .single()
      campaign = newCamp
    }

    // 3. Fetch eligible sellers from RPC (enforces harvest seasonality + 15-day cooldown + local buyer demand)
    const { data: eligibleSellers, error: rpcErr } = await supabase
      .rpc('get_seasonal_seller_demand_reminders')

    if (rpcErr) {
      console.error('[send-seasonal-demand-reminders] RPC error:', rpcErr)
      throw rpcErr
    }

    if (!eligibleSellers || eligibleSellers.length === 0) {
      return jsonOk({ sentCount: 0, message: 'No eligible sellers due for seasonal reminders today' }, corsHeaders)
    }

    let sentCount = 0
    let skippedTimezoneCount = 0
    const results: any[] = []

    for (const seller of eligibleSellers) {
      // Check recipient optimal morning window (09:00 - 11:59 local time) unless explicitly ignored
      if (!ignoreTimeWindow && !isWithinOptimalSellerSlot(seller.state)) {
        skippedTimezoneCount++
        continue
      }
      const isPreSeason = !!seller.is_pre_season
      const prodName = seller.produce_name
      const zip = seller.zipcode
      const buyersCount = seller.local_buyers_count || 1
      const startMonthName = MONTH_NAMES[seller.season_start_month] || ''
      const endMonthName = MONTH_NAMES[seller.season_end_month] || ''

      const emailSubject = isPreSeason
        ? `🌱 Getting Ready: ${prodName} Season is Approaching in ${zip}`
        : `🌾 Harvest Reminder: Neighbors in ${zip} are Looking for ${prodName}`

      // Build Section 1: Main Crop
      const seasonLabel = isPreSeason
        ? `⏳ Upcoming Season: ${startMonthName} – ${endMonthName}`
        : `🌱 Active Harvest Season: ${startMonthName} – ${endMonthName}`

      const seasonIntro = isPreSeason
        ? `<strong>${prodName} season is approaching in your area!</strong> As your garden or trees start ripening over the coming weeks, keep CasaGrown top-of-mind to share your extra harvest with local neighbors.`
        : `<strong>${prodName} harvest is in full swing in your area!</strong> Local neighbors in <strong>${zip}</strong> are actively searching for fresh, home-grown backyard produce.`

      // Build Section 2: What Else Neighbors Want
      const otherDemands: any[] = Array.isArray(seller.other_in_demand_produce)
        ? seller.other_in_demand_produce.filter((o: any) => o.produce_name.toLowerCase() !== prodName.toLowerCase()).slice(0, 3)
        : []

      let otherDemandsHtml = ''
      if (otherDemands.length > 0) {
        otherDemandsHtml = `
          <div style="margin-top: 28px; padding-top: 20px; border-top: 1px dashed #e2e8f0;">
            <h3 style="margin: 0 0 8px; font-size: 15px; font-weight: 700; color: #1e293b;">
              🏡 Growing Other Fruits or Veggies in Your Yard?
            </h3>
            <p style="margin: 0 0 12px; font-size: 13px; color: #64748b;">
              Here is what else your neighbors in <strong>${zip}</strong> are looking for right now:
            </p>
            <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6;">
              ${otherDemands.map(d => `
                <li>
                  <strong style="text-transform: capitalize;">${d.produce_name}</strong> &mdash; 
                  <span style="color: #15803d; font-weight: 600;">${d.buyers_count} interested ${d.buyers_count === 1 ? 'buyer' : 'buyers'}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        `
      }

      const utmVariant = isPreSeason
        ? `pre_season_${encodeURIComponent(prodName.toLowerCase().replace(/\s+/g, '_'))}`
        : `in_season_${encodeURIComponent(prodName.toLowerCase().replace(/\s+/g, '_'))}`
      
      const targetListingUrl = `${createListingUrl}?utm_source=email&utm_medium=seasonal_reminder&utm_campaign=seasonal_demand_reminders&utm_content=${utmVariant}&utm_term=${encodeURIComponent(zip)}`

      const bodyHtml = `
        <p style="margin: 0 0 14px; font-size: 15px; color: #334155; line-height: 1.5;">
          ${seasonIntro}
        </p>

        <!-- Crop Summary Card -->
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin: 16px 0 24px;">
          <h2 style="margin: 0 0 4px; font-size: 18px; font-weight: 700; color: #0f172a;">
            ${prodName}
          </h2>
          <div style="font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 8px;">
            ${seasonLabel}
          </div>
          <div style="display: inline-block; background-color: #dcfce7; color: #166534; font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 6px;">
            👥 ${buyersCount} ${buyersCount === 1 ? 'Neighbor' : 'Neighbors'} in ${zip} looking to buy
          </div>
        </div>

        <!-- Primary CTA Button (Straight to /create-listing with MAB UTM parameters) -->
        <div style="text-align: center; margin: 24px 0 12px;">
          <a href="${targetListingUrl}" 
             style="display: inline-block; background-color: #16a34a; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.2);">
            ✨ List Your Produce on CasaGrown
          </a>
          <p style="margin: 8px 0 0; font-size: 12px; color: #94a3b8;">
            Just snap a photo or type a quick note &mdash; our AI handles the rest in seconds!
          </p>
        </div>

        ${otherDemandsHtml}
      `

      const emailHtml = wrapInBrandedTemplate({
        title: isPreSeason ? 'Upcoming Harvest Season' : 'Local Harvest Season',
        greeting: `Hi ${seller.seller_name || 'Neighbor'},`,
        bodyHtml,
        footer: `You received this seasonal harvest update because you grow produce in ZIP ${zip}. We send seasonal updates at most once every 15 days.`,
        headerGradient: isPreSeason
          ? 'linear-gradient(135deg, #0d9488 0%, #10b981 50%, #22c55e 100%)'
          : 'linear-gradient(135deg, #15803d 0%, #16a34a 50%, #22c55e 100%)'
      })

      // Send via Postmark if token exists
      let sentSuccess = false
      if (postmarkToken) {
        try {
          const pmResp = await fetch('https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Postmark-Server-Token': postmarkToken,
            },
            body: JSON.stringify({
              From: senderEmail,
              To: seller.seller_email,
              Subject: emailSubject,
              HtmlBody: emailHtml,
              MessageStream: env('POSTMARK_BROADCAST_STREAM') || 'broadcast',
            })
          })
          sentSuccess = pmResp.ok
        } catch (postmarkErr) {
          console.error('[send-seasonal-demand-reminders] Postmark send error:', postmarkErr)
        }
      } else {
        // Dev/Mock mode
        sentSuccess = true
      }

      if (sentSuccess) {
        sentCount++
        // Log in crm_campaign_sends to enforce 15-day cooldown
        if (campaign?.id) {
          await supabase
            .from('crm_campaign_sends')
            .insert({
              campaign_id: campaign.id,
              lead_id: seller.seller_lead_id || null,
              user_id: seller.seller_user_id || null,
              email: seller.seller_email,
              status: 'sent',
              metadata: {
                produce_name: prodName,
                zipcode: zip,
                is_pre_season: isPreSeason,
                local_buyers_count: buyersCount
              }
            })
        }
      }

      results.push({ email: seller.seller_email, produce: prodName, success: sentSuccess })
    }

    return jsonOk({ sentCount, totalEligible: eligibleSellers.length, results }, corsHeaders)
  } catch (err: any) {
    console.error('[send-seasonal-demand-reminders] Error:', err)
    return jsonError(err, corsHeaders)
  }
})
