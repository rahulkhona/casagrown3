'use client'


import { useState, useEffect, useCallback , Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import { geocodeAddress } from '../../../lib/geocode'
import { formatUsd } from '../../../lib/store'
import { useMarketStatus } from '../../../lib/useMarketStatus'
import MarketClosedBox from '../../components/MarketClosedBox'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import styles from './page.module.css'

interface BoothResult {
  booth_id: string
  owner_id: string
  booth_name: string
  description: string | null
  decorative_theme: string
  header_image_url: string | null
  offers_delivery: boolean
  offers_pickup: boolean
  delivery_radius_miles: number
  pickup_address: string | null
  delivery_windows: any[]
  pickup_windows: any[]
  distance_miles: number
  product_count: number
  matched_products: any[]
  seller_avatar_url: string | null
  seller_avg_rating: number | null
}

const themeColors: Record<string, { border: string; gradient: string }> = {
  rustic:   { border: '#b45309', gradient: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
  tropical: { border: '#047857', gradient: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
  minimal:  { border: '#4b5563', gradient: 'linear-gradient(135deg, #f9fafb, #e5e7eb)' },
  floral:   { border: '#be185d', gradient: 'linear-gradient(135deg, #fce7f3, #fbcfe8)' },
  harvest:  { border: '#d97706', gradient: 'linear-gradient(135deg, #fffbeb, #fde68a)' },
  cottage:  { border: '#0369a1', gradient: 'linear-gradient(135deg, #e0f2fe, #bae6fd)' },
}

const categoryIcons: Record<string, string> = {
  produce: '🥬', baked: '🍞', preserved: '🫙', other: '📦',
}

function BrowseMarketPageInner() {
  const supabase = createClient()
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Restore from localStorage if URL has no params
  const saved = typeof window !== 'undefined' && !searchParams.has('lat')
    ? new URLSearchParams(localStorage.getItem('market_search') || '') : null

  const [address, setAddress] = useState(searchParams.get('addr') || saved?.get('addr') || '')
  const [lat, setLat] = useState<number | null>(searchParams.has('lat') ? parseFloat(searchParams.get('lat')!) : saved?.has('lat') ? parseFloat(saved.get('lat')!) : null)
  const [lng, setLng] = useState<number | null>(searchParams.has('lng') ? parseFloat(searchParams.get('lng')!) : saved?.has('lng') ? parseFloat(saved.get('lng')!) : null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [addressResolved, setAddressResolved] = useState(searchParams.has('lat') || (saved?.has('lat') ?? false))
  const [zipCode, setZipCode] = useState(searchParams.get('zip') || saved?.get('zip') || '')

  const [search, setSearch] = useState(searchParams.get('q') || saved?.get('q') || '')
  const [fulfillment, setFulfillment] = useState<'all' | 'delivery' | 'pickup'>((searchParams.get('ff') || saved?.get('ff') || 'all') as any)
  const [maxMiles, setMaxMiles] = useState(searchParams.has('mi') ? parseInt(searchParams.get('mi')!) : saved?.has('mi') ? parseInt(saved.get('mi')!) : 10)
  const [minPrice, setMinPrice] = useState(searchParams.get('pmin') || saved?.get('pmin') || '')
  const [maxPrice, setMaxPrice] = useState(searchParams.get('pmax') || saved?.get('pmax') || '')
  const [category, setCategory] = useState(searchParams.get('cat') || saved?.get('cat') || '')

  const [allowedCategories, setAllowedCategories] = useState<{ name: string }[]>([])
  const [booths, setBooths] = useState<BoothResult[]>([])
  const [loading, setLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [buyerStateCode, setBuyerStateCode] = useState<string | null>(null)

  // Product reminders (when market is closed)
  const [savedProductIds, setSavedProductIds] = useState<Set<string>>(new Set())
  const [reminderToast, setReminderToast] = useState<string | null>(null)

  // Market hours status
  const { isOpen: marketIsOpen, todaySchedule, nextOpenDate, loading: marketLoading } = useMarketStatus()

  // Sync state to URL and localStorage
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (address) params.set('addr', address)
    if (lat) params.set('lat', lat.toFixed(4))
    if (lng) params.set('lng', lng.toFixed(4))
    if (search) params.set('q', search)
    if (fulfillment !== 'all') params.set('ff', fulfillment)
    if (fulfillment === 'pickup' && maxMiles !== 10) params.set('mi', maxMiles.toString())
    if (zipCode) params.set('zip', zipCode)
    if (minPrice) params.set('pmin', minPrice)
    if (maxPrice) params.set('pmax', maxPrice)
    if (category) params.set('cat', category)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/market?${qs}` : '/market')
    // Persist to localStorage so Browse tab restores last search
    try { localStorage.setItem('market_search', qs) } catch {}
  }, [address, lat, lng, search, fulfillment, maxMiles, minPrice, maxPrice, category, zipCode])

  useEffect(() => { if (addressResolved) syncUrl() }, [syncUrl, addressResolved])

  // Load user's address from profile — only if no URL state
  useEffect(() => {
    if (searchParams.has('lat')) { setProfileLoading(false); return }
    if (!user) { setProfileLoading(false); return }
    supabase.from('profiles').select('street_address, city, state_code, zip_code')
      .eq('id', user.id).single()
      .then(async ({ data: profile }) => {
        if (profile?.state_code) setBuyerStateCode(profile.state_code)
        if (profile?.street_address) {
          const addr = [profile.street_address, profile.city, profile.state_code].filter(Boolean).join(', ')
          setAddress(addr)
          if (profile.zip_code) setZipCode(profile.zip_code)
          const geo = await geocodeAddress(addr)
          if (geo) { setLat(geo.lat); setLng(geo.lng); setAddressResolved(true) }
        }
        setProfileLoading(false)
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch allowed categories from DB when address resolves
  useEffect(() => {
    if (!addressResolved) return
    supabase.rpc('get_allowed_categories', { buyer_zip: zipCode || null })
      .then(({ data }) => { if (data) setAllowedCategories(data) })
  }, [addressResolved, zipCode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search booths
  const searchBooths = useCallback(async () => {
    if (!lat || !lng) return
    setLoading(true)
    const { data, error } = await supabase.rpc('nearby_booths', {
      user_lat: lat, user_lng: lng,
      max_miles: maxMiles,
      fulfillment_filter: fulfillment,
      product_search: search.trim() || null,
      min_price: minPrice ? parseFloat(minPrice) : null,
      max_price: maxPrice ? parseFloat(maxPrice) : null,
      category_filter: category || null,
      buyer_state_code: buyerStateCode,
    })
    if (error) console.error('Search error:', error.message)
    else setBooths(data || [])
    setLoading(false)
  }, [lat, lng, fulfillment, maxMiles, search, minPrice, maxPrice, category, buyerStateCode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (lat && lng && addressResolved) searchBooths() }, [lat, lng, fulfillment, maxMiles, category]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (!lat || !lng || !addressResolved) return
    const t = setTimeout(searchBooths, 500)
    return () => clearTimeout(t)
  }, [search, minPrice, maxPrice]) // eslint-disable-line react-hooks/exhaustive-deps

  // Two-tier polling:
  // 1. Lightweight refresh (30s + tab focus): just update prices/inventory for visible products
  // 2. Full spatial search (2 min): catch new/removed booths
  useEffect(() => {
    if (!lat || !lng || !addressResolved) return

    const refreshProducts = async () => {
      const productIds = booths.flatMap(b => b.matched_products.map((p: any) => p.id))
      if (productIds.length === 0) return
      const { data } = await supabase.rpc('refresh_product_data', { product_ids: productIds })
      if (!data) return
      const updates = new Map((data as any[]).map((d) => [d.id, d]))
      setBooths(prev => prev.map(b => ({
        ...b,
        matched_products: b.matched_products.map((p: any) => {
          const u = updates.get(p.id)
          return u ? { ...p, price_usd: u.price_usd, inventory: u.inventory, is_active: u.is_active } : p
        }).filter((p: any) => p.is_active),
      })))
    }

    const lightInterval = setInterval(refreshProducts, 30_000)
    const heavyInterval = setInterval(searchBooths, 120_000)
    const onFocus = () => { if (!document.hidden) refreshProducts() }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(lightInterval)
      clearInterval(heavyInterval)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [searchBooths, booths.length, addressResolved]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddressSubmit = async () => {
    if (!address.trim()) return
    setLocationLoading(true); setLocationError('')
    const geo = await geocodeAddress(address.trim())
    if (geo) {
      setLat(geo.lat); setLng(geo.lng)
      // Extract zip code from display name (e.g. "...San Jose, CA 95120, USA")
      const zipMatch = geo.display?.match(/\b(\d{5})\b/)
      if (zipMatch) setZipCode(zipMatch[1])
      setAddressResolved(true)
    } else {
      setLocationError('Could not find that address. Please include city and state.')
    }
    setLocationLoading(false)
  }

  const handleUseMyLocation = () => {
    if (!('geolocation' in navigator)) return
    setLocationLoading(true); setLocationError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude); setLng(pos.coords.longitude)
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
          const data = await res.json()
          if (data?.address) {
            const parts = [data.address.road, data.address.city || data.address.town || data.address.suburb, data.address.state].filter(Boolean)
            setAddress(parts.join(', '))
          }
        } catch { /* ignore */ }
        setAddressResolved(true); setLocationLoading(false)
      },
      () => { setLocationError('Location access denied. Please type your address.'); setLocationLoading(false) },
      { timeout: 5000 }
    )
  }

  const handleChangeAddress = () => {
    setAddressResolved(false); setBooths([])
  }

  // Load existing product reminders
  useEffect(() => {
    if (!user) return
    supabase.from('product_reminders').select('product_id').eq('user_id', user.id)
      .then(({ data }) => {
        if (data) setSavedProductIds(new Set(data.map(r => r.product_id)))
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProductReminder = async (productId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) { router.push(`/login?redirect=/market`); return }
    // Gate behind profile completion
    const supabaseClient = createClient()
    const { data: profile } = await supabaseClient.from('profiles').select('profile_completed_at').eq('id', user.id).single()
    if (!profile?.profile_completed_at) { router.push('/profile-setup'); return }
    const isSaved = savedProductIds.has(productId)
    if (isSaved) {
      await supabase.from('product_reminders').delete().eq('user_id', user.id).eq('product_id', productId)
      setSavedProductIds(prev => { const next = new Set(prev); next.delete(productId); return next })
      setReminderToast('Reminder removed')
    } else {
      await supabase.from('product_reminders').upsert({ user_id: user.id, product_id: productId }, { onConflict: 'user_id,product_id', ignoreDuplicates: true })
      setSavedProductIds(prev => new Set(prev).add(productId))
      setReminderToast('🔔 Saved! We\'ll remind you when market opens')
    }
    setTimeout(() => setReminderToast(null), 3000)
  }

  const isSearching = !!search.trim()
  const totalProducts = booths.reduce((sum, b) => sum + (b.matched_products?.length || 0), 0)

  // ── STATE 1: Loading profile or market status ──
  if (profileLoading || marketLoading) {
    return (
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  // ── STATE 1.5: Market is closed — full-page takeover ──
  if (!marketIsOpen) {
    return <MarketClosedBox nextOpenDate={nextOpenDate} todaySchedule={todaySchedule} />
  }

  // ── STATE 2: Need address ──
  if (!addressResolved) {
    return (
      <div className="container">
        <div className={styles.addressPrompt}>
          <h2 className={styles.promptTitle}>Where should we look?</h2>
          <p className={styles.promptText}>Tell us where you are and we'll show you fresh produce available for delivery or pickup nearby.</p>

          <div className={styles.addressForm}>
            <div className={styles.addressRow}>
              <input
                className="input"
                placeholder="e.g. 123 Main St, San Jose, CA"
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddressSubmit()}
                autoFocus
              />
              <button className="btn btn-primary" onClick={handleAddressSubmit}
                disabled={locationLoading || !address.trim()}>
                {locationLoading ? 'Finding...' : 'Find Produce'}
              </button>
            </div>
            <div className={styles.geoRow}>
              <button className={styles.geoLink} onClick={handleUseMyLocation} disabled={locationLoading}>
                📍 Use My Location
              </button>
            </div>
          </div>
          {locationError && <p className="form-error" style={{ marginTop: 8 }}>{locationError}</p>}
        </div>
      </div>
    )
  }

  // ── STATE 3: Address resolved — show results ──
  return (
    <div className="container">
      {/* Address bar + change */}
      <div className={styles.addressBar}>
        <span className={styles.addressLabel}>📍 {address || 'Your location'}</span>
        <button className="btn btn-xs btn-ghost" onClick={handleChangeAddress}>Change</button>
      </div>

      {/* Search + Filters */}
      <div className={styles.searchSection}>
        <input
          className="input"
          placeholder="Search products... (tomatoes, basil, honey)"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className={styles.filterRow}>
          <div className={styles.pills}>
            {(['all', 'delivery', 'pickup'] as const).map(f => (
              <button key={f}
                className={`${styles.pill} ${fulfillment === f ? styles.pillActive : ''}`}
                onClick={() => setFulfillment(f)}>
                {f === 'all' ? 'All' : f === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}
              </button>
            ))}
          </div>
          <div className={styles.rangeWrap}>
            <span className={styles.rangeLabel}>Within {maxMiles} mi</span>
            <input type="range" min={1} max={25} value={maxMiles}
              onChange={e => setMaxMiles(parseInt(e.target.value))} className={styles.slider} />
          </div>
          <select className={styles.categorySelect} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {allowedCategories.map(c => (
              <option key={c.name} value={c.name}>
                {c.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
          <div className={styles.priceWrap}>
            <span className={styles.priceLabel}>Price:</span>
            <input className={styles.priceInput} type="number" placeholder="Min" min="0" step="0.50"
              value={minPrice} onChange={e => setMinPrice(e.target.value)} />
            <span style={{ color: 'var(--gray-400)' }}>–</span>
            <input className={styles.priceInput} type="number" placeholder="Max" min="0" step="0.50"
              value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Status */}
      {!loading && booths.length > 0 && (
        <p className={styles.statusText}>
          {isSearching
            ? `${totalProducts} result${totalProducts !== 1 ? 's' : ''} for "${search}" across ${booths.length} booth${booths.length !== 1 ? 's' : ''}`
            : `${booths.length} booth${booths.length !== 1 ? 's' : ''} near you`}
        </p>
      )}

      {/* Results */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '20vh' }}>
          <LoadingSpinner />
        </div>
      ) : booths.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🌱</div>
          <div className="empty-state-title">{isSearching ? `No results for "${search}"` : 'No booths found'}</div>
          <div className="empty-state-text">{isSearching ? 'Try a different product name' : 'Try increasing distance or changing your address'}</div>
        </div>
      ) : (
        <div className={styles.boothGrid}>
          {booths.map(booth => {
            const theme = themeColors[booth.decorative_theme] || themeColors.minimal
            const products = booth.matched_products || []
            return (
              <div key={booth.booth_id} className="card">
                {/* Header → booth page */}
                <Link href={`/market/booth/${booth.booth_id}`} className={styles.cardHeaderLink}>
                  <div className={styles.cardHeader} style={{
                    background: booth.header_image_url ? `url(${booth.header_image_url}) center/cover` : theme.gradient,
                    borderBottom: `3px solid ${theme.border}`,
                  }}>
                    {booth.header_image_url && <div className={styles.headerOverlay} />}
                    <div className={styles.headerContent}>
                      <h3 className={styles.cardTitle} style={{ color: booth.header_image_url ? '#fff' : theme.border }}>
                        {booth.booth_name}
                      </h3>
                      <div className={styles.cardMeta}>
                        <span className="badge badge-green" style={{ fontSize: 11 }}>{booth.distance_miles} mi</span>
                        <span style={{ color: 'var(--gray-400)' }}>·</span>
                        <span>{booth.product_count} items</span>
                      </div>
                    </div>
                    {/* Seller avatar */}
                    <div className={styles.sellerBadge}>
                      <div className={styles.sellerAvatar}>
                        {booth.seller_avatar_url
                          ? <img src={booth.seller_avatar_url} alt="" />
                          : <span>{booth.booth_name.charAt(0)}</span>
                        }
                      </div>
                      {booth.seller_avg_rating && (
                        <span className={styles.sellerRating}>⭐ {booth.seller_avg_rating}</span>
                      )}
                    </div>
                  </div>
                </Link>

                {/* Body */}
                <div className={styles.cardBody}>
                  {booth.description && <p className={styles.cardDesc}>{booth.description}</p>}

                  <div className={styles.tagRow}>
                    {booth.offers_delivery && (
                      <span className="badge badge-green">🚗 Delivers {booth.delivery_radius_miles}mi</span>
                    )}
                    {booth.offers_pickup && (
                      <span className="badge badge-blue">📍 Pickup</span>
                    )}
                  </div>

                  {products.length > 0 && (
                    <div className={styles.productList}>
                      {products.slice(0, isSearching ? 6 : 4).map((p: any) => (
                        <div key={p.id} style={{ position: 'relative' }}>
                          <Link href={`/market/booth/${booth.booth_id}/product/${p.id}`} className={styles.productCard}>
                            <div className={styles.productThumb}>
                              {p.photo ? <img src={p.photo} alt={p.name} /> : <span>{categoryIcons[p.category] || '📦'}</span>}
                            </div>
                            <div className={styles.productInfo}>
                              <span className={styles.productName}>{p.name}</span>
                              <div className={styles.productMeta}>
                                <span className={styles.productPrice}>{formatUsd(p.price_usd)}<span className={styles.unit}>/{p.unit}</span></span>
                                <span className={styles.qty}>{p.inventory > 0 ? `${p.inventory} avail` : 'Sold out'}</span>
                              </div>
                            </div>
                          </Link>
                          {!marketIsOpen && (
                            <button
                              onClick={(e) => toggleProductReminder(p.id, e)}
                              title={savedProductIds.has(p.id) ? 'Remove reminder' : 'Remind me when market opens'}
                              className={styles.remindBtn}
                              style={{
                                position: 'absolute', top: 4, right: 4,
                                background: savedProductIds.has(p.id) ? 'var(--green-100, #dcfce7)' : 'rgba(255,255,255,0.9)',
                                border: savedProductIds.has(p.id) ? '1px solid var(--green-300, #86efac)' : '1px solid var(--gray-200, #e5e7eb)',
                                borderRadius: 20, padding: '2px 8px', fontSize: 11,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                                color: savedProductIds.has(p.id) ? 'var(--green-700, #15803d)' : 'var(--gray-600)',
                                zIndex: 2, transition: 'all 0.2s',
                              }}
                            >
                              🔔 {savedProductIds.has(p.id) ? 'Saved' : 'Remind Me'}
                            </button>
                          )}
                        </div>
                      ))}
                      {products.length > (isSearching ? 6 : 4) && (
                        <Link href={`/market/booth/${booth.booth_id}`} className={styles.moreCard}>+{products.length - (isSearching ? 6 : 4)}</Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Reminder toast */}
      {reminderToast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--gray-900, #111)', color: '#fff', padding: '10px 20px',
          borderRadius: 24, fontSize: 14, zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          animation: 'fadeInUp 0.3s ease',
        }}>
          {reminderToast}
        </div>
      )}
    </div>
  )
}

export default function BrowseMarketPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <BrowseMarketPageInner />
    </Suspense>
  )
}
