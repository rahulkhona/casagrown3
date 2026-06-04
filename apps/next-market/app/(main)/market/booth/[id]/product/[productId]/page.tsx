import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import ProductDetailClient from './ProductDetailClient'

/**
 * Dynamic OG metadata for product pages.
 * Fetches product name + first photo from Supabase so social crawlers
 * (WhatsApp, iMessage, Facebook) get a rich preview with the product image.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string; productId: string }> }
): Promise<Metadata> {
  const { id, productId } = await params
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3002'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${host}`

  const defaultTitle = 'Product — CasaGrown Market'
  const defaultDesc = 'Fresh, locally-grown produce from your neighbors.'
  const defaultOgImage = `${siteUrl}/og-share.jpg`

  try {
    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data: product } = await supabase
      .from('market_products')
      .select('name, description, photos, price_usd, unit, category')
      .eq('id', productId)
      .single()

    if (product) {
      let boothHeaderUrl: string | null = null
      let avatarUrl: string | null = null

      const { data: booth } = await supabase
        .from('market_booths')
        .select('header_image_url, owner_id')
        .eq('id', id)
        .single()

      if (booth) {
        boothHeaderUrl = booth.header_image_url || null
        if (booth.owner_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('avatar_url')
            .eq('id', booth.owner_id)
            .single()
          avatarUrl = profile?.avatar_url || null
        }
      }

      const photo = product.photos?.[0]
      const ogImage = photo || boothHeaderUrl || avatarUrl || defaultOgImage

      const price = product.price_usd === 0 ? 'Free' : `$${Number(product.price_usd).toFixed(2)}/${product.unit}`
      const title = `${product.name} — ${price} | CasaGrown Market`
      const description = product.description
        ? `${product.description.slice(0, 120)} — Fresh from a neighbor's garden on CasaGrown.`
        : `Fresh ${product.name} (${price}) grown right in your neighborhood. Buy local, eat fresh, and help stop food waste on CasaGrown.`

      return {
        metadataBase: new URL(siteUrl),
        title,
        description,
        openGraph: {
          title,
          description,
          siteName: 'CasaGrown Market',
          type: 'website',
          url: `/market/booth/${id}/product/${productId}`,
          images: [{ url: ogImage, width: 1200, height: 630, alt: product.name }],
        },
        twitter: {
          card: 'summary_large_image',
          title,
          description,
          images: [ogImage],
        },
      }
    }
  } catch (err) {
    console.warn('generateMetadata failed for product:', err)
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
      url: `/market/booth/${id}/product/${productId}`,
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

export default function ProductDetailPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  return <ProductDetailClient params={params} />
}
