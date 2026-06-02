'use client'

import { useState, useEffect, KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../lib/useAuth'
import { createClient } from '../../../../lib/supabase'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import AddressInput from '../../../components/AddressInput'
import { type AddressFields, EMPTY_ADDRESS, formatFullAddress, toGeocodingString } from '../../../../lib/address'
import { geocodeAddress, toPostgisPoint } from '../../../../lib/geocode'

import styles from './page.module.css'

const DAY_KEYS = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
]

const TIME_WINDOWS = [
  { id: '8-10', label: '8–10a' },
  { id: '10-12', label: '10–12p' },
  { id: '12-14', label: '12–2p' },
  { id: '14-16', label: '2–4p' },
  { id: '16-18', label: '4–6p' },
  { id: '18-20', label: '6–8p' },
]

type WeeklyWindows = Record<string, string[]>

function WindowSelector({ value, onChange }: { value: WeeklyWindows; onChange: (v: WeeklyWindows) => void }) {
  const [customStart, setCustomStart] = useState('17:00')
  const [customEnd, setCustomEnd] = useState('19:00')
  const [showCustomFor, setShowCustomFor] = useState<string | null>(null)

  const toggleDay = (dayId: string) => {
    const next = { ...value }
    if (next[dayId]) { delete next[dayId] } else { next[dayId] = ['10-12', '16-18'] }
    onChange(next)
  }

  const toggleWindow = (dayId: string, winId: string) => {
    const next = { ...value }
    if (!next[dayId]) next[dayId] = []
    if (next[dayId].includes(winId)) {
      next[dayId] = next[dayId].filter(id => id !== winId)
      if (next[dayId].length === 0) delete next[dayId]
    } else {
      next[dayId].push(winId)
    }
    onChange(next)
  }

  const addCustomWindow = (dayId: string) => {
    if (!customStart || !customEnd) return
    const next = { ...value }
    if (!next[dayId]) next[dayId] = []
    next[dayId].push(`custom-${customStart}-${customEnd}`)
    onChange(next)
    setShowCustomFor(null)
  }

  const selectedDays = Object.keys(value)

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {DAY_KEYS.map(d => (
          <button key={d.id} type="button" onClick={() => toggleDay(d.id)} style={{
            padding: '6px 12px', borderRadius: 16, fontSize: 13, fontWeight: 600,
            border: value[d.id] ? 'none' : '1px solid #d1d5db',
            background: value[d.id] ? '#16a34a' : 'white',
            color: value[d.id] ? 'white' : '#4b5563', cursor: 'pointer'
          }}>
            {value[d.id] ? '✅ ' : ''}{d.label}
          </button>
        ))}
      </div>
      {selectedDays.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {selectedDays.map(dayId => {
            const dayLabel = DAY_KEYS.find(d => d.id === dayId)?.label
            if (!dayLabel) return null
            const dayWindows = value[dayId] || []
            const customWindows = dayWindows.filter(id => id.startsWith('custom-'))
            return (
              <div key={dayId} style={{ background: '#f9fafb', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, width: 40, paddingTop: 4, color: '#374151' }}>{dayLabel}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {TIME_WINDOWS.map(w => (
                        <button key={w.id} type="button" onClick={() => toggleWindow(dayId, w.id)} style={{
                          padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                          border: dayWindows.includes(w.id) ? 'none' : '1px solid #d1d5db',
                          background: dayWindows.includes(w.id) ? '#dcfce7' : 'white',
                          color: dayWindows.includes(w.id) ? '#15803d' : '#6b7280', cursor: 'pointer'
                        }}>
                          {w.label}
                        </button>
                      ))}
                    </div>
                    {customWindows.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {customWindows.map(cwId => {
                          const parts = cwId.replace('custom-', '').split('-')
                          return (
                            <div key={cwId} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                              <span style={{ color: '#4b5563' }}>{parts[0]} – {parts[1]}</span>
                              <button type="button" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                                onClick={() => toggleWindow(dayId, cwId)}>×</button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {showCustomFor === dayId ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                        <input type="time" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4 }} />
                        <span style={{ fontSize: 12 }}>to</span>
                        <input type="time" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4 }} />
                        <button type="button" style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                          onClick={() => addCustomWindow(dayId)}>Add</button>
                        <button type="button" style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                          onClick={() => setShowCustomFor(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" style={{ fontSize: 12, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8, padding: 0, fontWeight: 600 }}
                        onClick={() => setShowCustomFor(dayId)}>+ Custom slot</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface ExistingStand {
  id: string
  name: string
  offers_pickup: boolean
  offers_delivery: boolean
  delivery_radius_miles: number | null
  pickup_address: string | null
  delivery_zipcodes: string[] | null
}

export default function NewStandPage() {
  const { user, loading: authLoading, isAuthenticated, isPro } = useAuth()
  const supabase = createClient()
  const router = useRouter()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [boothAddress, setBoothAddress] = useState<AddressFields>(EMPTY_ADDRESS)
  const [pickupAddress, setPickupAddress] = useState<AddressFields>(EMPTY_ADDRESS)
  const [offersPickup, setOffersPickup] = useState(true)
  const [offersDelivery, setOffersDelivery] = useState(true)
  const [deliveryRadius, setDeliveryRadius] = useState(5)
  const [deliveryZipcodes, setDeliveryZipcodes] = useState<string[]>([])
  const [zipInput, setZipInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weeklyPickupWindows, setWeeklyPickupWindows] = useState<WeeklyWindows>({})
  const [weeklyDeliveryWindows, setWeeklyDeliveryWindows] = useState<WeeklyWindows>({})

  // Platform sync
  const [hasFbConnection, setHasFbConnection] = useState(false)
  const [fbConnectionId, setFbConnectionId] = useState<string | null>(null)
  const [fbSyncEnabled, setFbSyncEnabled] = useState(true)
  const [hasIgConnection, setHasIgConnection] = useState(false)
  const [igSyncEnabled, setIgSyncEnabled] = useState(true)
  const [hasWaConnection, setHasWaConnection] = useState(false)
  const [waSyncEnabled, setWaSyncEnabled] = useState(true)
  const [hasGoogleConnection, setHasGoogleConnection] = useState(false)
  const [googleSyncEnabled, setGoogleSyncEnabled] = useState(true)
  const [isElite, setIsElite] = useState(false)

  // Copy defaults from existing stand
  const [existingStands, setExistingStands] = useState<ExistingStand[]>([])
  const [copyFromId, setCopyFromId] = useState('')

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login?redirect=/my-stands/new')
    }
  }, [authLoading, isAuthenticated, router])

  // Creating additional booths is Pro-only
  useEffect(() => {
    if (!authLoading && user && !isPro) {
      router.replace('/my-stands')
    }
  }, [authLoading, user, isPro, router])

  // Load existing stands + profile address
  useEffect(() => {
    if (authLoading || !user) return
    const load = async () => {
      const [{ data: booths }, { data: profile }] = await Promise.all([
        supabase
          .from('market_booths')
          .select('id, name, offers_pickup, offers_delivery, delivery_radius_miles, pickup_address, delivery_zipcodes')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('street_address, city, state_code, zip_code')
          .eq('id', user.id)
          .single(),
      ])

      if (booths && booths.length > 0) {
        setExistingStands(booths.map((b: any) => ({
          id: b.id,
          name: b.name || 'Unnamed Booth',
          offers_pickup: b.offers_pickup ?? false,
          offers_delivery: b.offers_delivery ?? false,
          delivery_radius_miles: b.delivery_radius_miles,
          pickup_address: b.pickup_address,
          delivery_zipcodes: b.delivery_zipcodes || [],
        })))
      }

      // Default booth address from profile
      if (!boothAddress.street && profile?.street_address) {
        let street = profile.street_address || ''
        let city = profile.city || ''
        let state = profile.state_code || ''
        let zip = profile.zip_code || ''

        // Parse from full address if separate fields are empty
        if ((!city || !state) && street.includes(',')) {
          const parts = street.split(',').map((s: string) => s.trim())
          if (parts.length >= 3) {
            const stateZip = parts[parts.length - 1].split(/\s+/)
            street = parts.slice(0, -2).join(', ')
            city = city || parts[parts.length - 2]
            state = state || stateZip[0] || ''
            zip = zip || stateZip.slice(1).join('') || ''
          } else if (parts.length === 2) {
            street = parts[0]
            city = city || parts[1]
          }
        }

        setBoothAddress({ street, city, state, zip })
      }
    }
    load()

    // Load platform connections
    supabase
      .from('seller_fb_connections')
      .select('id, status, auto_sync_enabled, ig_business_account_id, ig_messenger_enabled, wa_display_phone')
      .eq('user_id', user.id)
      .single()
      .then(({ data: conn }: { data: any }) => {
        if (conn && conn.status === 'connected') {
          if (conn.auto_sync_enabled) {
            setHasFbConnection(true)
            setFbConnectionId(conn.id)
          }
          if (conn.ig_business_account_id && conn.ig_messenger_enabled) setHasIgConnection(true)
          if (conn.wa_display_phone) setHasWaConnection(true)
        }
      })
    supabase
      .from('seller_google_connections')
      .select('auto_sync_catalog')
      .eq('user_id', user.id)
      .single()
      .then(({ data: gConn }: { data: any }) => {
        if (gConn?.auto_sync_catalog) setHasGoogleConnection(true)
      })
    supabase
      .from('seller_subscriptions')
      .select('plan')
      .eq('user_id', user.id)
      .single()
      .then(({ data: sub }: { data: any }) => {
        if (sub?.plan === 'elite') setIsElite(true)
      })
  }, [user?.id, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopyFrom = (standId: string) => {
    setCopyFromId(standId)
    const source = existingStands.find(s => s.id === standId)
    if (!source) return
    setOffersPickup(source.offers_pickup)
    setOffersDelivery(source.offers_delivery)
    setDeliveryRadius(source.delivery_radius_miles || 5)
    if (source.pickup_address) {
      // Parse legacy string from existing stand
      const pa = source.pickup_address
      const parts = pa.split(',').map((s: string) => s.trim())
      if (parts.length >= 3) {
        const sz = parts[parts.length - 1].split(/\s+/)
        setPickupAddress({ street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], state: sz[0] || '', zip: sz.slice(1).join(' ') })
      } else if (parts.length === 2) {
        setPickupAddress({ street: parts[0], city: parts[1], state: '', zip: '' })
      } else {
        setPickupAddress({ street: pa, city: '', state: '', zip: '' })
      }
    }
    if (source.delivery_zipcodes) setDeliveryZipcodes(source.delivery_zipcodes)
  }

  const handleAddZip = () => {
    const cleaned = zipInput.trim()
    if (cleaned && /^\d{5}$/.test(cleaned) && !deliveryZipcodes.includes(cleaned)) {
      setDeliveryZipcodes([...deliveryZipcodes, cleaned])
    }
    setZipInput('')
  }

  const handleZipKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddZip()
    }
  }

  const handleSubmit = async () => {
    if (!name.trim() || !user) return
    setError(null)
    setSaving(true)

    try {
      // Validate
      const issues: string[] = []
      if (!offersDelivery && !offersPickup) {
        issues.push('Enable at least one fulfillment option')
      }
      if (!toGeocodingString(boothAddress)) {
        issues.push('Enter a booth address')
      }
      if (offersPickup && Object.keys(weeklyPickupWindows).length === 0) {
        issues.push('Set at least one pickup window')
      }
      if (offersDelivery && Object.keys(weeklyDeliveryWindows).length === 0) {
        issues.push('Set at least one delivery window')
      }
      if (issues.length > 0) {
        setError('⚠️ ' + issues.join('\n• '))
        setSaving(false)
        return
      }

      const boothStr = formatFullAddress(boothAddress)
      const pickupStr = offersPickup && toGeocodingString(pickupAddress) ? formatFullAddress(pickupAddress) : null
      const dbRow: Record<string, any> = {
        owner_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        status: 'published',
        offers_pickup: offersPickup,
        offers_delivery: offersDelivery,
        delivery_radius_miles: deliveryRadius,
        booth_address: boothStr || null,
        booth_street: boothAddress.street || null,
        booth_city: boothAddress.city || null,
        booth_state: boothAddress.state || null,
        booth_zip: boothAddress.zip || null,
        pickup_address: pickupStr || boothStr || null,
        pickup_street: offersPickup ? (pickupAddress.street || boothAddress.street || null) : null,
        pickup_city: offersPickup ? (pickupAddress.city || boothAddress.city || null) : null,
        pickup_state: offersPickup ? (pickupAddress.state || boothAddress.state || null) : null,
        pickup_zip: offersPickup ? (pickupAddress.zip || boothAddress.zip || null) : null,
        delivery_zipcodes: deliveryZipcodes.length > 0 ? deliveryZipcodes : null,
        weekly_pickup_windows: offersPickup && Object.keys(weeklyPickupWindows).length > 0 ? weeklyPickupWindows : null,
        weekly_delivery_windows: offersDelivery && Object.keys(weeklyDeliveryWindows).length > 0 ? weeklyDeliveryWindows : null,
      }

      // Geocode booth address for booth_location
      if (boothStr) {
        const geo = await geocodeAddress(boothStr)
        if (geo) {
          dbRow.booth_location = toPostgisPoint(geo.lat, geo.lng)
          // Default pickup_location to booth_location
          dbRow.pickup_location = toPostgisPoint(geo.lat, geo.lng)
        }
      }
      // If pickup address is different, geocode it separately
      if (pickupStr && pickupStr !== boothStr) {
        const geo = await geocodeAddress(pickupStr)
        if (geo) {
          dbRow.pickup_location = toPostgisPoint(geo.lat, geo.lng)
        }
      }

      const { data, error: insertError } = await supabase
        .from('market_booths')
        .insert(dbRow)
        .select()
        .single()

      if (insertError) {
        setError('Failed to create stand: ' + insertError.message)
        setSaving(false)
        return
      }

      // Save platform sync toggles
      if (hasFbConnection && fbConnectionId && fbSyncEnabled) {
        await supabase.from('booth_fb_catalogs').upsert({
          booth_id: data.id,
          connection_id: fbConnectionId,
          sync_enabled: fbSyncEnabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'booth_id' }).then(() => {})
      }

      router.push(`/my-stands/${data.id}`)
    } catch (err: any) {
      setError('Failed to create stand: ' + (err.message || 'Unknown error'))
      setSaving(false)
    }
  }

  if (authLoading || !isAuthenticated) {
    return <LoadingSpinner />
  }

  return (
    <div className={styles.page}>
      {/* Back navigation */}
      <Link href="/my-stands" className={styles.backNav}>
        ← Back to My Booths
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>Create New Booth</h1>
        <p className={styles.subtitle}>
          Set up a new booth for a different location or specialty
        </p>
      </div>

      {/* Copy from existing */}
      {existingStands.length > 0 && (
        <div className={styles.copyFromSection}>
          <span className={styles.copyFromLabel}>💡 Copy from:</span>
          <select
            className={styles.copyFromSelect}
            value={copyFromId}
            onChange={e => handleCopyFrom(e.target.value)}
          >
            <option value="">Start fresh</option>
            {existingStands.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Basic Info */}
      <div className={styles.formSection}>
        <h2 className={styles.sectionTitle}>🏪 Basic Info</h2>

        <div className={styles.formGroup}>
          <label className={styles.label}>Booth Name *</label>
          <input
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. My Backyard Garden, Downtown Booth"
            maxLength={60}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>
            Description <span className={styles.labelHint}>(optional)</span>
          </label>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What kind of produce do you grow? Tell shoppers about your stand..."
            maxLength={300}
          />
        </div>
      </div>

      {/* Fulfillment */}
      <div className={styles.formSection}>
        <h2 className={styles.sectionTitle}>🚗 Fulfillment</h2>

        {/* ── Booth Address (Base Location) ── */}
        <div className={styles.formGroup} style={{ marginBottom: 20 }}>
          <label className={styles.label}>🏠 Booth Address *</label>
          <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '2px 0 8px' }}>
            Your base address — delivery radius is computed from here.
          </p>
          <AddressInput
            value={boothAddress}
            onChange={(val: AddressFields) => setBoothAddress(val)}
            placeholderStreet="e.g. 123 Oak Street"
          />
        </div>

        {/* ── Delivery Card ── */}
        <div style={{
          border: `2px solid ${offersDelivery ? '#22c55e' : '#e5e7eb'}`,
          borderRadius: 12,
          background: offersDelivery ? '#f0fdf4' : '#fff',
          overflow: 'hidden',
          transition: 'all 0.15s',
          marginBottom: 16,
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }}
            onClick={() => { if (offersDelivery && !offersPickup) return; setOffersDelivery(!offersDelivery) }}
          >
            <span style={{ fontSize: 28 }}>🚗</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: offersDelivery ? '#15803d' : '#374151' }}>I&apos;ll Deliver</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Drop off at buyer&apos;s door</div>
            </div>
            <input type="checkbox" checked={offersDelivery} readOnly style={{ width: 20, height: 20, accentColor: '#16a34a', pointerEvents: 'none' }} />
          </div>

          {offersDelivery && (
            <div style={{ padding: '0 20px 20px', borderTop: '1px solid #bbf7d0' }}>
              <div style={{ marginTop: 16 }}>
                <label className={styles.label}>🚗 Delivery Radius</label>
                <div className={styles.sliderWrap}>
                  <input
                    className={styles.slider}
                    type="range" min="1" max="25"
                    value={deliveryRadius}
                    onChange={e => setDeliveryRadius(parseInt(e.target.value))}
                  />
                  <span className={styles.sliderValue}>{deliveryRadius} mi</span>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label className={styles.label}>📭 Delivery Zip Codes <span className={styles.labelHint}>(optional)</span></label>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 8px' }}>
                  Orders from these zip codes are always eligible, regardless of distance.
                </p>
                <div className={styles.tagsWrap}>
                  {deliveryZipcodes.map(zip => (
                    <span key={zip} className={styles.tag}>
                      {zip}
                      <button className={styles.tagRemove} onClick={() => setDeliveryZipcodes(zips => zips.filter(z => z !== zip))}>×</button>
                    </span>
                  ))}
                  <input
                    className={styles.tagInput}
                    value={zipInput}
                    onChange={e => setZipInput(e.target.value)}
                    onKeyDown={handleZipKeyDown}
                    onBlur={handleAddZip}
                    placeholder={deliveryZipcodes.length === 0 ? 'e.g. 97201 (Press Enter)' : 'Add zip...'}
                    maxLength={5}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #bbf7d0' }}>
                <label className={styles.label}>📅 Delivery Windows <span className={styles.labelHint}>(select days & time slots)</span></label>
                <WindowSelector value={weeklyDeliveryWindows} onChange={setWeeklyDeliveryWindows} />
              </div>
            </div>
          )}
        </div>

        {/* ── Pickup Card ── */}
        <div style={{
          border: `2px solid ${offersPickup ? '#22c55e' : '#e5e7eb'}`,
          borderRadius: 12,
          background: offersPickup ? '#f0fdf4' : '#fff',
          overflow: 'hidden',
          transition: 'all 0.15s',
          marginBottom: 16,
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }}
            onClick={() => { if (offersPickup && !offersDelivery) return; setOffersPickup(!offersPickup) }}
          >
            <span style={{ fontSize: 28 }}>📍</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: offersPickup ? '#15803d' : '#374151' }}>Pickup Available</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Buyers pick up from you</div>
            </div>
            <input type="checkbox" checked={offersPickup} readOnly style={{ width: 20, height: 20, accentColor: '#16a34a', pointerEvents: 'none' }} />
          </div>

          {offersPickup && (
            <div style={{ padding: '0 20px 20px', borderTop: '1px solid #bbf7d0' }}>
              <div style={{ marginTop: 16 }}>
                <label className={styles.label}>📍 Pickup Address <span className={styles.labelHint}>(optional)</span></label>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>Leave blank to use your booth address above.</p>
                <AddressInput
                  value={pickupAddress}
                  onChange={(val: AddressFields) => setPickupAddress(val)}
                  placeholderStreet="e.g. Corner of Oak & Main"
                />
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #bbf7d0' }}>
                <label className={styles.label}>📅 Pickup Windows <span className={styles.labelHint}>(select days & time slots)</span></label>
                <WindowSelector value={weeklyPickupWindows} onChange={setWeeklyPickupWindows} />
              </div>
            </div>
          )}
        </div>
        {/* ── Platform Inventory Sync ── */}
        {(isPro) && (hasFbConnection || (isElite && (hasIgConnection || hasWaConnection || hasGoogleConnection))) && (
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '16px 20px',
            background: '#f9fafb',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 4 }}>📡 Inventory Sync for this Booth</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>Choose which platforms sync listings from this booth.</div>

            {hasFbConnection && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 20 }}>📘</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Facebook Shop</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Sync listings to your Facebook catalog</div>
                </div>
                <button type="button" role="switch" aria-checked={fbSyncEnabled} onClick={() => setFbSyncEnabled(!fbSyncEnabled)}
                  style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', background: fbSyncEnabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', transition: 'background 0.2s', padding: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: fbSyncEnabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                </button>
              </div>
            )}

            {isElite && hasIgConnection && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 20 }}>📸</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Instagram Shop</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Sync listings to your Instagram catalog</div>
                </div>
                <button type="button" role="switch" aria-checked={igSyncEnabled} onClick={() => setIgSyncEnabled(!igSyncEnabled)}
                  style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', background: igSyncEnabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', transition: 'background 0.2s', padding: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: igSyncEnabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                </button>
              </div>
            )}

            {isElite && hasWaConnection && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 20 }}>📱</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>WhatsApp Catalog</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Include this booth&apos;s listings in WhatsApp</div>
                </div>
                <button type="button" role="switch" aria-checked={waSyncEnabled} onClick={() => setWaSyncEnabled(!waSyncEnabled)}
                  style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', background: waSyncEnabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', transition: 'background 0.2s', padding: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: waSyncEnabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                </button>
              </div>
            )}

            {isElite && hasGoogleConnection && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                <span style={{ fontSize: 20 }}>📍</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Google Business</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Sync to your Google Business Profile</div>
                </div>
                <button type="button" role="switch" aria-checked={googleSyncEnabled} onClick={() => setGoogleSyncEnabled(!googleSyncEnabled)}
                  style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', background: googleSyncEnabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', transition: 'background 0.2s', padding: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: googleSyncEnabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className={styles.error}>{error}</div>
      )}

      {/* Submit */}
      <button
        className={styles.submitBtn}
        onClick={handleSubmit}
        disabled={saving || !name.trim()}
      >
        {saving ? '🌱 Creating Booth...' : '🌱 Create Booth'}
      </button>
    </div>
  )
}
