import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fzdmszvfeewpwswlnfyk.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VEO_API_KEY || ''

/**
 * /api/interest/resolve-image
 * Accepts { name: string }
 * Fetches candidates from Wikipedia API, evaluates using Gemini 3.5 Flash Vision, and upserts into community_produce_catalog
 */
export async function POST(req: Request) {
  try {
    const { name } = await req.json()
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 })
    }

    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_')

    // 1. Check Wikipedia REST API for article lead image
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.trim().replace(/ /g, '_'))}`
    let candidateImage: string | null = null

    try {
      const wikiRes = await fetch(wikiUrl, { headers: { 'User-Agent': 'CasaGrownApp/1.0' } })
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json()
        candidateImage = wikiData.originalimage?.source || wikiData.thumbnail?.source || null
      }
    } catch {
      // Fallback
    }

    if (!candidateImage) {
      return NextResponse.json({ success: false, message: 'No candidate image found' })
    }

    // 2. Audit candidate image with Gemini 3.5 Flash Vision if key is present
    let isVerified = false
    if (GEMINI_API_KEY) {
      try {
        const imgRes = await fetch(candidateImage)
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer()
          const base64Data = Buffer.from(buffer).toString('base64')
          const mimeType = imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg'

          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`
          const aiRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { inline_data: { mime_type: mimeType, data: base64Data } },
                    { text: `Is this a photograph of fresh ${name} suitable for a marketplace listing? Reply JSON: {"is_verified": boolean, "score": number}` }
                  ]
                }
              ]
            })
          })

          if (aiRes.ok) {
            const aiJson = await aiRes.json()
            const rawText = aiJson.candidates?.[0]?.content?.parts?.[0]?.text || ''
            const match = rawText.match(/\{[\s\S]*\}/)
            if (match) {
              const parsed = JSON.parse(match[0])
              if (parsed.is_verified && (parsed.score ?? 10) >= 7) {
                isVerified = true
              }
            }
          }
        }
      } catch {
        // If vision fails, default to using candidate if available
        isVerified = true
      }
    } else {
      isVerified = true
    }

    if (!isVerified) {
      return NextResponse.json({ success: false, message: 'Image rejected by AI vision audit' })
    }

    // 3. Upsert verified image into community_produce_catalog DB table
    if (SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      await supabase.from('community_produce_catalog').upsert(
        {
          id: slug,
          name: name.trim(),
          image: candidateImage,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
    }

    return NextResponse.json({ success: true, image: candidateImage })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
