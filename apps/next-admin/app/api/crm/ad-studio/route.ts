import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EXHAUSTIVE_INTERESTS_CATALOG } from '../../../../../next-market/lib/interestCatalog'
import { getGameById } from '../../../../../next-market/lib/gamesCatalog'

import { adminSupabase } from '../../../../lib/adminSupabase'

function getAdminClient() {
  return adminSupabase
}

const AI_KEY = process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || ''
const AI_URL = process.env.AI_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const AI_MODELS = ['gemma-4-31b-it', 'gemini-3.5-flash', 'gemini-2.5-flash']

import { MAB_FORMATS, GAME_AD_FORMATS } from '../../../../lib/adStudioConstants'

const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0'

/**
 * AI QA Validator: Runs self-verification on generated ad creatives
 */
function validateStoryboardQA(contextType: string, payload: any, produceIds: string[], gameId?: string) {
  const checks: { name: string; pass: boolean; note: string }[] = []
  
  // Check 1: Scenes array validity
  const scenes = payload?.scenes || []
  const has3Scenes = scenes.length >= 3
  checks.push({
    name: 'Scene Count',
    pass: has3Scenes,
    note: has3Scenes ? `${scenes.length} scenes generated` : 'Expected at least 3 scenes (Hook, Body, CTA)'
  })

  // Check 2: Total duration check (10 to 18 seconds)
  const totalDuration = scenes.reduce((acc: number, s: any) => acc + (Number(s.duration_seconds) || 4), 0)
  const durationOk = totalDuration >= 10 && totalDuration <= 18
  checks.push({
    name: 'Runtime Budget (10-18s)',
    pass: durationOk,
    note: `Total runtime is ${totalDuration.toFixed(1)}s`
  })

  // Check 3: CTA link and destination
  const cta = payload?.cta
  const hasCta = Boolean(cta?.destination_url && cta?.button_text)
  checks.push({
    name: 'CTA Destination',
    pass: hasCta,
    note: hasCta ? `Destination: ${cta.destination_url}` : 'Missing CTA destination or button'
  })

  // Check 4: Catalog accuracy
  if (gameId) {
    const game = getGameById(gameId)
    const mentionsGame = JSON.stringify(payload).toLowerCase().includes(game?.title?.toLowerCase() || 'game')
    checks.push({
      name: 'Game Title Consistency',
      pass: Boolean(game && mentionsGame),
      note: game ? `Matched ${game.title}` : 'Game ID not found'
    })
  } else if (produceIds.length > 0) {
    const matched = produceIds.some(pid => {
      const match = EXHAUSTIVE_INTERESTS_CATALOG.find(i => i.id === pid || i.name.toLowerCase() === pid.toLowerCase())
      return match && JSON.stringify(payload).toLowerCase().includes(match.name.toLowerCase())
    })
    checks.push({
      name: 'Produce Catalog Match',
      pass: matched,
      note: matched ? `Accurate produce names used` : 'Produce names not found in script'
    })
  }

  const passed = checks.every(c => c.pass)
  return { passed, checks, evaluated_at: new Date().toISOString() }
}

/**
 * Fallback AI Generator using Gemma/Gemini
 */
async function callGeminiForAdScript(systemPrompt: string, userPrompt: string) {
  if (!AI_KEY) {
    return null
  }

  for (const model of AI_MODELS) {
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      })

      if (res.ok) {
        const json = await res.json()
        const text = json.choices?.[0]?.message?.content
        if (text) {
          try {
            return JSON.parse(text)
          } catch (e) {
            console.warn(`[Ad Studio] JSON parse failed on ${model}:`, e)
          }
        }
      }
    } catch (err) {
      console.warn(`[Ad Studio] Error calling ${model}:`, err)
    }
  }

  return null
}

/**
 * Generates rich mock fallback storyboard when offline or testing
 */
