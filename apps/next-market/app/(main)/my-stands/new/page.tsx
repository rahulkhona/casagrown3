'use client'

import { useState, useEffect, KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../lib/useAuth'
import { useSubscription } from '../../../../lib/useSubscription'
import { createClient } from '../../../../lib/supabase'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import AddressInput from '../../../components/AddressInput'
import { type AddressFields, EMPTY_ADDRESS, formatFullAddress, toGeocodingString, normalizeStateCode } from '../../../../lib/address'
import { resolveActiveCitySchedule, formatMarketDaySummary, type CityMarketSchedule } from '../../../../lib/marketCitySchedules'
import { FULFILLMENT_PRESET_OPTIONS, type FulfillmentPresetType } from '../../../../lib/bulkListingUtils'
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

const HOURLY_ROWS = Array.from({ length: 13 }, (_, i) => {
  const hour = 8 + i
  const isPm = hour >= 12
  const hourNum = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return { hour, label: `${hourNum}${isPm ? 'p' : 'a'}` }
})

function formatTime12(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(':')
  let h = parseInt(hStr, 10)
  const m = mStr || '00'
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m} ${ampm}`
}

function getMarketDayTimeString(sched: CityMarketSchedule, type: 'pickup' | 'delivery'): string {
  const days = sched.market_days.join(', ')
  const windows = type === 'pickup' ? sched.default_pickup_windows : sched.default_delivery_windows
  if (!windows || windows.length === 0) return `${days}`
  const times = windows.map(w => `${formatTime12(w.start_time)} – ${formatTime12(w.end_time)}`).join(', ')
  return `${days} · ${times}`
}

function getWindowsForWeeklyPreset(
  preset: FulfillmentPresetType,
  activeCitySchedule: CityMarketSchedule | null,
  type: 'pickup' | 'delivery'
): WeeklyWindows {
  const result: WeeklyWindows = {}
  if (preset === 'city_market_day' && activeCitySchedule) {
    activeCitySchedule.market_days.forEach(day => {
      const dShort = day.substring(0, 3).toLowerCase()
      const windows = type === 'delivery' ? activeCitySchedule.default_delivery_windows : activeCitySchedule.default_pickup_windows
      const dWins = (windows || []).filter(w => w.day.toLowerCase() === day.toLowerCase())
      if (dWins.length > 0) {
        result[dShort] = dWins.map(w => {
          const startH = parseInt(w.start_time.split(':')[0], 10)
          const endH = parseInt(w.end_time.split(':')[0], 10)
          return `${startH}-${endH}`
        })
      }
    })
  } else if (preset === 'weekend_mornings') {
    result.sat = ['8-12']
    result.sun = ['8-12']
  } else if (preset === 'weekday_evenings') {
    result.mon = ['17-20']
    result.tue = ['17-20']
    result.wed = ['17-20']
    result.thu = ['17-20']
    result.fri = ['17-20']
  } else if (preset === 'both') {
    result.mon = ['17-20']
    result.tue = ['17-20']
    result.wed = ['17-20']
    result.thu = ['17-20']
    result.fri = ['17-20']
    result.sat = ['8-12']
    result.sun = ['8-12']
  }
  return result
}

function isHourSelected(hour: number, activeSlots: string[]): boolean {
  return activeSlots.some(slotId => {
    const parts = slotId.split('-').map(Number)
    if (parts.length < 2) return false
    const start = parts[0]
    const end = parts[1]
    return hour >= start && hour < end
  })
}

function toggleHourCell(
  dayKey: string,
  hour: number,
  windowsState: WeeklyWindows,
  setWindowsState: (w: WeeklyWindows) => void
) {
  const activeSlots = windowsState[dayKey] || []
  const isSelected = isHourSelected(hour, activeSlots)

  let nextSlots: string[] = []

  if (isSelected) {
    for (const slotId of activeSlots) {
      const parts = slotId.split('-').map(Number)
      if (parts.length < 2) continue
      const start = parts[0]
      const end = parts[1]

      if (hour >= start && hour < end) {
        if (start < hour) {
          nextSlots.push(`${start}-${hour}`)
        }
        if (hour + 1 < end) {
          nextSlots.push(`${hour + 1}-${end}`)
        }
      } else {
        nextSlots.push(slotId)
      }
    }
  } else {
    nextSlots = [...activeSlots, `${hour}-${hour + 1}`]
  }

  const nextState = { ...windowsState }
  if (nextSlots.length > 0) {
    nextState[dayKey] = nextSlots
  } else {
    delete nextState[dayKey]
  }
  setWindowsState(nextState)
}

type WeeklyWindows = Record<string, string[]>

// ── StandScheduleSelector: in-box market day card + presets + weekly hourly matrix ──
function StandScheduleSelector({
  value,
  onChange,
  type,
  activeCitySchedule,
  preset,
  onPresetChange,
}: {
  value: WeeklyWindows
  onChange: (v: WeeklyWindows) => void
  type: 'pickup' | 'delivery'
  activeCitySchedule: CityMarketSchedule | null
  preset: FulfillmentPresetType
  onPresetChange: (p: FulfillmentPresetType) => void
}) {
  const isDelivery = type === 'delivery'
  const typeLabel = isDelivery ? 'Delivery' : 'Pickup'

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {activeCitySchedule && preset !== 'custom' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>✨</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
                {activeCitySchedule.city} Market Day {typeLabel}
              </div>
              <div style={{ fontSize: 12, color: '#15803d', marginTop: 1 }}>
                {getMarketDayTimeString(activeCitySchedule, type)}
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid={`customize-${type}-schedule-btn`}
            onClick={() => {
              onPresetChange('custom')
              if (Object.keys(value).length === 0) {
                onChange(getWindowsForWeeklyPreset('city_market_day', activeCitySchedule, type))
              }
            }}
            style={{
              background: '#ffffff',
              border: '1.5px solid #16a34a',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              color: '#15803d',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <span>✏️</span> Customize
          </button>
        </div>
      ) : (
        <div>
          {activeCitySchedule && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>Custom Schedule Mode</span>
              <button
                type="button"
                onClick={() => {
                  onChange(getWindowsForWeeklyPreset('city_market_day', activeCitySchedule, type))
                  onPresetChange('city_market_day')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#15803d',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0
                }}
              >
                ↩️ Use {activeCitySchedule.city} Market Day Defaults
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: preset === 'custom' ? 12 : 0 }}>
            {[
              ...(activeCitySchedule ? [{
                id: 'city_market_day' as FulfillmentPresetType,
                label: `✨ ${activeCitySchedule.city} Market Day`,
                desc: formatMarketDaySummary(activeCitySchedule)
              }] : []),
              ...FULFILLMENT_PRESET_OPTIONS
            ].map((opt) => {
              const isActive = preset === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onPresetChange(opt.id)
                    if (opt.id === 'city_market_day' && activeCitySchedule) {
                      onChange(getWindowsForWeeklyPreset('city_market_day', activeCitySchedule, type))
                    } else if (opt.id === 'custom') {
                      if (activeCitySchedule && Object.keys(value).length === 0) {
                        onChange(getWindowsForWeeklyPreset('city_market_day', activeCitySchedule, type))
                      }
                    } else {
                      onChange(getWindowsForWeeklyPreset(opt.id, activeCitySchedule, type))
                    }
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 100,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: isActive ? '1.5px solid var(--green-600)' : '1px solid var(--gray-300)',
                    background: isActive ? 'var(--green-50)' : '#ffffff',
                    color: isActive ? 'var(--green-800)' : 'var(--gray-700)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>

          {preset === 'custom' && (
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginTop: 10, overflowX: 'auto' }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, textAlign: 'center' }}>
                Tap any hour cell to set custom {type} hours
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center' }}>
                <thead>
                  <tr>
                    <th style={{ width: 32, padding: '4px 2px' }}></th>
                    {DAY_KEYS.map((d) => (
                      <th key={d.id} style={{ padding: '4px 2px', fontWeight: 600, color: '#374151' }}>
                        {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURLY_ROWS.map((row) => (
                    <tr key={row.hour}>
                      <td style={{ color: '#9ca3af', padding: '3px 0', fontSize: 10 }}>{row.label}</td>
                      {DAY_KEYS.map((d) => {
                        const isSelected = isHourSelected(row.hour, value[d.id] || [])
                        return (
                          <td
                            key={d.id}
                            onClick={() => toggleHourCell(d.id, row.hour, value, onChange)}
                            style={{
                              height: 22,
                              border: '1px solid #e5e7eb',
                              background: isSelected ? '#22c55e' : '#ffffff',
                              cursor: 'pointer',
                              borderRadius: 2,
                            }}
                          />
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
  const { user, loading: authLoading, isAuthenticated } = useAuth()
  const { isPro, isElite, loading: subLoading } = useSubscription()
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
  const [deliveryPreset, setDeliveryPreset] = useState<FulfillmentPresetType>('city_market_day')
  const [pickupPreset, setPickupPreset] = useState<FulfillmentPresetType>('city_market_day')
  const [activeCitySchedule, setActiveCitySchedule] = useState<CityMarketSchedule | null>(null)

  // Resolve active city schedule
  useEffect(() => {
    resolveActiveCitySchedule(supabase, {
      city: boothAddress.city,
      state: boothAddress.state,
      zip: boothAddress.zip
    }, true).then(sched => {
      setActiveCitySchedule(sched || null)
      if (sched) {
        if (Object.keys(weeklyDeliveryWindows).length === 0) {
          setWeeklyDeliveryWindows(getWindowsForWeeklyPreset('city_market_day', sched, 'delivery'))
          setDeliveryPreset('city_market_day')
        }
        if (Object.keys(weeklyPickupWindows).length === 0) {
          setWeeklyPickupWindows(getWindowsForWeeklyPreset('city_market_day', sched, 'pickup'))
          setPickupPreset('city_market_day')
        }
      } else {
        if (Object.keys(weeklyDeliveryWindows).length === 0) {
          setWeeklyDeliveryWindows(getWindowsForWeeklyPreset('both', null, 'delivery'))
          setDeliveryPreset('both')
        }
        if (Object.keys(weeklyPickupWindows).length === 0) {
          setWeeklyPickupWindows(getWindowsForWeeklyPreset('both', null, 'pickup'))
          setPickupPreset('both')
        }
      }
    })
  }, [boothAddress.city, boothAddress.state, boothAddress.zip])

  // Platform sync
  const [hasGoogleConnection, setHasGoogleConnection] = useState(false)
  const [googleSyncEnabled, setGoogleSyncEnabled] = useState(true)

  // Copy defaults from existing stand
  const [existingStands, setExistingStands] = useState<ExistingStand[]>([])
  const [copyFromId, setCopyFromId] = useState('')

  // Auth guard
  useEffect(() => {
    if (!authLoading && !subLoading && !isAuthenticated) {
      router.replace('/login?redirect=/my-stands/new')
    }
  }, [authLoading, subLoading, isAuthenticated, router])

  // Creating additional booths is Pro-only
  useEffect(() => {
    if (!authLoading && !subLoading && user && !isPro) {
      router.replace('/my-stands')
    }
  }, [authLoading, subLoading, user, isPro, router])

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

      // Default booth address and pickup address from profile
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

        const profileAddr = { street, city, state, zip }
        setBoothAddress(profileAddr)
        setPickupAddress(profileAddr)
      }
    }
    load()


    supabase
      .from('seller_google_connections')
      .select('auto_sync_catalog')
      .eq('user_id', user.id)
      .single()
      .then(({ data: gConn }: { data: any }) => {
        if (gConn?.auto_sync_catalog) setHasGoogleConnection(true)
      })
  }, [user?.id, authLoading, subLoading]) // eslint-disable-line react-hooks/exhaustive-deps

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
        booth_state: normalizeStateCode(boothAddress.state) || null,
        booth_zip: boothAddress.zip || null,
        pickup_address: pickupStr || boothStr || null,
        pickup_street: offersPickup ? (pickupAddress.street || boothAddress.street || null) : null,
        pickup_city: offersPickup ? (pickupAddress.city || boothAddress.city || null) : null,
        pickup_state: offersPickup ? (normalizeStateCode(pickupAddress.state || boothAddress.state) || null) : null,
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



      router.push(`/my-stands/${data.id}`)
    } catch (err: any) {
      setError('Failed to create stand: ' + (err.message || 'Unknown error'))
      setSaving(false)
    }
  }

  if (authLoading || subLoading || !isAuthenticated) {
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
                    type="range" min="0" max="25"
                    value={deliveryRadius}
                    onChange={e => setDeliveryRadius(parseInt(e.target.value))}
                  />
                  <span className={styles.sliderValue}>{deliveryRadius === 0 ? 'Zip only' : `${deliveryRadius} mi`}</span>
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
                <label className={styles.label} style={{ display: 'block', marginBottom: 8 }}>📅 Delivery Schedule</label>
                <StandScheduleSelector
                  value={weeklyDeliveryWindows}
                  onChange={setWeeklyDeliveryWindows}
                  type="delivery"
                  activeCitySchedule={activeCitySchedule}
                  preset={deliveryPreset}
                  onPresetChange={setDeliveryPreset}
                />
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
                <label className={styles.label} style={{ display: 'block', marginBottom: 8 }}>📅 Pickup Schedule</label>
                <StandScheduleSelector
                  value={weeklyPickupWindows}
                  onChange={setWeeklyPickupWindows}
                  type="pickup"
                  activeCitySchedule={activeCitySchedule}
                  preset={pickupPreset}
                  onPresetChange={setPickupPreset}
                />
              </div>
            </div>
          )}
        </div>
        {/* ── Platform Inventory Sync ── */}
        {isElite && hasGoogleConnection && (
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '16px 20px',
            background: '#f9fafb',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 4 }}>📡 Inventory Sync for this Booth</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>Choose which platforms sync listings from this booth.</div>

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
