'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { geocodeAddress } from '../../../../lib/geocode'
import { useNotificationPrompt } from '../../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../../../components/NotificationPromptModal'
import { useErrorToast } from '../../../components/ErrorToast'
import AddressInput from '../../../components/AddressInput'
import type { AddressFields } from '../../../../lib/address'
import { EMPTY_ADDRESS, formatFullAddress } from '../../../../lib/address'
import ProductListingCard from './ProductListingCard'
import ChatMessage from './ChatMessage'
import { CommunityChatMessage } from '../../../../../../packages/app/features/community-chat/community-chat-service'
import styles from '../page.module.css'

interface BoothResult {
  booth_id: string
  owner_id: string
  booth_name: string
  description: string | null
  offers_delivery: boolean
  offers_pickup: boolean
  delivery_radius_miles: number
  pickup_address: string | null
  distance_miles: number
  product_count: number
  matched_products: any[]
  is_demo: boolean
}

interface FindPanelProps {
  userId?: string
  profileH3?: string | null
  onClose: () => void
  /** Send a Buzz message (for the "looking for" auto-post) */
  onSendMessage: (content: string) => Promise<void>
  /** Reload messages after posting */
  onReloadMessages: () => void
}

export default function FindPanel({ userId, profileH3, onClose, onSendMessage, onReloadMessages }: FindPanelProps) {
  const router = useRouter()
  const supabase = createClient()
  const { showError, showInfo, showSuccess } = useErrorToast()
  const { showPrompt, modalProps } = useNotificationPrompt(userId)

  // ── Search form state ──
  const [address, setAddress] = useState<AddressFields>(EMPTY_ADDRESS)
  const [zip, setZip] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [keywords, setKeywords] = useState('')
  const [fulfillment, setFulfillment] = useState<'all' | 'delivery' | 'pickup'>('all')
  const [radius, setRadius] = useState(10)
  const [buyerStateCode, setBuyerStateCode] = useState<string | null>(null)
  const [addressResolved, setAddressResolved] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)

  // ── Results state ──
  const [results, setResults] = useState<BoothResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // ── USDA fallback state ──
  const [usdaMarkets, setUsdaMarkets] = useState<any[]>([])
  const [loadingUsda, setLoadingUsda] = useState(false)

  // ── Product chat messages (for showing conversations alongside cards) ──
  const [productMessages, setProductMessages] = useState<Record<string, CommunityChatMessage>>({})

  // ── "Looking for" posted state ──
  const [lookingForPosted, setLookingForPosted] = useState(false)
  const [watchSaved, setWatchSaved] = useState(false)

  // ── Load saved search from localStorage or profile ──
  useEffect(() => {
    // Try localStorage first
    try {
      const saved = localStorage.getItem('buzz_find_last')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.address) {
          // Handle legacy string format from localStorage
          if (typeof parsed.address === 'string') {
            setAddress({ street: parsed.address, city: '', state: '', zip: '' })
          } else {
            setAddress(parsed.address)
          }
        }
        if (parsed.zip) setZip(parsed.zip)
        if (parsed.lat) { setLat(parsed.lat); setLng(parsed.lng); setAddressResolved(true) }
        if (parsed.keywords) setKeywords(parsed.keywords)
        if (parsed.fulfillment) setFulfillment(parsed.fulfillment)
        if (parsed.radius) setRadius(parsed.radius)
        if (parsed.stateCode) setBuyerStateCode(parsed.stateCode)
        return // localStorage had data
      }
    } catch {}

    // Fall back to profile address
    if (!userId) return
    supabase.from('profiles')
      .select('street_address, city, state_code, zip_code')
      .eq('id', userId)
      .single()
      .then(async ({ data: profile }) => {
        if (profile?.street_address) {
          const addr: AddressFields = {
            street: profile.street_address || '',
            city: profile.city || '',
            state: profile.state_code || '',
            zip: profile.zip_code || '',
          }
          setAddress(addr)
          if (profile.zip_code) setZip(profile.zip_code)
          if (profile.state_code) setBuyerStateCode(profile.state_code)
          const geo = await geocodeAddress(formatFullAddress(addr))
          if (geo) { setLat(geo.lat); setLng(geo.lng); setAddressResolved(true) }
        }
      })
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save search to localStorage ──
  const saveToLocalStorage = useCallback(() => {
    try {
      localStorage.setItem('buzz_find_last', JSON.stringify({
        address, zip, lat, lng, keywords, fulfillment, radius, stateCode: buyerStateCode,
      }))
    } catch {}
  }, [address, zip, lat, lng, keywords, fulfillment, radius, buyerStateCode])

  // ── Handle address change ──
  const handleAddressResolve = async () => {
    const full = formatFullAddress(address)
    if (!full.trim()) return
    const geo = await geocodeAddress(full.trim())
    if (geo) {
      setLat(geo.lat); setLng(geo.lng); setAddressResolved(true)
      if (address.state) setBuyerStateCode(address.state)
      if (address.zip) setZip(address.zip)
    } else {
      showError('Could not find that address. Please include city and state.')
    }
  }

  // ── Use browser geolocation (mirrors market page) ──
  const handleUseMyLocation = () => {
    if (!('geolocation' in navigator)) return
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude); setLng(pos.coords.longitude)
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
          const data = await res.json()
          if (data?.address) {
            const street = [data.address.house_number, data.address.road].filter(Boolean).join(' ')
            const city = data.address.city || data.address.town || data.address.suburb || data.address.village
            const stateMap: Record<string, string> = {
              'California': 'CA', 'Florida': 'FL', 'New York': 'NY', 'Texas': 'TX',
              'Oklahoma': 'OK', 'Arizona': 'AZ', 'Oregon': 'OR', 'Washington': 'WA',
            }
            const sc = stateMap[data.address.state] || data.address['ISO3166-2-lvl4']?.split('-')[1] || data.address.state
            const postcode = data.address.postcode?.split('-')[0] || ''
            setAddress({ street: street || '', city: city || '', state: sc || '', zip: postcode })
            if (sc) setBuyerStateCode(sc)
            if (postcode) setZip(postcode)
          }
        } catch { /* ignore */ }
        setAddressResolved(true); setLocationLoading(false)
      },
      () => { showError('Location access denied.'); setLocationLoading(false) },
      { timeout: 5000 }
    )
  }

  // ── Search ──
  const handleSearch = async () => {
    if (!lat || !lng) {
      // Try to resolve address first
      await handleAddressResolve()
      return
    }
    if (!keywords.trim()) {
      showError('Please enter what you\'re looking for')
      return
    }

    setLoading(true)
    setSearched(true)
    saveToLocalStorage()

    const { data, error } = await supabase.rpc('nearby_booths', {
      user_lat: lat,
      user_lng: lng,
      max_miles: radius,
      fulfillment_filter: fulfillment,
      product_search: keywords.trim(),
      min_price: null,
      max_price: null,
      category_filter: null,
      buyer_state_code: buyerStateCode,
      exclude_demos: true, // No demos in Buzz find
    })

    if (error) {
      console.error('Find search error:', error.message)
      showError('Search failed. Please try again.')
      setLoading(false)
      return
    }

    const boothResults = (data as BoothResult[]) || []
    setResults(boothResults)

    // Fetch existing Buzz messages for matched products
    const allProductIds = boothResults.flatMap(b => 
      (b.matched_products || []).map((p: any) => p.id)
    )

    if (allProductIds.length > 0 && profileH3) {
      const { data: chatMsgs } = await supabase
        .from('community_chat_messages')
        .select(`
          id, community_h3_index, author_id, parent_id, content, media,
          product_listing_id, is_system, is_pinned, edited_at, created_at, bumped_at
        `)
        .in('product_listing_id', allProductIds)
        .is('parent_id', null)

      if (chatMsgs) {
        const msgMap: Record<string, CommunityChatMessage> = {}
        for (const msg of chatMsgs) {
          // Hydrate with author info
          const { data: authorProfile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', msg.author_id)
            .single()

          msgMap[msg.product_listing_id] = {
            ...msg,
            author_name: authorProfile?.full_name || 'Neighbor',
            author_avatar_url: authorProfile?.avatar_url || null,
            reaction_counts: {},
            reply_count: 0,
            user_reactions: [],
            flag_count: 0,
          }
        }
        setProductMessages(msgMap)
      }
    }

    setLoading(false)

    // ── USDA fallback: fire when real results are sparse ──
    if (boothResults.length < 3) {
      // Prefer stored zip; fall back to extracting from address string
      const zipcode = zip || address.zip || ''
      if (zipcode) {
        setLoadingUsda(true)
        setUsdaMarkets([])
        supabase.functions.invoke('usda-farmers-markets', {
          body: { zipcode, radius }
        }).then(({ data }) => {
          if (data?.data && Array.isArray(data.data)) {
            setUsdaMarkets(data.data.slice(0, 5))
          }
        }).catch(e => console.warn('USDA fallback error (FindPanel):', e))
          .finally(() => setLoadingUsda(false))
      }
    } else {
      setUsdaMarkets([])
    }

    // Queue notifications for growers who grow what the buyer searched for
    if (keywords.trim() && profileH3 && userId) {
      supabase.rpc('queue_grower_search_match', {
        p_keywords: keywords.trim(),
        p_community_h3: profileH3,
        p_searcher_id: userId,
      }).then(({ error: matchErr }) => {
        if (matchErr) console.warn('Grower match queue failed (non-blocking):', matchErr)
      })
    }
  }

  // ── Post "Looking for" message & save watch ──
  const handlePostLookingFor = async () => {
    let addrLabel = formatFullAddress(address) || 'my area'
    if (userId) {
       const { data: prof } = await supabase.from('profiles').select('street_address, city, state_code').eq('id', userId).single()
       if (prof?.street_address) {
          const street = prof.street_address.replace(/^[\d-]+\s*/, '')
          addrLabel = [street, prof.city, prof.state_code].filter(Boolean).join(', ')
       }
    }
    const fulfillmentLabel = fulfillment === 'delivery' ? '🚗 Delivery' : fulfillment === 'pickup' ? `📍 Pickup within ${radius} mi` : '🚗 Delivery or 📍 Pickup'

    const message = `🔍 Looking for: **${keywords}**\n${fulfillmentLabel} near ${addrLabel}\nIf you have some, let me know! 🌱`
    
    await onSendMessage(message)
    setLookingForPosted(true)
    onReloadMessages()
    showSuccess('Posted to Community! Your neighbors will see your request.')
  }

  const handleSaveWatch = async () => {
    if (!userId || watchSaved) return

    const { error } = await supabase
      .from('product_watches')
      .insert({
        user_id: userId,
        keywords: keywords.trim(),
        fulfillment_type: fulfillment,
        radius_miles: radius,
        lat, lng,
        state_code: buyerStateCode,
        community_h3_index: profileH3,
      })

    if (error) {
      console.error('Failed to save product watch:', error)
      showError('Failed to save your watch. Please try again.')
      return
    }

    setWatchSaved(true)
    showSuccess('🔔 You\'ll be notified when matching products appear (for 7 days)')
    // Prompt for push notifications if needed
    showPrompt()
  }

  // ── Collect all products across booths ──
  const allProducts = results.flatMap(b => 
    (b.matched_products || []).map((p: any) => ({
      ...p,
      boothId: b.booth_id,
      boothName: b.booth_name,
      distance: b.distance_miles,
    }))
  )

  return (
    <div className={styles.findPanel}>
      {/* Header */}
      <div className={styles.findHeader}>
        <h3 className={styles.findTitle}>🔍 Find Produce</h3>
        <button className={styles.findClose} onClick={onClose} aria-label="Close search">✕</button>
      </div>

      {/* Search Form */}
      <div className={styles.findForm}>
        {/* Address */}
        <div className={styles.findField}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label className={styles.findLabel} style={{ margin: 0 }}>📍 Location</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {addressResolved && <span style={{ fontSize: 12, color: 'var(--green-600)' }}>✅ Set</span>}
              <button
                onClick={handleUseMyLocation}
                disabled={locationLoading}
                style={{
                  background: 'none', border: 'none', cursor: locationLoading ? 'wait' : 'pointer',
                  color: 'var(--green-600, #16a34a)', fontSize: 13, fontWeight: 600,
                  padding: 0, display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {locationLoading ? '⏳ Locating...' : '📍 Use My Location'}
              </button>
            </div>
          </div>
          <AddressInput
            value={address}
            onChange={(updated) => {
              setAddress(updated)
              setAddressResolved(false)
              if (updated.zip) setZip(updated.zip)
              else setZip('')
              if (updated.state) setBuyerStateCode(updated.state)
            }}
            placeholderStreet="Street Address"
          />
          {!addressResolved && (address.street || address.city || address.zip) && (
            <button
              className={styles.findResolveBtn}
              onClick={handleAddressResolve}
              style={{ marginTop: 6, width: '100%' }}
            >✓ Confirm Address</button>
          )}
        </div>

        {/* Keywords */}
        <div className={styles.findField}>
          <label className={styles.findLabel}>🔍 What are you looking for?</label>
          <input
            className={styles.findInput}
            placeholder="tomatoes, basil, honey..."
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch() } }}
            autoFocus
          />
        </div>

        {/* Fulfillment pills */}
        <div className={styles.findField}>
          <label className={styles.findLabel}>Fulfillment</label>
          <div className={styles.findPills}>
            {(['all', 'delivery', 'pickup'] as const).map(f => (
              <button
                key={f}
                className={`${styles.findPill} ${fulfillment === f ? styles.findPillActive : ''}`}
                onClick={() => setFulfillment(f)}
              >
                {f === 'all' ? 'All' : f === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}
              </button>
            ))}
          </div>
        </div>

        {/* Radius (only for pickup) */}
        {fulfillment === 'pickup' && (
          <div className={styles.findField}>
            <label className={styles.findLabel}>Within {radius} miles</label>
            <input
              type="range"
              min={1}
              max={25}
              value={radius}
              onChange={e => setRadius(parseInt(e.target.value))}
              className={styles.findSlider}
            />
          </div>
        )}

        {/* Search button */}
        <button
          className={styles.findSearchBtn}
          onClick={handleSearch}
          disabled={loading || !keywords.trim()}
        >
          {loading ? 'Searching...' : '🔍 Search Nearby'}
        </button>
      </div>

      {/* Results */}
      {searched && !loading && (
        <div className={styles.findResults}>
          {allProducts.length > 0 ? (
            <>
              <p className={styles.findResultCount}>
                {allProducts.length} product{allProducts.length !== 1 ? 's' : ''} found nearby
              </p>
              {allProducts.map((product: any) => (
                <div key={product.id} className={styles.findResultItem}>
                  <ProductListingCard
                    productId={product.id}
                    messageContent=""
                    currentUserId={userId}
                  />
                  {/* Show existing Buzz conversation for this product */}
                  {productMessages[product.id] && (
                    <div className={styles.findProductChat}>
                      <div className={styles.findChatLabel}>💬 Conversation</div>
                      <ChatMessage
                        message={productMessages[product.id]}
                        currentUserId={userId}
                        onDelete={() => {}}
                        onFlag={() => {}}
                      />
                    </div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <div className={styles.findEmpty}>
              <span className={styles.findEmptyIcon}>🌱</span>
              <h4 className={styles.findEmptyTitle}>No products found</h4>
              <p className={styles.findEmptyText}>
                No one nearby is currently selling &quot;{keywords}&quot;.
              </p>

              {/* Post "Looking for" message */}
              {!lookingForPosted ? (
                <button className={styles.findPostBtn} onClick={handlePostLookingFor}>
                  📣 Post &quot;Looking for {keywords}&quot; to Community
                </button>
              ) : (
                <p className={styles.findPostedConfirm}>✅ Posted to Community!</p>
              )}

              {/* Save watch for notifications */}
              {!watchSaved ? (
                <button className={styles.findWatchBtn} onClick={handleSaveWatch}>
                  🔔 Notify me when available (7 days)
                </button>
              ) : (
                <p className={styles.findPostedConfirm}>🔔 Watch saved — we&apos;ll notify you!</p>
              )}

              {/* USDA Farmers Market fallback */}
              {loadingUsda && (
                <div style={{ marginTop: 24, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                  🌾 Looking for nearby farmers markets…
                </div>
              )}
              {!loadingUsda && usdaMarkets.length > 0 && (
                <div style={{ marginTop: 28, paddingTop: 24, borderTop: '2px dashed #e5e7eb', textAlign: 'left', width: '100%' }}>
                  {/* Context banner */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: 'linear-gradient(135deg, #fefce8, #fef9c3)',
                    border: '1px solid #fde047', borderRadius: 12,
                    padding: '12px 16px', marginBottom: 16,
                  }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>🌾</span>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#854d0e' }}>
                        No neighbors selling &quot;{keywords}&quot; right now
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#a16207', lineHeight: 1.5 }}>
                        These USDA-registered Farmers Markets near you may carry it.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1f2937' }}>🏪 Nearby Farmers Markets</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#6b7280',
                      background: '#f3f4f6', borderRadius: 999, padding: '2px 8px',
                    }}>via USDA</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {usdaMarkets.map((market, i) => {
                      const distMiles = market.distance ? parseFloat(market.distance).toFixed(1) : null
                      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(market.location_address || `${market.listing_name} ${market.location_city} ${market.location_state}`)}`
                      const websiteUrl = market.media_website?.startsWith('http') ? market.media_website : market.media_website ? `https://${market.media_website}` : null
                      return (
                        <div key={i} style={{
                          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                          overflow: 'hidden', display: 'flex', boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                        }}>
                          <div style={{ width: 5, flexShrink: 0, background: 'linear-gradient(180deg, #f59e0b, #d97706)' }} />
                          <div style={{ flex: 1, padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>{market.listing_name}</span>
                              {distMiles && (
                                <span style={{
                                  fontSize: 11, fontWeight: 600, color: '#059669',
                                  background: '#ecfdf5', border: '1px solid #a7f3d0',
                                  borderRadius: 999, padding: '1px 7px',
                                }}>📍 {distMiles} mi away</span>
                              )}
                            </div>
                            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6b7280' }}>
                              {market.location_address || `${market.location_street || ''} ${market.location_city}, ${market.location_state}`}
                            </p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <a href={mapsUrl} target="_blank" rel="noreferrer" style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '6px 14px', borderRadius: 999,
                                background: '#1f2937', color: '#fff',
                                fontSize: 12, fontWeight: 600, textDecoration: 'none',
                              }}>🗺️ Directions</a>
                              {websiteUrl && (
                                <a href={websiteUrl} target="_blank" rel="noreferrer" style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  padding: '6px 14px', borderRadius: 999,
                                  background: '#fff', color: '#d97706',
                                  fontSize: 12, fontWeight: 600, textDecoration: 'none',
                                  border: '1px solid #fde68a',
                                }}>🌐 Website</a>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <NotificationPromptModal {...modalProps} />
    </div>
  )
}
