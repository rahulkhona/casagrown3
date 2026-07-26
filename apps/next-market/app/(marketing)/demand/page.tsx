import { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import Image from 'next/image'
import { Navbar } from '../../components/Navbar'
import { BottomNav } from '../../components/BottomNav'
import { EXHAUSTIVE_US_PRODUCE, type ProduceItem } from '../../../lib/produceCatalog'
import { MarketProvider } from '../../../lib/store'
import { CartProvider } from '../../../lib/useCart'
import { BootstrapProvider } from '../../../lib/useBootstrap'
import { QuickSetupProvider } from '../../../lib/useQuickSetup'
import { ErrorToastProvider } from '../../components/ErrorToast'

interface DemandPageProps {
  searchParams: Promise<{
    items?: string
    name?: string
    location?: string
    q?: string
    ref?: string
  }>
}

export async function generateMetadata({ searchParams }: DemandPageProps): Promise<Metadata> {
  const { items, name, location, q } = await searchParams
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3002'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${host}`

  const rawItems = items || q || 'Fresh Produce'
  const itemList = rawItems.split(',').map((s) => s.trim()).filter(Boolean)
  const primaryItemName = itemList[0] || 'Fresh Produce'

  // Match primary item in catalog for high-res photo URL (Option A — 0 server cost)
  const catalogMatch = EXHAUSTIVE_US_PRODUCE.find(
    (p) => p.name.toLowerCase() === primaryItemName.toLowerCase()
  )
  const photoUrl = catalogMatch?.image
    ? catalogMatch.image.startsWith('http')
      ? catalogMatch.image
      : `${siteUrl}${catalogMatch.image}`
    : `${siteUrl}/og-share.jpg`

  const buyerName = name?.trim() || 'A neighbor'
  const locStr = location?.trim() ? ` in ${location.trim()}` : ''

  let itemsSummary = primaryItemName
  if (itemList.length === 2) {
    itemsSummary = `${itemList[0]} & ${itemList[1]}`
  } else if (itemList.length > 2) {
    itemsSummary = `${itemList[0]}, ${itemList[1]} + ${itemList.length - 2} more`
  }

  const title = `${buyerName} is looking for ${itemsSummary}${locStr} | CasaGrown`
  const description = `Do you have extra garden produce? Help ${buyerName} by listing your harvest on CasaGrown so your neighbors can buy local!`

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'CasaGrown Market',
      type: 'website',
      url: `/demand?items=${encodeURIComponent(rawItems)}`,
      images: [{ url: photoUrl, alt: itemsSummary }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [photoUrl],
    },
  }
}

export default async function DemandPage({ searchParams }: DemandPageProps) {
  const { items, name, location, q } = await searchParams

  const rawItems = items || q || 'Fresh Produce'
  const itemNames = rawItems.split(',').map((s) => s.trim()).filter(Boolean)
  const buyerName = name?.trim() || 'A neighbor'
  const locStr = location?.trim() ? ` in ${location.trim()}` : ''

  // Hydrate items from catalog
  const matchedItems: ProduceItem[] = itemNames.map((itemName, index) => {
    const catalogItem = EXHAUSTIVE_US_PRODUCE.find(
      (p) => p.name.toLowerCase() === itemName.toLowerCase()
    )
    if (catalogItem) return catalogItem

    return {
      id: `demand_${index}_${itemName.toLowerCase().replace(/\s+/g, '_')}`,
      name: itemName,
      category: 'produce',
      displayCategory: 'Requested Item',
      image: '/images/produce_placeholder.jpg',
      buyersCount: 1,
      sellersCount: 0,
      unit: 'item',
    }
  })

  return (
    <ErrorToastProvider>
      <BootstrapProvider>
        <MarketProvider>
          <CartProvider>
            <QuickSetupProvider>
              <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', paddingTop: '64px', paddingBottom: '80px' }}>
                <Navbar />

                <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 16px' }}>
                  {/* Banner Header */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '16px',
                      padding: '24px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                      marginBottom: '28px',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}>🥦 🧺 🍎</span>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#111827', margin: '0 0 8px 0' }}>
                      {buyerName}{locStr} is searching for local produce!
                    </h1>
                    <p style={{ fontSize: '15px', color: '#4b5563', margin: 0, maxWidth: '640px', marginLeft: 'auto', marginRight: 'auto' }}>
                      Got extra harvest growing in your garden? Click <strong style={{ color: '#15803d' }}>List Item Now</strong> next to any requested produce to post a listing in 30 seconds and connect with your neighbor!
                    </p>
                  </div>

                  {/* Requested Items Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '20px',
                    }}
                  >
                    {matchedItems.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: '16px',
                          border: '1px solid #e5e7eb',
                          overflow: 'hidden',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <div style={{ position: 'relative', width: '100%', height: '180px', backgroundColor: '#f3f4f6' }}>
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            style={{ objectFit: 'cover' }}
                            sizes="(max-width: 768px) 100vw, 33vw"
                          />
                          <span
                            style={{
                              position: 'absolute',
                              top: '12px',
                              left: '12px',
                              backgroundColor: '#dcfce7',
                              color: '#15803d',
                              fontSize: '12px',
                              fontWeight: 700,
                              padding: '4px 10px',
                              borderRadius: '9999px',
                              border: '1px solid #86efac',
                            }}
                          >
                            🔥 Buyer Searching
                          </span>
                        </div>

                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>
                            {item.name}
                          </h3>
                          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px 0' }}>
                            Category: {item.displayCategory || 'Produce'}
                          </p>

                          <div style={{ marginTop: 'auto' }}>
                            <Link
                              href={`/create-listing?produce=${encodeURIComponent(item.name)}`}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'center',
                                backgroundColor: '#16a34a',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '14px',
                                padding: '10px 16px',
                                borderRadius: '10px',
                                textDecoration: 'none',
                                boxSizing: 'border-box',
                                boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)',
                              }}
                            >
                              ➕ List {item.name} Now →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </main>

                <BottomNav />
              </div>
            </QuickSetupProvider>
          </CartProvider>
        </MarketProvider>
      </BootstrapProvider>
    </ErrorToastProvider>
  )
}
