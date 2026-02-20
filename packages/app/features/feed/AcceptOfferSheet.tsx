/**
 * AcceptOfferSheet — Buyer confirms delivery details before accepting an offer.
 *
 * Mirrors OrderSheet: quantity, delivery address, latest drop-off date,
 * additional acceptable dates, instructions, points balance summary,
 * and BuyPointsSheet for insufficient balance.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Spinner } from 'tamagui'
import { Platform, TextInput, TouchableOpacity, Alert, Pressable } from 'react-native'
import {
  X,
  Check,
  MapPin,
  Navigation2,
  FileText,
  Calendar,
  ShoppingCart,
  Info,
  Plus,
  Trash2,
} from '@tamagui/lucide-icons'
import * as Location from 'expo-location'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { CalendarPicker } from '../create-post/CalendarPicker'
import { BuyPointsSheet } from './BuyPointsSheet'
import type { Offer } from '../offers/offer-types'

// =============================================================================
// Types
// =============================================================================

export interface AcceptOfferFormData {
  quantity: number
  address: string
  latestDate: string
  additionalDates: string[]
  instructions: string
  totalPrice: number
}

export interface AcceptOfferSheetProps {
  visible: boolean
  offer: Offer | null
  userPoints: number
  /** Buyer post's desired quantity — used to cap the pre-fill */
  buyPostQuantity?: number | null
  onClose: () => void
  onConfirm: (data: AcceptOfferFormData) => Promise<void>
  /** Called when balance changes (e.g., after buying points) */
  onBalanceChanged?: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

// =============================================================================
// Component
// =============================================================================

