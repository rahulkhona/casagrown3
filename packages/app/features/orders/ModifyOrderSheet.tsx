/**
 * ModifyOrderSheet – Full order-modification form
 *
 * Replaces the simple text-input modal. Pre-fills from the existing order
 * and supports:
 *  - Quantity editing with live total calculation
 *  - CalendarPicker for delivery date
 *  - Delivery address with "Use My Location"
 *  - Delivery instructions
 *  - Points balance summary (accounts for escrow refund from old total)
 *  - BuyPointsSheet when the modification increases cost beyond balance
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Spinner } from 'tamagui'
import { Platform, TextInput, TouchableOpacity, Alert } from 'react-native'
import {
  X,
  ShoppingCart,
  MapPin,
  Calendar,
  FileText,
  Navigation2,
  Edit3,
} from '@tamagui/lucide-icons'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { BuyPointsSheet } from '../feed/BuyPointsSheet'
import { CalendarPicker } from '../create-post/CalendarPicker'
import type { Order } from './order-types'
import * as Location from 'expo-location'

// =============================================================================
// Types
// =============================================================================

export interface ModifyOrderFormData {
  quantity: number
  deliveryDate: string
  deliveryAddress: string
  deliveryInstructions: string
  totalPrice: number
}

export interface ModifyOrderSheetProps {
  visible: boolean
  order: Order | null
  userPoints: number
  onClose: () => void
  onSubmit: (data: ModifyOrderFormData) => void
  /** Called when balance changes (e.g. after buying points) */
  onBalanceChanged?: () => void
  t: (key: string, opts?: Record<string, any>) => string
}

// =============================================================================
// Component
// =============================================================================

