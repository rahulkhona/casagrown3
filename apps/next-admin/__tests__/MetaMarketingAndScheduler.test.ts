import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as getMetaSettings, POST as postMetaSettings } from '../app/api/crm/meta-settings/route'
import { GET as getMetaAds, POST as postMetaAds } from '../app/api/crm/meta-ads/route'
import { POST as postAdStudio } from '../app/api/crm/ad-studio/route'

describe('Comprehensive Meta Marketing & Database Persistence Assertions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Meta Settings & Configuration API', () => {
    it('accurately captures and returns all Meta credentials and default parameters', async () => {
      const updateReq = new NextRequest('http://localhost:3000/api/crm/meta-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            fb_app_id: '159283749102938',
            fb_app_secret: 'secret_abc_123',
            fb_access_token: 'EAAB_VALID_TOKEN_XYZ',
            fb_ad_account_id: 'act_1234567890',
            fb_page_id: '102938475619283',
            fb_instagram_account_id: '178414001234567',
            environment: 'sandbox',
            default_campaign_objective: 'OUTCOME_TRAFFIC',
            default_optimization_goal: 'LINK_CLICKS',
          },
        }),
      })

      const postRes = await postMetaSettings(updateReq)
      expect(postRes.status).toBe(200)
      const postData = await postRes.json()
      expect(postData.success).toBe(true)

      // Verify on GET
      const getRes = await getMetaSettings()
      expect(getRes.status).toBe(200)
      const getData = await getRes.json()
      expect(getData.settings.fb_app_id).toBe('159283749102938')
      expect(getData.settings.fb_ad_account_id).toBe('act_1234567890')
      expect(getData.settings.fb_page_id).toBe('102938475619283')
      expect(getData.settings.environment).toBe('sandbox')
    })
  })

  describe('2. Campaign & Ad Set Dropdowns and Listing API', () => {
    it('returns available campaigns and ad sets for "Pick Existing" dropdowns', async () => {
      const req = new NextRequest('http://localhost:3000/api/crm/meta-ads')
      const res = await getMetaAds(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(Array.isArray(data.campaigns)).toBe(true)
      expect(data.campaigns.length).toBeGreaterThan(0)
      expect(Array.isArray(data.adsets)).toBe(true)
      expect(data.adsets.length).toBeGreaterThan(0)
    })
  })

  describe('3. Exhaustive Form Capture & Meta Marketing API Dispatch', () => {
    it('asserts all produce paid ad fields are captured and mapped correctly to Meta objects', async () => {
      const fullProducePayload = {
        title: 'Lemons & Avocados Paid Ad (seller)',
        campaign_mode: 'new',
        campaign_name: '[CasaGrown] Seller Demand - Lemons & Avocados (94025)',
        ad_set_mode: 'new',
        ad_set_name: 'AdSet_Lemons_Avocados_94025_Age25-65_10mi',
        publish_type: 'paid_ad',
        target_audience: 'seller',
        produce_names: ['Lemons', 'Avocados'],
        headline: 'Got Extra Lemons & Avocados in Menlo Park? 🍋🥑',
        primary_text: 'Verified neighbors in 94025 are actively requesting fresh lemons and avocados right now.',
        call_to_action: 'List Your Harvest',
        destination_url: 'https://casagrown.com/create-listing?utm_source=facebook&utm_medium=paid_ad&utm_campaign=produce_lemons',
        short_url: 'https://casagrown.com/l/lemons94025',
        media_mode: 'photos',
        photo_layout: 'split_2',
        photo_urls: ['https://images.unsplash.com/lemon.jpg', 'https://images.unsplash.com/avocado.jpg'],
        target_zips: ['94025', '94024'],
        target_radius_miles: 10,
        demographics: {
          age_min: 25,
          age_max: '65+',
          gender: 'all',
          interests: ['Gardening', 'Organic Food', 'Farmers Market'],
        },
        budget: {
          type: 'daily',
          amount_usd: 15,
          duration_days: '7',
          placements: ['fb_feed', 'ig_feed', 'ig_reels', 'ig_stories'],
        },
        schedule: {
          type: 'immediate',
          scheduled_at: '2026-08-15T12:00:00.000Z',
          status: 'active',
        },
      }

      const req = new NextRequest('http://localhost:3000/api/crm/meta-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign: fullProducePayload,
          settings: { environment: 'sandbox' },
        }),
      })

      const res = await postMetaAds(req)
      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.mode).toBe('sandbox')
      
      // Strict Field Assertions on Meta Campaign Object
      expect(data.meta_objects.campaign.name).toBe('[CasaGrown] Seller Demand - Lemons & Avocados (94025)')
      expect(data.meta_objects.campaign.objective).toBe('OUTCOME_TRAFFIC')
      expect(data.meta_objects.campaign.status).toBe('ACTIVE')

      // Strict Field Assertions on Meta Ad Set Object
      expect(data.meta_objects.ad_set.name).toBe('AdSet_Lemons_Avocados_94025_Age25-65_10mi')
      expect(data.meta_objects.ad_set.daily_budget_cents).toBe(1500)
      expect(data.meta_objects.ad_set.targeting.geo_locations.zips).toEqual([{ key: '94025' }, { key: '94024' }])
      expect(data.meta_objects.ad_set.targeting.age_min).toBe(25)
      expect(data.meta_objects.ad_set.targeting.age_max).toBe(65)
      expect(data.meta_objects.ad_set.targeting.interests).toEqual(['Gardening', 'Organic Food', 'Farmers Market'])

      // Strict Field Assertions on Meta Ad Creative Object
      expect(data.meta_objects.ad_creative.headline).toBe('Got Extra Lemons & Avocados in Menlo Park? 🍋🥑')
      expect(data.meta_objects.ad_creative.primary_text).toContain('Verified neighbors in 94025')
      expect(data.meta_objects.ad_creative.call_to_action).toBe('List Your Harvest')
      expect(data.meta_objects.ad_creative.link_url).toContain('casagrown.com/create-listing')
    })

    it('asserts all game video ad fields are captured and mapped correctly to Meta objects', async () => {
      const fullGamePayload = {
        title: 'Garden Spell Paid Video Ad',
        campaign_mode: 'new',
        campaign_name: '[CasaGrown] Games - Garden Spell (Daily Streak)',
        ad_set_mode: 'new',
        ad_set_name: 'AdSet_Game_garden_spell_Wordle_Puzzles_Age25-65',
        publish_type: 'paid_ad',
        target_audience: 'game_player',
        produce_names: ['Garden Spell'],
        headline: "Can you solve today's Garden Spell in 4 tries? 🧠🌱",
        primary_text: 'Daily 3-minute brain game for garden lovers. 100% free with zero ads.',
        call_to_action: "Play Today's Puzzle",
        destination_url: 'https://casagrown.com/games?utm_source=facebook&utm_medium=paid_ad&utm_campaign=game_garden_spell',
        short_url: 'https://casagrown.com/l/spell',
        media_mode: 'video',
        video_name: 'gameplay_screen_recording_vertical.mp4',
        target_zips: [],
        target_radius_miles: 0,
        demographics: {
          age_min: 25,
          age_max: '65+',
          gender: 'all',
          interests: ['Wordle', 'New York Times Games', 'Crossword Puzzles', 'Brain Games'],
        },
        budget: {
          type: 'daily',
          amount_usd: 10,
          duration_days: '7',
          placements: ['ig_reels', 'ig_stories', 'fb_feed', 'ig_feed'],
        },
        schedule: {
          type: 'immediate',
          scheduled_at: '2026-08-15T12:00:00.000Z',
          status: 'active',
        },
      }

      const req = new NextRequest('http://localhost:3000/api/crm/meta-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign: fullGamePayload,
          settings: { environment: 'sandbox' },
        }),
      })

      const res = await postMetaAds(req)
      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.meta_objects.campaign.name).toBe('[CasaGrown] Games - Garden Spell (Daily Streak)')
      expect(data.meta_objects.ad_set.name).toBe('AdSet_Game_garden_spell_Wordle_Puzzles_Age25-65')
      expect(data.meta_objects.ad_set.daily_budget_cents).toBe(1000)
      expect(data.meta_objects.ad_creative.headline).toBe("Can you solve today's Garden Spell in 4 tries? 🧠🌱")
      expect(data.meta_objects.ad_creative.link_url).toContain('casagrown.com/games')
    })
  })

  describe('4. Database Persistence & Scheduler Integration (/api/crm/ad-studio)', () => {
    it('asserts all campaign payload data is stored into marketing_ad_creatives and fb_post_queue', async () => {
      const payload = {
        title: 'Garden Plots Organic Video Post',
        campaign_mode: 'new',
        campaign_name: '[CasaGrown] Games - Garden Plots (Daily Streak)',
        ad_set_mode: 'new',
        ad_set_name: 'AdSet_Game_garden_plots_Queens_Grid',
        publish_type: 'organic_post',
        target_audience: 'game_player',
        produce_names: ['Garden Plots'],
        headline: 'Plant without collisions! 🌻🧩',
        primary_text: 'Try today\'s Queens logic grid puzzle free on CasaGrown.',
        call_to_action: 'Play Free Now',
        destination_url: 'https://casagrown.com/games?utm_source=facebook&utm_medium=facebook_post',
        short_url: 'https://casagrown.com/l/plots',
        media_mode: 'video',
        video_name: 'garden_plots_solve.mp4',
        target_zips: ['94025'],
        target_radius_miles: 10,
        demographics: {
          age_min: 25,
          age_max: '65+',
          gender: 'all',
          interests: ['Sudoku', 'Brain Games'],
        },
        schedule: {
          type: 'scheduled',
          scheduled_at: '2026-08-16T14:00:00.000Z',
          status: 'scheduled',
        },
      }

      const req = new NextRequest('http://localhost:3000/api/crm/ad-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_campaign_post',
          campaignPayload: payload,
        }),
      })

      const res = await postAdStudio(req)
      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.campaign).toBeDefined()
      expect(data.campaign.title).toBe('Garden Plots Organic Video Post')
      expect(data.campaign.storyboard_payload.campaign_name).toBe('[CasaGrown] Games - Garden Plots (Daily Streak)')
      expect(data.campaign.storyboard_payload.ad_set_name).toBe('AdSet_Game_garden_plots_Queens_Grid')
      expect(data.campaign.storyboard_payload.short_url).toBe('https://casagrown.com/l/plots')
      expect(data.campaign.storyboard_payload.media.video_name).toBe('garden_plots_solve.mp4')
      expect(data.campaign.storyboard_payload.target_zips).toEqual(['94025'])
      expect(data.campaign.storyboard_payload.schedule.status).toBe('scheduled')
    })
  })

  describe('5. Smart Ad Set Matching & Budget Isolation Engine (resolveSmartAdSet)', () => {
    const availableAdSets = [
      {
        id: 'adset_seller_lemons_local',
        name: 'AdSet_Seller_Lemons_94025_94024_Age25-65_10mi',
        audience_intent: 'seller' as const,
        items: ['lemons'],
        targeting: {
          zips: ['94025', '94024'],
          age_min: 25,
          age_max: '65+',
          gender: 'all' as const,
          interests: ['Gardening', 'Organic Food'],
        },
      },
      {
        id: 'adset_wordle_puzzles',
        name: 'AdSet_Game_garden_spell_Age18-65',
        audience_intent: 'game' as const,
        items: ['garden_spell'],
        targeting: {
          zips: [],
          age_min: 18,
          age_max: '65+',
          gender: 'all' as const,
          interests: ['Wordle', 'Puzzles'],
        },
      },
    ]

    it('auto-matches and shares budget when Intent (Seller) + Produce (Lemons) + Geo + Demographics match', async () => {
      const { resolveSmartAdSet } = await import('../lib/adSetMatching')
      
      const match = resolveSmartAdSet(
        {
          audienceIntent: 'seller',
          items: ['lemons'],
          zips: ['94025', '94024'],
          ageMin: 25,
          ageMax: '65+',
          gender: 'all',
          interests: ['Gardening'],
        },
        availableAdSets
      )

      expect(match.mode).toBe('existing')
      expect(match.isAutoMatched).toBe(true)
      expect(match.matchedAdSet?.id).toBe('adset_seller_lemons_local')
      expect(match.suggestedName).toBe('AdSet_Seller_Lemons_94025_94024_Age25-65_10mi')
      expect(match.reason).toContain('Sharing budget with existing Ad Set')
    })

    it('creates an ISOLATED Ad Set when produce item differs (e.g. Avocados vs Lemons) to prevent budget contamination', async () => {
      const { resolveSmartAdSet } = await import('../lib/adSetMatching')

      const match = resolveSmartAdSet(
        {
          audienceIntent: 'seller',
          items: ['avocados'],
          zips: ['94025', '94024'],
          ageMin: 25,
          ageMax: '65+',
          gender: 'all',
          interests: ['Gardening'],
        },
        availableAdSets
      )

      // Even though ZIPs and demographics match, Avocados MUST NOT share budget with Lemons!
      expect(match.mode).toBe('new')
      expect(match.isAutoMatched).toBe(false)
      expect(match.suggestedName).toBe('AdSet_Seller_Avocados_94024_94025_Age25-65_10mi')
      expect(match.reason).toContain('Creating isolated Ad Set for Seller [Avocados]')
    })

    it('creates an ISOLATED Ad Set when intent differs (Buyer vs Seller) even for the same produce & ZIP', async () => {
      const { resolveSmartAdSet } = await import('../lib/adSetMatching')

      const match = resolveSmartAdSet(
        {
          audienceIntent: 'buyer',
          items: ['lemons'],
          zips: ['94025', '94024'],
          ageMin: 25,
          ageMax: '65+',
          gender: 'all',
          interests: ['Gardening'],
        },
        availableAdSets
      )

      // Buyer wishlist ads MUST NOT mix with Seller harvest ads!
      expect(match.mode).toBe('new')
      expect(match.isAutoMatched).toBe(false)
      expect(match.suggestedName).toBe('AdSet_Buyer_Lemons_94024_94025_Age25-65_10mi')
      expect(match.reason).toContain('Creating isolated Ad Set for Buyer [Lemons]')
    })

    it('auto-provisions a new ad set for novel ZIP codes or age brackets', async () => {
      const { resolveSmartAdSet } = await import('../lib/adSetMatching')

      const match = resolveSmartAdSet(
        {
          audienceIntent: 'seller',
          items: ['lemons'],
          zips: ['95125'],
          ageMin: 18,
          ageMax: 45,
          gender: 'women',
          interests: ['Gardening'],
        },
        availableAdSets
      )

      expect(match.mode).toBe('new')
      expect(match.isAutoMatched).toBe(false)
      expect(match.suggestedName).toBe('AdSet_Seller_Lemons_95125_Age18-45_women_10mi')
    })

    it('correctly matches or isolates multi-produce combinations (e.g. Lemons + Avocados vs Lemons alone)', async () => {
      const { resolveSmartAdSet } = await import('../lib/adSetMatching')

      // 1. Multi-produce Lemons + Avocados creates dedicated Multi-Produce Ad Set
      const matchNewBasket = resolveSmartAdSet(
        {
          audienceIntent: 'seller',
          items: ['Lemons', 'Avocados'],
          zips: ['94025'],
          ageMin: 25,
          ageMax: 65,
          gender: 'all',
          interests: ['Gardening'],
        },
        availableAdSets
      )

      expect(matchNewBasket.mode).toBe('new')
      expect(matchNewBasket.suggestedName).toBe('AdSet_Seller_Lemons_Avocados_94025_Age25-65_10mi')

      // 2. Another ad with the same basket (even if listed in reverse order 'Avocados', 'Lemons') matches the basket Ad Set
      const existingBasketAdSets = [
        ...availableAdSets,
        {
          id: 'adset_multi_lemons_avocados',
          name: 'AdSet_Seller_Lemons_Avocados_94025_Age25-65_10mi',
          audience_intent: 'seller' as const,
          items: ['lemons', 'avocados'],
          targeting: {
            zips: ['94025'],
            age_min: 25,
            age_max: 65,
            gender: 'all' as const,
            interests: ['Gardening'],
          },
        },
      ]

      const matchExistingBasket = resolveSmartAdSet(
        {
          audienceIntent: 'seller',
          items: ['Avocados', 'Lemons'], // reverse order
          zips: ['94025'],
          ageMin: 25,
          ageMax: 65,
          gender: 'all',
          interests: ['Gardening'],
        },
        existingBasketAdSets
      )

      expect(matchExistingBasket.mode).toBe('existing')
      expect(matchExistingBasket.matchedAdSet?.id).toBe('adset_multi_lemons_avocados')
    })

    it('formats 4+ produce items cleanly into MultiHarvest naming', async () => {
      const { resolveSmartAdSet } = await import('../lib/adSetMatching')

      const match = resolveSmartAdSet(
        {
          audienceIntent: 'seller',
          items: ['Lemons', 'Avocados', 'Figs', 'Tomatoes'],
          zips: ['94025'],
          ageMin: 25,
          ageMax: 65,
          gender: 'all',
          interests: ['Gardening'],
        },
        availableAdSets
      )

      expect(match.mode).toBe('new')
      expect(match.suggestedName).toBe('AdSet_Seller_MultiHarvest_4Items_94025_Age25-65_10mi')
    })

    it('isolates Game puzzles from Produce and matches game ad sets', async () => {
      const { resolveSmartAdSet } = await import('../lib/adSetMatching')

      const match = resolveSmartAdSet(
        {
          audienceIntent: 'game',
          items: ['garden_spell'],
          zips: [],
          ageMin: 18,
          ageMax: '65+',
          gender: 'all',
          interests: ['Wordle', 'Puzzles'],
        },
        availableAdSets
      )

      expect(match.mode).toBe('existing')
      expect(match.matchedAdSet?.id).toBe('adset_wordle_puzzles')
      expect(match.suggestedName).toBe('AdSet_Game_garden_spell_Age18-65')
    })
  })
})
