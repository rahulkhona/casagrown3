'use client'
import React, { useState, useEffect } from 'react'
import { useWizard } from './WizardContext'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import AddressInput from '../AddressInput'
import { type AddressFields, formatFullAddress } from '../../../lib/address'
import styles from './wizard.module.css'

interface StandOption {
  id: string
  name: string
  offers_delivery: boolean
  offers_pickup: boolean
  delivery_radius_miles: number
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
  const { state, updateState, nextStep, prevStep } = useWizard()
  const { user } = useAuth()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [stands, setStands] = useState<StandOption[]>([])
  const [standsLoaded, setStandsLoaded] = useState(false)

  // Load user's stands
  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    supabase
      .from('market_booths')
      .select('id, name, offers_delivery, offers_pickup, delivery_radius_miles')
      .eq('owner_id', user.id)
      .then(({ data }) => {
        const standList = data || []
        setStands(standList)
        setStandsLoaded(true)

        // Check URL param for pre-selected booth
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          const urlBoothId = params.get('booth')
          if (urlBoothId && standList.some(s => s.id === urlBoothId) && !state.boothId) {
            const stand = standList.find(s => s.id === urlBoothId)!
            updateState({
              boothId: stand.id,
              offersDelivery: stand.offers_delivery,
              offersPickup: stand.offers_pickup,
              deliveryRadius: stand.delivery_radius_miles || 5,
            })
            return
          }
        }

        // Auto-select if only 1 stand and no boothId yet
        if (standList.length === 1 && !state.boothId) {
          const stand = standList[0]
          updateState({
            boothId: stand.id,
            offersDelivery: stand.offers_delivery,
            offersPickup: stand.offers_pickup,
            deliveryRadius: stand.delivery_radius_miles || 5,
          })
        }
      })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStandChange = (standId: string) => {
    const stand = stands.find(s => s.id === standId)
    if (stand) {
      updateState({
        boothId: stand.id,
        offersDelivery: stand.offers_delivery,
        offersPickup: stand.offers_pickup,
        deliveryRadius: stand.delivery_radius_miles || 5,
      })
    } else {
      updateState({ boothId: null })
    }
  }

  const localToday = new Date()
  const todayStr = `${localToday.getFullYear()}-${String(localToday.getMonth()+1).padStart(2,'0')}-${String(localToday.getDate()).padStart(2,'0')}`
  const tomorrowDate = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + 1)
  const tomorrowStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth()+1).padStart(2,'0')}-${String(tomorrowDate.getDate()).padStart(2,'0')}`
  const todayLabel = `Today (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][localToday.getDay()]})`
  const tomorrowLabel = `Tomorrow (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][tomorrowDate.getDay()]})`

  const dynamicDays = [
    { id: todayStr, label: todayLabel },
    { id: tomorrowStr, label: tomorrowLabel }
  ]

  const validateAndNext = () => {
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
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

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
        <button className={styles.backBtn} onClick={prevStep}>← Back</button>
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
        <AddressInput 
          value={(() => {
            const a = state.address || ''
            if (typeof a !== 'string') return a
            const parts = a.split(',').map((s: string) => s.trim())
            if (parts.length >= 3) {
              const sz = parts[parts.length - 1].split(/\s+/)
              return { street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], state: sz[0] || '', zip: sz.slice(1).join(' ') }
            }
            if (parts.length === 2) return { street: parts[0], city: parts[1], state: '', zip: '' }
            return { street: a, city: '', state: '', zip: '' }
          })()}
          onChange={(val: AddressFields) => updateState({ address: formatFullAddress(val) })}
        />
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
          <div style={{ border: `2px solid ${state.offersDelivery ? '#22c55e' : '#e5e7eb'}`, borderRadius: 12, background: state.offersDelivery ? '#f0fdf4' : '#fff', overflow: 'hidden', transition: 'all 0.15s' }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }}
              onClick={() => {
                if (state.offersDelivery && !state.offersPickup) return;
                updateState({ offersDelivery: !state.offersDelivery })
              }}
            >
              <span style={{ fontSize: 28 }}>🚗</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: state.offersDelivery ? '#15803d' : '#374151' }}>I'll Deliver</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Drop off at buyer's door</div>
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
                      onChange={e => updateState({ deliveryRadius: parseInt(e.target.value) })}
                      style={{ flex: 1, accentColor: '#16a34a' }}
                    />
                    <span style={{ minWidth: 50, fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
                      {state.deliveryRadius || 5} mi
                    </span>
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
          <div style={{ border: `2px solid ${state.offersPickup ? '#22c55e' : '#e5e7eb'}`, borderRadius: 12, background: state.offersPickup ? '#f0fdf4' : '#fff', overflow: 'hidden', transition: 'all 0.15s' }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }}
              onClick={() => {
                if (state.offersPickup && !state.offersDelivery) return;
                updateState({ offersPickup: !state.offersPickup })
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
                  <label className={styles.label}>📍 Alternate Pickup Address <span className={styles.optional}>(optional)</span></label>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>Leave blank to use your Home / Farm address.</p>
                  <AddressInput
                    value={(() => {
                      const a = state.pickupAddress || ''
                      if (typeof a !== 'string') return a
                      const parts = a.split(',').map((s: string) => s.trim())
                      if (parts.length >= 3) {
                        const sz = parts[parts.length - 1].split(/\s+/)
                        return { street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], state: sz[0] || '', zip: sz.slice(1).join(' ') }
                      }
                      if (parts.length === 2) return { street: parts[0], city: parts[1], state: '', zip: '' }
                      return { street: a, city: '', state: '', zip: '' }
                    })()}
                    onChange={(val: AddressFields) => updateState({ pickupAddress: formatFullAddress(val) })}
                    placeholderStreet="e.g. Corner Store Parking Lot"
                  />
                  {errors.pickupAddress && <span className={styles.errorText} style={{ display: 'block' }}>{errors.pickupAddress}</span>}
                  <button
                    type="button"
                    className={styles.aiBtn}
                    style={{ marginTop: 6 }}
                    onClick={handleUseCurrentLocationPickup}
                  >
                    {isLocatingPickup ? "⏳ Locating..." : "📍 Use my current location"}
                  </button>
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
