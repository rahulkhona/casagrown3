'use client'

import { useState, useEffect, use, KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../../../lib/useAuth'
import { useSubscription } from '../../../../lib/useSubscription'
import { createClient } from '../../../../lib/supabase'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import AddressInput from '../../../components/AddressInput'
import { formatUsd } from '../../../../lib/store'
import { getBoothProductShareMessage, type SharePlatformType } from '../../../../lib/shareMessages'
import { geocodeAddress, toPostgisPoint } from '../../../../lib/geocode'
import SocialShareModal from '../../../components/SocialShareModal'
import { useProEnabled } from '../../../../lib/useProEnabled'
import { HelperDMModal } from '../../my-booth/components/HelperDMModal'
import { type AddressFields, EMPTY_ADDRESS, formatFullAddress, buildAddress, toGeocodingString, normalizeStateCode } from '../../../../lib/address'
import { resolveActiveCitySchedule, formatMarketDaySummary, type CityMarketSchedule } from '../../../../lib/marketCitySchedules'
import { FULFILLMENT_PRESET_OPTIONS, type FulfillmentPresetType } from '../../../../lib/bulkListingUtils'
import QRCode from 'react-qr-code'

import styles from './page.module.css'

// ── Theme Colors for banner gradients ──
const THEME_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  floral:   { bg: '#fdf2f8', border: '#ec4899', text: '#831843' },
  rustic:   { bg: '#fef3c7', border: '#d97706', text: '#78350f' },
  tropical: { bg: '#ecfccb', border: '#84cc16', text: '#365314' },
  minimal:  { bg: '#f0fdf4', border: '#22c55e', text: '#14532d' },
  harvest:  { bg: '#fff7ed', border: '#f97316', text: '#7c2d12' },
  cottage:  { bg: '#faf5ff', border: '#a855f7', text: '#581c87' },
}

const THEMES = [
  { id: 'floral', name: 'Floral', emoji: '🌸' },
  { id: 'rustic', name: 'Rustic', emoji: '🪵' },
  { id: 'tropical', name: 'Tropical', emoji: '🌴' },
  { id: 'minimal', name: 'Minimal', emoji: '🌿' },
  { id: 'harvest', name: 'Harvest', emoji: '🌾' },
  { id: 'cottage', name: 'Cottage', emoji: '🏡' },
]

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

interface FulfillmentWindow {
  id: string
  window_type: 'delivery' | 'pickup'
  day_of_week: string
  start_time: string
  end_time: string
}

interface StandData {
  id: string
  name: string
  description: string | null
  header_image_url: string | null
  is_active: boolean
  offers_pickup: boolean
  offers_delivery: boolean
  delivery_radius_miles: number | null
  pickup_address: string | null
  delivery_zipcodes: string[] | null
  decorative_theme: string | null
  about_html: string | null
  booth_addr: AddressFields
  pickup_addr: AddressFields
  fulfillment_windows: FulfillmentWindow[]
  // Keep old fields for backwards compat during transition
  booth_address: string | null
  weekly_delivery_windows: WeeklyWindows | null
  weekly_pickup_windows: WeeklyWindows | null
}

interface ProductRow {
  id: string
  name: string
  description: string | null
  photos: string[]
  price_usd: number
  unit: string
  inventory: number
  is_active: boolean
  is_draft: boolean
  category: string
  has_orders: boolean
}

