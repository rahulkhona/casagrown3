/**
 * RefundOfferSheet — Seller proposes a refund during dispute
 *
 * Displays a numeric input for the refund amount and optional message.
 */

import React, { useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Platform, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { X, DollarSign } from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'

// =============================================================================
// Props
// =============================================================================

interface RefundOfferSheetProps {
  visible: boolean
  orderId: string
  totalPrice: number
  onClose: () => void
  onSubmit: (data: { amount: number; message: string }) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

// =============================================================================
// Component
// =============================================================================

export function RefundOfferSheet({
  visible,
  orderId,
  totalPrice,
  onClose,
  onSubmit,
  t,
}: RefundOfferSheetProps) {
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const numericAmount = parseInt(amount, 10) || 0
  const exceedsTotal = numericAmount > totalPrice
  const isValid = numericAmount > 0 && !exceedsTotal

  const reset = useCallback(() => {
    setAmount('')
    setMessage('')
  }, [])

  const handleSubmit = useCallback(() => {
    if (!isValid) return
    setLoading(true)
    onSubmit({
      amount: numericAmount,
      message: message.trim(),
    })
    reset()
    onClose()
    setLoading(false)
  }, [isValid, numericAmount, message, onSubmit, onClose, reset])

  if (!visible) return null

  return (
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
        style={{ width: '100%', maxWidth: 420, maxHeight: '85%' }}
        contentContainerStyle={{ flexGrow: 0 }}
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
          {/* Header */}
          <XStack justifyContent="space-between" alignItems="center">
            <XStack alignItems="center" gap="$2">
              <DollarSign size={20} color={colors.amber[700]} />
              <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
                {t('orders.refund.title')}
              </Text>
            </XStack>
            <TouchableOpacity
              onPress={() => {
                reset()
                onClose()
              }}
              style={{
                padding: 8,
                borderRadius: 20,
                backgroundColor: colors.gray[100],
              }}
              activeOpacity={0.7}
            >
              <X size={18} color={colors.gray[600]} />
            </TouchableOpacity>
          </XStack>

          {/* Order total context */}
          <XStack
            backgroundColor={colors.gray[50]}
            borderRadius={borderRadius.md}
            padding="$3"
            justifyContent="space-between"
            alignItems="center"
          >
            <Text fontSize={13} color={colors.gray[700]}>
              {t('orders.refund.orderTotal')}
            </Text>
            <Text fontSize={15} fontWeight="700" color={colors.gray[900]}>
              {totalPrice} {t('orders.points')}
            </Text>
          </XStack>

          {/* Amount */}
          <YStack gap="$2">
            <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
              {t('orders.refund.amount')} <Text color="#ef4444">*</Text>
            </Text>
            <XStack
              borderWidth={1}
              borderColor={
                exceedsTotal ? colors.red[400] : colors.gray[300]
              }
              borderRadius={borderRadius.md}
              alignItems="center"
              paddingHorizontal="$3"
            >
              <DollarSign size={16} color={colors.gray[400]} />
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 18,
                  paddingVertical: 12,
                  paddingHorizontal: 8,
                  fontWeight: '600',
                  color: colors.gray[900],
                  fontFamily:
                    Platform.OS === 'ios' ? 'Inter-SemiBold' : 'Inter',
                }}
                placeholder="0"
                placeholderTextColor={colors.gray[400]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
              <Text fontSize={14} color={colors.gray[500]}>
                {t('orders.points')}
              </Text>
            </XStack>
            {exceedsTotal && (
              <Text fontSize={12} color={colors.red[600]} fontWeight="600">
                {t('orders.refund.exceedsTotal')}
              </Text>
            )}

            {/* Quick amount buttons */}
            <XStack gap="$2" flexWrap="wrap">
              {[25, 50, 75, 100].map((pct) => {
                const val = Math.round((totalPrice * pct) / 100)
                return (
                  <TouchableOpacity
                    key={pct}
                    onPress={() => setAmount(String(val))}
                    activeOpacity={0.7}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor:
                        numericAmount === val
                          ? colors.amber[100]
                          : colors.gray[100],
                      borderWidth: 1,
                      borderColor:
                        numericAmount === val
                          ? colors.amber[300]
                          : colors.gray[200],
                    }}
                  >
                    <Text
                      fontSize={12}
                      fontWeight="600"
                      color={
                        numericAmount === val
                          ? colors.amber[700]
                          : colors.gray[600]
                      }
                    >
                      {pct}% ({val} pts)
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </XStack>
          </YStack>

          {/* Message */}
          <YStack gap="$2">
            <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
              {t('orders.refund.message')}
            </Text>
            <XStack
              borderWidth={1}
              borderColor={colors.gray[300]}
              borderRadius={borderRadius.md}
              padding="$3"
            >
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: colors.gray[900],
                  minHeight: 60,
                  textAlignVertical: 'top',
                  fontFamily:
                    Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                }}
                placeholder={t('orders.refund.messagePlaceholder')}
                placeholderTextColor={colors.gray[400]}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={3}
              />
            </XStack>
          </YStack>

          {/* Actions */}
          <XStack gap="$3">
            <Button
              flex={1}
              backgroundColor={colors.gray[100]}
              paddingVertical="$2.5"
              borderRadius={borderRadius.md}
              pressStyle={{ backgroundColor: colors.gray[200] }}
              onPress={() => {
                reset()
                onClose()
              }}
            >
              <Text color={colors.gray[700]} fontWeight="600" fontSize={15}>
                {t('common.cancel')}
              </Text>
            </Button>
            <Button
              flex={1}
              backgroundColor={
                isValid ? colors.amber[600] : colors.gray[300]
              }
              paddingVertical="$2.5"
              borderRadius={borderRadius.md}
              pressStyle={
                isValid
                  ? { backgroundColor: colors.amber[700] }
                  : undefined
              }
              disabled={!isValid || loading}
              onPress={handleSubmit}
            >
              {loading ? (
                <Spinner size="small" color="white" />
              ) : (
                <Text color="white" fontWeight="600" fontSize={15}>
                  {t('orders.refund.send')}
                </Text>
              )}
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
