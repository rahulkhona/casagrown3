'use client'

import React, { useState, useEffect } from 'react'
import { colors } from '@casagrown/app/design-tokens'
import { Store, Save, MapPin, Plus, Trash2, Edit3, Globe, AlertTriangle, CheckCircle2 } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'

type CityScheduleRow = {
  id: string
  city: string
  state: string
  zipcodes: string[]
  is_active: boolean
  is_default?: boolean
  market_days: string[]
  default_pickup_windows: Array<{ day: string; start_time: string; end_time: string }>
  default_delivery_windows: Array<{ day: string; start_time: string; end_time: string }>
  cutoff_hours_before_market?: number
}

const ALL_DAYS = [
  { id: 'monday', label: 'Monday' },
  { id: 'tuesday', label: 'Tuesday' },
  { id: 'wednesday', label: 'Wednesday' },
  { id: 'thursday', label: 'Thursday' },
  { id: 'friday', label: 'Friday' },
  { id: 'saturday', label: 'Saturday' },
  { id: 'sunday', label: 'Sunday' },
]

function ToggleSwitch({
  checked,
  onChange,
  activeLabel = 'Active',
  inactiveLabel = 'Disabled',
  showLabels = false,
}: {
  checked: boolean
  onChange: (nextVal: boolean) => void
  activeLabel?: string
  inactiveLabel?: string
  showLabels?: boolean
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {showLabels && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: checked ? '#15803d' : '#6b7280',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: checked ? '#16a34a' : '#9ca3af',
            }}
          />
          {checked ? activeLabel : inactiveLabel}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 46,
          height: 26,
          borderRadius: 9999,
          backgroundColor: checked ? '#16a34a' : '#d1d5db',
          position: 'relative',
          cursor: 'pointer',
          border: 'none',
          outline: 'none',
          padding: 3,
          transition: 'background-color 0.2s ease',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
            transform: checked ? 'translateX(20px)' : 'translateX(0px)',
            transition: 'transform 0.2s ease',
            display: 'block',
          }}
        />
      </button>
    </div>
  )
}

