import { ImageResponse } from 'next/og'
import { createServerSupabase } from '../../../../../lib/supabase-server'

export const runtime = 'nodejs'
export const alt = 'CasaGrown Booth'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const supabase = await createServerSupabase()

    // Fetch booth info
    const { data: booth } = await supabase
      .from('market_booths')
      .select('name, header_image_url, booth_city, booth_state')
      .eq('id', id)
      .single()

    if (!booth) return fallbackImage()

    // If booth has a header image, redirect to it (social crawlers follow redirects)
    // But we can't redirect from ImageResponse, so let's always generate a branded image

    // Fetch product photos for the collage
    const { data: products } = await supabase
      .from('market_products')
      .select('name, photos')
      .eq('booth_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(6)

    const productPhotos = (products || [])
      .map(p => p.photos?.[0])
      .filter(Boolean)
      .slice(0, 6)

    const productCount = products?.length || 0
    const boothName = booth.name || 'Neighborhood Booth'
    const location = [booth.booth_city, booth.booth_state].filter(Boolean).join(', ')

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #064e3b 0%, #065f46 30%, #047857 60%, #059669 100%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Product photo grid */}
          <div style={{ display: 'flex', flex: 1, padding: '24px 24px 0 24px', gap: '12px' }}>
            {productPhotos.length > 0 ? (
              productPhotos.map((photo, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    borderRadius: '16px',
                    overflow: 'hidden',
                    display: 'flex',
                    border: '3px solid rgba(255,255,255,0.2)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>
              ))
            ) : booth.header_image_url ? (
              <div
                style={{
                  flex: 1,
                  borderRadius: '16px',
                  overflow: 'hidden',
                  display: 'flex',
                  border: '3px solid rgba(255,255,255,0.2)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={booth.header_image_url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ) : (
              // No photos at all — show placeholder icons
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
                {['🍅', '🌽', '🥬', '🍯'].map((emoji, i) => (
                  <span key={i} style={{ fontSize: '80px' }}>{emoji}</span>
                ))}
              </div>
            )}
          </div>

          {/* Bottom bar with booth info */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '20px 32px',
              gap: '16px',
            }}
          >
            {/* Booth icon */}
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '14px',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
              }}
            >
              🏪
            </div>

            {/* Booth name + location */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span
                style={{
                  fontSize: '32px',
                  fontWeight: 800,
                  color: 'white',
                  lineHeight: 1.2,
                }}
              >
                {boothName.length > 30 ? boothName.slice(0, 28) + '...' : boothName}
              </span>
              <span style={{ fontSize: '18px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
                {location ? `📍 ${location} · ` : ''}{productCount} product{productCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* CasaGrown branding */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
              }}
            >
              <span style={{ fontSize: '22px', fontWeight: 800, color: 'white' }}>🌱 CasaGrown</span>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Fresh from your neighbor</span>
            </div>
          </div>
        </div>
      ),
      { ...size }
    )
  } catch (err) {
    console.warn('OG image generation failed for booth:', err)
    return fallbackImage()
  }
}

function fallbackImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #064e3b, #059669)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '64px' }}>🌱</span>
          <span style={{ fontSize: '48px', fontWeight: 800, color: 'white' }}>CasaGrown Market</span>
          <span style={{ fontSize: '24px', color: 'rgba(255,255,255,0.7)' }}>
            Fresh from your neighbor&apos;s backyard
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
