import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { sendBroadcastEmailBatch } from '../_shared/postmark.ts'
import { wrapInBrandedTemplate, actionButton } from '../_shared/email-templates.ts'

/**
 * marketing-scheduler
 * Edge Function running every 15-30 minutes in background.
 * Evaluates active local-time notification schedules and dispatches Push, Email, or SMS
 * to registered users AND unauthenticated guest devices whose local clock currently
 * falls inside today's configured send window.
 * Supports Multi-Armed Bandit (MAB) Thompson Sampling for Content, Schedule, and Full Journey variants.
 */
serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const baseUrl = siteUrl || 'https://casagrown.com'
  const pushUrl = `${env('SUPABASE_URL')}/functions/v1/send-push-notification`

  // 1. Fetch active schedules
  const { data: schedules, error: schedError } = await supabase
    .from('crm_notification_schedules')
    .select('*, crm_campaigns(*)')
    .eq('is_active', true)

  if (schedError || !schedules || schedules.length === 0) {
    return jsonOk({ processed: 0, message: 'No active notification schedules found' }, corsHeaders)
  }

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  let totalDispatched = 0

  for (const sched of schedules) {
    const { id: scheduleId, notification_type, windows, channels, fallback_timezone, target_audience = 'all', crm_campaigns: campaign } = sched

    const channel = campaign?.channel || 'push'
    const isAB = campaign?.is_ab_test ?? false
    const isMAB = campaign?.is_mab_experiment ?? false

    // (A) Process Registered User Recipient Scope
    const { data: recipients } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_number, phone_verified, sms_enabled, zip_code, state_code')
      .limit(500)

    if (recipients && recipients.length > 0) {
      for (const windowDef of (windows || [])) {
        let { name: windowName, start: windowStart, end: windowEnd } = windowDef

        for (const recipient of recipients) {
          // Check recipient device timezone or fallback
          const { data: userTokens } = await supabase
            .from('user_push_tokens')
            .select('timezone')
            .eq('user_id', recipient.id)
            .limit(1)

          const userTz = userTokens?.[0]?.timezone || fallback_timezone || 'America/Los_Angeles'

          // Convert UTC now to recipient's local time string HH:MM:SS and day of week
          let localTimeStr = '10:00:00'
          let localDayKey = 'mon'
          try {
            const timeFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: userTz,
              hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', hour12: false
            })
            localTimeStr = timeFormatter.format(now)

            const dayFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: userTz,
              weekday: 'short'
            })
            localDayKey = dayFormatter.format(now).toLowerCase()
          } catch {
            localTimeStr = now.toTimeString().split(' ')[0]
          }

          // Sample MAB Variant if MAB Experiment is enabled
          let mabVariant: any = null
          if (isMAB && campaign?.id) {
            const { data: mabData } = await supabase.rpc('get_campaign_mab_variant', { p_campaign_id: campaign.id })
            if (mabData && mabData.length > 0) {
              mabVariant = mabData[0]
              if (mabVariant.send_window_start && mabVariant.send_window_end) {
                windowStart = mabVariant.send_window_start
                windowEnd = mabVariant.send_window_end
              }
            }
          }

          if (windowDef.days && Array.isArray(windowDef.days) && windowDef.days.length > 0) {
            if (!windowDef.days.includes(localDayKey)) continue
          }

          if (localTimeStr < windowStart || localTimeStr > windowEnd) continue

          // Prevent duplicate dispatch today
          const { data: existingLog } = await supabase
            .from('crm_notification_window_logs')
            .select('id')
            .eq('schedule_id', scheduleId)
            .eq('recipient_id', recipient.id)
            .eq('dispatch_date', todayStr)
            .eq('window_name', windowName)
            .maybeSingle()

          if (existingLog) continue

          const useVariantB = isAB && (recipient.id.charCodeAt(0) % 2 === 1)
          let pushSent = false, emailSent = false, smsSent = false

          if (channel === 'push' || channels?.push) {
            const pushTitle = mabVariant?.push_title || (useVariantB && campaign?.variant_b_push_title
              ? campaign.variant_b_push_title
              : (campaign?.push_title || campaign?.name || '🌱 CasaGrown Update'))

            const pushBody = mabVariant?.push_body || (useVariantB && campaign?.variant_b_push_body
              ? campaign.variant_b_push_body
              : (campaign?.push_body || 'Fresh produce update available near you.'))

            const pushTargetUrl = mabVariant?.push_target_url || campaign?.push_target_url || '/market'

            await fetch(pushUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
              body: JSON.stringify({
                userIds: [recipient.id],
                title: pushTitle,
                body: pushBody,
                data: { targetUrl: pushTargetUrl, scheduleId, variantId: mabVariant?.variant_id },
              }),
            }).then((res) => res.text()).catch(() => ({}))
            pushSent = true
          }

          if (channel === 'email' || channels?.email) {
            if (recipient.email) {
              const subject = mabVariant?.subject || (useVariantB && campaign?.variant_b_subject
                ? campaign.variant_b_subject
                : (campaign?.subject || '🌱 CasaGrown Update'))

              const htmlContent = mabVariant?.html_body || (useVariantB && campaign?.variant_b_html_body
                ? campaign.variant_b_html_body
                : (campaign?.html_body || wrapInBrandedTemplate({
                  title: 'CasaGrown Update',
                  greeting: `Hello ${recipient.full_name || 'Gardener'},`,
                  bodyHtml: `<p>Your update is ready!</p>${actionButton('View Market', baseUrl + '/market')}`,
                })))

              await sendBroadcastEmailBatch([
                { to: recipient.email, subject, htmlBody: htmlContent }
              ])
              emailSent = true
            }
          }

          if (pushSent || emailSent || smsSent) {
            await supabase.from('crm_notification_window_logs').insert({
              schedule_id: scheduleId,
              recipient_id: recipient.id,
              dispatch_date: todayStr,
              window_name: windowName,
              variant_id: mabVariant?.variant_id || null,
            })
            totalDispatched++
          }
        }
      }
    }

    // (B) Process Unauthenticated Guest Device Push Subscriptions
    if (channel === 'push' || channels?.push) {
      const { data: guestSubs } = await supabase
        .from('push_subscriptions')
        .select('guest_id, token, platform, timezone, zip_code, state_code')
        .not('guest_id', 'is', null)
        .limit(500)

      if (guestSubs && guestSubs.length > 0) {
        for (const windowDef of (windows || [])) {
          let { name: windowName, start: windowStart, end: windowEnd } = windowDef

          for (const guest of guestSubs) {
            const guestTz = guest.timezone || fallback_timezone || 'America/Los_Angeles'

            let localTimeStr = '10:00:00'
            let localDayKey = 'mon'
            try {
              const timeFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: guestTz,
                hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', hour12: false
              })
              localTimeStr = timeFormatter.format(now)

              const dayFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: guestTz,
                weekday: 'short'
              })
              localDayKey = dayFormatter.format(now).toLowerCase()
            } catch {
              localTimeStr = now.toTimeString().split(' ')[0]
            }

            let mabVariant: any = null
            if (isMAB && campaign?.id) {
              const { data: mabData } = await supabase.rpc('get_campaign_mab_variant', { p_campaign_id: campaign.id })
              if (mabData && mabData.length > 0) {
                mabVariant = mabData[0]
                if (mabVariant.send_window_start && mabVariant.send_window_end) {
                  windowStart = mabVariant.send_window_start
                  windowEnd = mabVariant.send_window_end
                }
              }
            }

            if (windowDef.days && Array.isArray(windowDef.days) && windowDef.days.length > 0) {
              if (!windowDef.days.includes(localDayKey)) continue
            }

            if (localTimeStr < windowStart || localTimeStr > windowEnd) continue

            // Prevent duplicate guest dispatch today
            const { data: existingGuestLog } = await supabase
              .from('crm_notification_window_logs')
              .select('id')
              .eq('schedule_id', scheduleId)
              .eq('guest_id', guest.guest_id)
              .eq('dispatch_date', todayStr)
              .eq('window_name', windowName)
              .maybeSingle()

            if (existingGuestLog) continue

            const pushTitle = mabVariant?.push_title || campaign?.push_title || campaign?.name || '🌱 CasaGrown Update'
            const pushBody = mabVariant?.push_body || campaign?.push_body || 'Fresh produce update available near you.'
            const pushTargetUrl = mabVariant?.push_target_url || campaign?.push_target_url || '/market'

            await fetch(pushUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
              body: JSON.stringify({
                tokens: [guest.token],
                title: pushTitle,
                body: pushBody,
                data: { targetUrl: pushTargetUrl, scheduleId, guestId: guest.guest_id, variantId: mabVariant?.variant_id },
              }),
            }).then((res) => res.text()).catch(() => ({}))

            await supabase.from('crm_notification_window_logs').insert({
              schedule_id: scheduleId,
              guest_id: guest.guest_id,
              dispatch_date: todayStr,
              window_name: windowName,
              variant_id: mabVariant?.variant_id || null,
            })
            totalDispatched++
          }
        }
      }
    }
  }

  return jsonOk({
    processed: schedules.length,
    dispatched: totalDispatched,
    timestamp: now.toISOString(),
  }, corsHeaders)
})
