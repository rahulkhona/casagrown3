'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useWizard } from './WizardContext'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import AddressInput from '../AddressInput'
import LandmarkPickerModal from '../LandmarkPickerModal'
import { type AddressFields, formatFullAddress } from '../../../lib/address'
import { LandmarkItem, isPublicLandmark, getSuggestedInstructionsForCategory } from '../../../lib/landmarks'
import styles from './wizard.module.css'
import { trackFieldInteract as rawTrackFieldInteract, trackEvent as rawTrackEvent } from '../../../lib/crm-analytics'

interface StandOption {
  id: string
  name: string
  offers_delivery: boolean
  offers_pickup: boolean
  delivery_radius_miles: number
  delivery_zipcodes?: string[]
  pickup_address?: string
  weekly_delivery_windows?: Record<string, any[]>
  weekly_pickup_windows?: Record<string, any[]>
}

const PRODUCT_TIME_WINDOWS = [
  { id: '8-10', label: '8–10a' },
  { id: '10-12', label: '10–12p' },
  { id: '12-14', label: '12–2p' },
  { id: '14-16', label: '2–4p' },
  { id: '16-18', label: '4–6p' },
  { id: '18-20', label: '6–8p' },
]

function WindowSelector({ 
  value, 
  onChange,
  days
}: { 
  value: Record<string, string[]>, 
  onChange: (v: Record<string, string[]>) => void,
  days: { id: string, label: string }[]
}) {
  const selectedDays = Object.keys(value)
  const [showCustomFor, setShowCustomFor] = useState<string | null>(null)
  const [customStart, setCustomStart] = useState('17:00')
  const [customEnd, setCustomEnd] = useState('19:00')
  
  const toggleDay = (dayId: string) => {
    const next = { ...value }
    if (next[dayId]) {
      delete next[dayId]
    } else {
      next[dayId] = ['10-12', '16-18'] // Default sensible windows
    }
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

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #bbf7d0' }} onClick={(e) => e.stopPropagation()}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>📅 Available Days & Times</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {days.map(d => (
          <button
            key={d.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleDay(d.id); }}
            style={{ 
              padding: '6px 12px', borderRadius: 16, fontSize: 13, fontWeight: 600,
              border: value[d.id] ? 'none' : '1px solid #d1d5db',
              background: value[d.id] ? '#16a34a' : 'white',
              color: value[d.id] ? 'white' : '#4b5563',
              cursor: 'pointer'
            }}
          >
            {value[d.id] ? '✅ ' : ''}{d.label}
          </button>
        ))}
      </div>
      {selectedDays.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {selectedDays.map(dayId => {
            const dayLabel = days.find(d => d.id === dayId)?.label
            if (!dayLabel) return null
            
            const dayWindows = value[dayId] || []
            const customWindows = dayWindows.filter(id => id.startsWith('custom-'))

            return (
              <div key={dayId} style={{ background: '#f9fafb', padding: '12px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, width: 85, paddingTop: 4, color: '#374151' }}>{dayLabel.split(' ')[0]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {PRODUCT_TIME_WINDOWS.map(w => {
                        const isSelected = dayWindows.includes(w.id)
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleWindow(dayId, w.id); }}
                            style={{
                              padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                              border: isSelected ? 'none' : '1px solid #d1d5db',
                              background: isSelected ? '#dcfce7' : 'white',
                              color: isSelected ? '#15803d' : '#6b7280',
                              cursor: 'pointer'
                            }}
                          >
                            {w.label}
                          </button>
                        )
                      })}
                    </div>
                    
                    {customWindows.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {customWindows.map(cwId => {
                          const [_, start, end] = cwId.split('-')
                          return (
                            <div key={cwId} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                              <span style={{ color: '#4b5563' }}>{start} – {end}</span>
                              <button type="button" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                                onClick={(e) => { e.stopPropagation(); toggleWindow(dayId, cwId); }}>×</button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {showCustomFor === dayId ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
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
                        onClick={(e) => { e.stopPropagation(); setShowCustomFor(dayId); }}>+ Custom slot</button>
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

export default function Step2Fulfillment() {
  const { state, updateState, nextStep, prevStep, pageSlug } = useWizard()
  const trackEvent = (type: any, _: string, data?: any) => rawTrackEvent(type, pageSlug, data)
  const trackFieldInteract = (_: string, step: number, field: string, value: boolean) => rawTrackFieldInteract(pageSlug, step, field, value)
  const { user } = useAuth()
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  const wentNext = useRef(false)
  const wentBack = useRef(false)
  const hasAbandoned = useRef(false)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    trackFieldInteract(pageSlug, 2, 'next_button', false)
    const startTime = Date.now()

    const handleUnload = () => {
      if (!wentNext.current && !wentBack.current && !hasAbandoned.current) {
        hasAbandoned.current = true
        const duration = (Date.now() - startTime) / 1000
        const st = stateRef.current
        trackEvent('wizard_abandon', pageSlug, {
          last_step: 2,
          last_step_name: 'fulfillment',
          time_on_step_secs: Math.round(duration)
        })
        trackFieldInteract(pageSlug, 2, 'home_address', !!st.address)
        trackFieldInteract(pageSlug, 2, 'offers_delivery', !!st.offersDelivery)
        trackFieldInteract(pageSlug, 2, 'delivery_radius', !!st.deliveryRadius)
        trackFieldInteract(pageSlug, 2, 'offers_pickup', !!st.offersPickup)
        trackFieldInteract(pageSlug, 2, 'pickup_address', !!st.pickupAddress)
        trackFieldInteract(pageSlug, 2, 'pickup_safety_mode', isPublicLandmark(st.pickupAddress || ''))
        trackFieldInteract(pageSlug, 2, 'pickup_instructions', !!st.pickupInstructions?.trim())
        trackFieldInteract(pageSlug, 2, 'pickup_notice_minutes', (st.pickupNoticeMinutes ?? 30) > 0)
      }
    }

    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      if (!wentNext.current && !wentBack.current && !hasAbandoned.current) {
        const duration = (Date.now() - startTime) / 1000
        if (duration < 0.5) return
        hasAbandoned.current = true

        const st = stateRef.current
        trackEvent('wizard_abandon', pageSlug, {
          last_step: 2,
          last_step_name: 'fulfillment',
          time_on_step_secs: Math.round(duration)
        })
        trackFieldInteract(pageSlug, 2, 'home_address', !!st.address)
        trackFieldInteract(pageSlug, 2, 'offers_delivery', !!st.offersDelivery)
        trackFieldInteract(pageSlug, 2, 'delivery_radius', !!st.deliveryRadius)
        trackFieldInteract(pageSlug, 2, 'offers_pickup', !!st.offersPickup)
        trackFieldInteract(pageSlug, 2, 'pickup_address', !!st.pickupAddress)
        trackFieldInteract(pageSlug, 2, 'pickup_safety_mode', isPublicLandmark(st.pickupAddress || ''))
        trackFieldInteract(pageSlug, 2, 'pickup_instructions', !!st.pickupInstructions?.trim())
        trackFieldInteract(pageSlug, 2, 'pickup_notice_minutes', (st.pickupNoticeMinutes ?? 30) > 0)
      }
    }
  }, [])
  const [stands, setStands] = useState<StandOption[]>([])
  const [standsLoaded, setStandsLoaded] = useState(false)

  // Local structured address fields — avoids lossy string↔object round-trips that strip spaces
  const [addressFields, setAddressFields] = useState<AddressFields>(() => {
    const a = state.address || ''
    if (typeof a !== 'string') return { street: '', city: '', state: '', zip: '' }
    const parts = a.split(',').map((s: string) => s.trim())
    if (parts.length >= 3) {
      const sz = parts[parts.length - 1].split(/\s+/)
      return { street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], state: sz[0] || '', zip: sz.slice(1).join(' ') }
    }
    if (parts.length === 2) return { street: parts[0], city: parts[1], state: '', zip: '' }
    return { street: a, city: '', state: '', zip: '' }
  })

  // Local structured pickup address fields — same pattern to avoid space-stripping
  const [pickupAddressFields, setPickupAddressFields] = useState<AddressFields>(() => {
    const a = state.pickupAddress || ''
    if (typeof a !== 'string') return { street: '', city: '', state: '', zip: '' }
    const parts = a.split(',').map((s: string) => s.trim())
    if (parts.length >= 3) {
      const sz = parts[parts.length - 1].split(/\s+/)
      return { street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], state: sz[0] || '', zip: sz.slice(1).join(' ') }
    }
    if (parts.length === 2) return { street: parts[0], city: parts[1], state: '', zip: '' }
    return { street: a, city: '', state: '', zip: '' }
  })

  const [showLandmarkModal, setShowLandmarkModal] = useState(false)

  // Sync local fields when state.address changes from context (e.g. after async profile fetch)
  useEffect(() => {
    const a = state.address || ''
    if (typeof a !== 'string') return
    const currentFormatted = formatFullAddress(addressFields)
    if (a !== currentFormatted) {
      const parts = a.split(',').map((s: string) => s.trim())
      if (parts.length >= 3) {
        const sz = parts[parts.length - 1].split(/\s+/)
        setAddressFields({
          street: parts.slice(0, -2).join(', '),
          city: parts[parts.length - 2],
          state: sz[0] || '',
          zip: sz.slice(1).join(' ')
        })
      } else if (parts.length === 2) {
        setAddressFields({ street: parts[0], city: parts[1], state: '', zip: '' })
      } else {
        setAddressFields({ street: a, city: '', state: '', zip: '' })
      }
    }
  }, [state.address, addressFields])

  // Sync local fields when state.pickupAddress changes from context
  useEffect(() => {
    const a = state.pickupAddress || ''
    if (typeof a !== 'string') return
    const currentFormatted = formatFullAddress(pickupAddressFields)
    if (a !== currentFormatted) {
      const parts = a.split(',').map((s: string) => s.trim())
      if (parts.length >= 3) {
        const sz = parts[parts.length - 1].split(/\s+/)
        setPickupAddressFields({
          street: parts.slice(0, -2).join(', '),
          city: parts[parts.length - 2],
          state: sz[0] || '',
          zip: sz.slice(1).join(' ')
        })
      } else if (parts.length === 2) {
        setPickupAddressFields({ street: parts[0], city: parts[1], state: '', zip: '' })
      } else {
        setPickupAddressFields({ street: a, city: '', state: '', zip: '' })
      }
    }
  }, [state.pickupAddress, pickupAddressFields])

  // Scroll to top when entering this step
  useEffect(() => {
    const el = document.querySelector('[class*="wizardContent"]') || document.querySelector('[class*="wizard"]')
    if (el) el.scrollTop = 0
    window.scrollTo(0, 0)
  }, [])

  const localToday = new Date()
  const dynamicDays: { id: string; label: string }[] = []
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  for (let i = 0; i < 7; i++) {
    const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const id = `${yyyy}-${mm}-${dd}`
    let label = ''
    if (i === 0) {
      label = `Today (${weekdays[d.getDay()]})`
    } else if (i === 1) {
      label = `Tomorrow (${weekdays[d.getDay()]})`
    } else {
      label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    }
    dynamicDays.push({ id, label })
  }

  const mapWeeklyWindowsToDates = (
    weeklyWindows: Record<string, any[]> | null | undefined,
    dates: { id: string; label: string }[]
  ): Record<string, string[]> => {
    const result: Record<string, string[]> = {}
    if (!weeklyWindows) return result

    dates.forEach(d => {
      const dateObj = new Date(d.id + 'T12:00:00')
      const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' })
      const windows = weeklyWindows[weekday] || weeklyWindows[weekday.toLowerCase()]
      if (windows && Array.isArray(windows)) {
        result[d.id] = windows.map(w => w.id).filter(Boolean)
      }
    })
    return result
  }

  // Load user's stands and profile address
  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()

    Promise.all([
      supabase.from('profiles').select('street_address, city, state_code, zip_code').eq('id', user.id).single(),
      supabase.from('market_booths')
        .select('id, name, offers_delivery, offers_pickup, delivery_radius_miles, delivery_zipcodes, pickup_address, weekly_delivery_windows, weekly_pickup_windows')
        .eq('owner_id', user.id)
    ]).then(([{ data: profile }, { data: booths }]) => {
      const standList = booths || []
      setStands(standList)
      setStandsLoaded(true)

      const profileAddress = profile && profile.street_address
        ? [profile.street_address, profile.city, `${profile.state_code || ''} ${profile.zip_code || ''}`.trim()].filter(Boolean).join(', ')
        : ''

      // Check URL param for pre-selected booth
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const urlBoothId = params.get('booth')
        if (urlBoothId && standList.some((s: any) => s.id === urlBoothId) && !state.boothId) {
          const stand = standList.find((s: any) => s.id === urlBoothId)!
          const resolvedDeliveryWindows = mapWeeklyWindowsToDates(stand.weekly_delivery_windows, dynamicDays)
          const resolvedPickupWindows = mapWeeklyWindowsToDates(stand.weekly_pickup_windows, dynamicDays)
          const allDates = Array.from(new Set([...Object.keys(resolvedDeliveryWindows), ...Object.keys(resolvedPickupWindows)]))

          updateState({
            boothId: stand.id,
            offersDelivery: stand.offers_delivery,
            offersPickup: stand.offers_pickup,
            deliveryRadius: stand.delivery_radius_miles || 5,
            deliveryZipcodes: stand.delivery_zipcodes || [],
            pickupAddress: stand.pickup_address || '',
            deliveryWindows: resolvedDeliveryWindows,
            pickupWindows: resolvedPickupWindows,
            selectedDates: allDates,
            address: state.address || profileAddress
          })
          return
        }
      }

      const currentStand = state.boothId ? standList.find((s: any) => s.id === state.boothId) : null
      const shouldLoadDefaults = currentStand && 
        Object.keys(state.deliveryWindows || {}).length === 0 && 
        Object.keys(state.pickupWindows || {}).length === 0

      if (shouldLoadDefaults && currentStand) {
        const resolvedDeliveryWindows = mapWeeklyWindowsToDates(currentStand.weekly_delivery_windows, dynamicDays)
        const resolvedPickupWindows = mapWeeklyWindowsToDates(currentStand.weekly_pickup_windows, dynamicDays)
        const allDates = Array.from(new Set([...Object.keys(resolvedDeliveryWindows), ...Object.keys(resolvedPickupWindows)]))

        updateState({
          offersDelivery: currentStand.offers_delivery,
          offersPickup: currentStand.offers_pickup,
          deliveryRadius: currentStand.delivery_radius_miles || 5,
          deliveryZipcodes: currentStand.delivery_zipcodes || [],
          pickupAddress: currentStand.pickup_address || '',
          deliveryWindows: resolvedDeliveryWindows,
          pickupWindows: resolvedPickupWindows,
          selectedDates: allDates,
          address: state.address || profileAddress
        })
      } else if (standList.length === 1 && !state.boothId) {
        const stand = standList[0]
        const resolvedDeliveryWindows = mapWeeklyWindowsToDates(stand.weekly_delivery_windows, dynamicDays)
        const resolvedPickupWindows = mapWeeklyWindowsToDates(stand.weekly_pickup_windows, dynamicDays)
        const allDates = Array.from(new Set([...Object.keys(resolvedDeliveryWindows), ...Object.keys(resolvedPickupWindows)]))

        updateState({
          boothId: stand.id,
          offersDelivery: stand.offers_delivery,
          offersPickup: stand.offers_pickup,
          deliveryRadius: stand.delivery_radius_miles || 5,
          deliveryZipcodes: stand.delivery_zipcodes || [],
          pickupAddress: stand.pickup_address || '',
          deliveryWindows: resolvedDeliveryWindows,
          pickupWindows: resolvedPickupWindows,
          selectedDates: allDates,
          address: state.address || profileAddress
        })
      } else if (!state.address && profileAddress) {
        updateState({ address: profileAddress })
      }
    })
  }, [user?.id, state.boothId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStandChange = (standId: string) => {
    const stand = stands.find((s: any) => s.id === standId)
    if (stand) {
      const resolvedDeliveryWindows = mapWeeklyWindowsToDates(stand.weekly_delivery_windows, dynamicDays)
      const resolvedPickupWindows = mapWeeklyWindowsToDates(stand.weekly_pickup_windows, dynamicDays)
      const allDates = Array.from(new Set([...Object.keys(resolvedDeliveryWindows), ...Object.keys(resolvedPickupWindows)]))

      updateState({
        boothId: stand.id,
        offersDelivery: stand.offers_delivery,
        offersPickup: stand.offers_pickup,
        deliveryRadius: stand.delivery_radius_miles || 5,
        deliveryZipcodes: stand.delivery_zipcodes || [],
        pickupAddress: stand.pickup_address || '',
        deliveryWindows: resolvedDeliveryWindows,
        pickupWindows: resolvedPickupWindows,
        selectedDates: allDates
      })
    } else {
      updateState({ boothId: null })
    }
  }



  const validateAndNext = () => {
    trackEvent('button_click', '/create-listing', { step: 2, button: 'next' })
    trackFieldInteract('/create-listing', 2, 'home_address', !!state.address)
    trackFieldInteract('/create-listing', 2, 'offers_delivery', !!state.offersDelivery)
    trackFieldInteract('/create-listing', 2, 'delivery_radius', !!state.deliveryRadius)
    trackFieldInteract('/create-listing', 2, 'offers_pickup', !!state.offersPickup)
    trackFieldInteract('/create-listing', 2, 'pickup_address', !!state.pickupAddress)

    const newErrors: Record<string, string> = {}
    if (!state.address) {
      newErrors.address = 'Home/Farm address is required'
    } else {
      // Check for ZIP in the address string
      const addrStr = typeof state.address === 'string' ? state.address : formatFullAddress(state.address as any)
      if (!/\b\d{5}\b/.test(addrStr)) {
        newErrors.address = 'Address must include a 5-digit ZIP code'
      }
    }

    if (state.offersPickup && state.pickupAddress) {
      const pickupStr = typeof state.pickupAddress === 'string' ? state.pickupAddress : formatFullAddress(state.pickupAddress as any)
      if (!/\b\d{5}\b/.test(pickupStr)) {
        newErrors.pickupAddress = 'Alternate pickup address must include a 5-digit ZIP code'
      }
    }
    
    if (!state.offersDelivery && !state.offersPickup) {
      newErrors.fulfillment = 'Select at least delivery or pickup'
    } else {
      let hasDeliveryWindow = false;
      let hasPickupWindow = false;
      
      if (state.offersDelivery) {
        hasDeliveryWindow = Object.keys(state.deliveryWindows || {}).length > 0;
        if (!hasDeliveryWindow) newErrors.fulfillment = 'Select at least one delivery day/window';
      }
      
      if (state.offersPickup) {
        hasPickupWindow = Object.keys(state.pickupWindows || {}).length > 0;
        if (!hasPickupWindow) newErrors.fulfillment = newErrors.fulfillment ? 'Select delivery and pickup days/windows' : 'Select at least one pickup day/window';
        if (isPublicLandmark(pickupAddressFields.street) && !state.pickupInstructions?.trim()) {
          newErrors.pickupInstructions = 'Please provide pickup instructions for meeting at this public location.'
        }
      }
    }

    // Track all input states on step transition
    trackEvent('button_click', pageSlug, { step: 2, button: 'next' })
    trackFieldInteract(pageSlug, 2, 'home_address', !!state.address)
    trackFieldInteract(pageSlug, 2, 'offers_delivery', !!state.offersDelivery)
    trackFieldInteract(pageSlug, 2, 'delivery_radius', !!state.deliveryRadius)
    trackFieldInteract(pageSlug, 2, 'offers_pickup', !!state.offersPickup)
    trackFieldInteract(pageSlug, 2, 'pickup_address', !!state.pickupAddress)
    trackFieldInteract(pageSlug, 2, 'pickup_safety_mode', isPublicLandmark(pickupAddressFields.street))
    trackFieldInteract(pageSlug, 2, 'pickup_instructions', !!state.pickupInstructions?.trim())
    trackFieldInteract(pageSlug, 2, 'pickup_notice_minutes', (state.pickupNoticeMinutes ?? 30) > 0)

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      trackEvent('wizard_validation_error', pageSlug, {
        step: 2,
        fields: Object.keys(newErrors)
      })
      setTimeout(() => {
        const firstError = document.querySelector(`.${styles.errorText}`)
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return
    }

    trackFieldInteract(pageSlug, 2, 'next_button', true)
    wentNext.current = true
    nextStep()
  }

  const [isLocatingHome, setIsLocatingHome] = useState(false)
  const [isLocatingPickup, setIsLocatingPickup] = useState(false)

  const handleUseCurrentLocationHome = async () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.")
      return
    }
    setIsLocatingHome(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`, { headers: { 'User-Agent': 'CasaGrown/1.0' } })
        const data = await res.json()
        if (data?.address) {
          const a = data.address
          const street = [a.house_number, a.road].filter(Boolean).join(' ')
          const city = a.city || a.town || a.village || ''
          const st = a.state || ''
          const zip = a.postcode || ''
          updateState({ address: [street, city, `${st} ${zip}`.trim()].filter(Boolean).join(', ') })
        }
        setIsLocatingHome(false)
      } catch {
        setIsLocatingHome(false)
        alert("Could not fetch address for your location. Please enter it manually.")
      }
    }, (err) => {
      setIsLocatingHome(false)
      alert("Could not access your location. Please check your browser permissions.")
    })
  }

  const handleUseCurrentLocationPickup = async () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.")
      return
    }
    setIsLocatingPickup(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`, { headers: { 'User-Agent': 'CasaGrown/1.0' } })
        const data = await res.json()
        if (data?.address) {
          const a = data.address
          const street = [a.house_number, a.road].filter(Boolean).join(' ')
          const city = a.city || a.town || a.village || ''
          const st = a.state || ''
          const zip = a.postcode || ''
          updateState({ pickupAddress: [street, city, `${st} ${zip}`.trim()].filter(Boolean).join(', ') })
        }
        setIsLocatingPickup(false)
      } catch {
        setIsLocatingPickup(false)
        alert("Could not fetch address for your location. Please enter it manually.")
      }
    }, (err) => {
      setIsLocatingPickup(false)
      alert("Could not access your location. Please check your browser permissions.")
    })
  }

  return (
    <div>
      <div className={styles.headerTop}>
        <button className={styles.backBtn} onClick={() => { wentBack.current = true; prevStep() }}>← Back</button>
      </div>
      
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>How will buyers get it?</h2>
      
      {/* Stand Selector */}
      {standsLoaded && stands.length > 0 && (
        <div className={styles.formGroup} style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px dashed #d1d5db' }}>
          <label className={styles.label}>🏪 Which Stand?</label>
          {stands.length === 1 ? (
            <div style={{
              padding: '12px 16px', borderRadius: 12,
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 15, fontWeight: 600, color: '#15803d',
            }}>
              <span style={{ fontSize: 20 }}>🏪</span>
              {stands[0].name}
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 400, color: '#16a34a' }}>Auto-selected</span>
            </div>
          ) : (
            <select
              className={styles.input}
              value={state.boothId || ''}
              onChange={e => handleStandChange(e.target.value)}
              style={{ accentColor: '#16a34a' }}
            >
              <option value="">Select a stand...</option>
              {stands.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {stands.length > 1 && state.boothId && (
            <p style={{ fontSize: 12, color: '#16a34a', marginTop: 6, fontWeight: 600 }}>
              ✅ Fulfillment defaults loaded from this stand
            </p>
          )}
        </div>
      )}

      <div className={styles.formGroup} style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px dashed #d1d5db' }}>
        <label className={styles.label}>🏠 Home / Farm Address</label>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 8px' }}>
          This is your primary location. It is used to calculate delivery distances and local taxes.
        </p>
        <div onBlur={() => trackFieldInteract('/create-listing', 2, 'home_address', !!formatFullAddress(addressFields).trim())}>
        <AddressInput 
          value={addressFields}
          onChange={(val: AddressFields) => {
            setAddressFields(val)
            updateState({ address: formatFullAddress(val) })
          }}
        />
        </div>
        {errors.address && <div className={styles.errorText}>{errors.address}</div>}
        <button 
          type="button" 
          className={styles.aiBtn} 
          style={{ marginTop: 8 }} 
          onClick={handleUseCurrentLocationHome}
        >
          {isLocatingHome ? "⏳ Locating..." : "📍 Use current location"}
        </button>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>📅 Available For</label>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>
          Booth defaults are pre-selected — override as needed.
        </p>
        {errors.fulfillment && <span className={styles.errorText} style={{ display: 'block', marginBottom: 8 }}>{errors.fulfillment}</span>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 12 }}>
          {/* Delivery Box */}
          <div data-testid="delivery-box" style={{ border: `2px solid ${state.offersDelivery ? '#22c55e' : '#e5e7eb'}`, borderRadius: 12, background: state.offersDelivery ? '#f0fdf4' : '#fff', overflow: 'hidden', transition: 'all 0.15s' }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }}
              onClick={() => {
                if (state.offersDelivery && !state.offersPickup) return;
                updateState({ offersDelivery: !state.offersDelivery })
                trackFieldInteract('/create-listing', 2, 'offers_delivery', !state.offersDelivery)
              }}
            >
              <span style={{ fontSize: 28 }}>🚗</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: state.offersDelivery ? '#15803d' : '#374151' }}>I&apos;ll Deliver</div>
                  <span style={{ fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: 12, padding: '2px 8px' }}>
                    🛡️ Safest (100% Contactless)
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#4b5563', marginTop: 2 }}>
                  100% Contactless Porch Drop-off — you deliver directly to buyer&apos;s door.
                </div>
              </div>
              <div>
                <input type="checkbox" checked={state.offersDelivery} readOnly style={{ width: 20, height: 20, accentColor: '#16a34a', pointerEvents: 'none' }} />
              </div>
            </div>
            {state.offersDelivery && (
              <div style={{ padding: '0 20px 20px 20px', borderTop: '1px solid #bbf7d0' }}>
                <div style={{ marginTop: 16 }}>
                  <label className={styles.label}>🚗 Delivery Radius</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="range" min={1} max={10}
                      value={state.deliveryRadius || 5}
                      onChange={e => {
                        updateState({ deliveryRadius: parseInt(e.target.value) })
                        trackFieldInteract('/create-listing', 2, 'delivery_radius', true)
                      }}
                      style={{ flex: 1, accentColor: '#16a34a' }}
                    />
                    <span style={{ minWidth: 50, fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
                      {state.deliveryRadius || 5} mi
                    </span>
                  </div>
                </div>
                {/* Delivery Zip Codes input */}
                <div style={{ marginTop: 16 }}>
                  <label className={styles.label}>📮 Delivery Zip Codes (Specific zones/neighborhoods)</label>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
                    Add zip codes where you deliver, regardless of distance.
                  </p>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    background: 'white',
                    alignItems: 'center',
                    minHeight: 38
                  }}>
                    {(state.deliveryZipcodes || []).map((zip) => (
                      <span key={zip} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: '#dcfce7',
                        color: '#15803d',
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {zip}
                        <button
                          type="button"
                          onClick={() => updateState(prev => ({
                            deliveryZipcodes: (prev.deliveryZipcodes || []).filter(z => z !== zip)
                          }))}
                          style={{
                            border: 'none',
                            background: 'none',
                            color: '#15803d',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: 14,
                            lineHeight: 1
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder={(state.deliveryZipcodes || []).length === 0 ? "e.g. 90210, 90211" : "Add zip..."}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim().replace(/[^0-9]/g, '');
                          if (val.length === 5 && !(state.deliveryZipcodes || []).includes(val)) {
                            updateState(prev => ({
                              deliveryZipcodes: [...(prev.deliveryZipcodes || []), val]
                            }));
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const val = e.currentTarget.value.trim().replace(/[^0-9]/g, '');
                        if (val.length === 5 && !(state.deliveryZipcodes || []).includes(val)) {
                          updateState(prev => ({
                            deliveryZipcodes: [...(prev.deliveryZipcodes || []), val]
                          }));
                          e.currentTarget.value = '';
                        }
                      }}
                      style={{
                        border: 'none',
                        outline: 'none',
                        flex: 1,
                        minWidth: 80,
                        fontSize: 14,
                        padding: '4px 0'
                      }}
                    />
                  </div>
                </div>
                <WindowSelector 
                  value={state.deliveryWindows || {}} 
                  onChange={(v) => {
                    const allDates = Array.from(new Set([...Object.keys(v), ...Object.keys(state.pickupWindows || {})]))
                    updateState({ deliveryWindows: v, selectedDates: allDates })
                  }} 
                  days={dynamicDays} 
                />
              </div>
            )}
          </div>

          {/* Pickup Box */}
          <div data-testid="pickup-box" style={{ border: `2px solid ${state.offersPickup ? '#22c55e' : '#e5e7eb'}`, borderRadius: 12, background: state.offersPickup ? '#f0fdf4' : '#fff', overflow: 'hidden', transition: 'all 0.15s' }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }}
              onClick={() => {
                if (state.offersPickup && !state.offersDelivery) return;
                updateState({ offersPickup: !state.offersPickup })
                trackFieldInteract('/create-listing', 2, 'offers_pickup', !state.offersPickup)
              }}
            >
              <span style={{ fontSize: 28 }}>📍</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: state.offersPickup ? '#15803d' : '#374151' }}>Pickup Available</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Buyers pick up from you</div>
              </div>
              <div>
                <input type="checkbox" checked={state.offersPickup} readOnly style={{ width: 20, height: 20, accentColor: '#16a34a', pointerEvents: 'none' }} />
              </div>
            </div>
            {state.offersPickup && (
              <div style={{ padding: '0 20px 20px 20px', borderTop: '1px solid #bbf7d0' }}>
                <div style={{ marginTop: 16 }}>
                  {/* ── Pickup Location & Safety Preference Selector ── */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📍</span> Choose Pickup Location &amp; Safety Mode:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setPickupAddressFields(addressFields)
                          updateState({ pickupAddress: formatFullAddress(addressFields) })
                          setErrors(p => ({ ...p, pickupAddress: '' }))
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: !isPublicLandmark(pickupAddressFields.street) ? '2px solid #16a34a' : '1px solid #e5e7eb',
                          background: !isPublicLandmark(pickupAddressFields.street) ? '#ffffff' : '#f9fafb',
                          boxShadow: !isPublicLandmark(pickupAddressFields.street) ? '0 1px 3px rgba(22, 163, 74, 0.2)' : 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          transition: 'all 0.15s ease',
                        }}
                        data-testid="pickup-mode-home"
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span>🏡</span> My Home Address
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.3 }}>
                          House # kept private
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowLandmarkModal(true)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: isPublicLandmark(pickupAddressFields.street) ? '2px solid #16a34a' : '1px solid #e5e7eb',
                          background: isPublicLandmark(pickupAddressFields.street) ? '#ffffff' : '#f9fafb',
                          boxShadow: isPublicLandmark(pickupAddressFields.street) ? '0 1px 3px rgba(22, 163, 74, 0.2)' : 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          transition: 'all 0.15s ease',
                        }}
                        data-testid="find-landmark-btn"
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span>🛡️</span> Safe Public Place
                        </div>
                        <div style={{ fontSize: 11, color: '#166534', fontWeight: 500, lineHeight: 1.3 }}>
                          Parks, libraries (Safe)
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Safety & Privacy Reassurance Callout */}
                  {isPublicLandmark(pickupAddressFields.street) ? (
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 12, color: '#065f46', lineHeight: 1.4 }}>
                        🛡️ <strong>Safe Meeting Spot:</strong> Meet buyers in a safe, public location without sharing your home address.
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowLandmarkModal(true)}
                        style={{ background: '#ffffff', border: '1px solid #6ee7b7', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: '#047857', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.4 }}>
                        🔒 <strong>Home Privacy:</strong> House numbers are hidden from public browse cards for your privacy.
                      </div>
                      <button
                        type="button"
                        onClick={handleUseCurrentLocationPickup}
                        disabled={isLocatingPickup}
                        style={{ background: 'none', border: 'none', color: '#16a34a', fontSize: 11, fontWeight: 600, cursor: isLocatingPickup ? 'wait' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}
                      >
                        {isLocatingPickup ? '⏳ Locating...' : '📍 Use My Location'}
                      </button>
                    </div>
                  )}

                  <AddressInput
                    value={pickupAddressFields}
                    onChange={(val: AddressFields) => {
                      setPickupAddressFields(val)
                      updateState({ pickupAddress: formatFullAddress(val) })
                      setErrors(p => ({ ...p, pickupAddress: '' }))
                    }}
                    placeholderStreet={isPublicLandmark(pickupAddressFields.street) ? 'Public Landmark & Street' : 'Street Address'}
                  />
                  {errors.pickupAddress && <span className={styles.errorText} style={{ display: 'block' }}>{errors.pickupAddress}</span>}

                  {/* ── Pickup Instructions Input ── */}
                  {(() => {
                    const isPublic = isPublicLandmark(pickupAddressFields.street)
                    const suggestedInfo = getSuggestedInstructionsForCategory(undefined, pickupAddressFields.street)

                    return (
                      <div style={{ marginTop: 12 }}>
                        <label className={styles.label} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>
                            📋 Pickup Instructions for Buyer{' '}
                            {isPublic ? (
                              <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 12 }}>(Required for public spots)</span>
                            ) : (
                              <span className={styles.optional}>(optional)</span>
                            )}
                          </span>
                          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>{(state.pickupInstructions || '').length}/300</span>
                        </label>
                        <input
                          type="text"
                          className={styles.input}
                          value={state.pickupInstructions || ''}
                          onChange={e => {
                            updateState({ pickupInstructions: e.target.value })
                            setErrors(p => ({ ...p, pickupInstructions: '' }))
                          }}
                          placeholder={suggestedInfo.placeholder}
                          maxLength={300}
                          data-testid="pickup-instructions-input"
                        />
                        {errors.pickupInstructions && (
                          <span className={styles.errorText} data-testid="pickup-instructions-error" style={{ display: 'block', marginTop: 4 }}>
                            {errors.pickupInstructions}
                          </span>
                        )}
                        {!state.pickupInstructions && (
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>💡 Suggestion:</span>
                            <button
                              type="button"
                              onClick={() => {
                                updateState({ pickupInstructions: suggestedInfo.example })
                                setErrors(p => ({ ...p, pickupInstructions: '' }))
                              }}
                              style={{
                                background: '#f0fdf4',
                                border: '1px dashed #86efac',
                                borderRadius: 6,
                                padding: '2px 8px',
                                fontSize: 11,
                                color: '#166534',
                                cursor: 'pointer',
                                textAlign: 'left'
                              }}
                            >
                              "{suggestedInfo.example}"
                            </button>
                          </div>
                        )}

                        {/* ── Buyer Advance Notice Selector ── */}
                        <div style={{ marginTop: 14 }}>
                          <label className={styles.label} style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>
                            ⏱️ Buyer Advance Notice Before Arrival
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
                            {[
                              { mins: 15, label: '⚡ 15 min' },
                              { mins: 30, label: '⏱️ 30 min (Default)' },
                              { mins: 60, label: '🕐 1 hour' },
                              { mins: 0, label: 'No notice needed' },
                            ].map(opt => {
                              const active = (state.pickupNoticeMinutes ?? 30) === opt.mins
                              return (
                                <button
                                  key={opt.mins}
                                  type="button"
                                  onClick={() => updateState({ pickupNoticeMinutes: opt.mins })}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: active ? 700 : 500,
                                    border: active ? '2px solid #16a34a' : '1px solid #e5e7eb',
                                    background: active ? '#f0fdf4' : '#fff',
                                    color: active ? '#15803d' : '#4b5563',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    transition: 'all 0.15s ease',
                                  }}
                                  data-testid={`pickup-notice-${opt.mins}`}
                                >
                                  {opt.label}
                                </button>
                              )
                            })}
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>
                            {(state.pickupNoticeMinutes ?? 30) > 0
                              ? `Buyers will be asked to message you ${state.pickupNoticeMinutes ?? 30} minutes before arriving within their 2-hour window.`
                              : `Buyers can arrive anytime during their selected 2-hour pickup window.`}
                          </p>
                        </div>
                      </div>
                    )
                  })()}

                  <LandmarkPickerModal
                    isOpen={showLandmarkModal}
                    onClose={() => setShowLandmarkModal(false)}
                    onSelect={(landmark: LandmarkItem) => {
                      const newFields: AddressFields = {
                        street: landmark.addressFields.street,
                        city: landmark.addressFields.city || addressFields.city || '',
                        state: landmark.addressFields.state || addressFields.state || 'CA',
                        zip: landmark.addressFields.zip || addressFields.zip || '',
                      }
                      setPickupAddressFields(newFields)
                      updateState({ pickupAddress: formatFullAddress(newFields) })
                      setErrors(p => ({ ...p, pickupAddress: '' }))
                    }}
                    fallbackZip={addressFields.zip}
                  />
                </div>
                <WindowSelector 
                  value={state.pickupWindows || {}} 
                  onChange={(v) => {
                    const allDates = Array.from(new Set([...Object.keys(v), ...Object.keys(state.deliveryWindows || {})]))
                    updateState({ pickupWindows: v, selectedDates: allDates })
                  }} 
                  days={dynamicDays} 
                />
              </div>
            )}
          </div>
        </div>


      </div>

      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInner}>
          <button className={styles.btnPrimary} onClick={validateAndNext}>
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