export default function StandDetailPage({ params }: { params: Promise<{ boothId: string }> }) {
  const unwrappedParams = use(params)
  const boothId = unwrappedParams.boothId
  const { user, loading: authLoading, isAuthenticated } = useAuth()
  const { isPro, isElite, loading: subLoading } = useSubscription()
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const proEnabled = useProEnabled()

  const [stand, setStand] = useState<StandData | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [productsLoading, setProductsLoading] = useState(true)
  const [isHelperView, setIsHelperView] = useState(false)
  const [showShareToast, setShowShareToast] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareProduct, setShareProduct] = useState<ProductRow | null>(null)

  // Helpers state
  interface BoothHelper {
    id: string
    helper_id: string
    status: string
    role: string
    created_at: string
    profile?: { id?: string; full_name: string | null; email?: string | null } | null
  }
  const [helpers, setHelpers] = useState<BoothHelper[]>([])
  const [helperPasscode, setHelperPasscode] = useState<string | null>(null)
  const [generatingPasscode, setGeneratingPasscode] = useState(false)
  const [removingHelper, setRemovingHelper] = useState<string | null>(null)
  const [showHelperDM, setShowHelperDM] = useState(false)
  const [showHelperShareModal, setShowHelperShareModal] = useState(false)
  const [toastMessage, setToastMessage] = useState('✅ Copied!')

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(searchParams.get('edit') === 'true')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPickupAddr, setEditPickupAddr] = useState<AddressFields>(EMPTY_ADDRESS)
  const [editDeliveryRadius, setEditDeliveryRadius] = useState('5')
  const [editOffersPickup, setEditOffersPickup] = useState(false)
  const [editOffersDelivery, setEditOffersDelivery] = useState(false)

  // New customization states
  const [editTheme, setEditTheme] = useState('floral')
  const [editAboutHtml, setEditAboutHtml] = useState('')
  const [editBannerUrl, setEditBannerUrl] = useState('')
  const [editDeliveryZipcodes, setEditDeliveryZipcodes] = useState<string[]>([])
  const [zipInput, setZipInput] = useState('')
  const [editIsOpen, setEditIsOpen] = useState(true)

  // Decomposed booth address + fulfillment windows
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [editBoothAddr, setEditBoothAddr] = useState<AddressFields>(EMPTY_ADDRESS)
  const [editWeeklyDeliveryWindows, setEditWeeklyDeliveryWindows] = useState<WeeklyWindows>({})
  const [editWeeklyPickupWindows, setEditWeeklyPickupWindows] = useState<WeeklyWindows>({})
  const [editDeliveryPreset, setEditDeliveryPreset] = useState<FulfillmentPresetType>('city_market_day')
  const [editPickupPreset, setEditPickupPreset] = useState<FulfillmentPresetType>('city_market_day')
  const [locating, setLocating] = useState(false)
  const [locatingPickup, setLocatingPickup] = useState(false)

  const [saving, setSaving] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Platform Sync state
  const [hasGoogleConnection, setHasGoogleConnection] = useState(false)
  const [editGoogleSyncEnabled, setEditGoogleSyncEnabled] = useState(true)

  // Catalog state
  interface CatalogItem {
    id: string
    name: string
    description: string | null
    category: string
    photos: string[]
    default_price_usd: number | null
    default_unit: string
    total_inventory: number
    allocated: number
  }
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [showAddChoice, setShowAddChoice] = useState(false)
  const [showCatalogPicker, setShowCatalogPicker] = useState(false)
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null)
  const [allocQty, setAllocQty] = useState('1')
  const [allocPrice, setAllocPrice] = useState('')
  const [allocating, setAllocating] = useState(false)
  const [activeCitySchedule, setActiveCitySchedule] = useState<CityMarketSchedule | null>(null)

  // Resolve active city schedule
  useEffect(() => {
    resolveActiveCitySchedule(supabase, {
      city: editBoothAddr.city,
      state: editBoothAddr.state,
      zip: editBoothAddr.zip
    }, true).then(sched => {
      setActiveCitySchedule(sched || null)
    })
  }, [editBoothAddr.city, editBoothAddr.state, editBoothAddr.zip])

  // Auth guard
  useEffect(() => {
    if (!authLoading && !subLoading && !isAuthenticated) {
      router.replace(`/login?redirect=/my-stands/${boothId}`)
    }
  }, [authLoading, subLoading, isAuthenticated, router, boothId])

  // Fetch stand data
  useEffect(() => {
    if (authLoading || subLoading || !user) return
    const load = async () => {
      // First try as owner
      let booth: any = null
      let isHelper = false
      const { data: ownedBooth } = await supabase
        .from('market_booths')
        .select('*')
        .eq('id', boothId)
        .eq('owner_id', user.id)
        .single()

      if (ownedBooth) {
        booth = ownedBooth
      } else {
        // Check if user is an accepted helper
        const { data: helperRow } = await supabase
          .from('booth_helpers')
          .select('booth_id')
          .eq('booth_id', boothId)
          .eq('helper_id', user.id)
          .eq('status', 'accepted')
          .single()
        if (helperRow) {
          const { data: helperBooth } = await supabase
            .from('market_booths')
            .select('*')
            .eq('id', boothId)
            .single()
          if (helperBooth) {
            booth = helperBooth
            isHelper = true
          }
        }
      }

      if (!booth) {
        router.replace('/my-stands')
        return
      }

      setIsHelperView(isHelper)

      // Fetch fulfillment windows from the new table
      const { data: windows } = await supabase
        .from('booth_fulfillment_windows')
        .select('*')
        .eq('booth_id', boothId)
        .order('day_of_week')

      const standData: StandData = {
        id: booth.id,
        name: booth.name || 'Unnamed Stand',
        description: booth.description || null,
        header_image_url: booth.header_image_url || null,
        is_active: booth.is_active !== false,
        offers_pickup: booth.offers_pickup ?? false,
        offers_delivery: booth.offers_delivery ?? false,
        delivery_radius_miles: booth.delivery_radius_miles ?? null,
        pickup_address: booth.pickup_address || null,
        delivery_zipcodes: booth.delivery_zipcodes || [],
        decorative_theme: booth.decorative_theme || 'floral',
        about_html: booth.about_html || '',
        booth_addr: buildAddress(booth.booth_street, booth.booth_city, booth.booth_state, booth.booth_zip),
        pickup_addr: buildAddress(booth.pickup_street, booth.pickup_city, booth.pickup_state, booth.pickup_zip),
        fulfillment_windows: (windows || []) as FulfillmentWindow[],
        booth_address: booth.booth_address || booth.pickup_address || null,
        weekly_delivery_windows: booth.weekly_delivery_windows || null,
        weekly_pickup_windows: booth.weekly_pickup_windows || null,
      }
      setStand(standData)
      setEditName(standData.name)
      setEditDescription(standData.description || '')
      setEditPickupAddr(standData.pickup_addr)
      setEditDeliveryRadius(String(standData.delivery_radius_miles || 5))
      setEditOffersPickup(standData.offers_pickup)
      setEditOffersDelivery(standData.offers_delivery)
      setEditTheme(standData.decorative_theme || 'floral')
      setEditAboutHtml(standData.about_html || '')
      setEditBannerUrl(standData.header_image_url || '')
      setEditDeliveryZipcodes(standData.delivery_zipcodes || [])
      setEditIsOpen(standData.is_active)
      setEditBoothAddr(standData.booth_addr)

      // If booth/pickup address is empty, pre-fill from profile
      if (!standData.booth_addr.street) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('street_address, city, state_code, zip_code')
          .eq('id', user.id)
          .single()
        if (profile?.street_address) {
          let street = profile.street_address || ''
          let city = profile.city || ''
          let state = profile.state_code || ''
          let zip = profile.zip_code || ''
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
          setEditBoothAddr(profileAddr)
          if (!standData.pickup_addr.street) setEditPickupAddr(profileAddr)
        }
      }
      // Convert fulfillment windows to WeeklyWindows for the editor
      const delWin: WeeklyWindows = {}
      const pickWin: WeeklyWindows = {}
      for (const w of standData.fulfillment_windows) {
        const startH = parseInt(w.start_time.split(':')[0])
        const endH = parseInt(w.end_time.split(':')[0])
        const slotId = `${startH}-${endH}`
        if (w.window_type === 'delivery') {
          if (!delWin[w.day_of_week]) delWin[w.day_of_week] = []
          delWin[w.day_of_week].push(slotId)
        } else {
          if (!pickWin[w.day_of_week]) pickWin[w.day_of_week] = []
          pickWin[w.day_of_week].push(slotId)
        }
      }
      setEditWeeklyDeliveryWindows(delWin)
      setEditWeeklyPickupWindows(pickWin)
      if (Object.keys(delWin).length > 0) {
        setEditDeliveryPreset('custom')
      }
      if (Object.keys(pickWin).length > 0) {
        setEditPickupPreset('custom')
      }
      setLoading(false)



      // Google connection
      supabase
        .from('seller_google_connections')
        .select('auto_sync_catalog')
        .eq('user_id', user.id)
        .single()
        .then(({ data: gConn }: { data: any }) => {
          if (gConn?.auto_sync_catalog) {
            setHasGoogleConnection(true)
          }
        })


      // Fetch products
      const { data: prods } = await supabase
        .from('market_products')
        .select('*')
        .eq('booth_id', boothId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })

      if (prods) {
        // Check which products have associated orders
        const prodIds = prods.map((p: any) => p.id)
        let orderProductIds = new Set<string>()
        if (prodIds.length > 0) {
          const { data: orderRows } = await supabase
            .from('market_orders')
            .select('product_id')
            .in('product_id', prodIds)
          if (orderRows) {
            orderProductIds = new Set(orderRows.map((o: any) => o.product_id))
          }
        }
        setProducts(prods.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          photos: p.photos || [],
          price_usd: p.price_usd,
          unit: p.unit || 'each',
          inventory: p.inventory,
          is_active: p.is_active,
          is_draft: p.is_draft,
          category: p.category || 'other',
          has_orders: orderProductIds.has(p.id),
        })))
      }
      setProductsLoading(false)

      // Fetch catalog items with allocation counts
      const { data: catItems } = await supabase
        .from('catalog_items')
        .select('*')
        .eq('owner_id', user.id)
        .order('name')
      if (catItems && catItems.length > 0) {
        // Get allocation counts per catalog item
        const { data: allocs } = await supabase
          .from('market_products')
          .select('catalog_item_id, inventory')
          .in('catalog_item_id', catItems.map((c: any) => c.id))
          .eq('is_deleted', false)
          .eq('is_active', true)
        const allocMap: Record<string, number> = {}
        if (allocs) allocs.forEach((a: any) => {
          allocMap[a.catalog_item_id] = (allocMap[a.catalog_item_id] || 0) + (a.inventory || 0)
        })
        setCatalogItems(catItems.map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          category: c.category || 'other',
          photos: c.photos || [],
          default_price_usd: c.default_price_usd,
          default_unit: c.default_unit || 'each',
          total_inventory: c.total_inventory || 0,
          allocated: allocMap[c.id] || 0,
        })))
      }
    }
    load()
  }, [user?.id, authLoading, subLoading, boothId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleShare = () => {
    setShowShareModal(true)
  }

  const boothShareUrl = typeof window !== 'undefined' ? `${window.location.origin}/market/booth/${boothId}` : ''
  const boothShareMessage = stand ? `Hey! 🌱 Check out my produce stand "${stand.name}" on CasaGrown Market!\n\nFresh produce straight from my backyard.\n\n👇 Click the link below to browse and shop:\n${boothShareUrl}\n\nFresh. Local. Trusted.` : ''

  // Fetch helpers
  useEffect(() => {
    if (!user || !boothId) return
    const loadHelpers = async () => {
      // Get helpers with profile info
      const { data: helperRows } = await supabase
        .from('booth_helpers')
        .select('id, helper_id, status, role, created_at')
        .eq('booth_id', boothId)
        .order('created_at')
      if (helperRows) {
        // Fetch profile names
        const helperIds = helperRows.map((h: any) => h.helper_id)
        if (helperIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', helperIds)
          const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || [])
          setHelpers(helperRows.map((h: any) => ({
            ...h,
            profile: profileMap.get(h.helper_id) || null,
          })))
        } else {
          setHelpers([])
        }
      }
      // Get passcode
      const { data: boothData } = await supabase
        .from('market_booths')
        .select('helper_passcode')
        .eq('id', boothId)
        .single()
      if (boothData) setHelperPasscode(boothData.helper_passcode)
    }
    loadHelpers()
  }, [user?.id, boothId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGeneratePasscode = async () => {
    setGeneratingPasscode(true)
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { error } = await supabase
      .from('market_booths')
      .update({ helper_passcode: code })
      .eq('id', boothId)
    if (!error) setHelperPasscode(code)
    setGeneratingPasscode(false)
  }

  const handleRemoveHelper = async (helperId: string) => {
    if (!confirm('Remove this helper from your stand?')) return
    setRemovingHelper(helperId)
    await supabase.from('booth_helpers').delete().eq('id', helperId)
    setHelpers(prev => prev.filter(h => h.id !== helperId))
    setRemovingHelper(null)
  }

  // Handle banner image upload to storage
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadingBanner(true)
    setError(null)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/stands/${Date.now()}_banner.${ext}`
      const { error: uploadErr } = await supabase.storage.from('product-photos').upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr
      const { data: urlData } = supabase.storage.from('product-photos').getPublicUrl(path)
      if (urlData?.publicUrl) {
        setEditBannerUrl(urlData.publicUrl)
      }
    } catch (err: any) {
      setError('Banner upload failed: ' + err.message)
    } finally {
      setUploadingBanner(false)
    }
  }

  // Geolocation for booth or pickup address
  const handleUseCurrentLocation = async (target: 'booth' | 'pickup' = 'booth') => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    if (target === 'pickup') setLocatingPickup(true)
    else setLocating(true)
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
          const addrFields: AddressFields = { street, city, state: st, zip }
          if (target === 'pickup') setEditPickupAddr(addrFields)
          else setEditBoothAddr(addrFields)
        }
      } catch {
        alert('Could not fetch address for your location. Please enter it manually.')
      } finally {
        if (target === 'pickup') setLocatingPickup(false)
        else setLocating(false)
      }
    }, () => {
      if (target === 'pickup') setLocatingPickup(false)
      else setLocating(false)
      alert('Could not access your location. Please check your browser permissions.')
    })
  }

  const handleAddZip = () => {
    const cleaned = zipInput.trim()
    if (cleaned && /^\d{5}$/.test(cleaned) && !editDeliveryZipcodes.includes(cleaned)) {
      setEditDeliveryZipcodes([...editDeliveryZipcodes, cleaned])
    }
    setZipInput('')
  }

  const handleDeleteProduct = async (productId: string) => {
    const { error } = await supabase
      .from('market_products')
      .update({ is_deleted: true, is_active: false })
      .eq('id', productId)
    if (!error) {
      setProducts(prev => prev.filter(p => p.id !== productId))
      setConfirmDeleteId(null)
    }
  }

  const handleArchiveProduct = async (productId: string) => {
    const { error } = await supabase
      .from('market_products')
      .update({ is_active: false, expires_at: new Date().toISOString() })
      .eq('id', productId)
    if (!error) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, is_active: false } : p))
      setConfirmDeleteId(null)
    }
  }

  const handleZipKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddZip()
    }
  }

  const handleSaveEdit = async () => {
    if (!stand || !user) return
    setError(null)
    setSaving(true)

    try {
      // Validate
      const errs: Record<string, string> = {}
      if (!editOffersDelivery && !editOffersPickup) {
        errs.fulfillment = 'Enable at least one: delivery or pickup'
      }
      if (editOffersDelivery && Object.keys(editWeeklyDeliveryWindows).length === 0) {
        errs.deliveryWindows = 'Select at least one delivery day and time slot'
      }
      if (editOffersPickup && Object.keys(editWeeklyPickupWindows).length === 0) {
        errs.pickupWindows = 'Select at least one pickup day and time slot'
      }
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs)
        setSaving(false)
        return
      }
      setFieldErrors({})

      const boothFullAddr = formatFullAddress(editBoothAddr)
      const pickupFullAddr = formatFullAddress(editPickupAddr)

      const dbRow: Record<string, any> = {
        name: editName.trim(),
        description: editDescription.trim() || null,
        // Decomposed booth address
        booth_street: editBoothAddr.street.trim() || null,
        booth_city: editBoothAddr.city.trim() || null,
        booth_state: normalizeStateCode(editBoothAddr.state) || null,
        booth_zip: editBoothAddr.zip.trim() || null,
        booth_address: boothFullAddr || null, // keep legacy column in sync
        // Decomposed pickup address
        pickup_street: editOffersPickup ? (editPickupAddr.street.trim() || null) : null,
        pickup_city: editOffersPickup ? (editPickupAddr.city.trim() || null) : null,
        pickup_state: editOffersPickup ? (normalizeStateCode(editPickupAddr.state) || null) : null,
        pickup_zip: editOffersPickup ? (editPickupAddr.zip.trim() || null) : null,
        pickup_address: editOffersPickup ? (pickupFullAddr || null) : null, // keep legacy column in sync
        delivery_radius_miles: editOffersDelivery ? (parseInt(editDeliveryRadius) || 0) : null,
        offers_pickup: editOffersPickup,
        offers_delivery: editOffersDelivery,
        decorative_theme: editTheme,
        about_html: editAboutHtml.trim() || null,
        header_image_url: editBannerUrl || null,
        is_open: editIsOpen,
        delivery_zipcodes: editOffersDelivery && editDeliveryZipcodes.length > 0 ? editDeliveryZipcodes : null,
        // Keep legacy JSONB in sync for now
        weekly_delivery_windows: editOffersDelivery && Object.keys(editWeeklyDeliveryWindows).length > 0 ? editWeeklyDeliveryWindows : null,
        weekly_pickup_windows: editOffersPickup && Object.keys(editWeeklyPickupWindows).length > 0 ? editWeeklyPickupWindows : null,
      }

      // Geocode booth address if changed
      const oldBoothAddr = formatFullAddress(stand.booth_addr)
      if (boothFullAddr && boothFullAddr !== oldBoothAddr) {
        const geo = await geocodeAddress(boothFullAddr)
        if (geo) {
          dbRow.booth_location = toPostgisPoint(geo.lat, geo.lng)
        }
      }

      // Geocode pickup address if changed and offers pickup
      const oldPickupAddr = formatFullAddress(stand.pickup_addr)
      if (editOffersPickup && pickupFullAddr && pickupFullAddr !== oldPickupAddr) {
        const geo = await geocodeAddress(pickupFullAddr)
        if (geo) {
          dbRow.pickup_location = toPostgisPoint(geo.lat, geo.lng)
        }
      }

      const { error: updateErr } = await supabase
        .from('market_booths')
        .update(dbRow)
        .eq('id', stand.id)
        .eq('owner_id', user.id)

      if (updateErr) throw updateErr

      // Save fulfillment windows to the relational table
      // Delete existing windows and re-insert
      await supabase
        .from('booth_fulfillment_windows')
        .delete()
        .eq('booth_id', stand.id)

      const windowRows: { booth_id: string; window_type: string; day_of_week: string; start_time: string; end_time: string }[] = []

      // Delivery windows
      if (editOffersDelivery) {
        for (const [day, slots] of Object.entries(editWeeklyDeliveryWindows)) {
          for (const slot of slots) {
            if (slot.startsWith('custom-')) {
              const parts = slot.replace('custom-', '').split('-')
              windowRows.push({ booth_id: stand.id, window_type: 'delivery', day_of_week: day, start_time: parts[0], end_time: parts[1] })
            } else {
              const [startH, endH] = slot.split('-').map(Number)
              windowRows.push({ booth_id: stand.id, window_type: 'delivery', day_of_week: day, start_time: `${startH}:00`, end_time: `${endH}:00` })
            }
          }
        }
      }

      // Pickup windows
      if (editOffersPickup) {
        for (const [day, slots] of Object.entries(editWeeklyPickupWindows)) {
          for (const slot of slots) {
            if (slot.startsWith('custom-')) {
              const parts = slot.replace('custom-', '').split('-')
              windowRows.push({ booth_id: stand.id, window_type: 'pickup', day_of_week: day, start_time: parts[0], end_time: parts[1] })
            } else {
              const [startH, endH] = slot.split('-').map(Number)
              windowRows.push({ booth_id: stand.id, window_type: 'pickup', day_of_week: day, start_time: `${startH}:00`, end_time: `${endH}:00` })
            }
          }
        }
      }

      if (windowRows.length > 0) {
        const { error: winErr } = await supabase
          .from('booth_fulfillment_windows')
          .insert(windowRows)
        if (winErr) console.error('Failed to save fulfillment windows:', winErr)
      }



      // Navigate back to My Booths
      router.push('/my-stands')
    } catch (err: any) {
      setError('Failed to update booth: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || subLoading || !isAuthenticated) {
    return <LoadingSpinner />
  }

  if (loading) {
    return <LoadingSpinner message="Loading stand..." />
  }

  if (!stand) {
    return <LoadingSpinner message="Stand not found..." />
  }

  return (
    <div className={styles.page}>
      {/* Back navigation */}
      <Link href="/my-stands" className={styles.backNav}>
        ← Back to My Produce Stands
      </Link>

      {/* Stand Header */}
      <div className={styles.standHeader}>
        <div className={styles.bannerArea}>
          {stand.header_image_url && (
            <img src={stand.header_image_url} alt={stand.name} />
          )}
          <div className={styles.bannerOverlay} />
        </div>
        <div className={styles.headerInfo}>
          <h1 className={styles.standTitle}>{stand.name}</h1>
          <span className={`${styles.standStatus} ${stand.is_active ? styles.active : styles.inactive}`}>
            {stand.is_active ? '● Active' : '● Inactive'}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className={styles.actionRow}>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={() => {
            if (catalogItems.length > 0) {
              setShowAddChoice(true)
            } else {
              router.push(`/my-booth/products/new?booth=${boothId}`)
            }
          }}
        >
          ➕ Add Listing
        </button>
        {!isHelperView && (
          <button
            className={styles.actionBtn}
            onClick={() => setShowEditModal(true)}
          >
            ✏️ Edit Stand
          </button>
        )}
        <button className={styles.actionBtn} onClick={handleShare}>
          🔗 Share
        </button>
      </div>

      {/* Settings Section — owner only */}
      {!isHelperView && (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>⚙️ Stand Settings</h2>
        <div className={styles.settingsGrid}>
          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>Stand Name</span>
            <span className={styles.settingValue}>{stand.name}</span>
          </div>
          {stand.description && (
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Description</span>
              <span className={styles.settingValue}>{stand.description}</span>
            </div>
          )}
          {(stand.booth_addr.street || stand.booth_addr.city) && (
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Base Address</span>
              <span className={styles.settingValue}>{formatFullAddress(stand.booth_addr)}</span>
            </div>
          )}
          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>Fulfillment</span>
            <div className={styles.fulfillmentRow}>
              {stand.offers_pickup && (
                <span className={styles.fulfillmentChip}>📍 Pickup</span>
              )}
              {stand.offers_delivery && (
                <span className={styles.fulfillmentChip}>
                  🚗 Delivery {stand.delivery_radius_miles ? `(${stand.delivery_radius_miles} mi)` : '(Zip only)'}
                </span>
              )}
              {!stand.offers_pickup && !stand.offers_delivery && (
                <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>
                  No fulfillment options set
                </span>
              )}
            </div>
          </div>
          {stand.offers_pickup && (stand.pickup_addr.street || stand.pickup_addr.city) && (
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Pickup Address</span>
              <span className={styles.settingValue}>{formatFullAddress(stand.pickup_addr)}</span>
            </div>
          )}
          {stand.offers_delivery && (
            <>
              {stand.delivery_radius_miles && (
                <div className={styles.settingItem}>
                  <span className={styles.settingLabel}>Delivery Radius</span>
                  <span className={styles.settingValue}>{stand.delivery_radius_miles ? `${stand.delivery_radius_miles} miles from base address` : 'Zip codes only'}</span>
                </div>
              )}
              {stand.delivery_zipcodes && stand.delivery_zipcodes.length > 0 && (
                <div className={styles.settingItem}>
                  <span className={styles.settingLabel}>Delivery Zip Codes</span>
                  <span className={styles.settingValue}>{stand.delivery_zipcodes.join(', ')}</span>
                </div>
              )}
            </>
          )}
          {/* Fulfillment Windows from relational table */}
          {(() => {
            const deliveryWindows = stand.fulfillment_windows.filter(w => w.window_type === 'delivery')
            const pickupWindows = stand.fulfillment_windows.filter(w => w.window_type === 'pickup')
            const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
            const dayLabels: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
            const fmtTime = (t: string) => {
              const h = parseInt(t.split(':')[0])
              return h > 12 ? `${h - 12}pm` : h === 12 ? '12pm' : h === 0 ? '12am' : `${h}am`
            }
            const groupByDay = (windows: FulfillmentWindow[]) => {
              const byDay: Record<string, FulfillmentWindow[]> = {}
              for (const w of windows) {
                if (!byDay[w.day_of_week]) byDay[w.day_of_week] = []
                byDay[w.day_of_week].push(w)
              }
              return Object.entries(byDay).sort((a, b) => dayOrder.indexOf(a[0]) - dayOrder.indexOf(b[0]))
            }
            return (
              <>
                {deliveryWindows.length > 0 && (
                  <div className={styles.settingItem}>
                    <span className={styles.settingLabel}>Delivery Windows</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {groupByDay(deliveryWindows).map(([day, wins]) => (
                        <span key={day} className={styles.settingValue} style={{ fontSize: 13 }}>
                          <strong>{dayLabels[day] || day}:</strong>{' '}
                          {wins.map(w => `${fmtTime(w.start_time)}–${fmtTime(w.end_time)}`).join(', ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {pickupWindows.length > 0 && (
                  <div className={styles.settingItem}>
                    <span className={styles.settingLabel}>Pickup Windows</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {groupByDay(pickupWindows).map(([day, wins]) => (
                        <span key={day} className={styles.settingValue} style={{ fontSize: 13 }}>
                          <strong>{dayLabels[day] || day}:</strong>{' '}
                          {wins.map(w => `${fmtTime(w.start_time)}–${fmtTime(w.end_time)}`).join(', ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(stand.offers_delivery || stand.offers_pickup) && deliveryWindows.length === 0 && pickupWindows.length === 0 && (
                  <div className={styles.settingItem}>
                    <span className={styles.settingLabel}>⚠️ Fulfillment Windows</span>
                    <span className={styles.settingValue} style={{ color: 'var(--amber-600)', fontSize: 13 }}>
                      No windows configured. Tap &quot;Edit Booth&quot; to set your availability schedule.
                    </span>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>
      )}

      {/* Listings Section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>📦 Listings ({products.length})</h2>

        {productsLoading ? (
          <LoadingSpinner message="Loading products..." />
        ) : products.length === 0 ? (
          <div className={styles.emptyListings}>
            <span style={{ fontSize: 40 }}>📦</span>
            <p className={styles.emptyListingsText}>
              No listings yet. Add your first product to this stand.
            </p>
            <Link
              href={`/my-booth/products/new?booth=${boothId}`}
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            >
              ➕ Add Listing
            </Link>
          </div>
        ) : (
          <div className={styles.listingsGrid}>
            {products.map(product => (
              <div
                key={product.id}
                className={styles.listingCard}
                style={{ position: 'relative' }}
              >
                <Link
                  href={`/my-booth/products/${product.id}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                  <div className={styles.listingImage}>
                    {product.photos[0] ? (
                      <img src={product.photos[0]} alt={product.name} />
                    ) : (
                      <span className={styles.listingEmoji}>🥬</span>
                    )}
                  </div>
                  <div className={styles.listingInfo}>
                    <strong>{product.name}</strong>
                    <span className={styles.listingPrice}>
                      {product.price_usd === 0 ? 'Free' : `${formatUsd(product.price_usd)}/${product.unit}`}
                    </span>
                    <span className={styles.listingStock}>
                      {product.inventory > 0 ? `${product.inventory} in stock` : 'Sold out'}
                    </span>
                  </div>
                </Link>
                {/* Product action buttons */}
                {!isHelperView && (
                  confirmDeleteId === product.id ? (
                    /* Inline delete/archive confirmation */
                    <div className={styles.cardConfirmBox}>
                      <div className={product.has_orders ? styles.cardConfirmTextArchive : styles.cardConfirmTextDelete}>
                        {product.has_orders ? 'Archive this listing?' : 'Delete this listing?'}
                      </div>
                      <div className={styles.cardConfirmBtns}>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            product.has_orders ? handleArchiveProduct(product.id) : handleDeleteProduct(product.id)
                          }}
                          className={product.has_orders ? styles.cardConfirmBtnArchive : styles.cardConfirmBtnDelete}
                        >
                          {product.has_orders ? 'Yes, archive' : 'Yes, delete'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setConfirmDeleteId(null)
                          }}
                          className={styles.cardConfirmBtnCancel}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal action buttons */
                    <div className={styles.productActionRow}>
                      <Link
                        href={`/my-booth/products/new?edit=${product.id}&booth=${boothId}`}
                        className={`${styles.cardActionBtnSmall} ${styles.cardBtnEdit}`}
                      >
                        <span>✏️</span>
                        <span>Edit</span>
                      </Link>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setShareProduct(product)
                        }}
                        className={`${styles.cardActionBtnSmall} ${styles.cardBtnShare}`}
                      >
                        <span>📣</span>
                        <span>Share</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setConfirmDeleteId(product.id)
                        }}
                        className={`${styles.cardActionBtnSmall} ${product.has_orders ? styles.cardBtnArchive : styles.cardBtnDelete}`}
                      >
                        <span>{product.has_orders ? '📦' : '🗑️'}</span>
                        <span>{product.has_orders ? 'Archive' : 'Delete'}</span>
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
            {/* Add listing card */}
            <Link
              href={`/my-booth/products/new?booth=${boothId}`}
              className={styles.listingCard}
              style={{ border: '2px dashed var(--gray-200)', background: 'var(--gray-50)' }}
            >
              <div className={styles.listingImage} style={{ background: 'transparent' }}>
                <span style={{ fontSize: 32, color: 'var(--green-500)' }}>+</span>
              </div>
              <div className={styles.listingInfo}>
                <strong style={{ color: 'var(--green-600)' }}>Add Listing</strong>
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* Helpers Section — owner only */}
      {!isHelperView && (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>👥 Helpers</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>
          Helpers can manage products and orders for this booth.
        </p>

        {/* Passcode */}
        <div style={{
          padding: '14px 16px', borderRadius: 12,
          background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 6 }}>Pairing Code</div>
          {helperPasscode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <code style={{
                fontSize: 20, fontWeight: 700, letterSpacing: 3,
                color: 'var(--green-700)', background: 'var(--green-50)',
                padding: '6px 14px', borderRadius: 8,
              }}>
                {helperPasscode}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(helperPasscode)
                  setToastMessage('✅ Passcode copied!')
                  setShowShareToast(true)
                  setTimeout(() => setShowShareToast(false), 2000)
                }}
                style={{
                  fontSize: 12, color: 'var(--green-600)', background: 'none',
                  border: 'none', cursor: 'pointer', fontWeight: 600,
                }}
              >📋 Copy</button>
              <button
                onClick={handleGeneratePasscode}
                disabled={generatingPasscode}
                style={{
                  fontSize: 12, color: 'var(--gray-400)', background: 'none',
                  border: 'none', cursor: 'pointer', fontWeight: 600,
                }}
              >🔄 New</button>
            </div>
          ) : (
            <button
              onClick={handleGeneratePasscode}
              disabled={generatingPasscode}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                borderRadius: 8, border: '1px solid var(--green-500)',
                background: 'var(--green-50)', color: 'var(--green-700)',
                cursor: 'pointer',
              }}
            >
              {generatingPasscode ? 'Generating...' : '🔑 Generate Pairing Code'}
            </button>
          )}
          <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>
            Share this code with helpers so they can join your booth.
          </p>

          {helperPasscode && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--gray-200, #e5e7eb)', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-700)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                HELPER INVITE QR CODE
              </div>
              <div style={{ background: '#ffffff', padding: 12, borderRadius: 12, display: 'inline-block', border: '1px solid var(--gray-200)' }}>
                <QRCode
                  value={`${typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com'}/join-booth/${helperPasscode}`}
                  size={150}
                  level="M"
                />
              </div>
              <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 8, marginBottom: 0 }}>
                Helpers can scan this QR code with their camera to immediately join your booth stand!
              </p>
            </div>
          )}
        </div>

        {/* Helpers list */}
        {helpers.length === 0 ? (
          <div style={{
            padding: 24, textAlign: 'center', borderRadius: 12,
            border: '2px dashed var(--gray-200)', color: 'var(--gray-400)',
          }}>
            <span style={{ fontSize: 32 }}>👤</span>
            <p style={{ marginTop: 8, fontSize: 14 }}>No helpers yet. Share your pairing code to invite helpers.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {helpers.map(helper => (
              <div key={helper.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12,
                background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--green-100)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, color: 'var(--green-700)',
                }}>
                  {(helper.profile?.full_name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-800)' }}>
                    {helper.profile?.full_name || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', display: 'flex', gap: 8 }}>
                    <span style={{
                      padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: helper.status === 'accepted' ? 'var(--green-50)' : helper.status === 'revoked' ? '#fef2f2' : '#fffbeb',
                      color: helper.status === 'accepted' ? 'var(--green-700)' : helper.status === 'revoked' ? '#dc2626' : '#d97706',
                    }}>
                      {helper.status}
                    </span>
                    <span>{helper.role === 'full_access' ? '🔑 Full Access' : '🚗 Delivery'}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveHelper(helper.id)}
                  disabled={removingHelper === helper.id}
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 600,
                    borderRadius: 8, border: '1px solid #fecaca',
                    background: '#fef2f2', color: '#dc2626',
                    cursor: 'pointer',
                  }}
                >
                  {removingHelper === helper.id ? '...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Invite via DM button */}
        {helperPasscode && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={() => setShowHelperDM(true)}
              style={{
                flex: 1, padding: '10px 16px',
                fontSize: 14, fontWeight: 600, borderRadius: 10,
                border: '1px solid var(--green-200)', background: 'var(--green-50)',
                color: 'var(--green-700)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              💬 Invite via DM
            </button>
            <button
              onClick={() => setShowHelperShareModal(true)}
              style={{
                flex: 1, padding: '10px 16px',
                fontSize: 14, fontWeight: 600, borderRadius: 10,
                border: '1px solid var(--blue-200, #bfdbfe)', background: 'var(--blue-50, #eff6ff)',
                color: 'var(--blue-700, #1d4ed8)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              📧 Share Invite
            </button>
          </div>
        )}
      </div>
      )}

      {/* Helper DM Modal */}
      {showHelperDM && stand && helperPasscode && user && (
        <HelperDMModal
          boothName={stand.name}
          passcode={helperPasscode}
          userId={user.id}
          onClose={() => setShowHelperDM(false)}
          onSent={(recipientName, _conversationId) => {
            setShowHelperDM(false)
            setToastMessage(`✅ Invite sent to ${recipientName}!`)
            setShowShareToast(true)
            setTimeout(() => setShowShareToast(false), 3000)
          }}
        />
      )}

      {/* Helper Invite Share Modal */}
      {showHelperShareModal && stand && helperPasscode && (
        <SocialShareModal
          isOpen={showHelperShareModal}
          onClose={() => setShowHelperShareModal(false)}
          title={`Invite a Helper to "${stand.name}"`}
          subtitle="Share this invite so someone can join as a helper on your booth."
          entityName={stand.name}
          shareUrl={typeof window !== 'undefined' ? `${window.location.origin}/join-booth/${encodeURIComponent(helperPasscode)}` : ''}
          shareMessage={`Hey! 🌱 I'd love your help with my produce stand "${stand.name}" on CasaGrown Market!\n\nTap this link to join as a helper:\n${typeof window !== 'undefined' ? `${window.location.origin}/join-booth/${encodeURIComponent(helperPasscode)}` : ''}\n\nThanks! 🙏`}
          shareContext="helper_invite"
          userId={user?.id}
          platforms={['whatsapp', 'sms', 'email', 'copy']}
        />
      )}

      {/* Share toast */}
      {showShareToast && (
        <div className={styles.copiedToast}>{toastMessage}</div>
      )}

      {/* Social Share Modal */}
      {showShareModal && stand && (
        <SocialShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          title={`Share ${stand.name}`}
          subtitle="Invite friends and family to visit your produce stand."
          entityName={stand.name}
          shareUrl={boothShareUrl}
          shareMessage={boothShareMessage}
          shareContext="booth_invitation"
          userId={user?.id}
          platforms={['whatsapp', 'nextdoor', 'facebook', 'sms', 'email', 'copy']}
        />
      )}

      {/* Product Share Modal */}
      {shareProduct && stand && (
        <SocialShareModal
          isOpen={!!shareProduct}
          onClose={() => setShareProduct(null)}
          title={`Share ${shareProduct.name}`}
          subtitle="Share this listing with your neighbors!"
          entityName={shareProduct.name}
          shareUrl={typeof window !== 'undefined' ? `${window.location.origin}/market/booth/${boothId}/product/${shareProduct.id}` : ''}
          shareMessage={(platform?: SharePlatformType) => {
            const priceText = shareProduct.price_usd === 0
              ? '💚 Price: Free'
              : `💰 Price: ${formatUsd(shareProduct.price_usd)}/${shareProduct.unit}`
            const qtyText = shareProduct.inventory > 0 ? `📦 Available Qty: ${shareProduct.inventory}` : ''
            const modes: string[] = []
            if (stand.offers_delivery) modes.push('🚗 Delivery')
            if (stand.offers_pickup) modes.push('📍 Pickup')
            const deliveryText = modes.length > 0
              ? `${qtyText ? qtyText + '\n' : ''}${modes.join(' • ')}`
              : qtyText
            return getBoothProductShareMessage(shareProduct.name, priceText, deliveryText, undefined, platform)
          }}
          shareContext="product_share"
          userId={user?.id}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <>
          <div className={styles.modalBackdrop} onClick={() => setShowEditModal(false)} />
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>✏️ Edit Stand</h2>


            {/* ── Banner with Inline Theme & Photo Controls ── */}
            <div className={styles.bannerEditWrap}>
              <div
                className={styles.bannerEditArea}
                style={editBannerUrl
                  ? { backgroundImage: `url(${editBannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: `linear-gradient(135deg, ${THEME_COLORS[editTheme]?.bg || '#f3f4f6'} 0%, ${THEME_COLORS[editTheme]?.border || '#6b7280'}44 50%, ${THEME_COLORS[editTheme]?.bg || '#f3f4f6'} 100%)` }
                }
              >
                {/* Photo change button — bottom-left */}
                <label className={styles.bannerCornerBtn} style={{ position: 'absolute', bottom: 8, left: 8 }}>
                  📷
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBannerUpload}
                    style={{ display: 'none' }}
                    disabled={uploadingBanner}
                  />
                </label>

                {/* Theme picker button — top-right */}
                <button
                  type="button"
                  className={styles.bannerCornerBtn}
                  style={{ position: 'absolute', top: 8, right: 8 }}
                  onClick={() => setShowThemePicker(!showThemePicker)}
                >
                  🎨
                </button>

                {/* Theme picker dropdown */}
                {showThemePicker && (
                  <div className={styles.themePicker}>
                    {THEMES.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        className={`${styles.themePickerItem} ${editTheme === t.id ? styles.themePickerActive : ''}`}
                        onClick={() => { setEditTheme(t.id); setShowThemePicker(false) }}
                      >
                        <span>{t.emoji}</span> {t.name}
                      </button>
                    ))}
                  </div>
                )}

                {uploadingBanner && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 14, fontWeight: 600, borderRadius: 'inherit' }}>
                    Uploading...
                  </div>
                )}
              </div>

              {/* Name bar below banner */}
              <div
                className={styles.nameBar}
                style={{ background: THEME_COLORS[editTheme]?.bg || '#f3f4f6', borderBottom: `2px solid ${THEME_COLORS[editTheme]?.border || '#6b7280'}` }}
              >
                <input
                  className={styles.nameBarInput}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Name your stand..."
                  style={{ color: THEME_COLORS[editTheme]?.text || '#1f2937' }}
                />
              </div>
            </div>

            {/* About Your Stand */}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="label">📝 About Your Stand</label>
              <textarea
                className="input"
                value={editAboutHtml}
                onChange={e => setEditAboutHtml(e.target.value)}
                placeholder="Share your story — what you grow, your methods, what makes your garden special..."
                rows={3}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            {/* ── Stand Address (Base Location) ── */}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="label">🏠 Stand Address</label>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 8px' }}>
                Your base address — delivery radius is computed from here.
              </p>
              <AddressInput
                value={editBoothAddr}
                onChange={val => setEditBoothAddr(val)}
                placeholderStreet="e.g. 456 Farm Road"
                showPrivacyNote={true}
              />
              <button
                type="button"
                style={{
                  marginTop: 6, padding: '6px 14px', borderRadius: 20,
                  border: '1px solid var(--green-300)', background: 'var(--green-50)',
                  color: 'var(--green-700)', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
                onClick={() => handleUseCurrentLocation('booth')}
              >
                {locating ? '⏳ Locating...' : '📍 Use my current location'}
              </button>
            </div>

            {/* ══════════════════════════════════════════════════════ */}
            {/*  🚗 DELIVERY — Self-Contained Box                     */}
            {/* ══════════════════════════════════════════════════════ */}
            <div style={{
              border: `2px solid ${editOffersDelivery ? '#22c55e' : '#e5e7eb'}`,
              borderRadius: 12,
              background: editOffersDelivery ? '#f0fdf4' : '#fff',
              overflow: 'hidden',
              transition: 'all 0.15s',
              marginBottom: 16,
            }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }}
                onClick={() => {
                  if (editOffersDelivery && !editOffersPickup) return
                  setEditOffersDelivery(!editOffersDelivery)
                }}
              >
                <span style={{ fontSize: 28 }}>🚗</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: editOffersDelivery ? '#15803d' : '#374151' }}>I'll Deliver</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Drop off at buyer's door</div>
                </div>
                <input type="checkbox" checked={editOffersDelivery} readOnly style={{ width: 20, height: 20, accentColor: '#16a34a', pointerEvents: 'none' }} />
              </div>

              {editOffersDelivery && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid #bbf7d0' }}>
                  {/* Delivery Radius */}
                  <div style={{ marginTop: 16 }}>
                    <label className="label">🚗 Delivery Radius</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range" min={0} max={25}
                        value={parseInt(editDeliveryRadius) || 0}
                        onChange={e => setEditDeliveryRadius(e.target.value)}
                        style={{ flex: 1, accentColor: '#16a34a' }}
                      />
                      <span style={{ minWidth: 50, fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
                        {parseInt(editDeliveryRadius) === 0 ? 'Zip only' : `${editDeliveryRadius} mi`}
                      </span>
                    </div>
                  </div>

                  {/* Delivery Zip Codes */}
                  <div style={{ marginTop: 16 }}>
                    <label className="label">📮 Delivery Zip Codes</label>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 8px' }}>
                      Orders from these zip codes are always eligible, regardless of distance.
                    </p>
                    <div
                      className={styles.tagsWrap}
                      onClick={() => document.getElementById('zip-input-field')?.focus()}
                    >
                      {editDeliveryZipcodes.map(zip => (
                        <span key={zip} className={styles.tag}>
                          {zip}
                          <button
                            type="button"
                            className={styles.tagRemove}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditDeliveryZipcodes(editDeliveryZipcodes.filter(z => z !== zip))
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        id="zip-input-field"
                        type="text"
                        className={styles.tagInput}
                        value={zipInput}
                        onChange={e => setZipInput(e.target.value)}
                        onKeyDown={handleZipKeyDown}
                        onBlur={handleAddZip}
                        placeholder={editDeliveryZipcodes.length === 0 ? "e.g. 97201 (Press Enter)" : "Add zip..."}
                      />
                    </div>
                  </div>

                  {/* Delivery Schedule */}
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #bbf7d0' }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>📅 Delivery Schedule</label>
                    <StandScheduleSelector
                      value={editWeeklyDeliveryWindows}
                      onChange={v => setEditWeeklyDeliveryWindows(v)}
                      type="delivery"
                      activeCitySchedule={activeCitySchedule}
                      preset={editDeliveryPreset}
                      onPresetChange={setEditDeliveryPreset}
                    />
                    {fieldErrors.deliveryWindows && (
                      <p style={{ color: '#dc2626', fontSize: 12, fontWeight: 500, margin: '6px 0 0' }}>⚠️ {fieldErrors.deliveryWindows}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            {fieldErrors.fulfillment && (
              <p style={{ color: '#dc2626', fontSize: 12, fontWeight: 500, margin: '0 0 8px' }}>⚠️ {fieldErrors.fulfillment}</p>
            )}

            {/* ══════════════════════════════════════════════════════ */}
            {/*  📍 PICKUP — Self-Contained Box                       */}
            {/* ══════════════════════════════════════════════════════ */}
            <div style={{
              border: `2px solid ${editOffersPickup ? '#22c55e' : '#e5e7eb'}`,
              borderRadius: 12,
              background: editOffersPickup ? '#f0fdf4' : '#fff',
              overflow: 'hidden',
              transition: 'all 0.15s',
              marginBottom: 20,
            }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }}
                onClick={() => {
                  if (editOffersPickup && !editOffersDelivery) return
                  setEditOffersPickup(!editOffersPickup)
                }}
              >
                <span style={{ fontSize: 28 }}>📍</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: editOffersPickup ? '#15803d' : '#374151' }}>Pickup Available</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Buyers pick up from you</div>
                </div>
                <input type="checkbox" checked={editOffersPickup} readOnly style={{ width: 20, height: 20, accentColor: '#16a34a', pointerEvents: 'none' }} />
              </div>

              {editOffersPickup && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid #bbf7d0' }}>
                  {/* Pickup Address */}
                  <div style={{ marginTop: 16 }}>
                    <label className="label">📍 Pickup Address <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12 }}>(optional)</span></label>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>Leave blank to use your stand address above.</p>
                    <AddressInput
                      value={editPickupAddr}
                      onChange={val => setEditPickupAddr(val)}
                      placeholderStreet="e.g. Corner of Oak & Main"
                      showPrivacyNote={true}
                    />
                    <button
                      type="button"
                      style={{
                        marginTop: 6, padding: '6px 14px', borderRadius: 20,
                        border: '1px solid var(--green-300)', background: 'var(--green-50)',
                        color: 'var(--green-700)', fontSize: 13, fontWeight: 500,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                      onClick={() => handleUseCurrentLocation('pickup')}
                    >
                      {locatingPickup ? '⏳ Locating...' : '📍 Use my current location'}
                    </button>
                  </div>

                  {/* Pickup Schedule */}
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #bbf7d0' }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>📅 Pickup Schedule</label>
                    <StandScheduleSelector
                      value={editWeeklyPickupWindows}
                      onChange={v => setEditWeeklyPickupWindows(v)}
                      type="pickup"
                      activeCitySchedule={activeCitySchedule}
                      preset={editPickupPreset}
                      onPresetChange={setEditPickupPreset}
                    />
                    {fieldErrors.pickupWindows && (
                      <p style={{ color: '#dc2626', fontSize: 12, fontWeight: 500, margin: '6px 0 0' }}>⚠️ {fieldErrors.pickupWindows}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════ */}
            {/*  📡 PLATFORM INVENTORY SYNC — Google Business Sync     */}
            {/* ══════════════════════════════════════════════════════ */}
            {isElite && hasGoogleConnection && (
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '16px 20px',
                background: '#f9fafb',
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 4 }}>📡 Inventory Sync for this Stand</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>Choose which platforms sync listings from this stand.</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                  <span style={{ fontSize: 20 }}>📍</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Google Business</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Sync to your Google Business Profile</div>
                  </div>
                  <button
                    type="button" role="switch" aria-checked={editGoogleSyncEnabled}
                    onClick={() => setEditGoogleSyncEnabled(!editGoogleSyncEnabled)}
                    style={{
                      position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none',
                      background: editGoogleSyncEnabled ? '#22c55e' : '#d1d5db',
                      cursor: 'pointer', transition: 'background 0.2s', padding: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, left: editGoogleSyncEnabled ? 22 : 2,
                      width: 20, height: 20, borderRadius: '50%', background: 'white',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
              </div>
            )}

            {/* Save error (e.g. network failure) */}
            {error && (
              <p style={{ color: '#dc2626', fontSize: 12, fontWeight: 500, margin: '0 0 8px', textAlign: 'center' }}>⚠️ {error}</p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnPrimary}`}
                onClick={handleSaveEdit}
                disabled={saving || !editName.trim()}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Listing Choice Modal */}
      {showAddChoice && (
        <>
          <div className={styles.modalOverlay} onClick={() => setShowAddChoice(false)} />
          <div className={styles.modalContent} style={{ maxWidth: 400, padding: 28 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>Add Listing</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>
              How would you like to add a product to this booth?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                style={{ padding: '14px 20px', fontSize: 15, fontWeight: 600, justifyContent: 'center' }}
                onClick={() => {
                  setShowAddChoice(false)
                  router.push(`/my-booth/products/new?booth=${boothId}`)
                }}
              >
                🆕 Create New Listing
              </button>
              {isPro && (
                <button
                  className={styles.actionBtn}
                  style={{ padding: '14px 20px', fontSize: 15, fontWeight: 600, justifyContent: 'center' }}
                  onClick={() => {
                    setShowAddChoice(false)
                    setShowCatalogPicker(true)
                    setSelectedCatalogItem(null)
                  }}
                >
                  📦 List from Catalog ({catalogItems.length} items)
                </button>
              )}
            </div>
            <button
              style={{
                marginTop: 16, width: '100%', padding: '10px', fontSize: 13,
                color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer',
              }}
              onClick={() => setShowAddChoice(false)}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Catalog Picker Modal */}
      {showCatalogPicker && (
        <>
          <div className={styles.modalOverlay} onClick={() => setShowCatalogPicker(false)} />
          <div className={styles.modalContent} style={{ maxWidth: 520, padding: 0, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {selectedCatalogItem ? '📦 Allocate to Stand' : '📦 Select from Catalog'}
              </h2>
              {selectedCatalogItem && (
                <button
                  style={{ fontSize: 13, color: 'var(--green-600)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}
                  onClick={() => setSelectedCatalogItem(null)}
                >
                  ← Back to catalog
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
              {!selectedCatalogItem ? (
                /* Item List */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {catalogItems.map(item => {
                    const available = item.total_inventory - item.allocated
                    return (
                      <button
                        key={item.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                          border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff',
                          cursor: available > 0 ? 'pointer' : 'not-allowed',
                          opacity: available > 0 ? 1 : 0.5,
                          textAlign: 'left', width: '100%',
                          transition: 'border-color 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => { if (available > 0) { e.currentTarget.style.borderColor = 'var(--green-400)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(34,197,94,0.15)' }}}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none' }}
                        onClick={() => {
                          if (available <= 0) return
                          setSelectedCatalogItem(item)
                          setAllocQty(String(Math.min(available, 5)))
                          setAllocPrice(item.default_price_usd != null ? String(item.default_price_usd) : '')
                        }}
                        disabled={available <= 0}
                      >
                        <div style={{
                          width: 52, height: 52, borderRadius: 10, overflow: 'hidden',
                          background: '#f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {item.photos[0] ? (
                            <img src={item.photos[0]} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 24 }}>📦</span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937' }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                            {item.default_price_usd != null ? `$${item.default_price_usd.toFixed(2)}/${item.default_unit}` : 'No price set'}
                            {' · '}
                            <span style={{ color: available > 0 ? 'var(--green-600)' : '#dc2626' }}>
                              {available > 0 ? `${available} available` : 'Fully allocated'}
                            </span>
                          </div>
                        </div>
                        {available > 0 && (
                          <span style={{ fontSize: 18, color: 'var(--green-500)' }}>→</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                /* Allocation Form */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Selected item preview */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                    background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0',
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 10, overflow: 'hidden',
                      background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selectedCatalogItem.photos[0] ? (
                        <img src={selectedCatalogItem.photos[0]} alt={selectedCatalogItem.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 22 }}>📦</span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#166534' }}>{selectedCatalogItem.name}</div>
                      <div style={{ fontSize: 12, color: '#4ade80' }}>
                        {selectedCatalogItem.total_inventory - selectedCatalogItem.allocated} available of {selectedCatalogItem.total_inventory} total
                      </div>
                    </div>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                      Quantity to list at this booth
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={selectedCatalogItem.total_inventory - selectedCatalogItem.allocated}
                      value={allocQty}
                      onChange={e => setAllocQty(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 14px', fontSize: 15, borderRadius: 10,
                        border: '1px solid #d1d5db', outline: 'none',
                      }}
                    />
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                      Max: {selectedCatalogItem.total_inventory - selectedCatalogItem.allocated}
                    </div>
                  </div>

                  {/* Price override */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                      Price per {selectedCatalogItem.default_unit} (optional override)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={allocPrice}
                      onChange={e => setAllocPrice(e.target.value)}
                      placeholder={selectedCatalogItem.default_price_usd != null ? `$${selectedCatalogItem.default_price_usd.toFixed(2)} (catalog default)` : 'Set price'}
                      style={{
                        width: '100%', padding: '10px 14px', fontSize: 15, borderRadius: 10,
                        border: '1px solid #d1d5db', outline: 'none',
                      }}
                    />
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                      Leave empty to use catalog default
                      {selectedCatalogItem.default_price_usd != null && ` ($${selectedCatalogItem.default_price_usd.toFixed(2)})`}
                    </div>
                  </div>

                  {/* Submit */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button
                      style={{
                        flex: 1, padding: '12px', fontSize: 14, fontWeight: 600,
                        borderRadius: 10, border: '1px solid #d1d5db', background: '#fff',
                        color: '#374151', cursor: 'pointer',
                      }}
                      onClick={() => setShowCatalogPicker(false)}
                    >
                      Cancel
                    </button>
                    <button
                      style={{
                        flex: 1, padding: '12px', fontSize: 14, fontWeight: 600,
                        borderRadius: 10, border: 'none',
                        background: allocating ? '#9ca3af' : 'var(--green-600)',
                        color: '#fff', cursor: allocating ? 'not-allowed' : 'pointer',
                      }}
                      disabled={allocating || !allocQty || parseInt(allocQty) < 1}
                      onClick={async () => {
                        if (!selectedCatalogItem) return
                        setAllocating(true)
                        const { data: newProductId, error: allocErr } = await supabase.rpc('allocate_from_catalog', {
                          p_catalog_item_id: selectedCatalogItem.id,
                          p_booth_id: boothId,
                          p_quantity: parseInt(allocQty),
                          p_price_override: allocPrice ? parseFloat(allocPrice) : null,
                        })
                        setAllocating(false)
                        if (allocErr) {
                          alert('Failed to allocate: ' + allocErr.message)
                          return
                        }
                        // Refresh products
                        setShowCatalogPicker(false)
                        const { data: prods } = await supabase
                          .from('market_products')
                          .select('*')
                          .eq('booth_id', boothId)
                          .eq('is_deleted', false)
                          .order('created_at', { ascending: false })
                        if (prods) {
                          // Check which products have associated orders
                          const prodIds = prods.map((p: any) => p.id)
                          let orderProductIds = new Set<string>()
                          if (prodIds.length > 0) {
                            const { data: orderRows } = await supabase
                              .from('market_orders')
                              .select('product_id')
                              .in('product_id', prodIds)
                            if (orderRows) {
                              orderProductIds = new Set(orderRows.map((o: any) => o.product_id))
                            }
                          }
                          setProducts(prods.map((p: any) => ({
                            id: p.id, name: p.name, description: p.description,
                            photos: p.photos || [], price_usd: p.price_usd,
                            unit: p.unit || 'each', inventory: p.inventory,
                            is_active: p.is_active, is_draft: p.is_draft,
                            category: p.category || 'other',
                            has_orders: orderProductIds.has(p.id),
                          })))
                        }
                        // Update catalog item allocated count
                        setCatalogItems(prev => prev.map(ci =>
                          ci.id === selectedCatalogItem.id
                            ? { ...ci, allocated: ci.allocated + parseInt(allocQty) }
                            : ci
                        ))
                      }}
                    >
                      {allocating ? 'Allocating...' : `List ${allocQty || 0} at this stand`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
