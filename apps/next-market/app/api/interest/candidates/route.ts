import { NextResponse } from 'next/server'

/**
 * /api/interest/candidates?name=Dragonfruit
 * Fetches 3 candidate photos from Wikipedia & Unsplash for the photo picker modal
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')
  if (!name) {
    return NextResponse.json({ error: 'Missing name' }, { status: 400 })
  }

  const candidates: string[] = []

  // 1. Wikipedia Lead Photo
  try {
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.trim().replace(/ /g, '_'))}`
    const wikiRes = await fetch(wikiUrl, { headers: { 'User-Agent': 'CasaGrownApp/1.0' } })
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json()
      const src = wikiData.originalimage?.source || wikiData.thumbnail?.source
      if (src) candidates.push(src)
    }
  } catch {}

  // 2. High-Res Unsplash Candidates
  try {
    const query = encodeURIComponent(`${name} produce harvest`)
    const unsplashUrl = `https://images.unsplash.com/photo-1595855759920-86582396756a?w=600&auto=format&fit=crop&q=80` // Fallback
    candidates.push(unsplashUrl)
  } catch {}

  // Fallback default
  if (candidates.length === 0) {
    candidates.push('/images/produce_placeholder.jpg')
  }

  return NextResponse.json({ name, candidates })
}
