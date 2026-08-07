import { NextResponse } from 'next/server'

/**
 * GET /api/interest/candidates?name=Dragonfruit
 *
 * Returns up to 3 candidate image URLs from Wikimedia for the custom interest
 * photo-picker modal. All candidates are freely licensed, no API key required.
 *
 * Strategy:
 *   1. Wikipedia REST summary API  → lead photo (originalimage / thumbnail)
 *   2. Wikipedia action API        → additional page images (filtered to content images)
 *   3. Wikipedia search API        → first search-result article's lead photo as fallback
 *
 * Non-food/non-produce pages are rejected via category inspection.
 */

const NON_PRODUCE_PATTERNS = [
  /film/i, /movie/i, /director/i, /actor/i, /biography/i, /surname/i,
  /politician/i, /football/i, /sports/i, /stadium/i, /album/i, /song/i,
  /band/i, /television/i, /novel/i, /video.?game/i, /district/i, /river/i,
  /company/i, /corporation/i, /software/i, /person/i,
]

function isNonProduceCategory(categories: { title: string }[]): boolean {
  return categories.some(c =>
    NON_PRODUCE_PATTERNS.some(p => p.test(c.title || ''))
  )
}

/** Fetch lead photo from the Wikipedia REST summary endpoint */
async function fetchSummaryPhoto(name: string): Promise<string | null> {
  try {
    const title = encodeURIComponent(name.trim().replace(/ /g, '_'))
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
      { headers: { 'User-Agent': 'CasaGrownApp/1.0 (casagrown.com)' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.originalimage?.source || data.thumbnail?.source || null
  } catch {
    return null
  }
}

/** Fetch additional page images via the MediaWiki action API */
async function fetchPageImages(name: string): Promise<string[]> {
  try {
    const title = encodeURIComponent(name.trim().replace(/ /g, '_'))
    // First get the canonical page title + categories
    const infoRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${title}&redirects=1&prop=categories|images&cllimit=20&imlimit=10&format=json&origin=*`,
      { headers: { 'User-Agent': 'CasaGrownApp/1.0' } }
    )
    if (!infoRes.ok) return []
    const infoData = await infoRes.json()
    const pages = infoData?.query?.pages || {}
    const pageId = Object.keys(pages)[0]
    if (!pageId || pageId === '-1') return []

    const page = pages[pageId]
    const categories: { title: string }[] = page?.categories || []
    if (isNonProduceCategory(categories)) return []

    // Filter images: skip icons, flags, logos — only real content photos
    const imageList: { title: string }[] = page?.images || []
    const imageFiles = imageList
      .map(i => i.title)
      .filter(t =>
        /\.(jpg|jpeg|png)$/i.test(t) &&
        !/flag|icon|logo|seal|signature|map|svg|commons-logo|wiki/i.test(t)
      )
      .slice(0, 5)

    if (imageFiles.length === 0) return []

    // Resolve file URLs via imageinfo API
    const fileParam = imageFiles.map(f => encodeURIComponent(f)).join('|')
    const imgRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${fileParam}&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json&origin=*`,
      { headers: { 'User-Agent': 'CasaGrownApp/1.0' } }
    )
    if (!imgRes.ok) return []
    const imgData = await imgRes.json()
    const imgPages = imgData?.query?.pages || {}

    return Object.values(imgPages)
      .map((p: any) => p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url)
      .filter(Boolean) as string[]
  } catch {
    return []
  }
}

/** Search Wikipedia and return the lead photo of the top result */
async function fetchSearchFallbackPhoto(name: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(name.trim())
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}+produce+plant+food&srlimit=3&format=json&origin=*`,
      { headers: { 'User-Agent': 'CasaGrownApp/1.0' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const results: { title: string }[] = data?.query?.search || []

    for (const result of results) {
      const photo = await fetchSummaryPhoto(result.title)
      if (photo) return photo
    }
    return null
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')?.trim()
  if (!name) {
    return NextResponse.json({ error: 'Missing name' }, { status: 400 })
  }

  const candidates: string[] = []

  // 1. Summary lead photo
  const summaryPhoto = await fetchSummaryPhoto(name)
  if (summaryPhoto) candidates.push(summaryPhoto)

  // 2. Additional page images
  if (candidates.length < 3) {
    const extras = await fetchPageImages(name)
    for (const url of extras) {
      if (!candidates.includes(url)) candidates.push(url)
      if (candidates.length >= 3) break
    }
  }

  // 3. Search fallback
  if (candidates.length < 2) {
    const fallback = await fetchSearchFallbackPhoto(name)
    if (fallback && !candidates.includes(fallback)) {
      candidates.push(fallback)
    }
  }

  return NextResponse.json({ name, candidates: candidates.slice(0, 3) })
}
