/**
 * JoinByCodeSheet — OTP-style 6-digit input for delegatees to enter a pairing code
 */

import { useState, useEffect, useRef } from 'react'
import { TextInput, Platform } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { X, Check, AlertCircle } from '@tamagui/lucide-icons'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius } from '../../design-tokens'

interface JoinByCodeSheetProps {
  visible: boolean
  onClose: () => void
  onAcceptCode: (code: string) => Promise<{ delegation?: any; error?: string }>
}

export default function JoinByCodeSheet({
  visible,
  onClose,
  onAcceptCode,
}: JoinByCodeSheetProps) {
  const { t } = useTranslation()
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const inputRefs = useRef<(TextInput | null)[]>([])

  // Reset on open/close
  useEffect(() => {
    if (!visible) {
      setDigits(['', '', '', '', '', ''])
      setError(null)
      setSuccess(false)
      setSubmitting(false)
    } else {
      // Focus first input on open
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }
  }, [visible])

  const handleDigitChange = (index: number, value: string) => {
    // Only accept digits
    const digit = value.replace(/\D/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    setError(null)

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit on 6th digit
    if (digit && index === 5) {
      const code = newDigits.join('')
      if (code.length === 6) {
        handleSubmit(code)
      }
    }
  }

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
      const newDigits = [...digits]
      newDigits[index - 1] = ''
      setDigits(newDigits)
    }
  }

  const handleSubmit = async (code: string) => {
    setSubmitting(true)
    setError(null)
    const result = await onAcceptCode(code)
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      // Clear digits on error
      setDigits(['', '', '', '', '', ''])
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    } else {
      setSuccess(true)
      setTimeout(() => onClose(), 1500)
    }
  }

  if (!visible) return null

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="rgba(0, 0, 0, 0.5)"
      justifyContent="center"
      alignItems="center"
      zIndex={100}
      padding="$4"
    >
      <YStack
        backgroundColor="white"
        borderRadius={borderRadius['2xl']}
        maxWidth={440}
        width="100%"
        padding="$6"
        gap="$5"
      >
        {/* Header */}
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize="$6" fontWeight="700" color={colors.gray[900]}>
            {t('delegate.joinByCode.title')}
          </Text>
          <Button unstyled padding="$2" onPress={onClose}>
            <X size={20} color={colors.gray[500]} />
          </Button>
        </XStack>

        {/* Instructions */}
        <Text fontSize={14} color={colors.gray[600]} textAlign="center">
          {t('delegate.joinByCode.instructions')}
        </Text>

        {/* OTP Digit Inputs */}
        <XStack gap="$2" justifyContent="center">
          {digits.map((digit, i) => (
            <YStack key={i} width={48} height={60}>
              <TextInput
                ref={(ref) => { inputRefs.current[i] = ref }}
                value={digit}
                onChangeText={(val) => handleDigitChange(i, val)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                style={{
                  width: 48,
                  height: 60,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: error ? '#ef4444' : digit ? colors.green[500] : colors.gray[300],
                  backgroundColor: digit ? colors.green[50] : colors.gray[50],
                  textAlign: 'center',
                  fontSize: 24,
                  fontWeight: '700',
                  color: colors.gray[900],
                }}
                editable={!submitting && !success}
              />
            </YStack>
          ))}
        </XStack>

        {/* Status */}
        {submitting && (
          <XStack justifyContent="center" gap="$2" alignItems="center">
            <Spinner size="small" color={colors.green[600]} />
            <Text color={colors.gray[600]} fontSize={14}>
              {t('delegate.joinByCode.verifying')}
            </Text>
          </XStack>
        )}

        {error && (
          <XStack
            backgroundColor={colors.red[50]}
            borderWidth={1}
            borderColor={colors.red[200]}
            borderRadius={borderRadius.lg}
            padding="$3"
            gap="$2"
            alignItems="center"
          >
            <AlertCircle size={16} color={colors.red[600]} />
            <Text fontSize={13} color={colors.red[700]} flex={1}>
              {error}
            </Text>
          </XStack>
        )}

        {success && (
          <XStack
            backgroundColor={colors.green[50]}
            borderWidth={1}
            borderColor={colors.green[200]}
            borderRadius={borderRadius.lg}
            padding="$3"
            gap="$2"
            alignItems="center"
            justifyContent="center"
          >
            <Check size={16} color={colors.green[600]} />
            <Text fontSize={14} fontWeight="600" color={colors.green[700]}>
              {t('delegate.joinByCode.success')}
            </Text>
          </XStack>
        )}
      </YStack>
    </YStack>
  )
}
