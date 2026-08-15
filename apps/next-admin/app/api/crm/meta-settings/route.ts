import { NextRequest, NextResponse } from 'next/server'

const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0'

// In-memory / persistent settings storage
let memoryMetaSettings = {
  fb_app_id: process.env.FACEBOOK_APP_ID || process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '',
  fb_app_secret: process.env.FACEBOOK_APP_SECRET || '',
  fb_access_token: process.env.FACEBOOK_ACCESS_TOKEN || '',
  fb_ad_account_id: process.env.FB_AD_ACCOUNT_ID || '',
  fb_page_id: process.env.FB_PAGE_ID || '',
  fb_instagram_account_id: process.env.FB_INSTAGRAM_ACCOUNT_ID || '',
  environment: 'sandbox' as 'sandbox' | 'production',
  default_campaign_objective: 'OUTCOME_TRAFFIC',
  default_optimization_goal: 'LINK_CLICKS',
}

export async function GET() {
  return NextResponse.json({
    success: true,
    settings: memoryMetaSettings,
  })
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    const body = await req.json().catch(() => ({}))

    if (action === 'test') {
      const { settings } = body
      const token = settings?.fb_access_token || memoryMetaSettings.fb_access_token
      const adAccountId = settings?.fb_ad_account_id || memoryMetaSettings.fb_ad_account_id
      const pageId = settings?.fb_page_id || memoryMetaSettings.fb_page_id

      if (!token) {
        return NextResponse.json({
          success: false,
          message: 'Access Token is required to test Meta connection.',
        })
      }

      // 1. Test User Identity & Token Validity
      const meRes = await fetch(`${FB_GRAPH_URL}/me?access_token=${token}&fields=id,name,permissions`)
      if (!meRes.ok) {
        const errJson = await meRes.json().catch(() => ({}))
        return NextResponse.json({
          success: false,
          message: errJson?.error?.message || 'Meta token validation failed. Check your access token.',
        })
      }
      const meData = await meRes.json()

      // 2. Test Ad Account (if provided)
      let adAccountName = 'N/A'
      let currency = 'USD'
      if (adAccountId) {
        const cleanAdId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
        const adRes = await fetch(`${FB_GRAPH_URL}/${cleanAdId}?access_token=${token}&fields=id,name,account_status,currency`)
        if (adRes.ok) {
          const adData = await adRes.json()
          adAccountName = adData.name || cleanAdId
          currency = adData.currency || 'USD'
        }
      }

      // 3. Test Facebook Page (if provided)
      let pageName = 'N/A'
      if (pageId) {
        const pageRes = await fetch(`${FB_GRAPH_URL}/${pageId}?access_token=${token}&fields=id,name`)
        if (pageRes.ok) {
          const pageData = await pageRes.json()
          pageName = pageData.name || pageId
        }
      }

      return NextResponse.json({
        success: true,
        message: `Connected to Meta as "${meData.name}" (ID: ${meData.id})`,
        details: {
          user_id: meData.id,
          user_name: meData.name,
          page_name: pageName,
          ad_account_name: adAccountName,
          currency,
        },
      })
    }

    // Save settings
    if (body.settings) {
      memoryMetaSettings = { ...memoryMetaSettings, ...body.settings }
    }

    return NextResponse.json({
      success: true,
      settings: memoryMetaSettings,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update Meta settings' },
      { status: 500 }
    )
  }
}
