/**
 * JoinByCodeSheet — 2-step flow:
 *   Step 1: Enter 6-digit pairing code (OTP-style)
 *   Step 2: Review proposed split + delegator info → Accept / Reject
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { TextInput, Platform } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { X, Check, AlertCircle, Users, XCircle, CheckCircle } from '@tamagui/lucide-icons'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius } from '../../design-tokens'
import { supabase } from '../auth/auth-hook'

interface JoinByCodeSheetProps {
  visible: boolean
  onClose: () => void
  onAcceptCode: (code: string) => Promise<{ delegation?: any; error?: string }>
}

interface LookupResult {
  delegator: { id: string; full_name: string | null; avatar_url: string | null }
  delegation: { id: string; delegatePct: number | null; message: string | null }
}

export default function JoinByCodeSheet({
  visible,
  onClose,
  onAcceptCode,
}: JoinByCodeSheetProps) {
  const { t } = useTranslation()
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [lookingUp, setLookingUp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
  const [enteredCode, setEnteredCode] = useState<string | null>(null)
  const inputRefs = useRef<(TextInput | null)[]>([])

  // Reset on open/close
  useEffect(() => {
    if (!visible) {
      setDigits(['', '', '', '', '', ''])
      setError(null)
      setSuccess(false)
      setSubmitting(false)
      setLookingUp(false)
      setLookupResult(null)
      setEnteredCode(null)
    } else {
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }
  }, [visible])

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    setError(null)

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // On 6th digit, do lookup (not accept)
    if (digit && index === 5) {
      const code = newDigits.join('')
      if (code.length === 6) {
        handleLookup(code)
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

  // Step 1: Lookup the delegation by pairing code
  const handleLookup = useCallback(async (code: string) => {
    setLookingUp(true)
    setError(null)

    try {
      const response = await supabase.functions.invoke('pair-delegation', {
        body: { action: 'lookup-pairing', code },
      })

      if (response.error || response.data?.error) {
        setError(response.data?.error || response.error?.message || 'Invalid code')
        setDigits(['', '', '', '', '', ''])
        setTimeout(() => inputRefs.current[0]?.focus(), 100)
      } else {
        setLookupResult(response.data)
        setEnteredCode(code)
      }
    } catch {
      setError('Failed to look up code')
      setDigits(['', '', '', '', '', ''])
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }

    setLookingUp(false)
  }, [])

  // Step 2: Accept the delegation
  const handleAccept = useCallback(async () => {
    if (!enteredCode) return
    setSubmitting(true)
    setError(null)

    const result = await onAcceptCode(enteredCode)
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setTimeout(() => onClose(), 1500)
    }
  }, [enteredCode, onAcceptCode, onClose])

  // Step 2: Reject — just close the sheet
  const handleReject = useCallback(() => {
    setLookupResult(null)
    setEnteredCode(null)
    setDigits(['', '', '', '', '', ''])
    setTimeout(() => inputRefs.current[0]?.focus(), 100)
  }, [])

  if (!visible) return null

  const delegatePct = lookupResult?.delegation?.delegatePct ?? 50
  const delegatorName = lookupResult?.delegator?.full_name || 'Unknown'

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
            {lookupResult ? 'Review Delegation' : t('delegate.joinByCode.title')}
          </Text>
          <Button unstyled padding="$2" onPress={onClose}>
            <X size={20} color={colors.gray[500]} />
          </Button>
        </XStack>

        {/* ─── Step 1: Enter Code ─── */}
        {!lookupResult && !success && (
          <>
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
                    editable={!lookingUp}
                  />
                </YStack>
              ))}
            </XStack>

            {lookingUp && (
              <XStack justifyContent="center" gap="$2" alignItems="center">
                <Spinner size="small" color={colors.green[600]} />
                <Text color={colors.gray[600]} fontSize={14}>
                  Looking up delegation...
                </Text>
              </XStack>
            )}
          </>
        )}

        {/* ─── Step 2: Review Split + Accept/Reject ─── */}
        {lookupResult && !success && (
          <>
            {/* Delegator info */}
            <XStack
              backgroundColor={colors.green[50]}
              borderWidth={1}
              borderColor={colors.green[200]}
              borderRadius={borderRadius.lg}
              padding="$4"
              gap="$3"
              alignItems="center"
            >
              <YStack
                width={44}
                height={44}
                borderRadius={22}
                backgroundColor={colors.green[100]}
                alignItems="center"
                justifyContent="center"
              >
                <Users size={22} color={colors.green[700]} />
              </YStack>
              <YStack flex={1}>
                <Text fontSize={12} color={colors.green[600]}>Delegator</Text>
                <Text fontWeight="700" fontSize={16} color={colors.gray[900]}>
                  {delegatorName}
                </Text>
              </YStack>
            </XStack>

            {/* Split proposal */}
            <YStack
              backgroundColor={colors.gray[50]}
              borderWidth={1}
              borderColor={colors.gray[200]}
              borderRadius={borderRadius.lg}
              padding="$4"
              gap="$3"
            >
              <Text fontWeight="600" fontSize={14} color={colors.gray[700]} textAlign="center">
                Proposed Profit Split
              </Text>
              <XStack justifyContent="center" alignItems="center" gap="$4">
                <YStack alignItems="center" gap="$1">
                  <Text fontSize={28} fontWeight="700" color={colors.green[700]}>
                    {delegatePct}%
                  </Text>
                  <Text fontSize={12} color={colors.green[600]} fontWeight="600">You get</Text>
                </YStack>
                <YStack height={40} width={1} backgroundColor={colors.gray[300]} />
                <YStack alignItems="center" gap="$1">
                  <Text fontSize={28} fontWeight="700" color={colors.blue[700]}>
                    {100 - delegatePct}%
                  </Text>
                  <Text fontSize={12} color={colors.blue[600]} fontWeight="600">Delegator keeps</Text>
                </YStack>
              </XStack>
              <Text fontSize={11} color={colors.gray[400]} textAlign="center">
                Split is applied after a 10% platform fee on each sale.
              </Text>
            </YStack>

            {/* Personal message */}
            {lookupResult.delegation.message && (
              <YStack
                backgroundColor="#eff6ff"
                borderWidth={1}
                borderColor="#bfdbfe"
                borderRadius={borderRadius.lg}
                padding="$3"
              >
                <Text fontSize={11} color="#1e40af" fontWeight="600">Personal message:</Text>
                <Text fontSize={13} color="#1e40af" fontStyle="italic" marginTop="$1">
                  "{lookupResult.delegation.message}"
                </Text>
              </YStack>
            )}

            {/* Accept / Reject buttons */}
            <XStack gap="$3">
              <Button
                flex={1}
                backgroundColor="white"
                borderWidth={2}
                borderColor={colors.red[300]}
                borderRadius={borderRadius.lg}
                paddingVertical="$3"
                onPress={handleReject}
                hoverStyle={{ backgroundColor: colors.red[50] }}
                disabled={submitting}
              >
                <XStack gap="$2" alignItems="center" justifyContent="center">
                  <XCircle size={18} color={colors.red[600]} />
                  <Text fontWeight="600" color={colors.red[600]} fontSize={15}>
                    Decline
                  </Text>
                </XStack>
              </Button>
              <Button
                flex={1}
                backgroundColor={colors.green[600]}
                borderRadius={borderRadius.lg}
                paddingVertical="$3"
                onPress={handleAccept}
                hoverStyle={{ backgroundColor: colors.green[700] }}
                disabled={submitting}
              >
                {submitting ? (
                  <Spinner size="small" color="white" />
                ) : (
                  <XStack gap="$2" alignItems="center" justifyContent="center">
                    <CheckCircle size={18} color="white" />
                    <Text fontWeight="600" color="white" fontSize={15}>
                      Accept
                    </Text>
                  </XStack>
                )}
              </Button>
            </XStack>
          </>
        )}

        {/* Error */}
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

        {/* Success */}
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
