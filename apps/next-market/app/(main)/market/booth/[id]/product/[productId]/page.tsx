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
      const price = product.price_usd === 0 ? 'Free' : `$${Number(product.price_usd).toFixed(2)}/${product.unit}`
      const title = `${product.name} — ${price} on CasaGrown`
      const description = product.description || `Fresh ${product.name} available on CasaGrown Market`

      return {
        metadataBase: new URL(siteUrl),
        title,
        description,
        openGraph: {
          title,
          description,
          siteName: 'CasaGrown Market',
          type: 'website',
          ...(photo ? { images: [{ url: photo, width: 600, height: 600, alt: product.name }] } : {}),
        },
        twitter: {
          card: 'summary_large_image',
          title,
          description,
          ...(photo ? { images: [photo] } : {}),
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