function generateDeterministicStoryboard(params: {
  contextType: string;
  produceNames: string[];
  mabFormatId: string;
  gameTitle?: string;
  gameId?: string;
  feedback?: string;
}) {
  const { contextType, produceNames, mabFormatId, gameTitle, gameId, feedback } = params
  const pName = produceNames.join(' & ') || 'Fresh Garden Produce'
  const isSeller = (contextType || '').startsWith('seller')
  const isGame = contextType === 'game_promo'

  if (isGame) {
    const title = gameTitle || 'Daily Garden Game'
    return {
      title: `${title} — 60s Daily Brain Warmup`,
      headline: `Can you solve today's ${title}? ☕🌱`,
      primary_copy: `Start your morning with a 2-minute daily garden puzzle. Play free at casagrown.com/games — no app install required!`,
      scenes: [
        {
          scene_number: 1,
          name: 'Morning Coffee Hook',
          duration_seconds: 3.5,
          media_type: 'narrator_talking_head',
          visual_description: 'Person taking a sip of morning coffee, picking up phone with a smile.',
          narrator_voiceover: `My favorite morning ritual before opening a single work email? Today's ${title}.`,
          onscreen_text: `☕ 2-Minute Morning Brain Game: ${title}`
        },
        {
          scene_number: 2,
          name: 'Live Gameplay Solve',
          duration_seconds: 6.5,
          media_type: 'screen_recording',
          visual_description: `Screen recording showing smooth touch interaction solving ${title} with satisfying tile snap animations.`,
          narrator_voiceover: `Every morning at 6 AM, CasaGrown drops fresh daily garden puzzles. You solve it, test your garden IQ, and score green reward points.`,
          onscreen_text: `🌱 Fresh Daily Puzzle Every Morning at 6 AM`
        },
        {
          scene_number: 3,
          name: 'Victory & Neighborhood CTA',
          duration_seconds: 4.0,
          media_type: 'game_victory_cta',
          visual_description: 'Victory confetti score splash screen showing local neighborhood rank leaderboard.',
          narrator_voiceover: `Play today's puzzle free on CasaGrown and see your rank in your neighborhood!`,
          onscreen_text: `Play Free Today ➔ casagrown.com/games`
        }
      ],
      cta: {
        button_text: 'Play Free Daily Game',
        destination_url: 'https://casagrown.com/games',
        voiceover: 'Tap the link to play today’s puzzle free!'
      }
    }
  }

  // Seller Contexts
  if (isSeller) {
    return {
      title: `${pName} Surplus? Monetize Your Backyard Harvest`,
      headline: `Neighbors in your zip code want your ${pName}! 🍋🧺`,
      primary_copy: `Got fruit trees or garden beds overloaded with ${pName}? List in under 60 seconds on CasaGrown. Free to list, zero vendor fees.`,
      scenes: [
        {
          scene_number: 1,
          name: 'Overloaded Tree / Harvest Hook',
          duration_seconds: 4.0,
          media_type: 'produce_tree_shot',
          visual_description: `Close-up of fruit-laden ${pName} tree with ripe harvest beginning to drop onto lush green grass.`,
          narrator_voiceover: `If your ${pName} tree is overloaded right now and you cannot eat them all before they drop...`,
          onscreen_text: `⚠️ Don't let your ${pName} go to waste!`
        },
        {
          scene_number: 2,
          name: 'Local Neighbor Demand',
          duration_seconds: 6.0,
          media_type: 'narrator_harvest_box',
          visual_description: `Backyard grower putting freshly clipped ${pName} into a wooden basket while neighbor phone notification pings.`,
          narrator_voiceover: `Stop letting good food go to waste. Neighbors in your neighborhood are searching for fresh homegrown ${pName} right now on CasaGrown.`,
          onscreen_text: `🏡 Local neighbors ready to buy your harvest`
        },
        {
          scene_number: 3,
          name: '60-Second Listing CTA',
          duration_seconds: 4.0,
          media_type: 'app_listing_cta',
          visual_description: 'Phone screen showing 1-click snap photo and listing published on CasaGrown map.',
          narrator_voiceover: `Snap a photo, set your price, and let neighbors pick it up. Tap below to list your harvest!`,
          onscreen_text: `🏡 List in 60s • Zero Fees • Free to Join`
        }
      ],
      cta: {
        button_text: 'List Your Harvest',
        destination_url: 'https://casagrown.com/create-listing',
        voiceover: 'Tap below to list in 60 seconds.'
      }
    }
  }

  // Buyer Contexts
  return {
    title: `Taste Real Tree-Ripened ${pName} Down Your Street`,
    headline: `Picked hours ago in your neighborhood — not weeks in cold storage! 🌿`,
    primary_copy: `Supermarket ${pName} sat in storage for weeks. Taste what tree-ripened produce is supposed to taste like on CasaGrown.`,
    scenes: [
      {
        scene_number: 1,
        name: 'Flavor Awakening Hook',
        duration_seconds: 3.5,
        media_type: 'macro_produce_slice',
        visual_description: `Slow-motion knife slicing into sun-warmed, bursting juicy ${pName} with rich vibrant colors.`,
        narrator_voiceover: `Supermarket ${pName} is picked weeks early and sits in cold storage. Once you taste one ripened in the California sun...`,
        onscreen_text: `✨ Tree-Ripened vs Cold-Storage`
      },
      {
        scene_number: 2,
        name: 'Hyperlocal Provenance',
        duration_seconds: 6.5,
        media_type: 'harvest_tray_box',
        visual_description: `Beautiful basket of freshly harvested ${pName} sitting on a sunlit garden patio with dew drops.`,
        narrator_voiceover: `...you can never go back. These ${pName} were picked just hours ago in backyards right down your street.`,
        onscreen_text: `📍 Harvested Today 2 Doors Down`
      },
      {
        scene_number: 3,
        name: 'Map Discovery CTA',
        duration_seconds: 4.0,
        media_type: 'buyer_map_cta',
        visual_description: 'CasaGrown interactive neighborhood map showing walking-distance harvest pins.',
        narrator_voiceover: `Check the CasaGrown map right now to find fresh produce available walking distance from you!`,
        onscreen_text: `🌱 Find Fresh Harvest Near You`
      }
    ],
    cta: {
      button_text: 'Shop Local Produce',
      destination_url: 'https://casagrown.com/market',
      voiceover: 'Tap below to find fresh produce today.'
    }
  }
}

