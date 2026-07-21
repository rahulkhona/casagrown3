/**
 * PickupPassModal — High-contrast QR code pickup pass for buyers
 * Shown on the buyer's order page / orders screen to present to seller for pickup.
 */

import React, { useState } from 'react'
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui'
import { X, QrCode, ShieldCheck, Sun, CheckCircle2 } from '@tamagui/lucide-icons'
import { Modal, Platform, TouchableOpacity } from 'react-native'
import { colors, borderRadius, shadows } from '../../design-tokens'
import { getBaseAppUrl } from '../../utils/external-urls'
import { QRCodeDisplay } from '../feed/QRCodeDisplay'
import type { Order } from './order-types'

interface PickupPassModalProps {
  visible: boolean
  onClose: () => void
  order: Order | null
  buyerName?: string
}

export function PickupPassModal({
  visible,
  onClose,
  order,
  buyerName = 'Buyer',
}: PickupPassModalProps) {
  const [enlarged, setEnlarged] = useState(false)

  if (!order) return null

  const baseUrl = getBaseAppUrl()
  const passcode = order.buyer_passcode || 'PASS'
  const qrUrl = `${baseUrl}/orders/${order.id}/pickup?passcode=${passcode}`
  const shortId = `#ORD-${order.id.substring(0, 6).toUpperCase()}`

  const qrSize = enlarged ? 240 : 180

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
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
          maxWidth={420}
          backgroundColor={colors.white}
          borderRadius={borderRadius['2xl']}
          overflow="hidden"
          {...shadows.xl}
        >
          {/* ── Modal Header ── */}
          <XStack
            backgroundColor={colors.green[700]}
            paddingHorizontal="$4"
            paddingVertical="$3"
            justifyContent="space-between"
            alignItems="center"
          >
            <XStack alignItems="center" gap="$2">
              <QrCode color={colors.white} size={20} />
              <Text color={colors.white} fontWeight="700" fontSize={16}>
                Pickup Pass
              </Text>
            </XStack>
            <TouchableOpacity onPress={onClose} testID="close-pickup-pass">
              <X color={colors.white} size={22} />
            </TouchableOpacity>
          </XStack>

          <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
            {/* ── High Contrast QR Card ── */}
            <YStack
              backgroundColor={colors.green[50]}
              borderColor={colors.green[300]}
              borderWidth={2}
              borderRadius={borderRadius.xl}
              padding="$4"
              alignItems="center"
              width="100%"
              marginBottom="$4"
            >
              <Text
                fontSize={12}
                fontWeight="800"
                color={colors.green[800]}
                letterSpacing={1}
                marginBottom="$1"
              >
                CASAGROWN VERIFIED PICKUP PASS
              </Text>
              <Text fontSize={18} fontWeight="800" color={colors.gray[900]} marginBottom="$3">
                {shortId}
              </Text>

              {/* QR Code */}
              <YStack
                backgroundColor={colors.white}
                padding="$3"
                borderRadius={borderRadius.lg}
                borderWidth={1}
                borderColor={colors.gray[200]}
                alignItems="center"
                justifyContent="center"
                {...shadows.md}
              >
                <QRCodeDisplay value={qrUrl} size={qrSize} />
              </YStack>

              <TouchableOpacity
                onPress={() => setEnlarged(!enlarged)}
                style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Sun size={14} color={colors.green[700]} />
                <Text fontSize={12} fontWeight="600" color={colors.green[700]}>
                  {enlarged ? 'Standard View' : 'Tap to Enlarge for Scanning'}
                </Text>
              </TouchableOpacity>
            </YStack>

            {/* ── Order Detail Summary ── */}
            <YStack
              width="100%"
              backgroundColor={colors.gray[50]}
              borderRadius={borderRadius.lg}
              padding="$3"
              borderWidth={1}
              borderColor={colors.gray[200]}
              gap="$1.5"
              marginBottom="$4"
            >
              <XStack justifyContent="space-between">
                <Text fontSize={12} color={colors.gray[500]} fontWeight="500">
                  Buyer Name
                </Text>
                <Text fontSize={13} color={colors.gray[900]} fontWeight="700">
                  {buyerName}
                </Text>
              </XStack>

              <XStack justifyContent="space-between">
                <Text fontSize={12} color={colors.gray[500]} fontWeight="500">
                  Item
                </Text>
                <Text fontSize={13} color={colors.gray[900]} fontWeight="700" textAlign="right">
                  {order.product_name || 'Homegrown Produce'} (x{order.quantity || 1})
                </Text>
              </XStack>

              <XStack justifyContent="space-between">
                <Text fontSize={12} color={colors.gray[500]} fontWeight="500">
                  Status
                </Text>
                <XStack alignItems="center" gap={4}>
                  <CheckCircle2 size={13} color={colors.green[600]} />
                  <Text fontSize={12} color={colors.green[700]} fontWeight="700">
                    Paid & Ready for Pickup
                  </Text>
                </XStack>
              </XStack>
            </YStack>

            <Text fontSize={11} color={colors.gray[500]} textAlign="center" lineHeight={16}>
              Show this QR code to the seller or booth helper. They will scan it to identify your order and hand over your items.
            </Text>
          </ScrollView>

          {/* ── Modal Footer ── */}
          <YStack padding="$3" borderTopWidth={1} borderTopColor={colors.gray[200]} backgroundColor={colors.white}>
            <Button
              backgroundColor={colors.gray[100]}
              pressStyle={{ backgroundColor: colors.gray[200] }}
              onPress={onClose}
              borderRadius={borderRadius.md}
            >
              <Text fontWeight="600" color={colors.gray[800]}>
                Close Pass
              </Text>
            </Button>
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  )
}
