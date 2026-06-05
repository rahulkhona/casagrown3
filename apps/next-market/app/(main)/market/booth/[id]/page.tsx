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

  const defaultTitle = 'Booth — CasaGrown Market'
  const defaultDesc = 'Fresh, locally-grown produce from your neighbors.'
  const defaultOgImage = `${siteUrl}/og-share.jpg`

  try {
    const supabase = await createServerSupabase()
    
    // Fetch booth
    const { data: booth } = await supabase
      .from('market_booths')
      .select('name, description, about_html, header_image_url, owner_id')
      .eq('id', id)
      .single()

    if (booth) {
      let avatarUrl: string | null = null
      let sellerPersonalName: string | null = null
      if (booth.owner_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('avatar_url, full_name')
          .eq('id', booth.owner_id)
          .single()
        avatarUrl = profile?.avatar_url || null
        sellerPersonalName = profile?.full_name || null
      }

      const title = `${booth.name || sellerPersonalName || 'Neighborhood Booth'} — CasaGrown Market`
      
      let description = booth.description || booth.about_html?.replace(/<[^>]+>/g, '') || ''
      if (description.length > 150) {
        description = description.slice(0, 147) + '...'
      }
      
      const fallbackDesc = `Browse fresh, homegrown produce from ${booth.name || 'your neighbor'} on CasaGrown \u2014 garden-to-table freshness.`
      const finalDesc = description ? `${description} \u2014 Shop local on CasaGrown.` : fallbackDesc

      let firstProductPhoto: string | null = null
      if (!booth.header_image_url && !avatarUrl) {
        const { data: firstProduct } = await supabase
          .from('market_products')
          .select('photos')
          .eq('booth_id', id)
          .eq('is_deleted', false)
          .eq('is_active', true)
          .gt('inventory', 0)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (firstProduct?.photos?.[0]) {
          firstProductPhoto = firstProduct.photos[0]
        }
      }

      const ogImage = booth.header_image_url || avatarUrl || firstProductPhoto || defaultOgImage

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
          images: [{ url: ogImage, width: 1200, height: 630, alt: booth.name || 'CasaGrown Booth' }],
        },
        twitter: {
          card: 'summary_large_image',
          title,
          description: finalDesc,
          images: [ogImage],
        },
      }
    }
  } catch (err) {
    console.warn('generateMetadata failed for booth:', err)
  }

  // Fallback to default, returning full block to prevent layout leakage
  return {
    metadataBase: new URL(siteUrl),
    title: defaultTitle,
    description: defaultDesc,
    openGraph: {
      title: defaultTitle,
      description: defaultDesc,
      siteName: 'CasaGrown Market',
      type: 'website',
      url: `/market/booth/${id}`,
      images: [{ url: defaultOgImage, width: 1200, height: 630, alt: 'CasaGrown Market' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: defaultTitle,
      description: defaultDesc,
      images: [defaultOgImage],
    },
  }
}

export default function BoothDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <BoothDetailClient params={params} />
}