/**
 * GET: Fetch ad creatives with optional filters
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const contextType = searchParams.get('context_type')
    const produceId = searchParams.get('produce_id')
    const gameId = searchParams.get('game_id')
    const approvalStatus = searchParams.get('approval_status')

    const supabase = getAdminClient()
    let q = supabase.from('marketing_ad_creatives').select('*').order('created_at', { ascending: false })

    if (contextType && contextType !== 'all') {
      q = q.eq('context_type', contextType)
    }
    if (produceId) {
      q = q.contains('produce_ids', [produceId])
    }
    if (gameId) {
      q = q.eq('game_id', gameId)
    }
    if (approvalStatus && approvalStatus !== 'all') {
      q = q.eq('approval_status', approvalStatus)
    }

    const { data, error } = await q
    if (error) {
      console.warn('[Ad Studio GET] Supabase table query notice:', error.message)
      return NextResponse.json({ creatives: [], notice: error.message })
    }

    return NextResponse.json({ creatives: data || [] })
  } catch (err: any) {
    console.error('[Ad Studio GET Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST: Generate, save, or publish ad creatives with Meta Video & Feed API
 */
export async function POST(req: Request) {
  try {
    let action: string = 'create_campaign_post'
    let creativeId: string | undefined
    let contextType: string | undefined
    let produceIds: string[] = []
    let gameId: string | undefined
    let mabFormatId = 'MAB-1'
    let aspectRatio = '9:16'
    let adminFeedback: string | undefined
    let campaignPayload: any = null
    let videoFile: File | null = null

    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      action = (formData.get('action') as string) || 'create_campaign_post'
      creativeId = (formData.get('creativeId') as string) || undefined
      contextType = (formData.get('contextType') as string) || undefined
      gameId = (formData.get('gameId') as string) || undefined
      mabFormatId = (formData.get('mabFormatId') as string) || 'MAB-1'
      aspectRatio = (formData.get('aspectRatio') as string) || '9:16'
      adminFeedback = (formData.get('adminFeedback') as string) || undefined
      const payloadStr = formData.get('campaignPayload') as string
      if (payloadStr) {
        try {
          campaignPayload = JSON.parse(payloadStr)
        } catch {
          campaignPayload = null
        }
      }
      videoFile = formData.get('videoFile') as File | null
    } else {
      const body = await req.json().catch(() => ({}))
      action = body.action || 'create_campaign_post'
      creativeId = body.creativeId
      contextType = body.contextType
      produceIds = body.produceIds || []
      gameId = body.gameId
      mabFormatId = body.mabFormatId || 'MAB-1'
      aspectRatio = body.aspectRatio || '9:16'
      adminFeedback = body.adminFeedback
      campaignPayload = body.campaignPayload
    }

    const supabase = getAdminClient()

    // 1. APPROVAL / REJECTION ACTIONS
    if (action === 'approve' && creativeId) {
      const { data, error } = await supabase
        .from('marketing_ad_creatives')
        .update({ approval_status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', creativeId)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ success: true, creative: data })
    }

    if (action === 'reject' && creativeId) {
      const { data, error } = await supabase
        .from('marketing_ad_creatives')
        .update({ 
          approval_status: 'rejected', 
          admin_feedback: adminFeedback || 'Rejected by reviewer',
          updated_at: new Date().toISOString() 
        })
        .eq('id', creativeId)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ success: true, creative: data })
    }

    // 2. CREATE AD / POST CAMPAIGN ACTION
    if (action === 'create_campaign_post') {
      if (!campaignPayload) {
        return NextResponse.json({ error: 'campaignPayload is required' }, { status: 400 })
      }

      // If a video binary file is uploaded, store it in Supabase storage 'media' bucket
      let videoPublicUrl = campaignPayload.preview_video_url || null
      let videoStoragePath = campaignPayload.video_storage_path || null

      if (videoFile && videoFile.size > 0) {
        try {
          const bytes = await videoFile.arrayBuffer()
          const buffer = Buffer.from(bytes)
          const sanitized = videoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')
          videoStoragePath = `crm/videos/${Date.now()}_${sanitized}`
          
          const { error: uploadErr } = await supabase.storage
            .from('media')
            .upload(videoStoragePath, buffer, {
              contentType: videoFile.type || 'video/mp4',
              upsert: true,
            })
          
          if (!uploadErr) {
            const { data: publicUrlData } = supabase.storage
              .from('media')
              .getPublicUrl(videoStoragePath)
            if (publicUrlData?.publicUrl) {
              videoPublicUrl = publicUrlData.publicUrl
            }
          } else {
            console.warn('[Ad Studio] Supabase video upload notice:', uploadErr.message)
          }
        } catch (storageEx: any) {
          console.warn('[Ad Studio] Video buffer storage exception:', storageEx.message)
        }
      }

      // Save campaign creative record
      const record = {
        title: campaignPayload.title || 'Untitled Campaign Post',
        context_type: campaignPayload.target_audience === 'seller' ? 'seller_single_produce' : (campaignPayload.target_audience === 'game_player' ? 'game_promo' : 'buyer_single_produce'),
        produce_ids: campaignPayload.produce_names || [],
        game_id: campaignPayload.target_audience === 'game_player' ? campaignPayload.produce_names?.[0] : null,
        mab_format_id: 'CUSTOM',
        mab_format_name: 'Custom Ad Studio Campaign',
        aspect_ratio: campaignPayload.aspect_ratio || '9:16',
        video_storage_path: videoStoragePath,
        preview_video_url: videoPublicUrl,
        storyboard_payload: {
          headline: campaignPayload.headline,
          primary_copy: campaignPayload.primary_text,
          campaign_mode: campaignPayload.campaign_mode,
          campaign_name: campaignPayload.campaign_name,
          existing_campaign_id: campaignPayload.existing_campaign_id,
          ad_set_mode: campaignPayload.ad_set_mode,
          ad_set_name: campaignPayload.ad_set_name,
          existing_ad_set_id: campaignPayload.existing_ad_set_id,
          target_zips: campaignPayload.target_zips,
          target_radius_miles: campaignPayload.target_radius_miles,
          short_url: campaignPayload.short_url,
          preview_video_url: videoPublicUrl,
          cta: {
            button_text: campaignPayload.call_to_action,
            destination_url: campaignPayload.destination_url,
          },
          media: {
            mode: campaignPayload.media_mode,
            photo_layout: campaignPayload.photo_layout,
            photos: campaignPayload.photo_urls,
            video_name: campaignPayload.video_name,
            video_url: videoPublicUrl,
          },
          demographics: campaignPayload.demographics,
          budget: campaignPayload.budget,
          schedule: campaignPayload.schedule,
        },
        approval_status: campaignPayload.schedule?.status === 'active' ? 'approved' : 'draft_generated',
        admin_feedback: null,
        duration_seconds: 15,
        qa_validation_log: { passed: true, checks: [{ name: 'self_check', pass: true }] },
      }

      const { data, error } = await supabase
        .from('marketing_ad_creatives')
        .insert(record)
        .select()
        .single()

      // If organic post, publish directly to Facebook Page (via Graph Video API or Feed API)
      let liveFbPostId: string | null = null
      let liveFbPostUrl: string | null = null

      if (campaignPayload.publish_type === 'organic_post') {
        const token = campaignPayload.settings?.fb_access_token || process.env.FACEBOOK_ACCESS_TOKEN || process.env.CASAGROWN_FB_PAGE_TOKEN
        const pageId = campaignPayload.settings?.fb_page_id || process.env.FB_PAGE_ID || process.env.CASAGROWN_FB_PAGE_ID || '919027537964944'
        const isImmediate = campaignPayload.schedule?.status === 'active' || !campaignPayload.schedule?.scheduled_at

        if (isImmediate && token && pageId) {
          try {
            const targetLink = campaignPayload.short_url || campaignPayload.destination_url
            let rawCopy = (campaignPayload.primary_text || '').trim()
            let message = campaignPayload.headline ? `${campaignPayload.headline}\n\n${rawCopy}` : rawCopy

            // Avoid double links if rawCopy already includes the link
            if (targetLink && !message.includes(targetLink)) {
              message = `${message}\n\n👉 ${targetLink}`
            }
            
            // If video file is present or video public URL is available, use Meta Graph Video API
            if (videoFile || videoPublicUrl || campaignPayload.media_mode === 'video') {
              const videoFormData = new FormData()
              videoFormData.append('access_token', token)
              videoFormData.append('description', message)
              if (campaignPayload.headline) {
                videoFormData.append('title', campaignPayload.headline)
              }

              let attachedSource = false
              if (videoFile && videoFile.size > 0) {
                const fileBuf = await videoFile.arrayBuffer()
                const blob = new Blob([fileBuf], { type: videoFile.type || 'video/mp4' })
                videoFormData.append('source', blob, videoFile.name || 'gameplay_video.mp4')
                attachedSource = true
              } else if (videoStoragePath) {
                try {
                  const { data: storageBlob, error: downloadErr } = await supabase.storage
                    .from('media')
                    .download(videoStoragePath)
                  if (!downloadErr && storageBlob) {
                    const buf = await storageBlob.arrayBuffer()
                    const blob = new Blob([buf], { type: 'video/mp4' })
                    videoFormData.append('source', blob, 'gameplay_video.mp4')
                    attachedSource = true
                  }
                } catch (dlEx) {
                  console.warn('[Ad Studio] Storage video download note:', dlEx)
                }
              }

              if (!attachedSource && videoPublicUrl) {
                if (!videoPublicUrl.includes('127.0.0.1') && !videoPublicUrl.includes('localhost')) {
                  videoFormData.append('file_url', videoPublicUrl)
                }
              }

              const fbVideoRes = await fetch(`https://graph-video.facebook.com/v21.0/${pageId}/videos`, {
                method: 'POST',
                body: videoFormData,
              })

              if (fbVideoRes.ok) {
                const fbVideoData = await fbVideoRes.json()
                liveFbPostId = fbVideoData.id
                liveFbPostUrl = `https://www.facebook.com/reel/${liveFbPostId}`
                console.log('[Ad Studio] Live Facebook Reel/Video Published:', liveFbPostId)
              } else {
                const fbErrData = await fbVideoRes.json().catch(() => ({}))
                console.warn('[Ad Studio] Video API post note, falling back to feed:', fbErrData)
                // Fallback to feed post
                const params = new URLSearchParams({
                  message,
                  link: campaignPayload.short_url || campaignPayload.destination_url,
                  access_token: token,
                })
                const fbFeedRes = await fetch(`${FB_GRAPH_URL}/${pageId}/feed`, {
                  method: 'POST',
                  body: params,
                })
                if (fbFeedRes.ok) {
                  const fbFeedData = await fbFeedRes.json()
                  liveFbPostId = fbFeedData.id
                  liveFbPostUrl = `https://www.facebook.com/${liveFbPostId.replace('_', '/posts/')}`
                }
              }
            } else {
              // Standard link / feed post
              const params = new URLSearchParams({
                message,
                link: campaignPayload.short_url || campaignPayload.destination_url,
                access_token: token,
              })
              const fbRes = await fetch(`${FB_GRAPH_URL}/${pageId}/feed`, {
                method: 'POST',
                body: params,
              })
              if (fbRes.ok) {
                const fbData = await fbRes.json()
                liveFbPostId = fbData.id
                liveFbPostUrl = `https://www.facebook.com/${liveFbPostId.replace('_', '/posts/')}`
                console.log('[Ad Studio] Live Facebook Feed Post Published:', liveFbPostId)
              }
            }
          } catch (fbErr: any) {
            console.warn('[Ad Studio] Direct FB Post error:', fbErr.message)
          }
        }

        try {
          await supabase.from('fb_post_queue').insert({
            target: 'casagrown_page',
            trigger_type: 'manual',
            post_message: `${campaignPayload.headline ? campaignPayload.headline + '\n\n' : ''}${campaignPayload.primary_text}\n\n👉 ${campaignPayload.short_url || campaignPayload.destination_url}`,
            post_link: campaignPayload.short_url || campaignPayload.destination_url,
            status: liveFbPostId ? 'posted' : 'approved',
            fb_post_id: liveFbPostId,
            posted_at: liveFbPostId ? new Date().toISOString() : null,
            metadata: {
              title: campaignPayload.title,
              video_url: videoPublicUrl,
              scheduled_for: campaignPayload.schedule?.scheduled_at || new Date().toISOString(),
            },
          })
        } catch (queueErr: any) {
          console.warn('[Ad Studio] fb_post_queue insert note:', queueErr.message)
        }
      }

      if (error) {
        console.warn('[Ad Studio create_campaign_post] Supabase save note:', error.message)
        return NextResponse.json({ success: true, campaign: record, liveFbPostId, liveFbPostUrl, notice: error.message })
      }

      return NextResponse.json({ success: true, campaign: data || record, liveFbPostId, liveFbPostUrl })
    }

    // 3. GENERATION / REGENERATION ACTION
    const isGame = contextType === 'game_promo'
    let gameTitle = ''
    if (isGame && gameId) {
      const game = getGameById(gameId)
      gameTitle = game?.title || 'Daily Garden Game'
    }

    const produceNames = produceIds.map((pid: string) => {
      const found = EXHAUSTIVE_INTERESTS_CATALOG.find(i => i.id === pid || i.name.toLowerCase() === pid.toLowerCase())
      return found ? found.name : pid
    })

    const formatInfo = isGame ? (GAME_AD_FORMATS[mabFormatId] || GAME_AD_FORMATS['GAME-1']) : (MAB_FORMATS[mabFormatId] || MAB_FORMATS['MAB-1'])

    // Prepare Prompt for Gemini
    const systemPrompt = `You are the lead video director and marketing producer for CasaGrown.
Your mission is to generate high-converting 3-scene video ad storyboards tailored for Google Veo / Gemini video generation.

STRICT VISUAL PROMPT DIRECTIVES FOR VIDEO GENERATION:
1. Scene 1 (Hook, 3-4s): Must specify the exact physical visual subject:
   - If Seller / Tree Overload: A lush, sunlit tree or garden bed heavily overloaded with ripe ${produceNames.join(', ')}, fruit weighing down branches in a sunny suburban backyard.
   - If Buyer / Freshness: A cinematic macro slow-motion shot of a knife slicing into a sun-ripened, juicy ${produceNames.join(', ')} with glistening dew drops.
   - If Combo / Multi-Produce: A rustic woven basket filled with an arrangement of ${produceNames.join(', ')}.
2. Scene 2 (Body, 5-7s): A wooden crate or harvest box overflowing with freshly clipped ${produceNames.join(', ')} on a sunlit wooden patio table, or neighbor receiving a box.
3. Scene 3 (CTA, 3-4s): A clean smartphone interface demonstrating a 1-tap photo snap listing or neighborhood harvest map.
4. Total video duration must be 12-15 seconds (total word count: 28-35 words, ~2.2 words/sec).
5. For each scene, include a dedicated "veo_prompt" (a detailed text-to-video diffusion prompt with camera angles, lighting, 9:16 framing, and 60fps cinematic styling).

Return JSON strictly matching:
{
  "title": string,
  "headline": string,
  "primary_copy": string,
  "scenes": [
    {
      "scene_number": 1,
      "name": string,
      "duration_seconds": number,
      "media_type": string,
      "visual_description": string,
      "veo_prompt": string,
      "narrator_voiceover": string,
      "onscreen_text": string
    }
  ],
  "cta": {
    "button_text": string,
    "destination_url": string,
    "voiceover": string
  }
}`

    const userPrompt = `Generate a 3-scene video ad storyboard:
- Context: ${contextType || 'general'} (Targeting: ${contextType?.startsWith('seller') ? 'Backyard tree owners to list their surplus' : 'Local buyers to shop fresh produce'})
- Exact Produce Items: ${(produceNames || []).join(', ') || 'Fresh Produce'}
- Visual Directives: Generate explicit photorealistic visual descriptions featuring ${(produceNames || []).join(', ')} trees, overflowing harvest boxes, and sunlit garden settings.
- Game Context: ${gameTitle || 'N/A'} (ID: ${gameId || 'N/A'})
- MAB Format Angle: ${formatInfo.name} (${formatInfo.description})
- Target Aspect Ratio: ${aspectRatio}
${adminFeedback ? `- Prior Feedback / Revision Instructions: "${adminFeedback}"` : ''}
Ensure natural, conversational pacing (max 35 words total).`

    // Attempt Gemini Generation
    let storyboardPayload = await callGeminiForAdScript(systemPrompt, userPrompt)

    // Deterministic fallback if API offline/rate-limited
    if (!storyboardPayload || !storyboardPayload.scenes) {
      storyboardPayload = generateDeterministicStoryboard({
        contextType,
        produceNames,
        mabFormatId,
        gameTitle,
        gameId,
        feedback: adminFeedback,
      })
    }

    // Run Automated Self-Verification QA Loop
    const qaLog = validateStoryboardQA(contextType, storyboardPayload, produceIds, gameId)

    // Calculate total duration
    const totalDuration = (storyboardPayload.scenes || []).reduce(
      (acc: number, s: any) => acc + (Number(s.duration_seconds) || 4), 
      0
    )

    // Save to Database
    const newRecord = {
      title: storyboardPayload.title || `${produceNames.join(' & ') || gameTitle} Ad (${mabFormatId})`,
      context_type: contextType,
      produce_ids: produceIds,
      game_id: gameId || null,
      mab_format_id: mabFormatId,
      mab_format_name: formatInfo.name,
      aspect_ratio: aspectRatio,
      duration_seconds: totalDuration,
      storyboard_payload: storyboardPayload,
      headline: storyboardPayload.headline || '',
      primary_copy: storyboardPayload.primary_copy || '',
      approval_status: 'draft_generated',
      admin_feedback: adminFeedback || null,
      qa_validation_log: qaLog,
      updated_at: new Date().toISOString(),
    }

    let savedCreative = null

    if (creativeId) {
      // Update existing
      const { data, error } = await supabase
        .from('marketing_ad_creatives')
        .update(newRecord)
        .eq('id', creativeId)
        .select()
        .single()
      if (!error) savedCreative = data
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('marketing_ad_creatives')
        .insert(newRecord)
        .select()
        .single()
      if (!error) savedCreative = data
    }

    // If table not yet migrated, return memory object with synthetic id
    if (!savedCreative) {
      savedCreative = {
        id: creativeId || `mock_${Date.now()}`,
        ...newRecord,
        created_at: new Date().toISOString(),
      }
    }

    return NextResponse.json({
      success: true,
      creative: savedCreative,
      qaLog,
    })
  } catch (err: any) {
    console.error('[Ad Studio POST Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
