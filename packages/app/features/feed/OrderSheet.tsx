/**
 * OrderSheet - Drop-off delivery request modal
 *
 * Triggered by the Order button on `want_to_sell` posts in the feed.
 * Shows quantity, address, dates, points balance summary, sales tax
 * breakdown, and handles the insufficient-points → BuyPointsSheet flow.
 *
 * Based on figma_code/src/components/MainFeed.tsx drop-off modal (lines 832-1094)
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Spinner } from 'tamagui'
import { Platform, TextInput, TouchableOpacity, Alert } from 'react-native'
import {
  X,
  ShoppingCart,
  MapPin,
  Calendar,
  FileText,
  Info,
  AlertTriangle,
  Navigation2,
  Receipt,
  CheckCircle,
} from '@tamagui/lucide-icons'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { BuyPointsSheet } from './BuyPointsSheet'
import { CalendarPicker } from '../create-post/CalendarPicker'
import type { FeedPost } from './feed-service'
import { supabase } from '../auth/auth-hook'
import * as Location from 'expo-location'

// =============================================================================
// Types
// =============================================================================

export interface OrderFormData {
  quantity: number
  address: string
  latestDate: string
  instructions: string
  totalPrice: number
  taxRatePct: number
  taxAmount: number
}

export interface OrderSheetProps {
  visible: boolean
  post: FeedPost | null
  userPoints: number
  onClose: () => void
  onSubmit: (data: OrderFormData) => void
  /** Called when balance changes (e.g., after buying points) */
  onBalanceChanged?: () => void
  t: (key: string, opts?: Record<string, any>) => string
}

// =============================================================================
// Component
// =============================================================================

// ── Tax info type ──────────────────────────────────────────────────────
interface TaxInfo {
  rate_pct: number
  rule_type: string
  is_exempt: boolean
  source: string
  loading: boolean
  error: string | null
}

const INITIAL_TAX: TaxInfo = {
  rate_pct: 0,
  rule_type: 'unknown',
  is_exempt: false,
  source: '',
  loading: false,
  error: null,
}

/** US state full name → 2-letter abbreviation map (case-insensitive lookup) */
export const US_STATE_MAP: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
}

/** Extract 5-digit ZIP code from a free-text address string */
export function extractZipCode(addr: string): string | null {
  const match = addr.match(/\b(\d{5})(?:-\d{4})?\b/)
  return match ? match[1]! : null
}

/** Extract 2-letter state code from a free-text address string */
export function extractStateCode(addr: string): string | null {
  // 1. Match 2-letter abbreviation before a ZIP: ", CA 95014"
  const stateAbbr = addr.match(/\b([A-Z]{2})\s+\d{5}\b/)
  if (stateAbbr) return stateAbbr[1]!
  // 2. Match 2-letter abbreviation after a comma: ", CA," or ", CA"
  const afterComma = addr.match(/,\s*([A-Z]{2})(?:\s|,|$)/)
  if (afterComma) return afterComma[1]!
  // 3. Match full state name (case-insensitive) — check longer names first
  //    to avoid "Virginia" matching before "West Virginia"
  const lowerAddr = addr.toLowerCase()
  // Split address into comma-separated parts for more precise matching
  const parts = lowerAddr.split(',').map(p => p.trim())
  // Sort entries by name length descending so "west virginia" beats "virginia"
  const sortedEntries = Object.entries(US_STATE_MAP)
    .sort(([a], [b]) => b.length - a.length)
  // First pass: check if any part exactly matches a state name (most reliable)
  for (const [name, code] of sortedEntries) {
    if (parts.some(part => part === name)) return code
  }
  // Second pass: check if a state name appears as a word boundary in any part
  for (const [name, code] of sortedEntries) {
    for (const part of parts) {
      const idx = part.indexOf(name)
      if (idx !== -1) {
        const before = idx === 0 || !/[a-z]/.test(part[idx - 1]!)
        const after = idx + name.length >= part.length || !/[a-z]/.test(part[idx + name.length]!)
        if (before && after) return code
      }
    }
  }
  return null
}