export function ModifyOrderSheet({
  visible,
  order,
  userPoints,
  onClose,
  onSubmit,
  onBalanceChanged,
  t,
}: ModifyOrderSheetProps) {
  // Form state — initialised from order
  const [quantity, setQuantity] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [address, setAddress] = useState('')
  const [instructions, setInstructions] = useState('')
  const [buyPointsVisible, setBuyPointsVisible] = useState(false)
  const [locating, setLocating] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [effectivePoints, setEffectivePoints] = useState(userPoints)

  // Pre-fill when order changes or sheet opens
  useEffect(() => {
    if (visible && order) {
      setQuantity(String(order.quantity))
      setDeliveryDate(order.delivery_date ?? '')
      setAddress(order.delivery_address ?? '')
      setInstructions(order.delivery_instructions ?? '')
      setEffectivePoints(userPoints)
    }
  }, [visible, order, userPoints])

  // Derived values
  const pointsPerUnit = order?.points_per_unit ?? 0
  const product = order?.product ?? 'items'
  const numericQty = parseFloat(quantity) || 0
  const newTotal = useMemo(() => Math.round(numericQty * pointsPerUnit), [numericQty, pointsPerUnit])
  const oldTotal = order ? order.quantity * order.points_per_unit : 0
  const additionalCost = Math.max(0, newTotal - oldTotal) // Only pay the difference
  const refundAmount = Math.max(0, oldTotal - newTotal)
  const balanceAfterModify = effectivePoints - additionalCost + refundAmount
  // But what the user really cares about: "balance after" = current balance - additional cost
  // If qty decreases, they get a refund, so balance goes up
  const balanceAfter = effectivePoints + (oldTotal - newTotal)
  const hasInsufficientPoints = numericQty > 0 && additionalCost > effectivePoints
  const shortfall = hasInsufficientPoints ? additionalCost - effectivePoints : 0

  const hasChanges = useMemo(() => {
    if (!order) return false
    return (
      numericQty !== order.quantity ||
      deliveryDate !== (order.delivery_date ?? '') ||
      address !== (order.delivery_address ?? '') ||
      instructions !== (order.delivery_instructions ?? '')
    )
  }, [numericQty, deliveryDate, address, instructions, order])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleSubmit = useCallback(() => {
    if (!numericQty || numericQty <= 0) {
      const msg = 'Please enter a valid quantity'
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Invalid', msg)
      return
    }
    if (!address.trim()) {
      const msg = 'Please enter a delivery address'
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Required', msg)
      return
    }
    if (!deliveryDate) {
      const msg = 'Please select a delivery date'
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Required', msg)
      return
    }
    if (hasInsufficientPoints) {
      const msg = 'Insufficient points — buy more to proceed'
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Insufficient Points', msg)
      return
    }
    if (!hasChanges) {
      const msg = 'No changes to apply'
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('No Changes', msg)
      return
    }
    onSubmit({
      quantity: numericQty,
      deliveryDate,
      deliveryAddress: address.trim(),
      deliveryInstructions: instructions.trim(),
      totalPrice: newTotal,
    })
  }, [numericQty, address, deliveryDate, instructions, hasInsufficientPoints, hasChanges, newTotal, onSubmit])

  const handleUseMyLocation = useCallback(async () => {
    setLocating(true)
    try {
      if (Platform.OS === 'web') {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
        )
        const { latitude, longitude } = pos.coords
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
        )
        const data = await res.json()
        if (data?.display_name) setAddress(data.display_name)
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Location access denied')
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
      const msg = 'Could not get location'
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Location Error', msg)
    } finally {
      setLocating(false)
    }
  }, [])

  const handleBuyPointsComplete = useCallback((pointsAmount: number) => {
    setBuyPointsVisible(false)
    setEffectivePoints(prev => prev + pointsAmount)
    onBalanceChanged?.()
  }, [onBalanceChanged])

  if (!visible || !order) return null

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
                <XStack alignItems="center" gap="$2">
                  <Edit3 size={20} color={colors.amber[600]} />
                  <Text fontSize={20} fontWeight="700" color={colors.gray[900]}>
                    Modify Order
                  </Text>
                </XStack>
                <Text fontSize={13} color={colors.gray[600]}>
                  Update your order for {product}
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
                Quantity <Text color="#ef4444">*</Text>
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
                    }}
                    placeholder="Enter quantity"
                    placeholderTextColor={colors.gray[400]}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="decimal-pad"
                  />
                </XStack>
                {/* Unit badge */}
                <YStack
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  backgroundColor={colors.gray[100]}
                  borderWidth={1}
                  borderColor={colors.gray[300]}
                  borderRadius={borderRadius.md}
                >
                  <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                    units
                  </Text>
                </YStack>
              </XStack>

              {/* Price calculations */}
              <YStack gap={2}>
                {pointsPerUnit > 0 && (
                  <Text fontSize={12} color={colors.gray[600]}>
                    Price per unit: {pointsPerUnit} pts
                  </Text>
                )}
                {numericQty > 0 && pointsPerUnit > 0 && (
                  <Text fontSize={12} color={colors.gray[500]}>
                    New total: {newTotal} pts
                    {newTotal !== oldTotal && (
                      <Text color={newTotal > oldTotal ? '#ea580c' : colors.green[600]}>
                        {' '}({newTotal > oldTotal ? '+' : ''}{newTotal - oldTotal} pts vs current)
                      </Text>
                    )}
                  </Text>
                )}
              </YStack>
            </YStack>

            {/* ─── Delivery Address ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                Delivery Address <Text color="#ef4444">*</Text>
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
                  }}
                  placeholder="Enter delivery address"
                  placeholderTextColor={colors.gray[400]}
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  numberOfLines={3}
                />
              </XStack>
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
                  Use my location
                </Text>
              </TouchableOpacity>
            </YStack>

            {/* ─── Delivery Date ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                Delivery Date <Text color="#ef4444">*</Text>
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
                  color={deliveryDate ? colors.gray[900] : colors.gray[400]}
                >
                  {deliveryDate
                    ? new Date(deliveryDate + 'T00:00:00').toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'Select a date'}
                </Text>
              </TouchableOpacity>
              <CalendarPicker
                visible={calendarOpen}
                initialDate={deliveryDate || undefined}
                minimumDate={new Date()}
                onSelect={(dateStr) => {
                  setDeliveryDate(dateStr)
                  setCalendarOpen(false)
                }}
                onCancel={() => setCalendarOpen(false)}
              />
            </YStack>

            {/* ─── Delivery Instructions ─── */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                Delivery Instructions
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
                  }}
                  placeholder="E.g. leave at front door, ring doorbell..."
                  placeholderTextColor={colors.gray[400]}
                  value={instructions}
                  onChangeText={setInstructions}
                  multiline
                  numberOfLines={3}
                />
              </XStack>
            </YStack>

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
                  Current balance
                </Text>
                <Text fontSize={14} fontWeight="600" color={colors.gray[900]}>
                  {effectivePoints} pts
                </Text>
              </XStack>

              <XStack justifyContent="space-between" alignItems="center">
                <Text fontSize={13} color={colors.gray[700]}>
                  Current escrow
                </Text>
                <Text fontSize={14} fontWeight="600" color={colors.gray[500]}>
                  {oldTotal} pts
                </Text>
              </XStack>

              {numericQty > 0 && newTotal > 0 && (
                <>
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text fontSize={13} color={colors.gray[700]}>
                      New order total
                    </Text>
                    <Text fontSize={14} fontWeight="600" color={colors.gray[900]}>
                      {newTotal} pts
                    </Text>
                  </XStack>

                  {newTotal !== oldTotal && (
                    <XStack justifyContent="space-between" alignItems="center">
                      <Text fontSize={13} color={colors.gray[700]}>
                        {newTotal > oldTotal ? 'Additional cost' : 'Refund'}
                      </Text>
                      <Text
                        fontSize={14}
                        fontWeight="600"
                        color={newTotal > oldTotal ? '#ea580c' : colors.green[600]}
                      >
                        {newTotal > oldTotal ? `-${additionalCost}` : `+${refundAmount}`} pts
                      </Text>
                    </XStack>
                  )}

                  <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    paddingTop="$2"
                    borderTopWidth={1}
                    borderTopColor={colors.gray[300]}
                  >
                    <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>
                      Balance after
                    </Text>
                    <Text
                      fontSize={18}
                      fontWeight="700"
                      color={balanceAfter >= 0 ? colors.green[600] : '#ef4444'}
                    >
                      {balanceAfter} pts
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
                    backgroundColor="#f59e0b"
                    paddingVertical="$2.5"
                    borderRadius={borderRadius.md}
                    pressStyle={{ backgroundColor: '#d97706' }}
                    onPress={() => setBuyPointsVisible(true)}
                  >
                    <Text color="white" fontWeight="600" fontSize={15}>
                      Buy Points & Update Order
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
                      Cancel
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
                      Cancel
                    </Text>
                  </Button>
                  <Button
                    flex={1}
                    backgroundColor={!hasChanges ? colors.gray[300] : colors.amber[600]}
                    paddingVertical="$2.5"
                    borderRadius={borderRadius.md}
                    pressStyle={!hasChanges ? undefined : { backgroundColor: colors.amber[700] }}
                    disabled={!hasChanges}
                    onPress={handleSubmit}
                  >
                    <Text color="white" fontWeight="600" fontSize={15}>
                      Update Order
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
