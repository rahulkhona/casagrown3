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
  const [pickupAddress, setPickupAddress] = useState<AddressFields>(EMPTY_ADDRESS)
  const [offersPickup, setOffersPickup] = useState(true)
  const [offersDelivery, setOffersDelivery] = useState(true)
  const [deliveryRadius, setDeliveryRadius] = useState(5)
  const [deliveryZipcodes, setDeliveryZipcodes] = useState<string[]>([])
  const [zipInput, setZipInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          .select('street_address, city, state_code')
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

      // Default pickup address from profile
      if (!pickupAddress.street && profile?.street_address) {
        setPickupAddress({
          street: profile.street_address || '',
          city: profile.city || '',
          state: profile.state_code || '',
          zip: '',
        })
      }
    }
    load()
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
      if (offersPickup && !toGeocodingString(pickupAddress)) {
        issues.push('Enter a pickup address')
      }
      if (issues.length > 0) {
        setError('⚠️ ' + issues.join('\n• '))
        setSaving(false)
        return
      }

      const pickupStr = formatFullAddress(pickupAddress)
      const dbRow: Record<string, any> = {
        owner_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        offers_pickup: offersPickup,
        offers_delivery: offersDelivery,
        delivery_radius_miles: deliveryRadius,
        pickup_address: pickupStr || null,
        pickup_street: pickupAddress.street || null,
        pickup_city: pickupAddress.city || null,
        pickup_state: pickupAddress.state || null,
        pickup_zip: pickupAddress.zip || null,
        booth_street: pickupAddress.street || null,
        booth_city: pickupAddress.city || null,
        booth_state: pickupAddress.state || null,
        booth_zip: pickupAddress.zip || null,
        delivery_zipcodes: deliveryZipcodes.length > 0 ? deliveryZipcodes : null,
      }

      // Geocode pickup address
      if (offersPickup && pickupStr) {
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

      {/* Location */}
      <div className={styles.formSection}>
        <h2 className={styles.sectionTitle}>📍 Location</h2>

        <div className={styles.formGroup}>
          <label className={styles.label}>Pickup Address</label>
          <AddressInput
            value={pickupAddress}
            onChange={(val: AddressFields) => setPickupAddress(val)}
            placeholderStreet="e.g. 123 Oak Street"
          />
        </div>
      </div>

      {/* Fulfillment */}
      <div className={styles.formSection}>
        <h2 className={styles.sectionTitle}>🚗 Fulfillment</h2>

        <div className={styles.toggleGrid}>
          <button
            className={`${styles.toggleCard} ${offersPickup ? styles.toggleActive : ''}`}
            onClick={() => setOffersPickup(!offersPickup)}
          >
            <span style={{ fontSize: 28 }}>📍</span>
            <strong>Pickup Available</strong>
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Buyers pick up from you</span>
          </button>
          <button
            className={`${styles.toggleCard} ${offersDelivery ? styles.toggleActive : ''}`}
            onClick={() => setOffersDelivery(!offersDelivery)}
          >
            <span style={{ fontSize: 28 }}>🚗</span>
            <strong>I&apos;ll Deliver</strong>
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Drop off at buyer&apos;s door</span>
          </button>
        </div>

        {offersDelivery && (
          <>
            <div className={styles.formGroup} style={{ marginTop: 20 }}>
              <label className={styles.label}>Delivery Radius (miles)</label>
              <div className={styles.sliderWrap}>
                <input
                  className={styles.slider}
                  type="range"
                  min="1"
                  max="25"
                  value={deliveryRadius}
                  onChange={e => setDeliveryRadius(parseInt(e.target.value))}
                />
                <span className={styles.sliderValue}>{deliveryRadius} mi</span>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Delivery Zip Codes <span className={styles.labelHint}>(optional, press Enter to add)</span>
              </label>
              <div className={styles.tagsWrap}>
                {deliveryZipcodes.map(zip => (
                  <span key={zip} className={styles.tag}>
                    {zip}
                    <button
                      className={styles.tagRemove}
                      onClick={() => setDeliveryZipcodes(zips => zips.filter(z => z !== zip))}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className={styles.tagInput}
                  value={zipInput}
                  onChange={e => setZipInput(e.target.value)}
                  onKeyDown={handleZipKeyDown}
                  onBlur={handleAddZip}
                  placeholder={deliveryZipcodes.length === 0 ? 'Enter zip codes...' : ''}
                  maxLength={5}
                />
              </div>
            </div>
          </>
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
