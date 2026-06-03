/**
 * provision-wa-number — Edge Function
 *
 * Provisions a local WhatsApp-enabled phone number for an Elite seller
 * based on their zip code. Creates a Twilio sub-account if needed,
 * searches for a local number matching the zip code's area code,
 * and purchases it.
 *
 * Request body: { "zipCode": "90210" }
 * Response:     { "phoneNumber": "+13105551234", "phoneNumberId": "PN..." }
 */

import {
  jsonError,
  jsonOk,
  requireAuth,
  serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { createTwilioSubaccount, provisionWhatsAppNumber } from "../_shared/twilio.ts";

// US zip code → area code mapping (simplified — major metro areas)
const ZIP_TO_AREA_CODE: Record<string, string> = {
  // California
  "900": "213", "901": "213", "902": "213", "903": "213", "904": "323", "905": "323",
  "906": "323", "907": "323", "908": "323", "910": "626", "911": "626", "912": "626",
  "913": "818", "914": "818", "915": "818", "916": "818", "917": "818", "918": "818",
  "920": "310", "921": "310", "922": "310", "925": "310", "926": "310",
  "930": "805", "931": "805", "932": "805", "934": "805",
  "935": "858", "940": "619", "941": "619", "950": "408", "951": "408",
  "952": "408", "953": "408", "954": "650", "955": "650",
  "956": "510", "957": "510", "958": "916", "959": "916",
  // New York
  "100": "212", "101": "212", "102": "212", "103": "212", "104": "718", "112": "718",
  "113": "718", "114": "718", "115": "914", "116": "914",
  "117": "315", "118": "315", "120": "518", "121": "518", "122": "518",
  "130": "585", "140": "716", "141": "716", "142": "716", "143": "716",
  // Texas
  "750": "214", "751": "214", "752": "214", "753": "214", "760": "817", "761": "817",
  "770": "713", "771": "713", "772": "713", "773": "713", "774": "281", "775": "281",
  "776": "281", "777": "713", "778": "832", "779": "832",
  "780": "210", "781": "210", "782": "210", "783": "830",
  "786": "512", "787": "512",
  // Florida
  "320": "904", "321": "407", "322": "386", "323": "386",
  "327": "407", "328": "407", "329": "321", "330": "954",
  "331": "954", "332": "954", "333": "305", "334": "561",
  "335": "813", "336": "813", "337": "727", "338": "941",
  // Illinois
  "600": "312", "601": "312", "602": "312", "603": "312", "604": "630", "605": "630",
  "606": "708", "607": "708", "608": "815", "610": "309", "611": "309",
  "617": "217", "618": "217", "619": "217", "620": "618",
  // General fallbacks by state (first digit of zip)
  "0": "617",  // Northeast (Boston area)
  "1": "212",  // NY/NJ
  "2": "202",  // DC/VA/NC
  "3": "305",  // FL/GA
  "4": "502",  // KY/IN/OH
  "5": "612",  // MN/WI
  "6": "312",  // IL/MO
  "7": "214",  // TX/LA
  "8": "303",  // CO/UT
  "9": "213",  // CA/WA/OR
}

function zipToAreaCode(zipCode: string): string {
  // Try exact 3-digit prefix first
  const prefix3 = zipCode.slice(0, 3)
  if (ZIP_TO_AREA_CODE[prefix3]) return ZIP_TO_AREA_CODE[prefix3]

  // Fall back to first digit
  const prefix1 = zipCode.slice(0, 1)
  if (ZIP_TO_AREA_CODE[prefix1]) return ZIP_TO_AREA_CODE[prefix1]

  // Default
  return "844" // Toll-free fallback
}

serveWithCors(async (req, { supabase, corsHeaders }) => {
  // ── Auth ──
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth
  const userId = auth

  // ── Verify Elite subscription or pro_tester ──
  const { data: sub } = await supabase
    .from('seller_subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .single()

  let isElite = sub && sub.plan === 'elite' && (sub.status === 'active' || sub.status === 'trialing')

  // Also check pro_testers table (for test/demo accounts)
  if (!isElite) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single()
    if (profile?.email) {
      const { data: tester } = await supabase
        .from('pro_testers')
        .select('email')
        .ilike('email', profile.email)
        .maybeSingle()
      if (tester) {
        isElite = true
      }
    }
  }

  if (!isElite) {
    return jsonError('WhatsApp provisioning requires an active Elite subscription.', corsHeaders, 403)
  }

  // ── Check if already provisioned ──
  const { data: fbConn } = await supabase
    .from('seller_fb_connections')
    .select('twilio_wa_phone_sid, wa_display_phone, wa_number_source')
    .eq('user_id', userId)
    .maybeSingle()

  if (fbConn?.twilio_wa_phone_sid && fbConn?.wa_display_phone) {
    return jsonOk({
      phoneNumber: fbConn.wa_display_phone,
      phoneNumberId: fbConn.twilio_wa_phone_sid,
      alreadyProvisioned: true,
    }, corsHeaders)
  }

  // ── Parse zip code ──
  const body = await req.json().catch(() => ({}))
  const zipCode = body?.zipCode?.trim()

  if (!zipCode || !/^\d{5}$/.test(zipCode)) {
    return jsonError('A valid 5-digit zip code is required.', corsHeaders, 400)
  }

  const areaCode = zipToAreaCode(zipCode)
  console.log(`[PROVISION] User ${userId}: zip=${zipCode} → areaCode=${areaCode}`)

  // ── Create Twilio sub-account ──
  const subAccount = await createTwilioSubaccount(`CasaGrown Seller - ${userId}`)
  if (!subAccount.success || !subAccount.sid || !subAccount.authToken) {
    return jsonError('Failed to create phone account. Please try again.', corsHeaders, 500)
  }

  // ── Provision local number ──
  const phone = await provisionWhatsAppNumber(subAccount.sid, subAccount.authToken, areaCode)
  if (!phone.success || !phone.phoneNumber || !phone.phoneSid) {
    return jsonError(
      `Could not find an available local number for area code ${areaCode}. Please try again.`,
      corsHeaders,
      500,
    )
  }

  // ── Save to database ──
  await supabase
    .from('seller_fb_connections')
    .upsert({
      user_id: userId,
      wa_number_source: 'twilio_provisioned',
      twilio_sub_account_sid: subAccount.sid,
      twilio_wa_phone_sid: phone.phoneSid,
      wa_phone_number_id: phone.phoneSid,
      wa_display_phone: phone.phoneNumber,
      wa_auto_reply_enabled: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  // ── Save zip code to profile ──
  await supabase
    .from('profiles')
    .update({ zip_code: zipCode })
    .eq('id', userId)

  // ── Update WhatsApp Business Profile (best-effort) ──
  try {
    // Fetch seller profile for about/description content
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('farm_name, full_name, seller_bio')
      .eq('id', userId)
      .single()

    // Re-fetch connection to get fb_page_access_token (may have been set during FB connect flow)
    const { data: updatedConn } = await supabase
      .from('seller_fb_connections')
      .select('fb_page_access_token, wa_phone_number_id')
      .eq('user_id', userId)
      .single()

    const accessToken = updatedConn?.fb_page_access_token
    const phoneNumberId = updatedConn?.wa_phone_number_id

    if (accessToken && phoneNumberId) {
      const farmName = sellerProfile?.farm_name || sellerProfile?.full_name || 'Local Farm'
      let aboutText = `${farmName} on CasaGrown`
      // The 'about' field is limited to 139 characters
      if (aboutText.length > 139) {
        aboutText = aboutText.substring(0, 139)
      }

      const profileBody: Record<string, string> = {
        messaging_product: 'whatsapp',
        about: aboutText,
      }
      if (sellerProfile?.seller_bio) {
        profileBody.description = sellerProfile.seller_bio
      }

      const waProfileRes = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/whatsapp_business_profile`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(profileBody),
        },
      )

      if (waProfileRes.ok) {
        console.log(`[PROVISION] ✅ Updated WhatsApp Business Profile about for user ${userId}`)
      } else {
        console.warn(`[PROVISION] ⚠️ WA Business Profile update failed: ${await waProfileRes.text()}`)
      }
    } else {
      console.log(`[PROVISION] ℹ️ Skipping WA Business Profile update — no page access token or phone number ID available yet`)
    }
  } catch (waProfileErr: any) {
    console.warn(`[PROVISION] ⚠️ WA Business Profile update error (non-fatal): ${waProfileErr.message}`)
  }

  console.log(`[PROVISION] ✅ Provisioned ${phone.phoneNumber} (area ${areaCode}) for user ${userId}`)

  return jsonOk({
    phoneNumber: phone.phoneNumber,
    phoneNumberId: phone.phoneSid,
  }, corsHeaders)
})