export function OrderSheet({
  visible,
  post,
  userPoints,
  onClose,
  onSubmit,
  onBalanceChanged,
  t,
}: OrderSheetProps) {
  // Form state
  const [quantity, setQuantity] = useState('')
  const [address, setAddress] = useState('')
  const [addressPreFilled, setAddressPreFilled] = useState(false)

  // Pre-fill delivery address from buyer's profile
  useEffect(() => {
    if (addressPreFilled || address) return
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('street_address, city, state_code, zip_code')
          .eq('id', user.id)
          .maybeSingle()
        if (profile?.street_address && profile?.city && profile?.state_code && profile?.zip_code) {
          setAddress(`${profile.street_address}, ${profile.city}, ${profile.state_code}, ${profile.zip_code}`)
          setAddressPreFilled(true)
        }
      } catch { /* ignore - user can type manually */ }
    })()
  }, [visible]) // re-check when sheet opens
  const [latestDate, setLatestDate] = useState('')
  const [instructions, setInstructions] = useState('')
  const [buyPointsVisible, setBuyPointsVisible] = useState(false)
  const [locating, setLocating] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  // Local balance state — tracks purchases made during this session
  const [effectivePoints, setEffectivePoints] = useState(userPoints)
  // Tax state
  const [taxInfo, setTaxInfo] = useState<TaxInfo>(INITIAL_TAX)
  const taxLookupRef = useRef<number>(0)

  // Sync with prop when it changes (e.g. after parent refetch completes)
  useEffect(() => {
    setEffectivePoints(userPoints)
  }, [userPoints])

  // Derived values
  const pointsPerUnit = post?.sell_details?.points_per_unit ?? 0
  const unit = post?.sell_details?.unit ?? 'unit'
  const maxQuantity = post?.sell_details?.total_quantity_available ?? null
  const numericQty = parseFloat(quantity) || 0
  const exceedsMax = maxQuantity !== null && numericQty > maxQuantity
  const subtotal = useMemo(() => Math.round(numericQty * pointsPerUnit), [numericQty, pointsPerUnit])

  // Tax-aware totals
  const taxPoints = useMemo(() => {
    if (taxInfo.is_exempt || taxInfo.loading || !taxInfo.rate_pct || subtotal <= 0) return 0
    return Math.ceil(subtotal * taxInfo.rate_pct / 100) // always round up
  }, [subtotal, taxInfo.rate_pct, taxInfo.is_exempt, taxInfo.loading])
  const totalPrice = subtotal + taxPoints
  const balanceAfter = effectivePoints - totalPrice
  const hasInsufficientPoints = numericQty > 0 && totalPrice > 0 && balanceAfter < 0
  const shortfall = hasInsufficientPoints ? Math.abs(balanceAfter) : 0
  const cannotSubmit = exceedsMax

  // ── Tax lookup — triggered when address has a ZIP code ────────────
  useEffect(() => {
    const zip = extractZipCode(address)
    const stateCode = extractStateCode(address)
    const category = post?.sell_details?.category
    const productName = post?.sell_details?.produce_name

    if (!zip || !stateCode || !category) {
      setTaxInfo(INITIAL_TAX)
      return
    }

    const callId = ++taxLookupRef.current
    setTaxInfo(prev => ({ ...prev, loading: true, error: null }))

    supabase.functions
      .invoke('get-tax-rate', {
        body: {
          zip_code: zip,
          state_code: stateCode,
          category,
          product_name: productName,
        },
      })
      .then(({ data, error }) => {
        if (callId !== taxLookupRef.current) return // stale
        if (error) {
          console.error('Tax lookup error:', error)
          setTaxInfo({ ...INITIAL_TAX, error: 'Could not determine tax rate' })
          return
        }
        setTaxInfo({
          rate_pct: data.rate_pct ?? 0,
          rule_type: data.rule_type ?? 'unknown',
          is_exempt: data.is_exempt ?? false,
          source: data.source ?? '',
          loading: false,
          error: null,
        })
      })
      .catch(() => {
        if (callId !== taxLookupRef.current) return
        setTaxInfo({ ...INITIAL_TAX, error: 'Tax lookup failed' })
      })
  }, [address, post?.sell_details?.category, post?.sell_details?.produce_name])

  // Today's date for min date
  const todayString = useMemo(() => new Date().toISOString().split('T')[0]!, [])

  const resetForm = useCallback(() => {
    setQuantity('')
    setAddress('')
    setLatestDate('')
    setInstructions('')
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  const handleSubmit = useCallback(() => {
    if (!quantity || !address.trim() || !latestDate) {
      Alert.alert(t('feed.orderForm.requiredFields'))
      return
    }
    if (exceedsMax) {
      Alert.alert(t('feed.orderForm.exceedsMaxAlert', { max: maxQuantity, unit }))
      return
    }
    if (hasInsufficientPoints) {
      Alert.alert(t('feed.orderForm.insufficientAlert'))
      return
    }
    onSubmit({
      quantity: numericQty,
      address: address.trim(),
      latestDate,
      instructions: instructions.trim(),
      totalPrice,
      taxRatePct: taxInfo.rate_pct,
      taxAmount: taxPoints,
    })
    resetForm()
  }, [quantity, address, latestDate, instructions, exceedsMax, hasInsufficientPoints, maxQuantity, unit, numericQty, totalPrice, taxInfo.rate_pct, taxPoints, onSubmit, resetForm, t])

  const handleUseMyLocation = useCallback(async () => {
    setLocating(true)
    try {
      if (Platform.OS === 'web') {
        // Web: use browser Geolocation API + Nominatim reverse geocoding
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
        )
        const { latitude, longitude } = pos.coords
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
        )
        const data = await res.json()
        if (data?.display_name) {
          setAddress(data.display_name)
        }
      } else {
        // Native: use expo-location
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert(t('feed.orderForm.locationDenied'))
          return
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        })
        if (geo) {
          const parts = [geo.streetNumber, geo.street, geo.city, geo.region, geo.postalCode].filter(Boolean)
          setAddress(parts.join(', '))
        }
      }
    } catch {
      Alert.alert(t('feed.orderForm.locationError'))
    } finally {
      setLocating(false)
    }
  }, [t])

  const handleBuyPointsComplete = useCallback((pointsAmount: number) => {
    setBuyPointsVisible(false)
    // Immediately update local balance so deficit recalculates correctly
    setEffectivePoints(prev => prev + pointsAmount)
    // Notify parent to refresh balance from DB
    onBalanceChanged?.()
    // Auto-submit the order — user just bought enough points to cover the deficit
    if (quantity && address.trim() && latestDate) {
      onSubmit({
        quantity: numericQty,
        address: address.trim(),
        latestDate,
        instructions: instructions.trim(),
        totalPrice,
        taxRatePct: taxInfo.rate_pct,
        taxAmount: taxPoints,
      })
      resetForm()
    }
  }, [onBalanceChanged, quantity, address, latestDate, instructions, numericQty, totalPrice, taxInfo.rate_pct, taxPoints, onSubmit, resetForm])

  if (!visible || !post) return null

  const sellerName = post.author_name || t('feed.unknownAuthor')

  return (
    <>
      <YStack
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        backgroundColor="rgba(0,0,0,0.5)"
        justifyContent="center"
        alignItems="center"
        zIndex={100}
        padding="$4"
      >
        <ScrollView
          style={{ width: '100%', maxWidth: 480, maxHeight: '90%' }}
          contentContainerStyle={{ flexGrow: 0 }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius.lg}
            padding="$5"
            width="100%"
            gap="$4"
            shadowColor={shadows.sm.color}
            shadowOffset={shadows.sm.offset}
            shadowOpacity={0.1}
            shadowRadius={shadows.sm.radius}
          >
            {/* ─── Header ─── */}
            <XStack justifyContent="space-between" alignItems="flex-start">
              <YStack flex={1} gap="$1">
                <Text fontSize={20} fontWeight="700" color={colors.gray[900]}>
                  {t('feed.orderForm.title')}
                </Text>
                <Text fontSize={13} color={colors.gray[600]}>
                  {t('feed.orderForm.completeDetails', { seller: sellerName })}
                </Text>
              </YStack>
              <TouchableOpacity
                onPress={handleClose}
                style={{
                  padding: 8,
                  borderRadius: 20,
                  backgroundColor: colors.gray[100],
                  marginLeft: 8,
                }}
                activeOpacity={0.7}
              >
                <X size={18} color={colors.gray[600]} />
              </TouchableOpacity>
            </XStack>

            {/* ─── Quantity ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                {t('feed.orderForm.quantity')} <Text color="#ef4444">*</Text>
              </Text>
              <XStack gap="$2" alignItems="center">
                <XStack
                  flex={1}
                  borderWidth={1}
                  borderColor={colors.gray[300]}
                  borderRadius={borderRadius.md}
                  alignItems="center"
                  paddingHorizontal="$3"
                >
                  <ShoppingCart size={16} color={colors.gray[400]} />
                  <TextInput
                    style={{
                      flex: 1,
                      fontSize: 15,
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      fontWeight: '500',
                      color: colors.gray[900],
                      fontFamily: Platform.OS === 'ios' ? 'Inter-Medium' : 'Inter',
                    }}
                    placeholder={t('feed.orderForm.quantityPlaceholder')}
                    placeholderTextColor={colors.gray[400]}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="decimal-pad"
                  />
                </XStack>
                {/* Unit Badge */}
                <YStack
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  backgroundColor={colors.gray[100]}
                  borderWidth={1}
                  borderColor={colors.gray[300]}
                  borderRadius={borderRadius.md}
                >
                  <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                    {unit}
                  </Text>
                </YStack>
              </XStack>

              {/* Price per unit, max qty, + calculated subtotal */}
              <YStack gap={2}>
                {pointsPerUnit > 0 && (
                  <Text fontSize={12} color={colors.gray[600]}>
                    {t('feed.orderForm.pointsPerUnit', { unit })} {pointsPerUnit} {t('feed.orderForm.pointsUnit')}
                  </Text>
                )}
                {maxQuantity !== null && (
                  <Text fontSize={12} color={colors.gray[500]}>
                    {t('feed.orderForm.maxAvailable', { max: maxQuantity, unit })}
                  </Text>
                )}
                {numericQty > 0 && pointsPerUnit > 0 && (
                  <Text fontSize={12} color={colors.gray[500]}>
                    Subtotal: {subtotal} {t('feed.orderForm.pointsUnit')}
                  </Text>
                )}
                {exceedsMax && (
                  <Text fontSize={12} color="#ea580c" fontWeight="600">
                    {t('feed.orderForm.exceedsMax', { max: maxQuantity, unit })}
                  </Text>
                )}
              </YStack>
            </YStack>

            {/* ─── Drop-off Address ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                {t('feed.orderForm.address')} <Text color="#ef4444">*</Text>
              </Text>
              <XStack
                borderWidth={1}
                borderColor={colors.gray[300]}
                borderRadius={borderRadius.md}
                padding="$3"
                alignItems="flex-start"
                gap="$2"
              >
                <MapPin size={16} color={colors.gray[400]} style={{ marginTop: 2 }} />
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: colors.gray[900],
                    minHeight: 60,
                    textAlignVertical: 'top',
                    fontWeight: 'normal',
                    fontFamily: Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                  }}
                  placeholder={t('feed.orderForm.addressPlaceholder')}
                  placeholderTextColor={colors.gray[400]}
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  numberOfLines={3}
                />
              </XStack>
              {/* Use My Location button */}
              <TouchableOpacity
                onPress={handleUseMyLocation}
                disabled={locating}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  alignSelf: 'flex-start',
                  paddingVertical: 4,
                }}
              >
                {locating ? (
                  <Spinner size="small" color={colors.green[600]} />
                ) : (
                  <Navigation2 size={14} color={colors.green[600]} />
                )}
                <Text fontSize={12} fontWeight="600" color={colors.green[600]}>
                  {t('feed.orderForm.useMyLocation')}
                </Text>
              </TouchableOpacity>
              <Text fontSize={11} color={colors.gray[500]}>
                {t('feed.orderForm.addressHint')}
              </Text>
            </YStack>

            {/* ─── Latest Drop-off Date ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                {t('feed.orderForm.latestDate')} <Text color="#ef4444">*</Text>
              </Text>
              {/* Selected date display / toggle */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setCalendarOpen(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.gray[300],
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  gap: 8,
                }}
              >
                <Calendar size={16} color={colors.gray[400]} />
                <Text
                  flex={1}
                  fontSize={14}
                  color={latestDate ? colors.gray[900] : colors.gray[400]}
                >
                  {latestDate
                    ? new Date(latestDate + 'T00:00:00').toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : t('feed.orderForm.selectDate')}
                </Text>
              </TouchableOpacity>

              {/* CalendarPicker modal */}
              <CalendarPicker
                visible={calendarOpen}
                initialDate={latestDate || undefined}
                minimumDate={new Date()}
                onSelect={(dateStr) => {
                  setLatestDate(dateStr)
                  setCalendarOpen(false)
                }}
                onCancel={() => setCalendarOpen(false)}
              />

              <Text fontSize={11} color={colors.gray[500]}>
                {t('feed.orderForm.latestDateHint')}
              </Text>
            </YStack>

            {/* ─── Drop-off Instructions ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                {t('feed.orderForm.instructions')}
              </Text>
              <XStack
                borderWidth={1}
                borderColor={colors.gray[300]}
                borderRadius={borderRadius.md}
                padding="$3"
                alignItems="flex-start"
                gap="$2"
              >
                <FileText size={16} color={colors.gray[400]} style={{ marginTop: 2 }} />
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: colors.gray[900],
                    minHeight: 60,
                    textAlignVertical: 'top',
                    fontWeight: 'normal',
                    fontFamily: Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                  }}
                  placeholder={t('feed.orderForm.instructionsPlaceholder')}
                  placeholderTextColor={colors.gray[400]}
                  value={instructions}
                  onChangeText={setInstructions}
                  multiline
                  numberOfLines={3}
                />
              </XStack>
              <Text fontSize={11} color={colors.gray[500]}>
                {t('feed.orderForm.instructionsHint')}
              </Text>
            </YStack>

            {/* ─── Geotag Info Note ─── */}
            <XStack
              backgroundColor="#eff6ff"
              borderWidth={1}
              borderColor="#bfdbfe"
              borderRadius={borderRadius.md}
              padding="$3"
              gap="$2"
              alignItems="center"
            >
              <Info size={16} color="#1d4ed8" />
              <Text fontSize={13} color="#1e40af" flex={1}>
                {t('feed.orderForm.geotagNote')}
              </Text>
            </XStack>

            {/* ─── Points Balance Summary ─── */}
            <YStack
              backgroundColor={colors.gray[50]}
              borderRadius={borderRadius.md}
              padding="$4"
              borderWidth={1}
              borderColor={colors.gray[200]}
              gap="$2"
            >
              <XStack justifyContent="space-between" alignItems="center">
                <Text fontSize={13} color={colors.gray[700]}>
                  {t('feed.orderForm.currentBalance')}
                </Text>
                <Text fontSize={14} fontWeight="600" color={colors.gray[900]}>
                  {userPoints} {t('feed.orderForm.pointsUnit')}
                </Text>
              </XStack>

              {numericQty > 0 && subtotal > 0 && (
                <>
                  {/* Subtotal row */}
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text fontSize={13} color={colors.gray[700]}>
                      Subtotal ({numericQty} × {pointsPerUnit})
                    </Text>
                    <Text fontSize={14} fontWeight="600" color={colors.gray[900]}>
                      {subtotal} {t('feed.orderForm.pointsUnit')}
                    </Text>
                  </XStack>

                  {/* ─── Sales Tax Card ─── */}
                  {taxInfo.loading ? (
                    <XStack
                      backgroundColor="#f0f9ff"
                      borderWidth={1}
                      borderColor="#bae6fd"
                      borderRadius={borderRadius.md}
                      padding="$3"
                      gap="$2"
                      alignItems="center"
                    >
                      <Spinner size="small" color="#0284c7" />
                      <Text fontSize={12} color="#0369a1">Calculating sales tax…</Text>
                    </XStack>
                  ) : taxInfo.error ? (
                    <XStack
                      backgroundColor="#fef2f2"
                      borderWidth={1}
                      borderColor="#fecaca"
                      borderRadius={borderRadius.md}
                      padding="$3"
                      gap="$2"
                      alignItems="center"
                    >
                      <AlertTriangle size={14} color="#dc2626" />
                      <Text fontSize={12} color="#b91c1c">{taxInfo.error}</Text>
                    </XStack>
                  ) : extractZipCode(address) ? (
                    <YStack
                      backgroundColor={taxInfo.is_exempt ? '#f0fdf4' : '#fffbeb'}
                      borderWidth={1}
                      borderColor={taxInfo.is_exempt ? '#bbf7d0' : '#fde68a'}
                      borderRadius={borderRadius.md}
                      padding="$3"
                      gap="$1.5"
                    >
                      <XStack alignItems="center" gap="$2">
                        <Receipt size={14} color={taxInfo.is_exempt ? '#16a34a' : '#d97706'} />
                        <Text fontSize={13} fontWeight="600" color={colors.gray[800]}>
                          Sales Tax
                        </Text>
                      </XStack>

                      <XStack justifyContent="space-between" alignItems="center">
                        <Text fontSize={12} color={colors.gray[600]}>
                          {post?.sell_details?.category ? post.sell_details.category.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Category'}
                          {' · '}
                          {extractStateCode(address) || 'State'}
                        </Text>
                        {taxInfo.is_exempt ? (
                          <XStack alignItems="center" gap="$1">
                            <CheckCircle size={12} color="#16a34a" />
                            <Text fontSize={12} fontWeight="600" color="#16a34a">Exempt</Text>
                          </XStack>
                        ) : (
                          <Text fontSize={12} fontWeight="500" color="#d97706">Taxable</Text>
                        )}
                      </XStack>

                      <XStack justifyContent="space-between" alignItems="center">
                        <Text fontSize={12} color={colors.gray[500]}>
                          Rate{!taxInfo.is_exempt ? ` (ZIP ${extractZipCode(address)})` : ''}
                        </Text>
                        <Text fontSize={12} color={colors.gray[700]}>
                          {taxInfo.rate_pct.toFixed(3)}%
                        </Text>
                      </XStack>

                      <XStack justifyContent="space-between" alignItems="center">
                        <Text fontSize={12} color={colors.gray[500]}>Tax</Text>
                        <Text
                          fontSize={12}
                          fontWeight="600"
                          color={taxPoints > 0 ? '#d97706' : '#16a34a'}
                        >
                          {taxPoints > 0 ? `⬆ ${taxPoints}` : '0'} {t('feed.orderForm.pointsUnit')}
                        </Text>
                      </XStack>
                    </YStack>
                  ) : null}

                  {/* Total (incl. tax) row */}
                  <XStack justifyContent="space-between" alignItems="center" paddingTop="$1">
                    <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>
                      {taxPoints > 0 ? 'Total (incl. tax)' : t('feed.orderForm.requestTotal')}
                    </Text>
                    <Text fontSize={14} fontWeight="700" color={colors.gray[900]}>
                      {totalPrice} {t('feed.orderForm.pointsUnit')}
                    </Text>
                  </XStack>

                  {/* Balance After row */}
                  <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    paddingTop="$2"
                    borderTopWidth={1}
                    borderTopColor={colors.gray[300]}
                  >
                    <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>
                      {t('feed.orderForm.balanceAfter')}
                    </Text>
                    <Text
                      fontSize={18}
                      fontWeight="700"
                      color={balanceAfter >= 0 ? colors.green[600] : '#ef4444'}
                    >
                      {balanceAfter} {t('feed.orderForm.pointsUnit')}
                    </Text>
                  </XStack>
                </>
              )}
            </YStack>



            {/* ─── Action Buttons ─── */}
            <YStack gap="$3">
              {hasInsufficientPoints ? (
                <YStack gap="$2">
                  <Button
                    backgroundColor={cannotSubmit ? colors.gray[300] : '#f59e0b'}
                    paddingVertical="$2.5"
                    borderRadius={borderRadius.md}
                    pressStyle={cannotSubmit ? undefined : { backgroundColor: '#d97706' }}
                    disabled={cannotSubmit}
                    onPress={() => setBuyPointsVisible(true)}
                  >
                    <Text color="white" fontWeight="600" fontSize={15}>
                      {t('feed.orderForm.buyPointsAndSubmit')}
                    </Text>
                  </Button>
                  <Button
                    backgroundColor={colors.gray[100]}
                    paddingVertical="$2.5"
                    borderRadius={borderRadius.md}
                    pressStyle={{ backgroundColor: colors.gray[200] }}
                    onPress={handleClose}
                  >
                    <Text color={colors.gray[700]} fontWeight="600" fontSize={15}>
                      {t('feed.orderForm.cancel')}
                    </Text>
                  </Button>
                </YStack>
              ) : (
                <XStack gap="$3">
                  <Button
                    flex={1}
                    backgroundColor={colors.gray[100]}
                    paddingVertical="$2.5"
                    borderRadius={borderRadius.md}
                    pressStyle={{ backgroundColor: colors.gray[200] }}
                    onPress={handleClose}
                  >
                    <Text color={colors.gray[700]} fontWeight="600" fontSize={15}>
                      {t('feed.orderForm.cancel')}
                    </Text>
                  </Button>
                  <Button
                    flex={1}
                    backgroundColor={cannotSubmit ? colors.gray[300] : colors.green[600]}
                    paddingVertical="$2.5"
                    borderRadius={borderRadius.md}
                    pressStyle={cannotSubmit ? undefined : { backgroundColor: colors.green[700] }}
                    disabled={cannotSubmit}
                    onPress={handleSubmit}
                  >
                    <Text color="white" fontWeight="600" fontSize={15}>
                      {t('feed.orderForm.submit')}
                    </Text>
                  </Button>
                </XStack>
              )}
            </YStack>
          </YStack>
        </ScrollView>
      </YStack>

      {/* BuyPointsSheet overlay */}
      <BuyPointsSheet
        visible={buyPointsVisible}
        currentBalance={effectivePoints}
        suggestedAmount={shortfall}
        onClose={() => setBuyPointsVisible(false)}
        onComplete={handleBuyPointsComplete}
        t={t}
      />
    </>
  )
}
