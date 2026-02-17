/**
 * RatingSheet — Post-transaction rating modal
 *
 * 1-5 star rating with optional feedback text.
 * Triggered after an order is completed.
 */

import React, { useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Platform, TextInput, TouchableOpacity, ScrollView } from 'react-native'
import { X, Star } from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'
import type { RatingScore } from './order-types'

// =============================================================================
// Props
// =============================================================================

interface RatingSheetProps {
  visible: boolean
  orderId: string
  otherUserName: string
  onClose: () => void
  onSubmit: (data: { score: RatingScore; feedback: string }) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

// =============================================================================
// Component
// =============================================================================

export function RatingSheet({
  visible,
  orderId,
  otherUserName,
  onClose,
  onSubmit,
  t,
}: RatingSheetProps) {
  const [score, setScore] = useState<RatingScore | 0>(0)
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)

  const labels = [
    '',
    t('orders.rating.terrible'),
    t('orders.rating.poor'),
    t('orders.rating.okay'),
    t('orders.rating.good'),
    t('orders.rating.excellent'),
  ]

  const reset = useCallback(() => {
    setScore(0)
    setFeedback('')
  }, [])

  const handleSubmit = useCallback(() => {
    if (score === 0) return
    setLoading(true)
    onSubmit({
      score: score as RatingScore,
      feedback: feedback.trim(),
    })
    reset()
    onClose()
    setLoading(false)
  }, [score, feedback, onSubmit, onClose, reset])

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
        style={{ width: '100%', maxWidth: 400, maxHeight: '85%' }}
        contentContainerStyle={{ flexGrow: 0 }}
        bounces={false}
      >
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.lg}
          padding="$5"
          width="100%"
          gap="$4"
          alignItems="center"
          shadowColor={shadows.sm.color}
          shadowOffset={shadows.sm.offset}
          shadowOpacity={0.1}
          shadowRadius={shadows.sm.radius}
        >
          {/* Close */}
          <XStack alignSelf="flex-end">
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

          {/* Title */}
          <YStack alignItems="center" gap="$1">
            <Text fontSize={20} fontWeight="700" color={colors.gray[900]}>
              {t('orders.rating.title')}
            </Text>
            <Text fontSize={14} color={colors.gray[600]} textAlign="center">
              {t('orders.rating.subtitle', { name: otherUserName })}
            </Text>
          </YStack>

          {/* Stars */}
          <XStack gap="$2" paddingVertical="$2">
            {([1, 2, 3, 4, 5] as RatingScore[]).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setScore(s)}
                activeOpacity={0.7}
                style={{
                  padding: 4,
                }}
              >
                <Star
                  size={36}
                  color={s <= score ? colors.amber[500] : colors.gray[300]}
                  fill={s <= score ? colors.amber[500] : 'transparent'}
                  strokeWidth={s <= score ? 2.5 : 1.5}
                />
              </TouchableOpacity>
            ))}
          </XStack>

          {/* Rating label */}
          {score > 0 && (
            <Text
              fontSize={15}
              fontWeight="600"
              color={colors.amber[700]}
            >
              {labels[score]}
            </Text>
          )}

          {/* Feedback */}
          <YStack width="100%" gap="$2">
            <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
              {t('orders.rating.feedback')}
            </Text>
            <XStack
              borderWidth={1}
              borderColor={colors.gray[300]}
              borderRadius={borderRadius.md}
              padding="$3"
              width="100%"
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
                placeholder={t('orders.rating.feedbackPlaceholder')}
                placeholderTextColor={colors.gray[400]}
                value={feedback}
                onChangeText={setFeedback}
                multiline
                numberOfLines={3}
              />
            </XStack>
          </YStack>

          {/* Actions */}
          <XStack gap="$3" width="100%">
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
                {t('orders.rating.later')}
              </Text>
            </Button>
            <Button
              flex={1}
              backgroundColor={
                score > 0 ? colors.green[600] : colors.gray[300]
              }
              paddingVertical="$2.5"
              borderRadius={borderRadius.md}
              pressStyle={
                score > 0
                  ? { backgroundColor: colors.green[700] }
                  : undefined
              }
              disabled={score === 0 || loading}
              onPress={handleSubmit}
            >
              {loading ? (
                <Spinner size="small" color="white" />
              ) : (
                <Text color="white" fontWeight="600" fontSize={15}>
                  {t('orders.rating.submit')}
                </Text>
              )}
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
