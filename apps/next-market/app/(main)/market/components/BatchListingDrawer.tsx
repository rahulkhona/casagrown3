'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useAuth } from '../../../../lib/useAuth'
import { useQuickSetup } from '../../../../lib/useQuickSetup'
import { trackEvent } from '../../../../lib/crm-analytics'
import {
  ALLOWED_UNITS,
  convertPrice,
  inferProduceUnitAndPrice,
  FULFILLMENT_PRESET_OPTIONS,
  FulfillmentPresetType,
  getWindowsForPreset,
  isHourSelected,
  toggleHourCell,
} from '../../../../lib/bulkListingUtils'
import { EXHAUSTIVE_INTERESTS_CATALOG } from '../../../../lib/interestCatalog'
import LandmarkPickerModal from '../../../components/LandmarkPickerModal'
import { LandmarkItem } from '../../../../lib/landmarks'
import CameraCapture, { CaptureResult } from '../../../../components/CameraCapture'
import styles from './BatchListingDrawer.module.css'

export interface BatchItem {
  id: string
  name: string
  category: string
  price: string
  suggestedPrice?: number
  unit: string
  quantity: string
  stockImage?: string
  customPhotoDataUrl?: string | null
  harvestedAt?: string
  description?: string
  isFree?: boolean
  isSelected?: boolean
}

interface BatchListingDrawerProps {
  isOpen: boolean
  items: BatchItem[]
  currentZipcode?: string
  onClose: () => void
  onUpdateItem: (id: string, updates: Partial<BatchItem>) => void
  onRemoveItem: (id: string) => void
  onAddItem?: (item: BatchItem) => void
  onPublishSuccess: (count: number) => void
}

