import { NextRequest, NextResponse } from 'next/server'
import { getInterestImage } from '../../../../../next-market/lib/interestCatalog'

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_AI_API_KEY ||
  process.env.VEO_API_KEY ||
  ''

export interface MotionStoryboardScene {
  id: string
  sceneNumber: number
  heading: string
  produceFocus: string
  visualPrompt: string
  imageUrl: string
  motionType: 'push_in' | 'pan_horizontal' | 'diagonal_sweep' | 'zoom_out'
  durationSeconds: number
  headlineOverlay: string
  badgeOverlay?: string
  callToAction?: string
  rationale?: string
}

export interface MotionVideoStoryboardResponse {
  success: boolean
  title: string
  summary: string
  totalDurationSeconds: number
  scenes: MotionStoryboardScene[]
  reasoning: string
}

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      produceContext = ['Meyer Lemons', 'Heirloom Tomatoes', 'Haas Avocados'],
      selectedPhotos = [],
      selectedPhotoUrls = [],
    } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Creative prompt is required' }, { status: 400 })
    }

    // Standardize input photos
    const normalizedPhotos: Array<{ title?: string; produceName?: string; imageUrl: string }> = Array.isArray(selectedPhotos) && selectedPhotos.length > 0
      ? selectedPhotos
      : (Array.isArray(selectedPhotoUrls) ? selectedPhotoUrls.map((url: string, i: number) => ({ imageUrl: url, title: `Scene ${i + 1}`, produceName: produceContext[i] || 'Produce' })) : [])

    const targetSceneCount = normalizedPhotos.length > 0 ? normalizedPhotos.length : 3

    const photoListDescription = normalizedPhotos.length > 0
      ? normalizedPhotos.map((p, i) => `Scene ${i + 1}: "${p.title || p.produceName || 'Produce Photo'}" focusing on ${p.produceName || 'Fresh Harvest'}`).join('\n')
      : `Default Produce: ${Array.isArray(produceContext) ? produceContext.join(', ') : 'Meyer Lemons, Heirloom Tomatoes, Haas Avocados'}`

    const systemInstruction = `You are the Lead Creative Director for CasaGrown Marketing Automation.
Your mission is to create high-converting Pan & Zoom (Ken Burns motion) advertising videos for social media (Instagram Reels, Facebook Feed Video Ads).

Ad Rules:
1. No talking narrators. These videos rely on stunning cinematic food photography with smooth pan & zoom motion paths, punchy on-screen headlines, local demand badges, and a strong final call to action.
2. You MUST generate EXACTLY ${targetSceneCount} sequential scenes (one scene for each of the ${targetSceneCount} photos provided).
3. Each scene must specify:
   - sceneNumber: 1, 2, 3...
   - heading: Short descriptive name (e.g. "Scene 1: Tree Orchard Overview")
   - produceFocus: The specific produce item or subject in focus
   - visualPrompt: Detailed commercial advertising photography prompt describing composition and lighting
   - motionType: Alternate between "push_in", "pan_horizontal", "diagonal_sweep", "zoom_out"
   - durationSeconds: 3 to 4 seconds
   - headlineOverlay: Bold, punchy on-screen text (e.g. "🚨 EXCESS MEYER LEMONS IN YOUR BACKYARD?")
   - badgeOverlay: Eye-catching badge (e.g. "Neighbors Ready to Buy • $3.50/lb")
   - callToAction: Action-oriented CTA for the closing scene (e.g. "List Your Harvest in 2 Mins on CasaGrown")

Output strictly valid JSON with no markdown wrapping:
{
  "title": "Short campaign title",
  "summary": "Creative overview of the motion ad",
  "reasoning": "Strategic explanation of why this sequence and motion paths were chosen",
  "scenes": [
    {
      "sceneNumber": 1,
      "heading": "Scene 1: Garden Tree Overview",
      "produceFocus": "Meyer Lemons",
      "visualPrompt": "cinematic commercial photo of ripe Meyer Lemons in sunlit crate, 8k",
      "motionType": "push_in",
      "durationSeconds": 3,
      "headlineOverlay": "🚨 GOT EXTRA PRODUCE IN YOUR BACKYARD?",
      "badgeOverlay": "High Local Demand in 95125",
      "rationale": "Hook viewer immediately with relatable abundance"
    }
  ]
}`

    const userPrompt = `User Creative Request: "${prompt}"

Required Scene Setup (${targetSceneCount} Photos):
${photoListDescription}

Generate the complete ${targetSceneCount}-scene pan-and-zoom motion ad storyboard.`

    let storyboardData: any = null

    if (GEMINI_API_KEY) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 4000)

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.7,
              },
            }),
          }
        )
        clearTimeout(timeoutId)

        if (geminiRes.ok) {
          const geminiJson = await geminiRes.json()
          const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text
          if (rawText) {
            storyboardData = JSON.parse(rawText)
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini Flash-Lite storyboard call timed out or failed, using deterministic builder:', geminiErr)
      }
    }

    // Fallback deterministic builder if Gemini didn't return the exact count
    const motions: Array<'push_in' | 'pan_horizontal' | 'diagonal_sweep' | 'zoom_out'> = [
      'push_in',
      'pan_horizontal',
      'diagonal_sweep',
      'zoom_out',
    ]

    const scenesSource = Array.isArray(storyboardData?.scenes) && storyboardData.scenes.length === targetSceneCount
      ? storyboardData.scenes
      : Array.from({ length: targetSceneCount }).map((_, idx) => {
          const photo = normalizedPhotos[idx]
          const prodName = photo?.produceName || produceContext[idx % produceContext.length] || 'Fresh Harvest'
          const isFirst = idx === 0
          const isLast = idx === targetSceneCount - 1

          return {
            sceneNumber: idx + 1,
            heading: photo?.title || `Scene ${idx + 1}: Fresh ${prodName}`,
            produceFocus: prodName,
            visualPrompt: `cinematic commercial photo of ${prodName}, 8k`,
            motionType: motions[idx % motions.length],
            durationSeconds: 3.5,
            headlineOverlay: isFirst
              ? `🚨 GOT EXTRA ${prodName.toUpperCase()} IN YOUR BACKYARD?`
              : isLast
              ? '🌿 SHARE YOUR HARVEST • JOIN CASAGROWN'
              : `💰 NEIGHBORS WANT FRESH ${prodName.toUpperCase()}`,
            badgeOverlay: isFirst ? 'High Local Demand' : isLast ? 'Instant Pickup' : 'Neighbors Ready to Buy',
            callToAction: isLast ? 'List in 2 Minutes on CasaGrown' : undefined,
            rationale: `Showcase ${prodName} with dynamic motion`,
          }
        })

    const scenesWithMedia: MotionStoryboardScene[] = scenesSource.map((s: any, idx: number) => {
      const photo = normalizedPhotos[idx]
      const fallbackUrl = getInterestImage(s.produceFocus || 'produce')

      return {
        id: `motion-scene-${Date.now()}-${idx}`,
        sceneNumber: idx + 1,
        heading: s.heading || photo?.title || `Scene ${idx + 1}`,
        produceFocus: s.produceFocus || photo?.produceName || 'Produce',
        visualPrompt: s.visualPrompt || `cinematic commercial photo of ${s.produceFocus}`,
        imageUrl: photo?.imageUrl || fallbackUrl,
        motionType: s.motionType || motions[idx % motions.length],
        durationSeconds: Number(s.durationSeconds) || 3.5,
        headlineOverlay: s.headlineOverlay || 'FRESH LOCAL HARVEST',
        badgeOverlay: s.badgeOverlay || 'Local Demand Alert',
        callToAction: s.callToAction,
        rationale: s.rationale,
      }
    })

    const totalDurationSeconds = scenesWithMedia.reduce((a, b) => a + b.durationSeconds, 0)

    return NextResponse.json({
      success: true,
      title: storyboardData?.title || `Neighborhood Harvest Video (${targetSceneCount} Scenes)`,
      summary: storyboardData?.summary || `Cinematic ${targetSceneCount}-scene pan & zoom produce showcase`,
      reasoning: storyboardData?.reasoning || `Tailored sequence matching all ${targetSceneCount} selected photos`,
      totalDurationSeconds,
      scenes: scenesWithMedia,
    })
  } catch (err: any) {
    console.error('[Motion Storyboard API] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to generate motion storyboard' },
      { status: 500 }
    )
  }
}
