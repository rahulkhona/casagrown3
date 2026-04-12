import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { createServerSupabase } from '../../../../../lib/supabase-server'
import BoothDetailClient from './BoothDetailClient'

/**
 * Dynamic OG metadata for booth pages.
 * Fetches booth name + header photo from Supabase so social crawlers
 * (WhatsApp, iMessage, Facebook) get a rich preview with the booth block.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3002'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${host}`

  try {
    const supabase = await createServerSupabase()
    
    // Fetch booth
    const { data: booth } = await supabase
      .from('market_booths')
      .select('name, description, description_html, header_image_url')
      .eq('id', id)
      .single()

    if (booth) {
      // Use Next.js image optimization to resize for OG, or fallback to default CasaGrown share image
      const ogImage = booth.header_image_url
        ? `${siteUrl}/_next/image?url=${encodeURIComponent(booth.header_image_url)}&w=1200&q=75`
        : `${siteUrl}/og-share.jpg`
      const title = `${booth.name || 'Neighborhood Booth'} on CasaGrown`
      
      let description = booth.description || booth.description_html?.replace(/<[^>]+>/g, '') || ''
      if (description.length > 150) {
        description = description.slice(0, 147) + '...'
      }
      
      const fallbackDesc = `Check out fresh, homegrown produce available at ${booth.name || 'this booth'} on CasaGrown Market.`
      const finalDesc = description ? `${description} — ${fallbackDesc}` : fallbackDesc

      return {
        metadataBase: new URL(siteUrl),
        title,
        description: finalDesc,
        openGraph: {
          title,
          description: finalDesc,
          siteName: 'CasaGrown Market',
          type: 'website',
          url: `/market/booth/${id}`,
          ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: booth.name }] } : {}),
        },
        twitter: {
          card: 'summary_large_image',
          title,
          description: finalDesc,
          ...(ogImage ? { images: [ogImage] } : {}),
        },
      }
    }
  } catch (err) {
    console.warn('generateMetadata failed for booth:', err)
  }

  // Fallback to default
  return {
    metadataBase: new URL(siteUrl),
    title: 'Booth — CasaGrown Market',
    description: 'Fresh, locally-grown produce from your neighbors.',
  }
}

export default function BoothDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <BoothDetailClient params={params} />
}
