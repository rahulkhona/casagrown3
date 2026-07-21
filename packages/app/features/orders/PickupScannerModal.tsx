/**
 * PickupScannerModal — Seller/Booth Helper QR scanner modal
 * Used by sellers or booth helpers to scan a buyer's pickup pass QR code.
 *
 * CRITICAL SCOPE CONTROL:
 * 1. Scanning/decoding QR code ONLY identifies the order (displays Order Identification Card).
 * 2. Status transition to 'completed' occurs ONLY when the seller explicitly taps "Confirm Pickup & Hand-Off".
 */

import React, { useState } from 'react'
import { YStack, XStack, Text, Button, Input, Spinner } from 'tamagui'
import {
  X,
  Camera,
  Search,
  PackageCheck,
  CheckCircle,
  AlertCircle,
  ShoppingBag,
  User,
  Check,
} from '@tamagui/lucide-icons'
import { Modal, TouchableOpacity, Alert } from 'react-native'
import { colors, borderRadius, shadows } from '../../design-tokens'
import type { Order } from './order-types'

interface PickupScannerModalProps {
  visible: boolean
  onClose: () => void
  orders: Order[]
  onConfirmHandOff: (orderId: string) => Promise<void>
}

export function PickupScannerModal({
  visible,
  onClose,
  orders,
  onConfirmHandOff,
}: PickupScannerModalProps) {
  const [manualCode, setManualCode] = useState('')
  const [identifiedOrder, setIdentifiedOrder] = useState<Order | null>(null)
  const [searching, setSearching] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [handOffCompleted, setHandOffCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetScanner = () => {
    setManualCode('')
    setIdentifiedOrder(null)
    setError(null)
    setHandOffCompleted(false)
  }

  const handleClose = () => {
    resetScanner()
    onClose()
  }

  // Parse QR string or manual passcode/order ID input
  const processQrInput = (input: string) => {
    if (!input.trim()) return

    setSearching(true)
    setError(null)
    setIdentifiedOrder(null)
    setHandOffCompleted(false)

    const trimmed = input.trim()

    // Match order by order ID substring, full ID, or passcode
    const found = orders.find((o) => {
      if (o.id === trimmed) return true
      if (trimmed.includes(o.id)) return true
      if (o.buyer_passcode && trimmed.toLowerCase().includes(o.buyer_passcode.toLowerCase())) return true
      const shortId = o.id.substring(0, 6).toUpperCase()
      if (trimmed.toUpperCase().includes(shortId)) return true
      return false
    })

    setSearching(false)

    if (found) {
      setIdentifiedOrder(found)
    } else {
      setError('Order not found. Please verify the QR code or active seller orders list.')
    }
  }

  const handleExplicitConfirm = async () => {
    if (!identifiedOrder) return
    setConfirming(true)
    try {
      await onConfirmHandOff(identifiedOrder.id)
      setHandOffCompleted(true)
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to mark order completed')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <YStack
        flex={1}
        backgroundColor="rgba(0,0,0,0.6)"
        justifyContent="center"
        alignItems="center"
        padding="$4"
      >
        <YStack
          width="100%"
          maxWidth={440}
          backgroundColor={colors.white}
          borderRadius={borderRadius['2xl']}
          overflow="hidden"
          {...shadows.xl}
        >
          {/* ── Header ── */}
          <XStack
            backgroundColor={colors.green[700]}
            paddingHorizontal="$4"
            paddingVertical="$3"
            justifyContent="space-between"
            alignItems="center"
          >
            <XStack alignItems="center" gap="$2">
              <Camera color={colors.white} size={20} />
              <Text color={colors.white} fontWeight="700" fontSize={16}>
                Scan Buyer Pickup Pass
              </Text>
            </XStack>
            <TouchableOpacity onPress={handleClose} testID="close-pickup-scanner">
              <X color={colors.white} size={22} />
            </TouchableOpacity>
          </XStack>

          <YStack padding="$4" gap="$3">
            {/* ── QR Scanner / Input Control ── */}
            <YStack
              backgroundColor={colors.green[50]}
              borderWidth={1}
              borderColor={colors.green[200]}
              borderRadius={borderRadius.xl}
              padding="$3"
              gap="$2"
            >
              <Text fontSize={12} fontWeight="700" color={colors.green[800]}>
                Scan Camera QR Link or Enter Order Passcode
              </Text>
              <XStack gap="$2" alignItems="center">
                <Input
                  flex={1}
                  placeholder="Paste QR payload or ORD-XXXX..."
                  value={manualCode}
                  onChangeText={setManualCode}
                  backgroundColor={colors.white}
                  borderColor={colors.gray[300]}
                  borderRadius={borderRadius.md}
                  height={40}
                  fontSize={13}
                  testID="qr-scanner-input"
                />
                <Button
                  backgroundColor={colors.green[600]}
                  pressStyle={{ backgroundColor: colors.green[700] }}
                  height={40}
                  onPress={() => processQrInput(manualCode)}
                  testID="scan-lookup-btn"
                >
                  {searching ? (
                    <Spinner color={colors.white} size="small" />
                  ) : (
                    <Search color={colors.white} size={16} />
                  )}
                </Button>
              </XStack>
            </YStack>

            {/* Error Message */}
            {error && (
              <XStack
                backgroundColor={colors.red[50]}
                borderColor={colors.red[200]}
                borderWidth={1}
                borderRadius={borderRadius.md}
                padding="$3"
                alignItems="center"
                gap="$2"
              >
                <AlertCircle size={16} color={colors.red[600]} />
                <Text fontSize={12} color={colors.red[700]} flex={1}>
                  {error}
                </Text>
              </XStack>
            )}

            {/* ── PHASE 1: ORDER IDENTIFIED CARD ── */}
            {identifiedOrder && !handOffCompleted && (
              <YStack
                backgroundColor={colors.white}
                borderColor={colors.green[300]}
                borderWidth={2}
                borderRadius={borderRadius.xl}
                padding="$4"
                gap="$3"
                {...shadows.md}
              >
                <XStack
                  backgroundColor={colors.green[100]}
                  paddingHorizontal="$3"
                  paddingVertical="$1.5"
                  borderRadius={borderRadius.full}
                  alignSelf="flex-start"
                  alignItems="center"
                  gap="$1.5"
                >
                  <PackageCheck size={14} color={colors.green[800]} />
                  <Text fontSize={11} fontWeight="800" color={colors.green[800]}>
                    ORDER IDENTIFIED
                  </Text>
                </XStack>

                <YStack gap="$1">
                  <Text fontSize={16} fontWeight="800" color={colors.gray[900]}>
                    Order #{identifiedOrder.id.substring(0, 6).toUpperCase()}
                  </Text>
                  <XStack alignItems="center" gap="$1.5">
                    <User size={14} color={colors.gray[500]} />
                    <Text fontSize={13} fontWeight="600" color={colors.gray[700]}>
                      Buyer: {identifiedOrder.buyer_id}
                    </Text>
                  </XStack>
                  <XStack alignItems="center" gap="$1.5">
                    <ShoppingBag size={14} color={colors.gray[500]} />
                    <Text fontSize={13} fontWeight="600" color={colors.gray[700]}>
                      Item: {identifiedOrder.product_name || 'Produce Item'} (x{identifiedOrder.quantity || 1})
                    </Text>
                  </XStack>
                </YStack>

                <YStack
                  backgroundColor={colors.amber[50]}
                  borderColor={colors.amber[200]}
                  borderWidth={1}
                  borderRadius={borderRadius.md}
                  padding="$2.5"
                >
                  <Text fontSize={11} color={colors.amber[700]} fontWeight="600">
                    Step 1 Complete: Pack produce items. Status is currently unmutated until physical hand-off.
                  </Text>
                </YStack>

                {/* ── PHASE 2: EXPLICIT CONFIRM HAND-OFF BUTTON ── */}
                <Button
                  backgroundColor={colors.green[600]}
                  pressStyle={{ backgroundColor: colors.green[700] }}
                  borderRadius={borderRadius.lg}
                  height={46}
                  onPress={handleExplicitConfirm}
                  disabled={confirming}
                  testID="confirm-pickup-btn"
                >
                  {confirming ? (
                    <Spinner color={colors.white} />
                  ) : (
                    <XStack alignItems="center" gap="$2">
                      <Check color={colors.white} size={18} />
                      <Text color={colors.white} fontWeight="700" fontSize={14}>
                        Confirm Pickup & Hand-Off
                      </Text>
                    </XStack>
                  )}
                </Button>
              </YStack>
            )}

            {/* ── COMPLETED SUCCESS STATE ── */}
            {handOffCompleted && (
              <YStack
                backgroundColor={colors.green[50]}
                borderColor={colors.green[400]}
                borderWidth={2}
                borderRadius={borderRadius.xl}
                padding="$4"
                alignItems="center"
                gap="$2"
              >
                <CheckCircle size={40} color={colors.green[600]} />
                <Text fontSize={16} fontWeight="800" color={colors.green[900]}>
                  Pickup Hand-Off Confirmed!
                </Text>
                <Text fontSize={12} color={colors.green[700]} textAlign="center">
                  Order status updated to completed. Points have been transferred.
                </Text>
                <Button
                  marginTop="$2"
                  backgroundColor={colors.green[600]}
                  pressStyle={{ backgroundColor: colors.green[700] }}
                  onPress={resetScanner}
                  borderRadius={borderRadius.md}
                >
                  <Text color={colors.white} fontWeight="600" fontSize={13}>
                    Scan Next Order Pass
                  </Text>
                </Button>
              </YStack>
            )}
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  )
}
