'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { geocodeAddress } from '../../../../lib/geocode'
import { useNotificationPrompt } from '../../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../../../components/NotificationPromptModal'
import { useErrorToast } from '../../../components/ErrorToast'
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
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [keywords, setKeywords] = useState('')
  const [fulfillment, setFulfillment] = useState<'all' | 'delivery' | 'pickup'>('all')
  const [radius, setRadius] = useState(10)
  const [buyerStateCode, setBuyerStateCode] = useState<string | null>(null)
  const [addressResolved, setAddressResolved] = useState(false)

  // ── Results state ──
  const [results, setResults] = useState<BoothResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

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
        if (parsed.address) setAddress(parsed.address)
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
          const addr = [profile.street_address, profile.city, profile.state_code].filter(Boolean).join(', ')
          setAddress(addr)
          if (profile.state_code) setBuyerStateCode(profile.state_code)
          const geo = await geocodeAddress(addr)
          if (geo) { setLat(geo.lat); setLng(geo.lng); setAddressResolved(true) }
        }
      })
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save search to localStorage ──
  const saveToLocalStorage = useCallback(() => {
    try {
      localStorage.setItem('buzz_find_last', JSON.stringify({
        address, lat, lng, keywords, fulfillment, radius, stateCode: buyerStateCode,
      }))
    } catch {}
  }, [address, lat, lng, keywords, fulfillment, radius, buyerStateCode])

  // ── Handle address change ──
  const handleAddressResolve = async () => {
    if (!address.trim()) return
    const geo = await geocodeAddress(address.trim())
    if (geo) {
      setLat(geo.lat); setLng(geo.lng); setAddressResolved(true)
      // Extract state code from the address string (e.g. "123 Main St, San Jose, CA")
      const stateMatch = address.match(/,\s*([A-Z]{2})\b/)
      if (stateMatch) setBuyerStateCode(stateMatch[1])
    } else {
      showError('Could not find that address. Please include city and state.')
    }
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
    let addrLabel = address ? address.replace(/^[\d-]+\s*/, '') : 'my area'
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
          <label className={styles.findLabel}>📍 Location</label>
          <div className={styles.findAddressRow}>
            <input
              className={styles.findInput}
              placeholder="Your address..."
              value={address}
              onChange={e => { setAddress(e.target.value); setAddressResolved(false) }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddressResolve() } }}
            />
            {!addressResolved && address.trim() && (
              <button className={styles.findResolveBtn} onClick={handleAddressResolve}>✓</button>
            )}
            {addressResolved && (
              <span className={styles.findResolvedBadge}>✅</span>
            )}
          </div>
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
                No one nearby is currently selling "{keywords}".
              </p>

              {/* Post "Looking for" message */}
              {!lookingForPosted ? (
                <button className={styles.findPostBtn} onClick={handlePostLookingFor}>
                  📣 Post "Looking for {keywords}" to Community
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
                <p className={styles.findPostedConfirm}>🔔 Watch saved — we'll notify you!</p>
              )}
            </div>
          )}
        </div>
      )}

      <NotificationPromptModal {...modalProps} />
    </div>
  )
}
