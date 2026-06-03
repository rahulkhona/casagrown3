/**
 * connect-whatsapp — WhatsApp Embedded Signup callback handler
 *
 * GET: Receives the OAuth callback from Meta's Embedded Signup flow.
 *      Exchanges the code for a token, fetches the seller's WABA and
 *      phone number, and saves the connection so GrowBot can auto-reply.
 *
 * Flow:
 *   1. Seller clicks "Connect WhatsApp Business" in CasaGrown settings
 *   2. Opens Meta Embedded Signup (hosted by Meta)
 *   3. Seller authorizes → Meta redirects to /api/facebook-callback
 *   4. Next.js route forwards here with ?code=...&state=...
 *   5. We exchange code → token → fetch WABA → fetch phone number
 *   6. Save wa_phone_number_id + token to seller_fb_connections
 *   7. Redirect back to settings page
 */
import { serveWithCors, jsonError } from '../_shared/serve-with-cors.ts'

const GRAPH_API_VERSION = 'v21.0'

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const FACEBOOK_APP_ID = env('FACEBOOK_APP_ID', true)!
  const FACEBOOK_APP_SECRET = env('FACEBOOK_APP_SECRET', true)!

  if (req.method !== 'GET') {
    return jsonError('Method not allowed', corsHeaders, 405)
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state') || ''

  // Parse state: format is "userId:encodedReturnPath"
  const [userId, returnPathEncoded] = stateRaw.split(':')
  const returnPath = returnPathEncoded ? decodeURIComponent(returnPathEncoded) : '/pro-manage'

  // Handle errors or cancelled flow
  const error = url.searchParams.get('error')
  if (error || !code) {
    console.warn('[CONNECT-WA] User cancelled or error:', error)
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': `${siteUrl}${returnPath}?wa=canceled` },
    })
  }

  if (!userId) {
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': `${siteUrl}${returnPath}?wa=error&msg=missing_state` },
    })
  }

  const redirectUri = `${siteUrl}/api/facebook-callback`

  try {
    // ── Step 1: Exchange code for access token ──
    const tokenRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?` +
      `client_id=${FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&client_secret=${FACEBOOK_APP_SECRET}` +
      `&code=${code}`,
    )

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      throw new Error(`Token exchange failed: ${errText}`)
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token
    console.log('[CONNECT-WA] Token exchange successful')

    // ── Step 2: Get the user's shared WhatsApp Business Accounts ──
    // The Embedded Signup grants access to the seller's WABA
    const debugTokenRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/debug_token?` +
      `input_token=${accessToken}&access_token=${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`,
    )

    let wabaId: string | null = null
    let phoneNumberId: string | null = null
    let displayPhone: string | null = null

    if (debugTokenRes.ok) {
      const debugData = await debugTokenRes.json()
      const granularScopes = debugData.data?.granular_scopes || []
      // Find WABA ID from the granted scopes
      for (const scope of granularScopes) {
        if (scope.scope === 'whatsapp_business_management' && scope.target_ids?.length > 0) {
          wabaId = scope.target_ids[0]
          break
        }
      }
      console.log('[CONNECT-WA] Debug token - WABA ID:', wabaId)
    }

    // ── Step 3: If we got a WABA ID, fetch phone numbers ──
    if (wabaId) {
      const phonesRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/phone_numbers?access_token=${accessToken}`,
      )

      if (phonesRes.ok) {
        const phonesData = await phonesRes.json()
        const phones = phonesData.data || []
        if (phones.length > 0) {
          // Use the first phone number (most common case: seller has one number)
          phoneNumberId = phones[0].id
          displayPhone = phones[0].display_phone_number
          console.log(`[CONNECT-WA] Found phone: ${displayPhone} (ID: ${phoneNumberId})`)
        }
      } else {
        console.warn('[CONNECT-WA] Failed to fetch phone numbers:', await phonesRes.text())
      }
    }

    // ── Step 4: If we couldn't get WABA from debug_token, try listing WABAs ──
    if (!wabaId) {
      // Try fetching the user's business accounts
      const businessRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/me/businesses?access_token=${accessToken}`,
      )

      if (businessRes.ok) {
        const bizData = await businessRes.json()
        const businesses = bizData.data || []

        for (const biz of businesses) {
          // For each business, try to get owned WABAs
          const wabaRes = await fetch(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${biz.id}/owned_whatsapp_business_accounts?access_token=${accessToken}`,
          )
          if (wabaRes.ok) {
            const wabaData = await wabaRes.json()
            const wabas = wabaData.data || []
            if (wabas.length > 0) {
              wabaId = wabas[0].id

              // Fetch phone numbers for this WABA
              const phonesRes2 = await fetch(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/phone_numbers?access_token=${accessToken}`,
              )
              if (phonesRes2.ok) {
                const phonesData2 = await phonesRes2.json()
                const phones2 = phonesData2.data || []
                if (phones2.length > 0) {
                  phoneNumberId = phones2[0].id
                  displayPhone = phones2[0].display_phone_number
                }
              }
              break
            }
          }
        }
      }
    }

    if (!phoneNumberId) {
      console.warn('[CONNECT-WA] Could not find phone number. WABA:', wabaId)
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': `${siteUrl}${returnPath}?wa=error&msg=${encodeURIComponent('No WhatsApp phone number found. Please ensure you completed the setup and registered a phone number.')}`,
        },
      })
    }

    // ── Step 5: Subscribe the WABA to our app's webhooks ──
    if (wabaId) {
      try {
        const subscribeRes = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/subscribed_apps`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
          },
        )
        if (subscribeRes.ok) {
          console.log(`[CONNECT-WA] ✅ Subscribed WABA ${wabaId} to app webhooks`)
        } else {
          console.warn(`[CONNECT-WA] ⚠️ WABA subscribe failed: ${await subscribeRes.text()}`)
        }
      } catch (subErr: any) {
        console.warn(`[CONNECT-WA] ⚠️ WABA subscribe error: ${subErr.message}`)
      }
    }

    // ── Step 6: Save connection to database ──
    await supabase
      .from('seller_fb_connections')
      .upsert({
        user_id: userId,
        wa_business_account_id: wabaId,
        wa_phone_number_id: phoneNumberId,
        wa_display_phone: displayPhone,
        wa_number_source: 'seller_provided',
        wa_auto_reply_enabled: true,
        // Use the token for sending messages via WhatsApp Cloud API
        fb_page_access_token: accessToken,
        status: 'connected',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    console.log(`[CONNECT-WA] ✅ Saved WhatsApp connection for user ${userId}: phone=${displayPhone}, WABA=${wabaId}`)

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': `${siteUrl}${returnPath}?wa=connected` },
    })
  } catch (err: any) {
    console.error('[CONNECT-WA] Error:', err)
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': `${siteUrl}${returnPath}?wa=error&msg=${encodeURIComponent(err.message)}`,
      },
    })
  }
})