export default function MarketOperationsPage() {
  // ── Global Market Settings State ──
  const [productsNeverExpire, setProductsNeverExpire] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  // ── Default Market Schedule (Platform-Wide) State ──
  const [defaultSchedule, setDefaultSchedule] = useState<CityScheduleRow | null>(null)
  const [defaultLoading, setDefaultLoading] = useState(true)
  const [savingDefault, setSavingDefault] = useState(false)
  const [defDay, setDefDay] = useState<string>('saturday')
  const [defPickupStart, setDefPickupStart] = useState('09:00')
  const [defPickupEnd, setDefPickupEnd] = useState('11:00')
  const [defDeliveryStart, setDefDeliveryStart] = useState('13:00')
  const [defDeliveryEnd, setDefDeliveryEnd] = useState('16:00')
  const [defIsActive, setDefIsActive] = useState(false)

  // ── City Overrides State ──
  const [cityOverrides, setCityOverrides] = useState<CityScheduleRow[]>([])
  const [citiesLoading, setCitiesLoading] = useState(true)
  const [isEditingCity, setIsEditingCity] = useState(false)
  const [editingCityId, setEditingCityId] = useState<string | null>(null)
  const [deletingCity, setDeletingCity] = useState<CityScheduleRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // City Override Form State
  const [formCity, setFormCity] = useState('')
  const [formState, setFormState] = useState('CA')
  const [formZips, setFormZips] = useState('')
  const [formDay, setFormDay] = useState<string>('saturday')
  const [formPickupStart, setFormPickupStart] = useState('09:00')
  const [formPickupEnd, setFormPickupEnd] = useState('11:00')
  const [formDeliveryStart, setFormDeliveryStart] = useState('13:00')
  const [formDeliveryEnd, setFormDeliveryEnd] = useState('16:00')
  const [formIsActive, setFormIsActive] = useState(true)
  const [savingCity, setSavingCity] = useState(false)

  // ── Toast Notification State ──
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(prev => prev?.message === message ? null : prev)
    }, 3500)
  }

  // ── Load All Data ──
  useEffect(() => {
    loadSettings()
    loadSchedules()
  }, [])

  const loadSettings = async () => {
    setSettingsLoading(true)
    const { data } = await adminApi.select('market_settings', '*', undefined, { limit: 1, single: true })
    if (data) {
      setProductsNeverExpire(data.products_never_expire ?? false)
    }
    setSettingsLoading(false)
  }

  const loadSchedules = async () => {
    setCitiesLoading(true)
    setDefaultLoading(true)

    const { data, error } = await adminApi.select('market_city_schedules', '*', undefined, {
      order: { column: 'city', ascending: true },
    })

    if (error) {
      console.error('Failed to load schedules:', error)
      showToast(typeof error === 'string' ? error : 'Failed to load schedules', 'error')
    } else if (data) {
      const allRows = data as CityScheduleRow[]
      const defRow = allRows.find(r => r.is_default)
      const overrides = allRows.filter(r => !r.is_default)

      if (defRow) {
        setDefaultSchedule(defRow)
        setDefDay(defRow.market_days?.[0] || 'saturday')
        const p = defRow.default_pickup_windows?.[0]
        setDefPickupStart(p?.start_time || '09:00')
        setDefPickupEnd(p?.end_time || '11:00')
        const d = defRow.default_delivery_windows?.[0]
        setDefDeliveryStart(d?.start_time || '13:00')
        setDefDeliveryEnd(d?.end_time || '16:00')
        setDefIsActive(defRow.is_active ?? false)
      }
      setCityOverrides(overrides)
    }
    setCitiesLoading(false)
    setDefaultLoading(false)
  }

  // ── Save Default Schedule ──
  const handleSaveDefaultSchedule = async () => {
    if (!defDay) {
      showToast('Select a default market day', 'error')
      return
    }

    setSavingDefault(true)

    const pickupWindows = [{
      day: defDay.toLowerCase(),
      start_time: defPickupStart,
      end_time: defPickupEnd,
    }]

    const deliveryWindows = [{
      day: defDay.toLowerCase(),
      start_time: defDeliveryStart,
      end_time: defDeliveryEnd,
    }]

    const payload = {
      city: 'All Cities (Default)',
      state: 'ALL',
      zipcodes: [],
      is_default: true,
      is_active: defIsActive,
      market_days: [defDay.toLowerCase()],
      default_pickup_windows: pickupWindows,
      default_delivery_windows: deliveryWindows,
      updated_at: new Date().toISOString(),
    }

    let res
    if (defaultSchedule?.id) {
      res = await adminApi.update('market_city_schedules', payload, { eq: { id: defaultSchedule.id } })
    } else {
      res = await adminApi.insert('market_city_schedules', payload)
    }

    if (res.error) {
      showToast(`Failed to save default schedule: ${res.error}`, 'error')
    } else {
      showToast(defIsActive ? 'Default Market Schedule is now Active platform-wide!' : 'Default Market Schedule disabled (only active override cities will run).')
      loadSchedules()
    }
    setSavingDefault(false)
  }

  // ── City Overrides Handlers ──
  const handleToggleCityActive = async (id: string, currentStatus: boolean, cityName: string) => {
    const nextStatus = !currentStatus
    const { error } = await adminApi.update('market_city_schedules', { is_active: nextStatus, updated_at: new Date().toISOString() }, { eq: { id } })
    if (error) {
      showToast(`Failed to update ${cityName}: ${error}`, 'error')
    } else {
      setCityOverrides(prev => prev.map(c => c.id === id ? { ...c, is_active: nextStatus } : c))
      showToast(`${cityName} Market Day is now ${nextStatus ? 'Active' : 'Inactive'}`)
    }
  }

  const handleOpenAddCity = () => {
    setEditingCityId(null)
    setFormCity('')
    setFormState('CA')
    setFormZips('')
    setFormDay('saturday')
    setFormPickupStart(defPickupStart || '09:00')
    setFormPickupEnd(defPickupEnd || '11:00')
    setFormDeliveryStart(defDeliveryStart || '13:00')
    setFormDeliveryEnd(defDeliveryEnd || '16:00')
    setFormIsActive(true)
    setIsEditingCity(true)
  }

  const handleOpenEditCity = (cityRow: CityScheduleRow) => {
    setEditingCityId(cityRow.id)
    setFormCity(cityRow.city)
    setFormState(cityRow.state || 'CA')
    setFormZips(Array.isArray(cityRow.zipcodes) ? cityRow.zipcodes.join(', ') : '')
    setFormDay(cityRow.market_days?.[0] || 'saturday')
    const p = cityRow.default_pickup_windows?.[0]
    setFormPickupStart(p?.start_time || '09:00')
    setFormPickupEnd(p?.end_time || '11:00')
    const d = cityRow.default_delivery_windows?.[0]
    setFormDeliveryStart(d?.start_time || '13:00')
    setFormDeliveryEnd(d?.end_time || '16:00')
    setFormIsActive(cityRow.is_active ?? true)
    setIsEditingCity(true)
  }

  const handleSaveCitySchedule = async () => {
    if (!formCity.trim()) {
      showToast('City name is required', 'error')
      return
    }
    if (!formDay) {
      showToast('Select a market day for this override', 'error')
      return
    }

    setSavingCity(true)

    const zipList = formZips
      .split(/[,\s\n]+/)
      .map(z => z.trim())
      .filter(z => z.length === 5 && /^\d+$/.test(z))

    const pickupWindows = [{
      day: formDay.toLowerCase(),
      start_time: formPickupStart,
      end_time: formPickupEnd,
    }]

    const deliveryWindows = [{
      day: formDay.toLowerCase(),
      start_time: formDeliveryStart,
      end_time: formDeliveryEnd,
    }]

    const payload = {
      city: formCity.trim(),
      state: formState.trim().toUpperCase() || 'CA',
      zipcodes: zipList,
      is_default: false,
      market_days: [formDay.toLowerCase()],
      default_pickup_windows: pickupWindows,
      default_delivery_windows: deliveryWindows,
      is_active: formIsActive,
      updated_at: new Date().toISOString(),
    }

    let res
    if (editingCityId) {
      res = await adminApi.update('market_city_schedules', payload, { eq: { id: editingCityId } })
    } else {
      res = await adminApi.insert('market_city_schedules', payload)
    }

    if (res.error) {
      showToast(`Failed to save city override: ${res.error}`, 'error')
    } else {
      showToast(`Successfully saved ${formCity} override!`)
      setIsEditingCity(false)
      loadSchedules()
    }
    setSavingCity(false)
  }

  const handleConfirmDeleteCity = async () => {
    if (!deletingCity) return
    setIsDeleting(true)
    const { error } = await adminApi.delete('market_city_schedules', { eq: { id: deletingCity.id } })
    if (error) {
      showToast(`Failed to delete override: ${error}`, 'error')
    } else {
      showToast(`Deleted ${deletingCity.city} override`)
      setDeletingCity(null)
      loadSchedules()
    }
    setIsDeleting(false)
  }

  // ── Save Global Settings ──
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    const { error } = await adminApi.update(
      'market_settings',
      {
        products_never_expire: productsNeverExpire,
        updated_at: new Date().toISOString(),
      },
      { eq: { id: true } }
    )

    if (error) {
      showToast(`Failed to save settings: ${error}`, 'error')
    } else {
      showToast('Market settings saved successfully')
    }
    setSavingSettings(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 16, maxWidth: 1100, width: '100%', position: 'relative' }}>
      {/* ─────────────────────────────────────────────────────────────
          STYLED FLOATING TOAST NOTIFICATION
          ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 9999,
          background: toast.type === 'success' ? '#064e3b' : '#7f1d1d',
          color: '#ffffff',
          padding: '12px 18px',
          borderRadius: 12,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 14,
          fontWeight: 600,
          border: `1px solid ${toast.type === 'success' ? '#059669' : '#dc2626'}`,
          animation: 'slideIn 0.25s ease-out',
        }}>
          {toast.type === 'success' ? (
            <CheckCircle2 size={18} color="#34d399" />
          ) : (
            <AlertTriangle size={18} color="#f87171" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: 16,
              cursor: 'pointer',
              marginLeft: 8,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          CARD 1: DEFAULT MARKET SCHEDULE (PLATFORM-WIDE)
          ───────────────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: 'white',
        border: `1px solid ${colors.gray[200]}`,
        borderRadius: 16,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={22} color={colors.green[600]} />
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
                Default Market Schedule (Platform-Wide)
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
                Base market fulfillment schedule applied to all cities without a custom override.
              </p>
            </div>
          </div>

          <ToggleSwitch
            checked={defIsActive}
            onChange={setDefIsActive}
            showLabels={true}
            activeLabel="Active Platform-Wide"
            inactiveLabel="Disabled Globally"
          />
        </div>

        {/* Informative Status Banner */}
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          background: defIsActive ? '#f0fdf4' : '#f9fafb',
          border: `1px solid ${defIsActive ? '#bbf7d0' : '#e5e7eb'}`,
          color: defIsActive ? '#166534' : '#4b5563',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>{defIsActive ? '🟢' : '⚪'}</span>
          <span>
            {defIsActive
              ? 'Market Days are ENABLED platform-wide. Any city without an override will inherit these days and windows.'
              : 'Market Days are DISABLED globally. Market Days will ONLY apply to the specific cities configured with an active City Override below.'}
          </span>
        </div>

        {defaultLoading ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Loading default schedule...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: defIsActive ? 1 : 0.75 }}>
            {/* Single Market Day Selector */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Default Market Day:
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ALL_DAYS.map(d => {
                  const isSelected = defDay === d.id
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDefDay(d.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 100,
                        fontSize: 12,
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        border: isSelected ? '1.5px solid #16a34a' : '1px solid #d1d5db',
                        background: isSelected ? '#16a34a' : '#f9fafb',
                        color: isSelected ? '#ffffff' : '#374151',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Default Pickup & Delivery Windows Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                  📍 Default Pickup Window:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="time"
                    value={defPickupStart}
                    onChange={e => setDefPickupStart(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 14,
                      flex: 1,
                    }}
                  />
                  <span style={{ color: '#9ca3af' }}>to</span>
                  <input
                    type="time"
                    value={defPickupEnd}
                    onChange={e => setDefPickupEnd(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 14,
                      flex: 1,
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                  🚗 Default Delivery Window:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="time"
                    value={defDeliveryStart}
                    onChange={e => setDefDeliveryStart(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 14,
                      flex: 1,
                    }}
                  />
                  <span style={{ color: '#9ca3af' }}>to</span>
                  <input
                    type="time"
                    value={defDeliveryEnd}
                    onChange={e => setDefDeliveryEnd(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 14,
                      flex: 1,
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                onClick={handleSaveDefaultSchedule}
                disabled={savingDefault}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: savingDefault ? 'wait' : 'pointer',
                }}
              >
                <Save size={15} color="white" />
                <span>{savingDefault ? 'Saving...' : 'Save Default Schedule'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          CARD 2: CITY OVERRIDES
          ───────────────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: 'white',
        border: `1px solid ${colors.gray[200]}`,
        borderRadius: 16,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MapPin size={22} color={colors.green[600]} />
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
                City Overrides
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
                Customized market days and fulfillment windows for specific cities & ZIP codes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenAddCity}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <Plus size={16} color="white" />
            <span>Add City Override</span>
          </button>
        </div>

        {citiesLoading ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Loading city overrides...</div>
        ) : cityOverrides.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: 12, color: '#6b7280', fontSize: 14 }}>
            No city overrides configured yet.
          </div>
        ) : (
          <div style={{ border: `1px solid ${colors.gray[200]}`, borderRadius: 12, overflow: 'hidden' }}>
            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1.2fr 1.8fr 1.8fr 100px 80px',
              backgroundColor: '#f9fafb',
              padding: '10px 16px',
              borderBottom: `1px solid ${colors.gray[200]}`,
              fontSize: 12,
              fontWeight: 700,
              color: '#6b7280',
              textTransform: 'uppercase',
            }}>
              <div>City & State</div>
              <div>Market Day</div>
              <div>Pickup Window</div>
              <div>Delivery Window</div>
              <div style={{ textAlign: 'center' }}>Status</div>
              <div style={{ textAlign: 'center' }}>Actions</div>
            </div>

            {/* Table Rows */}
            {cityOverrides.map((c, idx) => {
              const pWindow = c.default_pickup_windows?.[0]
              const dWindow = c.default_delivery_windows?.[0]
              const dayName = c.market_days?.[0] || 'saturday'
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.2fr 1.8fr 1.8fr 100px 80px',
                    padding: '12px 16px',
                    alignItems: 'center',
                    borderBottom: idx < cityOverrides.length - 1 ? `1px solid #f3f4f6` : 'none',
                    backgroundColor: c.is_active ? 'white' : '#f9fafb',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                      {c.city}, {c.state}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {Array.isArray(c.zipcodes) && c.zipcodes.length > 0 ? `${c.zipcodes.length} ZIP codes covered` : 'All ZIPs in city'}
                    </div>
                  </div>

                  <div>
                    <span
                      style={{
                        background: '#dcfce7',
                        color: '#15803d',
                        padding: '3px 10px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        display: 'inline-block',
                      }}
                    >
                      {dayName}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: '#374151' }}>
                    {pWindow ? `📍 ${pWindow.start_time} – ${pWindow.end_time}` : '—'}
                  </div>

                  <div style={{ fontSize: 13, color: '#374151' }}>
                    {dWindow ? `🚗 ${dWindow.start_time} – ${dWindow.end_time}` : '—'}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <ToggleSwitch
                      checked={c.is_active}
                      onChange={() => handleToggleCityActive(c.id, c.is_active, c.city)}
                      showLabels={true}
                      activeLabel="On"
                      inactiveLabel="Off"
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleOpenEditCity(c)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: 4 }}
                      title="Edit City Override"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingCity(c)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}
                      title="Delete City Override"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Add / Edit City Override Modal ── */}
        {isEditingCity && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}>
            <div style={{
              background: 'white',
              borderRadius: 16,
              maxWidth: 540,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
                  {editingCityId ? `Edit ${formCity} Override` : 'Add City Schedule Override'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditingCity(false)}
                  style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* City & State */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>City Name</label>
                    <input
                      type="text"
                      placeholder="e.g. San Jose"
                      value={formCity}
                      onChange={e => setFormCity(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>State</label>
                    <input
                      type="text"
                      placeholder="CA"
                      maxLength={2}
                      value={formState}
                      onChange={e => setFormState(e.target.value.toUpperCase())}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
                    />
                  </div>
                </div>

                {/* Covered ZIP Codes */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                    Covered 5-Digit ZIP Codes (Comma or space separated)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. 95125, 95120, 95124, 95112"
                    value={formZips}
                    onChange={e => setFormZips(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, fontFamily: 'inherit' }}
                  />
                  <span style={{ fontSize: 11, color: '#6b7280' }}>Providing ZIP codes ensures instant schedule matching when sellers/buyers enter their address.</span>
                </div>

                {/* Single Market Day */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Designated Market Day</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ALL_DAYS.map(d => {
                      const isSelected = formDay === d.id
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setFormDay(d.id)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 100,
                            fontSize: 12,
                            fontWeight: isSelected ? 700 : 500,
                            cursor: 'pointer',
                            border: isSelected ? '1.5px solid #16a34a' : '1px solid #d1d5db',
                            background: isSelected ? '#16a34a' : '#f9fafb',
                            color: isSelected ? '#ffffff' : '#374151',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Default Fulfillment Windows */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>📍 Default Pickup Window</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="time"
                        value={formPickupStart}
                        onChange={e => setFormPickupStart(e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, flex: 1 }}
                      />
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>–</span>
                      <input
                        type="time"
                        value={formPickupEnd}
                        onChange={e => setFormPickupEnd(e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, flex: 1 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>🚗 Default Delivery Window</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="time"
                        value={formDeliveryStart}
                        onChange={e => setFormDeliveryStart(e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, flex: 1 }}
                      />
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>–</span>
                      <input
                        type="time"
                        value={formDeliveryEnd}
                        onChange={e => setFormDeliveryEnd(e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, flex: 1 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Active Switch */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
                  <ToggleSwitch
                    checked={formIsActive}
                    onChange={setFormIsActive}
                    showLabels={true}
                    activeLabel="Active"
                    inactiveLabel="Disabled"
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setIsEditingCity(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCitySchedule}
                  disabled={savingCity}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#16a34a',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: savingCity ? 'wait' : 'pointer',
                  }}
                >
                  {savingCity ? 'Saving...' : 'Save Override'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Styled Delete Confirmation Modal ── */}
        {deletingCity && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}>
            <div style={{
              background: 'white',
              borderRadius: 16,
              maxWidth: 440,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                }}>
                  <Trash2 size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>
                  Delete City Override
                </h3>
              </div>

              <p style={{ margin: '0 0 20px', fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>
                Are you sure you want to delete the schedule override for <strong>{deletingCity.city}, {deletingCity.state}</strong>?
                This city will immediately revert to the default platform schedule.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setDeletingCity(null)}
                  disabled={isDeleting}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteCity}
                  disabled={isDeleting}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#dc2626',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: isDeleting ? 'wait' : 'pointer',
                  }}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Override'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          CARD 3: GLOBAL MARKET SETTINGS
          ───────────────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: 'white',
        border: `1px solid ${colors.gray[200]}`,
        borderRadius: 16,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Store size={22} color={colors.green[600]} />
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
              Global Market Settings
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              Platform-wide listing retention policy
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Products Never Expire</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>When enabled, seller listings remain active indefinitely instead of expiring based on post type policies.</div>
            </div>
            <ToggleSwitch
              checked={productsNeverExpire}
              onChange={setProductsNeverExpire}
              showLabels={true}
              activeLabel="Enabled"
              inactiveLabel="Disabled"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings || settingsLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 18px',
                fontWeight: 600,
                fontSize: 13,
                cursor: (savingSettings || settingsLoading) ? 'wait' : 'pointer',
              }}
            >
              <Save size={15} color="white" />
              <span>{savingSettings ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
