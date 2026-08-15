import { NextRequest, NextResponse } from 'next/server'

const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const adAccountId = searchParams.get('ad_account_id') || process.env.FB_AD_ACCOUNT_ID
    const token = searchParams.get('token') || process.env.FACEBOOK_ACCESS_TOKEN

    // Default presets for fast 1-click selection
    const defaultCampaigns = [
      { id: 'camp_produce_evergreen', name: '[CasaGrown] Hyperlocal Produce Demand (Continuous)' },
      { id: 'camp_games_daily', name: '[CasaGrown] Daily Games & Brain Puzzles (Engagement)' },
      { id: 'camp_seasonal_harvest', name: '[CasaGrown] Seasonal Fruit & Citrus Harvest (Local)' },
    ]

    const defaultAdSets = [
      {
        id: 'adset_gardening_local',
        name: 'AdSet_Seller_Lemons_94025_94024_Age25-65_10mi',
        campaign_id: 'camp_produce_evergreen',
        audience_intent: 'seller' as const,
        items: ['lemons'],
        targeting: {
          zips: ['94025', '94024'],
          age_min: 25,
          age_max: '65+',
          gender: 'all',
          interests: ['Gardening', 'Organic Food', 'Farmers Market'],
        },
        budget_daily_usd: 15,
      },
      {
        id: 'adset_wordle_puzzles',
        name: 'AdSet_Game_garden_spell_Age18-65',
        campaign_id: 'camp_games_daily',
        audience_intent: 'game' as const,
        items: ['garden_spell'],
        targeting: {
          zips: [],
          age_min: 18,
          age_max: '65+',
          gender: 'all',
          interests: ['Wordle', 'Puzzles', 'Brain Games'],
        },
        budget_daily_usd: 10,
      },
      {
        id: 'adset_organic_foodies',
        name: 'AdSet_Buyer_Avocados_94301_Age25-65_10mi',
        campaign_id: 'camp_seasonal_harvest',
        audience_intent: 'buyer' as const,
        items: ['avocados'],
        targeting: {
          zips: ['94301'],
          age_min: 25,
          age_max: '65+',
          gender: 'all',
          interests: ['Organic Farming', 'Fruit Trees', 'Home Cooking'],
        },
        budget_daily_usd: 20,
      },
    ]

    if (token && adAccountId) {
      try {
        const cleanAdId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
        const campRes = await fetch(`${FB_GRAPH_URL}/${cleanAdId}/campaigns?access_token=${token}&fields=id,name,status&limit=20`)
        if (campRes.ok) {
          const campData = await campRes.json()
          if (campData.data && campData.data.length > 0) {
            return NextResponse.json({
              success: true,
              campaigns: campData.data,
              adsets: defaultAdSets,
            })
          }
        }
      } catch {
        // Fallback to default presets
      }
    }

    return NextResponse.json({
      success: true,
      campaigns: defaultCampaigns,
      adsets: defaultAdSets,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { campaign, settings } = body

    const token = settings?.fb_access_token || process.env.FACEBOOK_ACCESS_TOKEN
    const adAccountId = settings?.fb_ad_account_id || process.env.FB_AD_ACCOUNT_ID
    const pageId = settings?.fb_page_id || process.env.FB_PAGE_ID
    const isSandbox = settings?.environment === 'sandbox' || !token || !adAccountId

    // In Sandbox Mode or when live tokens aren't configured yet, return simulated Meta Ads API creation
    if (isSandbox || !token || !adAccountId) {
      const simulatedCampaignId = `camp_${Date.now()}`
      const simulatedAdSetId = `adset_${Date.now() + 1}`
      const simulatedCreativeId = `creat_${Date.now() + 2}`
      const simulatedAdId = `ad_${Date.now() + 3}`

      return NextResponse.json({
        success: true,
        mode: 'sandbox',
        message: 'Meta Ad Campaign, Ad Set, and Creative created successfully in Sandbox Mode ($0 spent).',
        meta_objects: {
          campaign: {
            id: campaign.existing_campaign_id || simulatedCampaignId,
            name: campaign.campaign_name || campaign.title,
            objective: settings?.default_campaign_objective || 'OUTCOME_TRAFFIC',
            status: campaign.schedule?.status === 'active' || campaign.status === 'active' ? 'ACTIVE' : 'PAUSED',
          },
          ad_set: {
            id: campaign.existing_ad_set_id || simulatedAdSetId,
            name: campaign.ad_set_name || `AdSet_${campaign.produce_names?.join('_') || 'Produce'}_${campaign.target_zips?.slice(0, 2).join('_') || 'AllZips'}`,
            daily_budget_cents: (campaign.budget?.amount_usd || 15) * 100,
            targeting: {
              geo_locations: {
                zips: campaign.target_zips?.map((z: string) => ({ key: z })),
              },
              age_min: campaign.demographics?.age_min || 25,
              age_max: campaign.demographics?.age_max === '65+' ? 65 : Number(campaign.demographics?.age_max || 65),
              interests: campaign.demographics?.interests || [],
              narrow_interests: campaign.demographics?.narrow_interests || [],
            },
          },
          ad_creative: {
            id: simulatedCreativeId,
            headline: campaign.headline,
            primary_text: campaign.primary_text,
            call_to_action: campaign.call_to_action,
            link_url: campaign.destination_url,
          },
          ad: {
            id: simulatedAdId,
            name: `Ad_${campaign.produce_names?.join('_') || 'Creative'}_V1`,
            status: campaign.schedule?.status === 'active' || campaign.status === 'active' ? 'ACTIVE' : 'PAUSED',
          },
        },
      })
    }

    // Live Meta Marketing API Call
    const cleanAdId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`

    // 1. Create or Use Live Campaign
    let liveCampaignId = campaign.existing_campaign_id
    if (!liveCampaignId) {
      const campPayload = {
        name: campaign.campaign_name || campaign.title,
        objective: settings?.default_campaign_objective || 'OUTCOME_TRAFFIC',
        special_ad_categories: ['NONE'],
        status: campaign.status === 'active' ? 'ACTIVE' : 'PAUSED',
      }

      const campRes = await fetch(`${FB_GRAPH_URL}/${cleanAdId}/campaigns?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campPayload),
      })
      const campData = await campRes.json()

      if (!campRes.ok) {
        throw new Error(`Meta Campaign creation failed: ${campData?.error?.message || JSON.stringify(campData)}`)
      }

      liveCampaignId = campData.id
    }

    // 2. Create or Use Live Ad Set
    let liveAdSetId = campaign.existing_ad_set_id
    if (!liveAdSetId) {
      // Build Flexible Spec for Interest & Narrow Targeting
      const flexibleSpec: Array<{ interests: Array<{ name: string }> }> = []
      if (campaign.demographics?.interests && campaign.demographics.interests.length > 0) {
        flexibleSpec.push({
          interests: campaign.demographics.interests.map((name: string) => ({ name })),
        })
      }
      if (campaign.demographics?.narrow_interests && campaign.demographics.narrow_interests.length > 0) {
        flexibleSpec.push({
          interests: campaign.demographics.narrow_interests.map((name: string) => ({ name })),
        })
      }

      const adSetPayload = {
        name: campaign.ad_set_name || `AdSet_${campaign.produce_names?.join('_') || 'Harvest'}_${Date.now()}`,
        campaign_id: liveCampaignId,
        daily_budget: ((campaign.budget?.amount_usd || 15) * 100).toString(),
        billing_event: 'IMPRESSIONS',
        optimization_goal: settings?.default_optimization_goal || 'LINK_CLICKS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: {
          geo_locations: {
            zips: campaign.target_zips?.map((z: string) => ({ key: z })),
          },
          age_min: campaign.demographics?.age_min || 25,
          age_max: campaign.demographics?.age_max === '65+' ? 65 : Number(campaign.demographics?.age_max || 65),
          ...(flexibleSpec.length > 0 ? { flexible_spec: flexibleSpec } : {}),
        },
        status: campaign.status === 'active' ? 'ACTIVE' : 'PAUSED',
      }

      const adSetRes = await fetch(`${FB_GRAPH_URL}/${cleanAdId}/adsets?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adSetPayload),
      })
      const adSetData = await adSetRes.json()

      if (!adSetRes.ok) {
        throw new Error(`Meta AdSet creation failed: ${adSetData?.error?.message || JSON.stringify(adSetData)}`)
      }

      liveAdSetId = adSetData.id
    }

    const ctaEnum = (() => {
      const c = (campaign.call_to_action || '').toLowerCase()
      if (c.includes('shop') || c.includes('buy') || c.includes('order')) return 'SHOP_NOW'
      if (c.includes('sign up') || c.includes('join') || c.includes('list')) return 'SIGN_UP'
      if (c.includes('play') || c.includes('game')) return 'PLAY_GAME'
      if (c.includes('offer') || c.includes('claim')) return 'GET_OFFER'
      if (c.includes('contact') || c.includes('message')) return 'CONTACT_US'
      return 'LEARN_MORE'
    })()

    // 3. Create Live Ad Creative
    const creativePayload = {
      name: `Creative_${campaign.produce_names?.join('_') || 'Harvest'}_${Date.now()}`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          message: campaign.primary_text,
          name: campaign.headline,
          link: campaign.destination_url,
          call_to_action: {
            type: ctaEnum,
            value: {
              link: campaign.destination_url,
            },
          },
        },
      },
    }

    const creativeRes = await fetch(`${FB_GRAPH_URL}/${cleanAdId}/adcreatives?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creativePayload),
    })
    const creativeData = await creativeRes.json()

    if (!creativeRes.ok) {
      throw new Error(`Meta AdCreative creation failed: ${creativeData?.error?.message || JSON.stringify(creativeData)}`)
    }

    const liveCreativeId = creativeData.id

    // 4. Create Live Ad
    const adPayload = {
      name: `Ad_${campaign.produce_names?.join('_') || 'Harvest'}_${Date.now()}`,
      adset_id: liveAdSetId,
      creative: { creative_id: liveCreativeId },
      status: campaign.status === 'active' ? 'ACTIVE' : 'PAUSED',
    }

    const adRes = await fetch(`${FB_GRAPH_URL}/${cleanAdId}/ads?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adPayload),
    })
    const adData = await adRes.json()

    if (!adRes.ok) {
      throw new Error(`Meta Ad creation failed: ${adData?.error?.message || JSON.stringify(adData)}`)
    }

    return NextResponse.json({
      success: true,
      mode: 'production',
      message: 'Live Meta Campaign, Ad Set, Creative, and Ad successfully launched on Facebook & Instagram!',
      meta_objects: {
        campaign_id: liveCampaignId,
        ad_set_id: liveAdSetId,
        ad_creative_id: liveCreativeId,
        ad_id: adData.id,
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to create Meta ad' },
      { status: 500 }
    )
  }
}