export default function BatchListingDrawer({
  isOpen,
  items,
  currentZipcode = '95125',
  onClose,
  onUpdateItem,
  onRemoveItem,
  onAddItem,
  onPublishSuccess,
}: BatchListingDrawerProps) {
  const supabase = createClient()
  const { user } = useAuth()
  const { requireAuth } = useQuickSetup()

  // File & Camera Upload State
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeUploadItemId, setActiveUploadItemId] = useState<string | null>(null)
  const [showCameraItemId, setShowCameraItemId] = useState<string | null>(null)

  // Add Another Produce Quick Selector
  const [isAddingProduce, setIsAddingProduce] = useState(false)
  const [addProduceSearch, setAddProduceSearch] = useState('')

  // ── Delivery Configuration (matches Step2Fulfillment) ──
  const [offersDelivery, setOffersDelivery] = useState(false)
  const [deliveryBaseAddr, setDeliveryBaseAddr] = useState('')
  const [deliveryRadius, setDeliveryRadius] = useState(5)
  const [deliveryZipcodes, setDeliveryZipcodes] = useState<string[]>([])
  const [zipInput, setZipInput] = useState('')
  const [isLocatingDelivery, setIsLocatingDelivery] = useState(false)

  // ── Pickup Configuration (matches Step2Fulfillment) ──
  const [offersPickup, setOffersPickup] = useState(true)
  const [pickupSafetyMode, setPickupSafetyMode] = useState<'landmark' | 'home'>('landmark')
  const [homePickupAddress, setHomePickupAddress] = useState('')
  const [selectedLandmark, setSelectedLandmark] = useState<LandmarkItem | null>(null)
  const [showLandmarkPicker, setShowLandmarkPicker] = useState(false)
  const [pickupInstructions, setPickupInstructions] = useState('')
  const [pickupNoticeMinutes, setPickupNoticeMinutes] = useState(30)
  const [isLocatingHome, setIsLocatingHome] = useState(false)

  // ── 7-Day Matrix Day Options for Custom Calendar ──
  const dayOptions = React.useMemo(() => {
    const localToday = new Date()
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const options: { date: string; label: string; isWeekend: boolean }[] = []
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + offset)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      const label = DAY_SHORT[d.getDay()]
      options.push({ date: dateStr, label, isWeekend })
    }
    return options
  }, [])

  // Presets and custom window matrices
  const [deliveryPreset, setDeliveryPreset] = useState<FulfillmentPresetType>('both')
  const [customDeliveryWindows, setCustomDeliveryWindows] = useState<Record<string, string[]>>(() => getWindowsForPreset('both'))

  const [pickupPreset, setPickupPreset] = useState<FulfillmentPresetType>('both')
  const [customPickupWindows, setCustomPickupWindows] = useState<Record<string, string[]>>(() => getWindowsForPreset('both'))

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const todayStr = new Date().toISOString().split('T')[0]

  // Prepopulate ZIP code into delivery tags if empty
  useEffect(() => {
    if (currentZipcode && deliveryZipcodes.length === 0) {
      const clean = currentZipcode.trim().replace(/[^0-9]/g, '')
      if (clean.length === 5) {
        setDeliveryZipcodes([clean])
      }
    }
  }, [currentZipcode])

  useEffect(() => {
    setErrorMessage('')
    setSuccessMessage('')
  }, [isOpen])

  if (!isOpen || items.length === 0) return null

  // ── Photo Upload Trigger & Handler ──
  const triggerFileUpload = (itemId: string) => {
    setActiveUploadItemId(itemId)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const triggerCameraUpload = (itemId: string) => {
    setShowCameraItemId(itemId)
  }

  const handleCameraCapture = (result: CaptureResult) => {
    if (!showCameraItemId) return
    const file = result.file
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      if (dataUrl && showCameraItemId) {
        onUpdateItem(showCameraItemId, { customPhotoDataUrl: dataUrl })
      }
    }
    reader.readAsDataURL(file)
    setShowCameraItemId(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeUploadItemId) return

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (JPEG, PNG, WebP).')
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      if (dataUrl && activeUploadItemId) {
        onUpdateItem(activeUploadItemId, { customPhotoDataUrl: dataUrl })
      }
    }
    reader.readAsDataURL(file)
  }

  // Geolocation helpers
  const handleUseLocationForDelivery = () => {
    if (!navigator.geolocation) return
    setIsLocatingDelivery(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&addressdetails=1`
          )
          const data = await res.json()
          if (data && data.address) {
            const addr = `${data.address.road || ''}, ${data.address.city || data.address.town || ''}, ${data.address.state || ''} ${data.address.postcode || ''}`.trim()
            setDeliveryBaseAddr(addr)
            if (data.address.postcode && !deliveryZipcodes.includes(data.address.postcode)) {
              setDeliveryZipcodes((prev) => [...prev, data.address.postcode])
            }
          }
        } catch (e) {
          console.warn('Geolocation reverse error:', e)
        } finally {
          setIsLocatingDelivery(false)
        }
      },
      () => setIsLocatingDelivery(false),
      { timeout: 8000 }
    )
  }

  const handleUseLocationForHome = () => {
    if (!navigator.geolocation) return
    setIsLocatingHome(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&addressdetails=1`
          )
          const data = await res.json()
          if (data && data.address) {
            const addr = `${data.address.road || ''}, ${data.address.city || data.address.town || ''}, ${data.address.state || ''} ${data.address.postcode || ''}`.trim()
            setHomePickupAddress(addr)
          }
        } catch (e) {
          console.warn('Geolocation reverse error:', e)
        } finally {
          setIsLocatingHome(false)
        }
      },
      () => setIsLocatingHome(false),
      { timeout: 8000 }
    )
  }

  // Delivery Zip Codes Tag Handlers
  const handleAddDeliveryZip = (val: string) => {
    const clean = val.trim().replace(/[^0-9]/g, '')
    if (clean.length === 5 && !deliveryZipcodes.includes(clean)) {
      setDeliveryZipcodes((prev) => [...prev, clean])
      setZipInput('')
    }
  }

  const handleRemoveDeliveryZip = (zip: string) => {
    setDeliveryZipcodes((prev) => prev.filter((z) => z !== zip))
  }

  // Filter Catalog for Adding More Items
  const availableCatalogAdditions = EXHAUSTIVE_INTERESTS_CATALOG.filter((catItem) => {
    const q = addProduceSearch.toLowerCase().trim()
    const matchesSearch = !q || catItem.name.toLowerCase().includes(q)
    const notAlreadyInBatch = !items.some((i) => i.name.toLowerCase() === catItem.name.toLowerCase())
    return matchesSearch && notAlreadyInBatch
  }).slice(0, 10)

  const handleSelectNewProduce = (catItem: typeof EXHAUSTIVE_INTERESTS_CATALOG[0]) => {
    if (onAddItem) {
      onAddItem({
        id: `crop_${catItem.id}_${Date.now()}`,
        name: catItem.name,
        category: catItem.category,
        price: (catItem.defaultPrice || 3.50).toFixed(2),
        suggestedPrice: catItem.defaultPrice || 3.50,
        unit: catItem.defaultUnit || 'lb',
        quantity: '5',
        stockImage: catItem.image,
        customPhotoDataUrl: null,
        harvestedAt: todayStr,
        description: '',
        isFree: false,
        isSelected: true,
      })
    }
    setIsAddingProduce(false)
    setAddProduceSearch('')
  }

  const performPublish = async () => {
    const activeItems = items.filter((i) => i.isSelected !== false)
    if (activeItems.length === 0) {
      setErrorMessage('Please select at least one produce item to list.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const sellerEmail = currentUser?.email || user?.email

      const effectiveZipcodes = deliveryZipcodes.length > 0 
        ? deliveryZipcodes 
        : [currentZipcode.trim() || '95125']

      const interestPayload = {
        email: sellerEmail || undefined,
        zipcodes: effectiveZipcodes,
        preference_pickup: offersPickup,
        preference_delivery: offersDelivery,
        radius_miles: deliveryRadius,
        delivery_base_address: deliveryBaseAddr || undefined,
        pickup_address: pickupSafetyMode === 'landmark' 
          ? (selectedLandmark?.name || 'Lincoln Glen Park (Front Parking Area)')
          : homePickupAddress || undefined,
        pickup_notice_minutes: pickupNoticeMinutes,
        pickup_instructions: pickupInstructions || undefined,
        accepts_email: true,
        accepts_push: true,
        source_url: '/market',
        interests: activeItems.map((item) => ({
          produce_name: item.name,
          interest_type: 'sell',
          category: item.category || 'produce',
          requested_quantity: parseFloat(item.quantity) || 5,
          requested_unit: item.unit || 'lb',
          metadata: {
            price_usd: item.isFree ? 0 : parseFloat(item.price) || 0,
            harvested_at: item.harvestedAt || null,
            description: item.description || undefined,
            has_custom_photo: !!item.customPhotoDataUrl,
          },
        })),
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const interestRes = await fetch('/api/interest/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify(interestPayload),
      })

      if (!interestRes.ok) {
        console.warn('Could not save crm seller interests:', await interestRes.text())
      }

      trackEvent('button_click', '/market', {
        action: 'batch_listings_published',
        itemCount: activeItems.length,
        items: activeItems.map((i) => i.name),
        zipcode: currentZipcode,
        offersPickup,
        offersDelivery,
        pickupSafetyMode,
        deliveryRadius,
        pickupNoticeMinutes,
      })

      onPublishSuccess(activeItems.length)
    } catch (err: any) {
      console.error('Failed to publish listings:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePublish = async () => {
    setErrorMessage('')
    setSuccessMessage('')

    if (!offersPickup && !offersDelivery) {
      setErrorMessage('Please enable at least one fulfillment method (Pickup or Delivery).')
      return
    }

    const activeItems = items.filter((i) => i.isSelected !== false)
    if (activeItems.length === 0) {
      setErrorMessage('Please select at least one produce item to list.')
      return
    }

    // Validate prices and quantities
    for (const item of activeItems) {
      const p = parseFloat(item.price)
      const q = parseFloat(item.quantity)
      if (!item.isFree && (isNaN(p) || p < 0)) {
        setErrorMessage(`Please enter a valid price for "${item.name}".`)
        return
      }
      if (isNaN(q) || q <= 0) {
        setErrorMessage(`Please enter a valid quantity for "${item.name}".`)
        return
      }
    }

    if (user || (typeof window !== 'undefined' && localStorage.getItem('sb-fzdmszvfeewpwswlnfyk-auth-token'))) {
      await performPublish()
      return
    }

    requireAuth({
      trigger: 'batch_list_produce',
      prefill: {
        zip: currentZipcode,
      },
      onReady: () => {
        performPublish()
      },
    })
  }

  const activeCount = items.filter((i) => i.isSelected !== false).length

  return (
    <div className={styles.drawerOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.drawerContent}>
        {/* Hidden File Input for Device Uploads */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {showCameraItemId && (
          <CameraCapture
            onCapture={handleCameraCapture}
            onClose={() => setShowCameraItemId(null)}
            cropSquare={false}
          />
        )}

        {/* Sticky Header */}
        <div className={styles.drawerHeader}>
          <div>
            <h3 className={styles.drawerTitle}>
              <span>🧺</span> List Surplus Produce
            </h3>
            <p className={styles.drawerSubtitle}>
              Configure prices, photos, and fulfillment settings for your neighborhood stand
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeBtn}
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        <div className={styles.drawerBody}>
          {errorMessage && (
            <div style={{ padding: '10px 14px', background: 'var(--red-50)', color: 'var(--red-700)', borderRadius: 'var(--radius-lg)', fontSize: '12px', fontWeight: 600 }}>
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div style={{ padding: '10px 14px', background: 'var(--green-50)', color: 'var(--green-800)', borderRadius: 'var(--radius-lg)', fontSize: '12px', fontWeight: 700 }}>
              {successMessage}
            </div>
          )}

          {/* 1. Produce Item Cards Form List */}
          <div>
            <div className={styles.sectionHeader}>
              <span>1. Produce Items Form List ({activeCount} of {items.length} selected)</span>
              <span style={{ fontWeight: 400, color: 'var(--gray-500)' }}>Photos & prices</span>
            </div>

            <div className={styles.produceGrid}>
              {items.map((row) => {
                const displayImage = row.customPhotoDataUrl || row.stockImage || '/images/produce_placeholder.jpg'
                const suggested = row.suggestedPrice || 3.50
                const isSelected = row.isSelected !== false

                return (
                  <div
                    key={row.id}
                    className={`${styles.produceCard} ${isSelected ? styles.produceCardSelected : styles.produceCardUnselected}`}
                  >
                    {/* Card Header */}
                    <div className={styles.cardHeader}>
                      <label className={styles.cardCheckboxLabel}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => onUpdateItem(row.id, { isSelected: e.target.checked })}
                          className={styles.cardCheckbox}
                        />
                        <span className={styles.cardCheckboxText}>
                          {isSelected ? 'Include in Stand Listing' : 'Click to include in listing'}
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(row.id)}
                        className={styles.deleteCardBtn}
                        title="Remove crop"
                      >
                        🗑️ Remove
                      </button>
                    </div>

                    {/* Card Body */}
                    <div className={styles.cardBody}>
                      {/* Left: Photo Column */}
                      <div className={styles.photoColumn}>
                        <div
                          className={styles.photoBox}
                          onClick={() => triggerFileUpload(row.id)}
                          title="Click to upload photo"
                        >
                          <img
                            src={displayImage}
                            alt={row.name || 'Produce'}
                            className={styles.photoImage}
                          />
                          <div className={styles.photoOverlay}>
                            <span>📷</span>
                            <span>{row.customPhotoDataUrl ? 'Change' : 'Upload'}</span>
                          </div>
                          {row.customPhotoDataUrl && (
                            <div className={styles.customBadge}>Custom</div>
                          )}
                        </div>

                        <div className={styles.photoBtnGroup}>
                          <button
                            type="button"
                            className={styles.photoBtn}
                            onClick={() => triggerCameraUpload(row.id)}
                            title="Take photo with camera"
                          >
                            📸 Camera
                          </button>
                          <button
                            type="button"
                            className={styles.photoBtn}
                            onClick={() => triggerFileUpload(row.id)}
                            title="Upload from device"
                          >
                            📁 Upload
                          </button>
                        </div>
                      </div>

                      {/* Right: Form Fields */}
                      <div className={styles.cardFields}>
                        {/* Produce Name */}
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Produce Name *</label>
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => onUpdateItem(row.id, { name: e.target.value })}
                            className={styles.input}
                            placeholder="e.g. Meyer Lemons"
                          />
                        </div>

                        {/* 1-Line Description */}
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>1-Line Note / Description</label>
                          <input
                            type="text"
                            value={row.description || ''}
                            onChange={(e) => onUpdateItem(row.id, { description: e.target.value })}
                            placeholder="e.g. Sweet, juicy, picked fresh this morning"
                            className={styles.input}
                          />
                        </div>

                        {/* Pricing & Quantity Row */}
                        <div className={styles.pricingRow}>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Quantity</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={row.quantity}
                              onChange={(e) => onUpdateItem(row.id, { quantity: e.target.value })}
                              className={styles.input}
                              placeholder="5"
                            />
                          </div>

                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Unit</label>
                            <select
                              value={row.unit}
                              onChange={(e) => {
                                const newUnit = e.target.value
                                const currentPriceNum = parseFloat(row.price)
                                const newPrice = (!isNaN(currentPriceNum) && currentPriceNum > 0)
                                  ? convertPrice(currentPriceNum, row.unit, newUnit).toFixed(2)
                                  : row.price

                                const currentSuggested = row.suggestedPrice || 3.50
                                const newSuggested = convertPrice(currentSuggested, row.unit, newUnit)

                                onUpdateItem(row.id, {
                                  unit: newUnit,
                                  price: newPrice,
                                  suggestedPrice: newSuggested,
                                })
                              }}
                              className={styles.select}
                            >
                              {ALLOWED_UNITS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Price ($)</label>
                            {row.isFree ? (
                              <div className={styles.freePill}>FREE</div>
                            ) : (
                              <div className={styles.priceWrapper}>
                                <span className={styles.pricePrefix}>$</span>
                                <input
                                  type="number"
                                  step="0.25"
                                  min="0"
                                  placeholder="0.00"
                                  value={row.price}
                                  onChange={(e) => onUpdateItem(row.id, { price: e.target.value, isFree: false })}
                                  className={`${styles.input} ${styles.priceInput}`}
                                />
                              </div>
                            )}
                          </div>

                          <label className={styles.freeToggleWrapper}>
                            <input
                              type="checkbox"
                              checked={row.isFree || false}
                              onChange={(e) =>
                                onUpdateItem(row.id, {
                                  isFree: e.target.checked,
                                  price: e.target.checked ? '0.00' : row.price || suggested.toFixed(2),
                                })
                              }
                              className={styles.freeCheckbox}
                            />
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>
                              Make Free
                            </span>
                          </label>
                        </div>

                        {/* Suggested Price Chip */}
                        <div className={styles.suggestedRow}>
                          <button
                            type="button"
                            onClick={() => onUpdateItem(row.id, { price: suggested.toFixed(2), isFree: false })}
                            className={styles.suggestedChip}
                            title="Click to apply suggested benchmark price"
                          >
                            💡 Suggested: ${suggested.toFixed(2)}/{row.unit}
                          </button>
                        </div>

                        {/* 🌾 Harvest Date (Matching Step1Basics in add-product-listing) */}
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>
                            🌾 Harvest Date <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(optional)</span>
                          </label>
                          <input
                            type="date"
                            className={styles.input}
                            value={row.harvestedAt || ''}
                            onChange={(e) => onUpdateItem(row.id, { harvestedAt: e.target.value })}
                            max={todayStr}
                          />
                          {row.harvestedAt && (
                            <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4, fontWeight: 600 }}>
                              {(() => {
                                const harvestTime = new Date(row.harvestedAt + 'T12:00:00').getTime()
                                if (isNaN(harvestTime)) return null
                                const days = Math.round((Date.now() - harvestTime) / 86400000)
                                if (isNaN(days)) return null
                                if (days <= 0) return '🟢 Harvested today — ultra fresh!'
                                if (days === 1) return '🟢 Harvested yesterday — very fresh!'
                                if (days <= 3) return `🟢 Harvested ${days} days ago — fresh!`
                                return `🟡 Harvested ${days} days ago`
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* + Add Another Produce Quick Bar */}
            <div style={{ marginTop: '14px' }}>
              {isAddingProduce ? (
                <div style={{ background: 'var(--gray-50)', padding: '12px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <input
                      type="text"
                      placeholder="Search seasonal catalog (e.g. Mint, Apples, Basil)..."
                      value={addProduceSearch}
                      onChange={(e) => setAddProduceSearch(e.target.value)}
                      className={styles.addProduceSearchInput}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingProduce(false)
                        setAddProduceSearch('')
                      }}
                      className={styles.cancelAddBtn}
                    >
                      Done
                    </button>
                  </div>

                  {/* Matching Catalog Items */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                    {availableCatalogAdditions.map((catItem) => (
                      <button
                        key={catItem.id}
                        type="button"
                        onClick={() => handleSelectNewProduce(catItem)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-lg)',
                          border: '1px solid var(--border)',
                          background: '#fff',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <img src={catItem.image} alt={catItem.name} style={{ width: '16px', height: '16px', borderRadius: '4px', objectFit: 'cover' }} />
                        <span>{catItem.name}</span>
                      </button>
                    ))}
                    {availableCatalogAdditions.length === 0 && (
                      <p style={{ fontSize: '12px', color: 'var(--gray-500)', padding: '6px 0' }}>
                        No matching seasonal catalog produce.
                      </p>
                    )}
                  </div>

                  <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--gray-500)', textAlign: 'center' }}>
                    Looking to list specialty items or seedlings?{' '}
                    <a href="/create-listing" style={{ color: 'var(--green-700)', fontWeight: 600, textDecoration: 'underline' }}>
                      Use Full Listing Wizard →
                    </a>
                  </div>
                </div>
              ) : (
                <div className={styles.addProduceSection}>
                  <button
                    type="button"
                    onClick={() => setIsAddingProduce(true)}
                    className={styles.addProduceBtn}
                  >
                    <span>➕</span> Add Another Produce to Stand
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 2. Unified Fulfillment Options */}
          <div>
            <div className={styles.sectionHeader}>
              2. Stand Fulfillment & Safety Settings
            </div>

            <div className={styles.fulfillmentCard}>
              {/* ── Pickup Option (matches Step2Fulfillment) ── */}
              <div className={styles.fulfillmentOption}>
                <div className={styles.optionHeader}>
                  <div className={styles.optionLabelGroup}>
                    <label htmlFor="toggle-offers-pickup" className={styles.optionLabel}>
                      <span>📍</span> Pickup Available
                    </label>
                  </div>
                  <input
                    id="toggle-offers-pickup"
                    type="checkbox"
                    checked={offersPickup}
                    onChange={(e) => setOffersPickup(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--green-600)', cursor: 'pointer' }}
                  />
                </div>
                <div className={styles.optionSubtitle}>
                  Buyers pick up from you
                </div>

                {offersPickup && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
                    {/* Safety Mode Selector: Home vs Safe Landmark */}
                    <div className={styles.modeSwitchGrid}>
                      <div
                        onClick={() => setPickupSafetyMode('home')}
                        className={`${styles.modeSwitchCard} ${pickupSafetyMode === 'home' ? styles.modeSwitchActive : styles.modeSwitchInactive}`}
                      >
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--gray-900)' }}>
                          🏡 My Home Address
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>
                          House # kept private
                        </div>
                      </div>

                      <div
                        onClick={() => setPickupSafetyMode('landmark')}
                        className={`${styles.modeSwitchCard} ${pickupSafetyMode === 'landmark' ? styles.modeSwitchActive : styles.modeSwitchInactive}`}
                      >
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--green-700)' }}>
                          🛡️ Safe Public Place
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--green-800)' }}>
                          Parks, libraries (Safe)
                        </div>
                      </div>
                    </div>

                    {pickupSafetyMode === 'landmark' ? (
                      <div className={styles.landmarkBox}>
                        <div className={styles.landmarkRow}>
                          <span className={styles.landmarkTitle}>
                            <span>🛡️</span> Safe Public Landmark Location:
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowLandmarkPicker(true)}
                            className={styles.changeLandmarkBtn}
                          >
                            {selectedLandmark ? 'Change' : 'Select Landmark'}
                          </button>
                        </div>

                        <div className={styles.landmarkDisplay}>
                          {selectedLandmark ? `🌳 ${selectedLandmark.name} (${selectedLandmark.category})` : '🌳 Lincoln Glen Park (Front Parking Area)'}
                        </div>

                        <p style={{ fontSize: '11px', color: 'var(--green-800)', margin: 0 }}>
                          Buyers meet you at this public spot. Your home address remains private.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <label className={styles.fieldLabel}>Home / Garden Address</label>
                          <button
                            type="button"
                            onClick={handleUseLocationForHome}
                            disabled={isLocatingHome}
                            style={{ background: 'none', border: 'none', color: 'var(--green-700)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                          >
                            {isLocatingHome ? '⏳ Locating...' : '📍 Use My Location'}
                          </button>
                        </div>
                        <input
                          type="text"
                          value={homePickupAddress}
                          onChange={(e) => setHomePickupAddress(e.target.value)}
                          placeholder="e.g. 1230 Willow Glen Way, San Jose, CA 95125"
                          className={styles.input}
                        />
                      </div>
                    )}

                    {/* Pickup Instructions */}
                    <div className={styles.fieldGroup}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className={styles.fieldLabel}>
                          📋 Pickup Instructions for Buyer
                        </label>
                        <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                          {pickupInstructions.length}/300
                        </span>
                      </div>
                      <input
                        type="text"
                        value={pickupInstructions}
                        onChange={(e) => setPickupInstructions(e.target.value)}
                        placeholder={pickupSafetyMode === 'landmark' ? 'e.g. Meet by the park benches near the main entrance' : 'e.g. Porch pickup box on front porch'}
                        maxLength={300}
                        className={styles.input}
                      />
                    </div>

                    {/* ⏱️ Buyer Advance Notice Before Arrival (matches Step2Fulfillment) */}
                    <div>
                      <label className={styles.fieldLabel} style={{ marginBottom: 6, display: 'block' }}>
                        ⏱️ Buyer Advance Notice Before Arrival
                      </label>
                      <div className={styles.noticeGrid}>
                        {[
                          { mins: 15, label: '⚡ 15 min' },
                          { mins: 30, label: '⏱️ 30 min (Default)' },
                          { mins: 60, label: '🕐 1 hour' },
                          { mins: 0, label: 'No notice needed' },
                        ].map((opt) => {
                          const active = pickupNoticeMinutes === opt.mins
                          return (
                            <button
                              key={opt.mins}
                              type="button"
                              onClick={() => setPickupNoticeMinutes(opt.mins)}
                              className={`${styles.noticePill} ${active ? styles.noticePillActive : styles.noticePillInactive}`}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6b7280' }}>
                        {pickupNoticeMinutes > 0
                          ? `Buyers will be asked to message you ${pickupNoticeMinutes} minutes before arriving within their 2-hour window.`
                          : 'Buyers can arrive anytime during their selected window without advance message.'}
                      </p>
                    </div>

                    {/* Pickup Schedule Presets & Calendar View */}
                    <div>
                      <label className={styles.fieldLabel} style={{ marginBottom: 6, display: 'block' }}>
                        📅 Pickup Schedule & Availability
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: pickupPreset === 'custom' ? 12 : 0 }}>
                        {FULFILLMENT_PRESET_OPTIONS.map((opt) => {
                          const isActive = pickupPreset === opt.id
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setPickupPreset(opt.id)
                                if (opt.id !== 'custom') {
                                  setCustomPickupWindows(getWindowsForPreset(opt.id))
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

                      {pickupPreset === 'custom' && (
                        <div style={{ background: '#f9fafb', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 12, marginTop: 10, overflowX: 'auto' }}>
                          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 8, textAlign: 'center' }}>
                            Tap any hour cell to set custom pickup hours
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center' }}>
                            <thead>
                              <tr>
                                <th style={{ width: 32, padding: '4px 2px' }}></th>
                                {dayOptions.map((d) => (
                                  <th key={d.date} style={{ padding: '4px 2px', fontWeight: 600, color: 'var(--gray-700)' }}>
                                    {d.label.split(' ')[0]}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: 13 }).map((_, index) => {
                                const hour = 8 + index
                                const isPm = hour >= 12
                                const hourNum = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                                const hourLabel = `${hourNum}${isPm ? 'p' : 'a'}`
                                return (
                                  <tr key={hour}>
                                    <td style={{ color: 'var(--gray-400)', padding: '3px 0', fontSize: 10 }}>{hourLabel}</td>
                                    {dayOptions.map((opt) => {
                                      const isSelected = isHourSelected(hour, customPickupWindows[opt.date] || [])
                                      return (
                                        <td
                                          key={opt.date}
                                          onClick={() => toggleHourCell(opt.date, hour, customPickupWindows, setCustomPickupWindows)}
                                          style={{
                                            height: 22,
                                            border: '1px solid #e5e7eb',
                                            background: isSelected ? 'var(--green-500)' : '#ffffff',
                                            cursor: 'pointer',
                                            borderRadius: 2,
                                          }}
                                        />
                                      )
                                    })}
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Contactless Delivery Option (matches Step2Fulfillment) ── */}
              <div className={styles.fulfillmentOption}>
                <div className={styles.optionHeader}>
                  <div className={styles.optionLabelGroup}>
                    <label htmlFor="toggle-offers-delivery" className={styles.optionLabel}>
                      <span>🚗</span> I&apos;ll Deliver
                    </label>
                    <span className={styles.safestBadge}>
                      🛡️ Safest (100% Contactless)
                    </span>
                  </div>
                  <input
                    id="toggle-offers-delivery"
                    type="checkbox"
                    checked={offersDelivery}
                    onChange={(e) => setOffersDelivery(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--green-600)', cursor: 'pointer' }}
                  />
                </div>
                <div className={styles.optionSubtitle}>
                  100% Contactless Porch Drop-off — you deliver directly to buyer&apos;s door.
                </div>

                {offersDelivery && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
                    {/* Base Address */}
                    <div className={styles.fieldGroup}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label className={styles.fieldLabel}>Delivery Origin / Base Address</label>
                        <button
                          type="button"
                          onClick={handleUseLocationForDelivery}
                          disabled={isLocatingDelivery}
                          style={{ background: 'none', border: 'none', color: 'var(--green-700)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >
                          {isLocatingDelivery ? '⏳ Locating...' : '📍 Use My Location'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={deliveryBaseAddr}
                        onChange={(e) => setDeliveryBaseAddr(e.target.value)}
                        placeholder="e.g. 1200 Lincoln Ave, San Jose, CA 95125"
                        className={styles.input}
                      />
                    </div>

                    {/* Delivery Radius Slider */}
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>🚗 Delivery Radius</label>
                      <div className={styles.radiusSliderRow}>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={deliveryRadius}
                          onChange={(e) => setDeliveryRadius(parseInt(e.target.value, 10))}
                          className={styles.radiusSlider}
                        />
                        <span className={styles.radiusBadge}>
                          {deliveryRadius} mi
                        </span>
                      </div>
                    </div>

                    {/* Delivery Zip Codes Tags */}
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>
                        📮 Delivery Zip Codes (Specific zones/neighborhoods)
                      </label>
                      <div className={styles.zipTagsContainer}>
                        {deliveryZipcodes.map((zip) => (
                          <span key={zip} className={styles.zipTag}>
                            {zip}
                            <button
                              type="button"
                              onClick={() => handleRemoveDeliveryZip(zip)}
                              className={styles.zipTagRemoveBtn}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          placeholder={deliveryZipcodes.length === 0 ? 'e.g. 95125, 95124 (press Enter)' : 'Add zip...'}
                          value={zipInput}
                          onChange={(e) => setZipInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                              e.preventDefault()
                              handleAddDeliveryZip(zipInput)
                            }
                          }}
                          onBlur={() => {
                            if (zipInput) handleAddDeliveryZip(zipInput)
                          }}
                          className={styles.zipTagInput}
                        />
                      </div>
                    </div>

                    {/* Delivery Schedule Presets & Calendar View */}
                    <div>
                      <label className={styles.fieldLabel} style={{ marginBottom: 6, display: 'block' }}>
                        📅 Delivery Schedule & Availability
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: deliveryPreset === 'custom' ? 12 : 0 }}>
                        {FULFILLMENT_PRESET_OPTIONS.map((opt) => {
                          const isActive = deliveryPreset === opt.id
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setDeliveryPreset(opt.id)
                                if (opt.id !== 'custom') {
                                  setCustomDeliveryWindows(getWindowsForPreset(opt.id))
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

                      {deliveryPreset === 'custom' && (
                        <div style={{ background: '#f9fafb', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 12, marginTop: 10, overflowX: 'auto' }}>
                          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 8, textAlign: 'center' }}>
                            Tap any hour cell to set custom delivery hours
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center' }}>
                            <thead>
                              <tr>
                                <th style={{ width: 32, padding: '4px 2px' }}></th>
                                {dayOptions.map((d) => (
                                  <th key={d.date} style={{ padding: '4px 2px', fontWeight: 600, color: 'var(--gray-700)' }}>
                                    {d.label.split(' ')[0]}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: 13 }).map((_, index) => {
                                const hour = 8 + index
                                const isPm = hour >= 12
                                const hourNum = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                                const hourLabel = `${hourNum}${isPm ? 'p' : 'a'}`
                                return (
                                  <tr key={hour}>
                                    <td style={{ color: 'var(--gray-400)', padding: '3px 0', fontSize: 10 }}>{hourLabel}</td>
                                    {dayOptions.map((opt) => {
                                      const isSelected = isHourSelected(hour, customDeliveryWindows[opt.date] || [])
                                      return (
                                        <td
                                          key={opt.date}
                                          onClick={() => toggleHourCell(opt.date, hour, customDeliveryWindows, setCustomDeliveryWindows)}
                                          style={{
                                            height: 22,
                                            border: '1px solid #e5e7eb',
                                            background: isSelected ? 'var(--green-500)' : '#ffffff',
                                            cursor: 'pointer',
                                            borderRadius: 2,
                                          }}
                                        />
                                      )
                                    })}
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <button
            type="button"
            onClick={handlePublish}
            disabled={isSubmitting || activeCount === 0}
            className={styles.publishBtn}
          >
            <span>🚀</span> {isSubmitting ? 'Publishing...' : `Publish ${activeCount} Crop Listing${activeCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {showLandmarkPicker && (
        <LandmarkPickerModal
          isOpen={showLandmarkPicker}
          onClose={() => setShowLandmarkPicker(false)}
          onSelect={(landmark) => {
            setSelectedLandmark(landmark)
            setShowLandmarkPicker(false)
          }}
          fallbackZip={currentZipcode}
        />
      )}
    </div>
  )
}
