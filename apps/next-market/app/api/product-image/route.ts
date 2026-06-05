import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '../../../lib/supabase-server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('id')
  if (!productId) {
    return new Response('Missing id', { status: 400 })
  }

  try {
    const supabase = await createServerSupabase()
    const { data: product } = await supabase
      .from('market_products')
      .select('photos')
      .eq('id', productId)
      .single()

    const photoUrl = product?.photos?.[0]
    if (!photoUrl) {
      // Fallback to default logo
      return NextResponse.redirect(new URL('/og-share.jpg', req.nextUrl.origin))
    }

    // Fetch the image from Supabase storage
    const imageRes = await fetch(photoUrl)
    if (!imageRes.ok) {
      return NextResponse.redirect(new URL('/og-share.jpg', req.nextUrl.origin))
    }

    const arrayBuffer = await imageRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Sniff MIME type
    let contentType = 'image/png' // Default fallback
    if (buffer.length >= 4) {
      const hex = buffer.slice(0, 4).toString('hex')
      if (hex.startsWith('ffd8')) {
        contentType = 'image/jpeg'
      } else if (hex === '89504e47') {
        contentType = 'image/png'
      } else if (hex.startsWith('474946')) {
        contentType = 'image/gif'
      } else if (hex.startsWith('52494646')) { // WEBP
        contentType = 'image/webp'
      }
    }

    const response = new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
      },
    })

    return response
  } catch (err) {
    console.warn('Failed to proxy product image:', err)
    return NextResponse.redirect(new URL('/og-share.jpg', req.nextUrl.origin))
  }
}