export function AcceptOfferSheet({
  visible,
  offer,
  userPoints,
  buyPostQuantity,
  onClose,
  onConfirm,
  onBalanceChanged,
  t,
}: AcceptOfferSheetProps) {
  // Form state
  const [quantity, setQuantity] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [latestDate, setLatestDate] = useState('')
  const [additionalDates, setAdditionalDates] = useState<string[]>([])
  const [instructions, setInstructions] = useState('')
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [buyPointsVisible, setBuyPointsVisible] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Additional dates calendar state
  const [addDateCalendarOpen, setAddDateCalendarOpen] = useState(false)
  const [editingDateIndex, setEditingDateIndex] = useState<number | null>(null)

  // Hidden date input ref for web
  const hiddenDateRef = useRef<HTMLInputElement>(null)

  // Pre-fill from offer when opening
  useEffect(() => {
    if (offer && visible) {
      // Pre-fill quantity: min(offer qty, buy post desired qty) so buyer doesn't over-buy
      const prefillQty = (buyPostQuantity != null && buyPostQuantity < offer.quantity)
        ? buyPostQuantity
        : offer.quantity
      setQuantity(String(prefillQty))
      // Pre-fill from delivery_dates array first, fall back to delivery_date
      const firstDate = (offer.delivery_dates && offer.delivery_dates.length > 0)
        ? offer.delivery_dates[0]
        : offer.delivery_date
      setLatestDate(firstDate ?? '')
      setDeliveryAddress('')
      setInstructions('')
      setAdditionalDates([])
      setValidationError(null)
    }
  }, [offer, visible, buyPostQuantity])

  // Derived values
  const pointsPerUnit = offer?.points_per_unit ?? 0
  const unit = offer?.unit ?? 'unit'
  const maxQuantity = offer?.quantity ?? null
  const numericQty = parseFloat(quantity) || 0
  const exceedsMax = maxQuantity !== null && numericQty > maxQuantity
  const totalPrice = useMemo(
    () => Math.round(numericQty * pointsPerUnit),
    [numericQty, pointsPerUnit],
  )
  const balanceAfter = userPoints - totalPrice
  const hasInsufficientPoints =
    numericQty > 0 && totalPrice > 0 && balanceAfter < 0
  const shortfall = hasInsufficientPoints ? Math.abs(balanceAfter) : 0
  const cannotSubmit = exceedsMax

  const todayString = useMemo(
    () => new Date().toISOString().split('T')[0]!,
    [],
  )

  const resetForm = useCallback(() => {
    setQuantity('')
    setDeliveryAddress('')
    setLatestDate('')
    setAdditionalDates([])
    setInstructions('')
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  const handleSubmit = useCallback(async () => {
    if (!quantity || !deliveryAddress.trim() || !latestDate) {
      setValidationError(t('offers.accept.requiredFields'))
      return
    }
    if (exceedsMax) {
      setValidationError('Cannot exceed offered quantity')
      return
    }
    if (hasInsufficientPoints) {
      setValidationError(t('offers.accept.insufficientAlert'))
      return
    }
    setValidationError(null)
    setSubmitting(true)
    try {
      await onConfirm({
        quantity: numericQty,
        address: deliveryAddress.trim(),
        latestDate,
        additionalDates,
        instructions: instructions.trim(),
        totalPrice,
      })
      resetForm()
      onClose()
    } catch (err) {
      console.error('AcceptOfferSheet submit error:', err)
      setValidationError((err as Error).message || t('offers.actions.error'))
    } finally {
      setSubmitting(false)
    }
  }, [
    quantity,
    deliveryAddress,
    latestDate,
    additionalDates,
    instructions,
    exceedsMax,
    hasInsufficientPoints,
    numericQty,
    totalPrice,
    onConfirm,
    onClose,
    resetForm,
    t,
  ])

  const handleUseMyLocation = useCallback(async () => {
    setLocating(true)
    try {
      if (Platform.OS === 'web') {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
          }),
        )
        const { latitude, longitude } = pos.coords
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        )
        const data = await res.json()
        if (data?.display_name) {
          setDeliveryAddress(data.display_name)
        }
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert(t('offers.form.locationDenied'))
          return
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        })
        if (geo) {
          const parts = [
            geo.streetNumber,
            geo.street,
            geo.city,
            geo.region,
            geo.postalCode,
          ].filter(Boolean)
          setDeliveryAddress(parts.join(', '))
        }
      }
    } catch {
      Alert.alert(t('offers.form.locationError'))
    } finally {
      setLocating(false)
    }
  }, [t])

  const handleBuyPointsComplete = useCallback(
    (pointsAmount: number) => {
      setBuyPointsVisible(false)
      // Notify parent to refresh balance from DB
      onBalanceChanged?.()
      // Auto-submit the offer — user just bought enough points to cover the deficit
      if (quantity && deliveryAddress.trim() && latestDate) {
        onConfirm({
          quantity: numericQty,
          address: deliveryAddress.trim(),
          latestDate,
          additionalDates,
          instructions: instructions.trim(),
          totalPrice,
        })
          .then(() => {
            resetForm()
            onClose()
          })
          .catch(() => {})
      }
    },
    [
      onBalanceChanged,
      quantity,
      deliveryAddress,
      latestDate,
      additionalDates,
      instructions,
      numericQty,
      totalPrice,
      onConfirm,
      onClose,
      resetForm,
    ],
  )

  // Additional dates helpers
  const handleAddDate = useCallback(() => {
    if (Platform.OS === 'web') {
      hiddenDateRef.current?.showPicker?.()
    } else {
      setAddDateCalendarOpen(true)
    }
  }, [])

  const removeAdditionalDate = useCallback((index: number) => {
    setAdditionalDates((prev) => prev.filter((_, i) => i !== index))
  }, [])

  if (!visible || !offer) return null

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
                  {t('offers.accept.title')}
                </Text>
                <Text fontSize={13} color={colors.gray[600]}>
                  {t('offers.accept.subtitle', {
                    quantity: offer.quantity,
                    unit: offer.unit || 'units',
                    product: offer.product,
                    total: offer.quantity * offer.points_per_unit,
                  })}
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
                {t('offers.accept.quantity')}{' '}
                <Text color="#ef4444">*</Text>
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
                      fontFamily:
                        Platform.OS === 'ios' ? 'Inter-Medium' : 'Inter',
                    }}
                    placeholder={String(offer.quantity)}
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
                  <Text
                    fontSize={14}
                    fontWeight="600"
                    color={colors.gray[700]}
                  >
                    {unit}
                  </Text>
                </YStack>
              </XStack>

              <YStack gap={2}>
                {pointsPerUnit > 0 && (
                  <Text fontSize={12} color={colors.gray[600]}>
                    {pointsPerUnit} pts/{unit}
                  </Text>
                )}
                {numericQty > 0 && pointsPerUnit > 0 && (
                  <Text fontSize={11} color={colors.gray[500]}>
                    Total: {totalPrice} pts
                  </Text>
                )}
                {exceedsMax && (
                  <Text fontSize={11} color="#ea580c" fontWeight="600">
                    Cannot exceed offered quantity of {maxQuantity} {unit}
                  </Text>
                )}
              </YStack>
              <Text fontSize={11} color={colors.gray[500]}>
                {t('offers.accept.quantityHint')}
              </Text>
            </YStack>

            {/* ─── Drop-off Address ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                {t('offers.form.deliveryAddress')}{' '}
                <Text color="#ef4444">*</Text>
              </Text>
              <XStack
                borderWidth={1}
                borderColor={colors.gray[300]}
                borderRadius={borderRadius.md}
                padding="$3"
                alignItems="flex-start"
                gap="$2"
              >
                <MapPin
                  size={16}
                  color={colors.gray[400]}
                  style={{ marginTop: 2 }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: colors.gray[900],
                    minHeight: 60,
                    textAlignVertical: 'top',
                    fontWeight: 'normal',
                    fontFamily:
                      Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                  }}
                  placeholder={t('offers.form.addressPlaceholder')}
                  placeholderTextColor={colors.gray[400]}
                  value={deliveryAddress}
                  onChangeText={setDeliveryAddress}
                  multiline
                  numberOfLines={3}
                />
              </XStack>
              {/* Use My Location */}
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
                  {t('offers.form.useMyLocation')}
                </Text>
              </TouchableOpacity>
            </YStack>

            {/* ─── Latest Drop-off Date ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                {t('offers.accept.latestDate')}{' '}
                <Text color="#ef4444">*</Text>
              </Text>
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
                    ? new Date(latestDate + 'T00:00:00').toLocaleDateString(
                        undefined,
                        {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        },
                      )
                    : t('offers.accept.selectDate')}
                </Text>
              </TouchableOpacity>

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
                {t('offers.accept.latestDateHint')}
              </Text>
            </YStack>

            {/* ─── Additional Acceptable Dates ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                {t('offers.accept.additionalDates')}
              </Text>
              <Text fontSize={11} color={colors.gray[500]}>
                {t('offers.accept.additionalDatesHint')}
              </Text>

              {additionalDates.map((date, index) => (
                <XStack key={index} alignItems="center" gap="$2">
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={date}
                      onChange={(e: any) => {
                        const newDates = [...additionalDates]
                        newDates[index] = e.target.value
                        setAdditionalDates(newDates)
                      }}
                      style={{
                        flex: 1,
                        height: 44,
                        borderRadius: 8,
                        border: `1px solid ${colors.gray[300]}`,
                        padding: '0 12px',
                        fontSize: 14,
                        fontFamily: 'inherit',
                        fontWeight: 400,
                        backgroundColor: 'white',
                        color: colors.gray[900],
                      }}
                    />
                  ) : (
                    <Pressable
                      style={{ flex: 1 }}
                      onPress={() => {
                        setEditingDateIndex(index)
                        setAddDateCalendarOpen(true)
                      }}
                    >
                      <XStack
                        flex={1}
                        height={44}
                        alignItems="center"
                        paddingHorizontal="$3"
                        borderWidth={1}
                        borderColor={colors.gray[300]}
                        borderRadius={8}
                        backgroundColor="white"
                      >
                        <Text
                          flex={1}
                          fontSize={14}
                          color={
                            date ? colors.gray[900] : colors.gray[400]
                          }
                          fontWeight="400"
                        >
                          {date || t('offers.accept.selectDate')}
                        </Text>
                        <Calendar size={16} color={colors.gray[400]} />
                      </XStack>
                    </Pressable>
                  )}
                  <Button
                    unstyled
                    padding="$2"
                    onPress={() => removeAdditionalDate(index)}
                  >
                    <Trash2 size={20} color="#ef4444" />
                  </Button>
                </XStack>
              ))}

              <Button
                size="$3"
                backgroundColor={colors.green[50]}
                borderWidth={1}
                borderColor={colors.green[200]}
                icon={<Plus size={18} color={colors.green[600]} />}
                onPress={handleAddDate}
              >
                <Text color={colors.green[600]} fontWeight="600">
                  {t('offers.accept.addDate')}
                </Text>
              </Button>

              {/* Hidden date input for web */}
              {Platform.OS === 'web' && (
                <input
                  ref={hiddenDateRef as any}
                  type="date"
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    pointerEvents: 'none',
                    width: 0,
                    height: 0,
                  }}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    if (e.target.value) {
                      setAdditionalDates((prev) => [
                        ...prev,
                        e.target.value,
                      ])
                      e.target.value = ''
                    }
                  }}
                />
              )}

              {/* Calendar Picker for additional dates (native) */}
              {Platform.OS !== 'web' && addDateCalendarOpen && (
                <CalendarPicker
                  visible={addDateCalendarOpen}
                  initialDate={
                    editingDateIndex !== null
                      ? additionalDates[editingDateIndex] || undefined
                      : undefined
                  }
                  minimumDate={new Date()}
                  onSelect={(dateStr) => {
                    if (editingDateIndex !== null) {
                      const newDates = [...additionalDates]
                      newDates[editingDateIndex] = dateStr
                      setAdditionalDates(newDates)
                    } else {
                      setAdditionalDates((prev) => [...prev, dateStr])
                    }
                    setAddDateCalendarOpen(false)
                    setEditingDateIndex(null)
                  }}
                  onCancel={() => {
                    setAddDateCalendarOpen(false)
                    setEditingDateIndex(null)
                  }}
                />
              )}
            </YStack>

            {/* ─── Drop-off Instructions ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                {t('offers.accept.instructions')}
              </Text>
              <XStack
                borderWidth={1}
                borderColor={colors.gray[300]}
                borderRadius={borderRadius.md}
                padding="$3"
                alignItems="flex-start"
                gap="$2"
              >
                <FileText
                  size={16}
                  color={colors.gray[400]}
                  style={{ marginTop: 2 }}
                />
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: colors.gray[900],
                    minHeight: 60,
                    textAlignVertical: 'top',
                    fontWeight: 'normal',
                    fontFamily:
                      Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                  }}
                  placeholder={t('offers.accept.instructionsPlaceholder')}
                  placeholderTextColor={colors.gray[400]}
                  value={instructions}
                  onChangeText={setInstructions}
                  multiline
                  numberOfLines={3}
                />
              </XStack>
              <Text fontSize={11} color={colors.gray[500]}>
                {t('offers.accept.instructionsHint')}
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
                {t('offers.accept.geotagNote')}
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
                  {t('offers.accept.currentBalance')}
                </Text>
                <Text
                  fontSize={14}
                  fontWeight="600"
                  color={colors.gray[900]}
                >
                  {userPoints} pts
                </Text>
              </XStack>

              {numericQty > 0 && totalPrice > 0 && (
                <>
                  <XStack
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Text fontSize={13} color={colors.gray[700]}>
                      {t('offers.accept.offerTotal')}
                    </Text>
                    <Text
                      fontSize={14}
                      fontWeight="600"
                      color={colors.gray[900]}
                    >
                      {totalPrice} pts
                    </Text>
                  </XStack>
                  <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    paddingTop="$2"
                    borderTopWidth={1}
                    borderTopColor={colors.gray[300]}
                  >
                    <Text
                      fontSize={13}
                      fontWeight="600"
                      color={colors.gray[900]}
                    >
                      {t('offers.accept.balanceAfter')}
                    </Text>
                    <Text
                      fontSize={18}
                      fontWeight="700"
                      color={
                        balanceAfter >= 0 ? colors.green[600] : '#ef4444'
                      }
                    >
                      {balanceAfter} pts
                    </Text>
                  </XStack>
                </>
              )}
            </YStack>

            {/* ─── Validation Error ─── */}
            {validationError && (
              <Text
                fontSize={13}
                fontWeight="600"
                color="#ef4444"
                textAlign="center"
                paddingVertical="$1"
              >
                {validationError}
              </Text>
            )}

            {/* ─── Action Buttons ─── */}
            <YStack gap="$3">
              {hasInsufficientPoints ? (
                <YStack gap="$2">
                  <Button
                    backgroundColor={
                      cannotSubmit ? colors.gray[300] : '#f59e0b'
                    }
                    paddingVertical="$2.5"
                    borderRadius={borderRadius.md}
                    pressStyle={
                      cannotSubmit
                        ? undefined
                        : { backgroundColor: '#d97706' }
                    }
                    disabled={cannotSubmit}
                    onPress={() => setBuyPointsVisible(true)}
                  >
                    <Text color="white" fontWeight="600" fontSize={15}>
                      {t('offers.accept.buyPointsAndAccept')}
                    </Text>
                  </Button>
                  <Button
                    backgroundColor={colors.gray[100]}
                    paddingVertical="$2.5"
                    borderRadius={borderRadius.md}
                    pressStyle={{ backgroundColor: colors.gray[200] }}
                    onPress={handleClose}
                  >
                    <Text
                      color={colors.gray[700]}
                      fontWeight="600"
                      fontSize={15}
                    >
                      {t('offers.actions.cancel')}
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
                    <Text
                      color={colors.gray[700]}
                      fontWeight="600"
                      fontSize={15}
                    >
                      {t('offers.actions.cancel')}
                    </Text>
                  </Button>
                  <Button
                    flex={1}
                    backgroundColor={
                      cannotSubmit || submitting
                        ? colors.gray[300]
                        : colors.green[600]
                    }
                    paddingVertical="$2.5"
                    borderRadius={borderRadius.md}
                    pressStyle={
                      cannotSubmit || submitting
                        ? undefined
                        : { backgroundColor: colors.green[700] }
                    }
                    disabled={cannotSubmit || submitting}
                    onPress={handleSubmit}
                    icon={
                      submitting ? (
                        <Spinner size="small" color="white" />
                      ) : (
                        <Check size={18} color="white" />
                      )
                    }
                  >
                    <Text color="white" fontWeight="600" fontSize={15}>
                      {t('offers.actions.accept')}
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
        currentBalance={userPoints}
        suggestedAmount={shortfall}
        onClose={() => setBuyPointsVisible(false)}
        onComplete={handleBuyPointsComplete}
        t={t}
      />
    </>
  )
}
