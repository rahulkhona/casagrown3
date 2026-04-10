import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { createServerSupabase } from '../../../../../../../lib/supabase-server'
import ProductDetailClient from './ProductDetailClient'

/**
 * Dynamic OG metadata for product pages.
 * Fetches product name + first photo from Supabase so social crawlers
 * (WhatsApp, iMessage, Facebook) get a rich preview with the product image.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string; productId: string }> }
): Promise<Metadata> {
  const { productId } = await params
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3002'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${host}`

  try {
    const supabase = await createServerSupabase()
    const { data: product } = await supabase
      .from('market_products')
      .select('name, description, photos, price_usd, unit, category')
      .eq('id', productId)
      .single()

    if (product) {
      const photo = product.photos?.[0]
      // Use Next.js image optimization to resize for OG (WhatsApp needs < ~300KB)
      const ogImage = photo
        ? `${siteUrl}/_next/image?url=${encodeURIComponent(photo)}&w=1200&q=75`
        : undefined
      const price = product.price_usd === 0 ? 'Free' : `$${Number(product.price_usd).toFixed(2)}/${product.unit}`
      const title = `${product.name} — ${price} on CasaGrown`
      const description = product.description
        ? `${product.description} — Check it out on CasaGrown and help stop food waste!`
        : `Fresh ${product.name} available on CasaGrown Market. Join me in stopping food waste — help feed millions!`

      return {
        metadataBase: new URL(siteUrl),
        title,
        description,
        openGraph: {
          title,
          description,
          siteName: 'CasaGrown Market',
          type: 'website',
          url: `/market/booth/${params.id}/product/${product.id}`,
          ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: product.name }] } : {}),
        },
        twitter: {
          card: 'summary_large_image',
          title,
          description,
          ...(ogImage ? { images: [ogImage] } : {}),
        },
      }
    }
  } catch (err) {
    console.warn('generateMetadata failed for product:', err)
  }

  // Fallback to default
  return {
    metadataBase: new URL(siteUrl),
    title: 'Product — CasaGrown Market',
    description: 'Fresh, locally-grown produce from your neighbors.',
  }
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  return <ProductDetailClient params={params} />
}
