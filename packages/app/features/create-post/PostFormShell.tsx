/**
 * PostFormShell — Shared layout wrapper for all create-post form screens.
 *
 * Provides: header (back + title), scrollable content area, error banner,
 * and submit button with loading state.
 *
 * Extracted from SellForm / BuyForm / GeneralForm to eliminate duplication.
 */

import React from 'react'
import {
  YStack,
  XStack,
  Text,
  Button,
  ScrollView,
  Spinner,
} from 'tamagui'
import { ArrowLeft } from '@tamagui/lucide-icons'
import { Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius } from '../../design-tokens'

export interface PostFormShellProps {
  /** Title displayed in the header bar */
  title: string
  /** Called when the back arrow is pressed */
  onBack: () => void
  /** Called when the submit button is pressed */
  onSubmit: () => void
  /** Whether a submission is in progress — shows spinner on button */
  submitting: boolean
  /** Error message to display above the submit button */
  formError?: string
  /** Clears the form error */
  onClearError?: () => void
  /** Custom submit button label (defaults to t('createPost.submit')) */
  submitLabel?: string
  /** Custom submitting label (defaults to t('createPost.submitting')) */
  submittingLabel?: string
  /** Form content */
  children: React.ReactNode
}

export function PostFormShell({
  title,
  onBack,
  onSubmit,
  submitting,
  formError,
  onClearError,
  submitLabel,
  submittingLabel,
  children,
}: PostFormShellProps) {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()

  return (
    <YStack flex={1} backgroundColor={colors.neutral[50]}>
      {/* Header */}
      <XStack
        paddingTop={insets.top + 8}
        paddingHorizontal="$4"
        paddingBottom="$3"
        backgroundColor="white"
        alignItems="center"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor={colors.neutral[200]}
      >
        <Button unstyled onPress={onBack} padding="$2">
          <ArrowLeft size={24} color={colors.neutral[700]} />
        </Button>
        <Text fontSize="$6" fontWeight="700" color={colors.neutral[900]}>
          {title}
        </Text>
      </XStack>

      <ScrollView
        flex={1}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <YStack gap="$5" maxWidth={600} alignSelf="center" width="100%">
          {children}

          {/* Error banner */}
          {formError ? (
            <XStack
              backgroundColor={colors.red[50]}
              borderWidth={1}
              borderColor={colors.red[200]}
              borderRadius={borderRadius.md}
              padding="$3"
              alignItems="center"
              gap="$2"
            >
              <Text flex={1} fontSize="$3" color={colors.red[700]}>
                {formError}
              </Text>
              {onClearError && (
                <Pressable onPress={onClearError}>
                  <Text fontSize="$3" color={colors.red[400]}>✕</Text>
                </Pressable>
              )}
            </XStack>
          ) : null}

          {/* Submit button */}
          <Button
            size="$5"
            backgroundColor={colors.primary[600]}
            borderRadius={borderRadius.lg}
            onPress={onSubmit}
            disabled={submitting}
            hoverStyle={{ backgroundColor: colors.primary[700] }}
            pressStyle={{ backgroundColor: colors.primary[700], scale: 0.98 }}
          >
            {submitting ? (
              <XStack alignItems="center" gap="$2">
                <Spinner size="small" color="white" />
                <Text color="white" fontWeight="700" fontSize="$4">
                  {submittingLabel || t('createPost.submitting')}
                </Text>
              </XStack>
            ) : (
              <Text color="white" fontWeight="700" fontSize="$4">
                {submitLabel || t('createPost.submit')}
              </Text>
            )}
          </Button>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
