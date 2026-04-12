import { Metadata } from 'next'
import { createServerSupabase } from '../../../../../lib/supabase-server'
import { redirect } from 'next/navigation'

interface ProductPageProps {
  params: Promise<{ id: string }>
}

/**
 * Dynamic product page — exists primarily for OG meta tags.
 * When a product link is shared, platforms scrape this page for the preview.
 * Users landing here are redirected to the main market page.
 */
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createServerSupabase()

  const { data: product } = await supabase
    .from('market_products')
    .select('name, description, price_usd, unit, photos, seller_id, category')
    .eq('id', id)
    .single()

  if (!product) {
    return {
      title: 'Product Not Found — CasaGrown Market',
    }
  }

  // Get seller name
  const { data: seller } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', product.seller_id)
    .single()

  const sellerName = seller?.full_name || 'Local Seller'
  const price = `$${parseFloat(product.price_usd).toFixed(2)}/${product.unit}`
  const photoUrl = product.photos?.[0] || '/og-share.png'
  const title = `${product.name} — ${price} | CasaGrown Market`
  const description = product.description
    ? `${product.description.slice(0, 120)} — Fresh from ${sellerName}'s garden on CasaGrown.`
    : `Fresh ${product.name} (${price}) from ${sellerName} — Grown right in your neighborhood. Buy local on CasaGrown.`

  return {
    title: `${product.name} — CasaGrown Market`,
    description,
    openGraph: {
      title,
      description,
      siteName: 'CasaGrown Market',
      type: 'website',
      url: `/market/product/${id}`,
      images: [{ url: photoUrl, alt: product.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [photoUrl],
    },
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params
  // Redirect to market with product highlighted
  redirect(`/market?product=${id}`)
}
