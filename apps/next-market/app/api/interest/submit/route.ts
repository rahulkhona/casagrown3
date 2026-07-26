import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fzdmszvfeewpwswlnfyk.supabase.co'
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
      home_address,
      accepts_email,
      accepts_sms,
      accepts_push,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      first_touch_source,
      signup_referrer_id,
    } = body

    // 1. Validate zipcodes array format (must contain valid 5-digit US zipcodes)
    if (!zipcodes || !Array.isArray(zipcodes) || zipcodes.length === 0) {
      return NextResponse.json({ error: 'At least one valid 5-digit zipcode is required' }, { status: 400 })
    }

    const invalidZip = zipcodes.find((z: string) => !/^\d{5}$/.test(String(z).trim()))
    if (invalidZip) {
      return NextResponse.json({ error: `Invalid 5-digit zipcode provided: ${invalidZip}` }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 2. Insert or update crm_leads entry with UTM attribution
    const primaryZipcode = zipcodes[0]
    const userId = user?.id || body.user_id || null
    console.log('[Interest API] userId:', userId, 'interests count:', interests?.length, 'zipcodes:', zipcodes)

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
          source_url: '/interest',
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
            first_touch_source: first_touch_source || null,
            referrer_id: signup_referrer_id || null,
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
        lead_id: userId ? null : (leadId || null),
        user_id: userId,
        interest_type: item.interest_type,
        produce_name: item.produce_name,
        produce_category: item.category || 'produce',
        zipcodes: zipcodes.map((z: string) => z.trim()),
        radius_miles: radius_miles || 5,
        home_address: home_address || null,
        preference_pickup: preference_pickup ?? true,
        preference_delivery: preference_delivery ?? true,
        status: 'active',
      }))

      const { error: interestError } = await supabase.from('crm_produce_interests').insert(rowsToInsert)
      console.log('[Interest API] Insert interests result:', interestError ? 'ERROR: ' + JSON.stringify(interestError) : 'OK, ' + rowsToInsert.length + ' rows')
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
