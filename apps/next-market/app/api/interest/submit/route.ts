import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function POST(req: Request) {
  try {
    // Check for authenticated user via Authorization header
    let user: { id: string; email?: string } | null = null
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const { data: { user: authUser } } = await supabaseAuth.auth.getUser(authHeader.replace('Bearer ', ''))
      if (authUser) user = { id: authUser.id, email: authUser.email || undefined }
    }

    const body = await req.json()
    const {
      name,
      email,
      phone,
      zipcodes,
      interests,
      preference_pickup,
      preference_delivery,
      radius_miles,
      home_address: rawHomeAddress,
      accepts_email,
      accepts_sms,
      accepts_push,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      source_url,
      first_touch_source,
      signup_referrer_id,
      store_types,
      fulfillment_modes,
      buying_frequency,
      neighbor_buying_comfort,
      selling_comfort,
      excess_handling,
    } = body

    let home_address = rawHomeAddress

    // 1. Validate zipcodes array format (must contain valid 5-digit US zipcodes)
    if (!zipcodes || !Array.isArray(zipcodes) || zipcodes.length === 0) {
      return NextResponse.json({ error: 'At least one valid 5-digit zipcode is required' }, { status: 400 })
    }

    const invalidZip = zipcodes.find((z: string) => !/^\d{5}$/.test(String(z).trim()))
    if (invalidZip) {
      return NextResponse.json({ error: `Invalid 5-digit zipcode provided: ${invalidZip}` }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 2. Insert or update crm_leads entry with UTM & source attribution
    const primaryZipcode = zipcodes[0]
    let userId = user?.id || body.user_id || null

    if (!userId && email) {
      const { data: matchedProfile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', email.trim())
        .maybeSingle()
      if (matchedProfile?.id) userId = matchedProfile.id
    }

    let finalLat = body.latitude ?? null
    let finalLng = body.longitude ?? null

    if ((finalLat == null || finalLng == null) && userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('home_address, latitude, longitude')
        .eq('id', userId)
        .maybeSingle()
      if (profile) {
        if (!home_address && profile.home_address) home_address = profile.home_address
        if (finalLat == null && profile.latitude != null) finalLat = profile.latitude
        if (finalLng == null && profile.longitude != null) finalLng = profile.longitude
      }
    }

    if (finalLat == null || finalLng == null) {
      const headerLat = req.headers.get('x-vercel-ip-latitude')
      const headerLng = req.headers.get('x-vercel-ip-longitude')
      if (headerLat) finalLat = parseFloat(headerLat)
      if (headerLng) finalLng = parseFloat(headerLng)
    }

    const effectiveSourceUrl = source_url || first_touch_source || body.source || '/interest'
    const effectiveFirstTouch = first_touch_source || source_url || body.source || null

    console.log('[Interest API] userId:', userId, 'source_url:', effectiveSourceUrl, 'interests count:', interests?.length)

    const { data: leadData, error: leadError } = await supabase
      .from('crm_leads')
      .upsert(
        {
          name,
          email,
          phone,
          zipcode: primaryZipcode,
          accepts_email: accepts_email ?? true,
          accepts_sms: accepts_sms ?? true,
          source_platform: 'web',
          source_url: effectiveSourceUrl,
          form_version: 'v1-interest-grid',
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: utm_term || null,
          status: userId ? 'contacted' : 'new',
          metadata: {
            radius_miles: radius_miles || 5,
            home_address,
            preference_pickup,
            preference_delivery,
            accepts_push: accepts_push ?? true,
            secondary_zipcodes: zipcodes.slice(1),
            interest_count: interests?.length || 0,
            first_touch_source: effectiveFirstTouch,
            referrer_id: signup_referrer_id || null,
            ...(store_types ? { store_types } : {}),
            ...(fulfillment_modes ? { fulfillment_modes } : {}),
            ...(buying_frequency ? { buying_frequency } : {}),
            ...(neighbor_buying_comfort ? { neighbor_buying_comfort } : {}),
            ...(selling_comfort ? { selling_comfort } : {}),
            ...(excess_handling ? { excess_handling } : {}),
          },
        },
        { onConflict: 'email' }
      )
      .select()
      .single()

    const leadId = leadData?.id
    console.log('[Interest API] Lead upsert result:', leadId, 'error:', leadError)

    // 3. Save produce interests in crm_produce_interests
    if (interests && Array.isArray(interests) && interests.length > 0) {
      const rowsToInsert = interests.map((item: { produce_name: string; interest_type: string; category?: string }) => ({
        lead_id: leadId || null,
        user_id: userId || null,
        interest_type: item.interest_type,
        produce_name: item.produce_name,
        produce_category: item.category || 'produce',
        zipcodes: zipcodes.map((z: string) => z.trim()),
        radius_miles: radius_miles || 5,
        home_address: home_address || null,
        latitude: finalLat,
        longitude: finalLng,
        preference_pickup: preference_pickup ?? true,
        preference_delivery: preference_delivery ?? true,
        status: 'active',
      }))

      const { error: interestError } = await supabase.from('crm_produce_interests').insert(rowsToInsert)
      console.log('[Interest API] Insert interests result:', interestError ? 'ERROR: ' + JSON.stringify(interestError) : 'OK, ' + rowsToInsert.length + ' rows')

      if (userId && leadId) {
        await supabase
          .from('crm_produce_interests')
          .update({ user_id: userId })
          .eq('lead_id', leadId)
      }

      // Upsert custom items into community_produce_catalog for fast O(1) community catalog hydration
      const customItems = interests.filter((item: { produce_name: string; is_custom?: boolean; image?: string; category?: string }) => item.is_custom)
      if (customItems.length > 0) {
        const catalogRows = customItems.map((ci: { produce_name: string; image?: string; category?: string }) => ({
          id: ci.produce_name.toLowerCase().trim().replace(/\s+/g, '_'),
          name: ci.produce_name.charAt(0).toUpperCase() + ci.produce_name.slice(1).trim(),
          category: ci.category || 'produce',
          image: ci.image || '/images/produce_placeholder.jpg',
          use_count: 1,
        }))
        await supabase.from('community_produce_catalog').upsert(catalogRows, { onConflict: 'id' })
      }
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      message: 'Produce interest saved successfully',
    })
  } catch (error: any) {
    console.error('Error submitting produce interest:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
