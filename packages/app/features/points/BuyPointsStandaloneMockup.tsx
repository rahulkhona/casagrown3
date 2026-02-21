/**
 * BuyPointsStandaloneMockup - Standalone mockup for purchasing points directly
 *
 * Requirements:
 * - 1 field for points amount
 * - Calculate service fee if < 500 points (e.g. 2.9% + $0.30)
 * - Standard mocked card fields inline
 * - Show breakdown of total cost
 */
'use client'
import { useState, useCallback, useMemo } from 'react'
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui'
import { Platform, TextInput, View } from 'react-native'
import {
  CreditCard,
  Lock,
  ShieldCheck,
  Info,
  CheckCircle2,
} from '@tamagui/lucide-icons'
import { useRouter } from 'solito/navigation'
import { supabase, useAuth } from '../auth/auth-hook'
import { usePointsBalance } from '../../hooks/usePointsBalance'
import { colors, shadows, borderRadius } from '../../design-tokens'

// Configuration
const MIN_PURCHASE_AMOUNT = 500
const POINTS_PER_DOLLAR = 100
const SERVICE_FEE_POLICY = {
  rate: 0.029, // 2.9%
  fixedFee: 0.30, // $0.30
}

export function BuyPointsStandaloneMockup({ t = (k: string) => k }: { t?: (key: string, opts?: any) => string }) {
  const [pointsInput, setPointsInput] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [cardName, setCardName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const { user } = useAuth()
  const { refetch: refetchBalance } = usePointsBalance(user?.id)

  // Derived calculations
  const numericPoints = parseInt(pointsInput.replace(/\D/g, ''), 10) || 0
  const baseCost = numericPoints / POINTS_PER_DOLLAR
  
  // Apply service fee if below threshold
  const appliesFee = numericPoints > 0 && numericPoints < MIN_PURCHASE_AMOUNT
  const serviceFee = appliesFee 
    ? (baseCost * SERVICE_FEE_POLICY.rate) + SERVICE_FEE_POLICY.fixedFee 
    : 0
  
  const totalCost = baseCost + serviceFee

  // Format inputs
  const formatCardNumber = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '').substring(0, 16)
    const groups = cleaned.match(/.{1,4}/g)
    setCardNumber(groups ? groups.join(' ') : cleaned)
  }, [])

  const formatExpiry = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '').substring(0, 4)
    if (cleaned.length > 2) {
      setCardExpiry(`${cleaned.substring(0, 2)}/${cleaned.substring(2)}`)
    } else {
      setCardExpiry(cleaned)
    }
  }, [])

  const router = useRouter()

  const handlePurchase = async () => {
    if (numericPoints <= 0) return
    setIsProcessing(true)

    try {
      // 1. Create a intent/transaction
      const amountCents = Math.round(totalCost * 100)
      const serviceFeeCents = Math.round(serviceFee * 100)
      
      const { data: intentData, error: intentError } = await supabase.functions.invoke(
        'create-payment-intent',
        {
          body: {
            amountCents,
            pointsAmount: numericPoints,
            serviceFeeCents,
            provider: 'mock'
          }
        }
      )

      if (intentError) throw intentError

      const { transactionId } = intentData

      // 2. Confirm the transaction to actually mint the points
      const { data: confirmData, error: confirmError } = await supabase.functions.invoke(
        'confirm-payment',
        {
          body: {
            paymentTransactionId: transactionId
          }
        }
      )

      if (confirmError) throw confirmError

      setIsSuccess(true)
      
      // Refresh global points cache so the header updates instantly
      await refetchBalance()
      
      // Navigate cleanly
      setTimeout(() => {
        setIsSuccess(false)
        router.push('/feed')
      }, 2000)

    } catch (err) {
      console.error('Purchase failed', err)
      alert('Payment processing failed. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.gray[50] }}
      contentContainerStyle={{ alignItems: 'center', padding: 20 }}
    >
      <YStack
        backgroundColor="white"
        borderRadius={borderRadius.xl}
        padding="$5"
        width="100%"
        maxWidth={480}
        gap="$4"
        shadowColor={shadows.lg.color}
        shadowOffset={shadows.lg.offset}
        shadowOpacity={0.1}
        shadowRadius={shadows.lg.radius}
        borderWidth={1}
        borderColor={colors.gray[200]}
      >
        {/* Header */}
        <YStack gap="$1">
          <Text fontSize={22} fontWeight="700" color={colors.gray[900]}>
            Buy Points
          </Text>
          <Text fontSize={14} color={colors.gray[500]}>
            Add points to your balance instantly using your credit card.
          </Text>
        </YStack>

        {/* Input */}
        <YStack gap="$2" marginTop="$2">
          <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
            How many points do you want to buy?
          </Text>
          <XStack
            borderWidth={1}
            borderColor={colors.green[500]}
            borderRadius={borderRadius.md}
            alignItems="center"
            paddingHorizontal="$3"
            backgroundColor={colors.green[50]}
          >
            <TextInput
              style={{
                flex: 1,
                fontSize: 24,
                paddingVertical: 12,
                paddingHorizontal: 8,
                fontWeight: '700',
                color: colors.green[700],
                fontFamily: Platform.OS === 'ios' ? 'Inter-Bold' : 'Inter',
              }}
              placeholder="0"
              placeholderTextColor={colors.green[300]}
              value={pointsInput}
              onChangeText={(text) => setPointsInput(text.replace(/\D/g, ''))}
              keyboardType="number-pad"
            />
            <Text fontSize={16} fontWeight="600" color={colors.green[700]}>
              points
            </Text>
          </XStack>
          
          <XStack gap="$2" alignItems="flex-start" paddingTop="$1">
            <Info size={14} color={colors.gray[500]} style={{ marginTop: 2 }} />
            <Text fontSize={12} color={colors.gray[500]} flex={1} lineHeight={16}>
              A service fee applies for purchases under {MIN_PURCHASE_AMOUNT} points.
              Buy {MIN_PURCHASE_AMOUNT} or more to waive the fee.
            </Text>
          </XStack>
        </YStack>

        {/* Pricing Breakdown */}
        {numericPoints > 0 && (
          <YStack
            backgroundColor={appliesFee ? colors.amber[50] : colors.green[50]}
            borderWidth={1}
            borderColor={appliesFee ? colors.amber[200] : colors.green[200]}
            borderRadius={borderRadius.lg}
            padding="$3"
            gap="$2"
            marginTop="$2"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={13} color={colors.gray[700]}>
                {numericPoints} points
              </Text>
              <Text fontSize={14} fontWeight="600" color={colors.gray[900]}>
                ${baseCost.toFixed(2)}
              </Text>
            </XStack>

            {appliesFee && (
              <XStack
                justifyContent="space-between"
                alignItems="center"
                paddingTop="$1"
                borderTopWidth={1}
                borderTopColor={colors.amber[200]}
              >
                <YStack>
                  <Text fontSize={13} color={colors.amber[700]}>
                    Service Fee
                  </Text>
                  <Text fontSize={11} color={colors.amber[600]}>
                    {(SERVICE_FEE_POLICY.rate * 100).toFixed(1)}% + ${SERVICE_FEE_POLICY.fixedFee.toFixed(2)}
                  </Text>
                </YStack>
                <Text fontSize={14} fontWeight="600" color={colors.amber[700]}>
                  ${serviceFee.toFixed(2)}
                </Text>
              </XStack>
            )}

            {!appliesFee && (
              <XStack
                justifyContent="space-between"
                alignItems="center"
                paddingTop="$1"
                borderTopWidth={1}
                borderTopColor={colors.green[200]}
              >
                <Text fontSize={13} color={colors.green[700]}>
                  Service Fee Waived
                </Text>
                <Text fontSize={14} fontWeight="600" color={colors.green[600]}>
                  $0.00
                </Text>
              </XStack>
            )}

            <XStack
              justifyContent="space-between"
              alignItems="center"
              paddingTop="$1"
              borderTopWidth={1}
              borderTopColor={appliesFee ? colors.amber[200] : colors.green[200]}
            >
              <Text fontSize={15} fontWeight="700" color={colors.gray[900]}>
                Total Cost
              </Text>
              <Text
                fontSize={18}
                fontWeight="700"
                color={appliesFee ? colors.amber[700] : colors.green[700]}
              >
                ${totalCost.toFixed(2)}
              </Text>
            </XStack>
          </YStack>
        )}

        {/* Credit Card Details */}
        <YStack gap="$2" marginTop="$2" opacity={numericPoints > 0 ? 1 : 0.5}>
          <XStack alignItems="center" gap="$2">
            <CreditCard size={16} color={colors.gray[700]} />
            <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
              Payment Details
            </Text>
          </XStack>

          <XStack borderWidth={1} borderColor={colors.gray[300]} borderRadius={borderRadius.md} alignItems="center" paddingHorizontal="$3" backgroundColor="white">
            <CreditCard size={16} color={colors.gray[400]} />
            <TextInput
              style={{ flex: 1, fontSize: 15, paddingVertical: 12, paddingHorizontal: 10, color: colors.gray[900], letterSpacing: 1 }}
              placeholder="Card Number"
              placeholderTextColor={colors.gray[400]}
              value={cardNumber}
              onChangeText={formatCardNumber}
              keyboardType="numeric"
              maxLength={19}
              editable={numericPoints > 0 && !isProcessing}
            />
          </XStack>

          <XStack borderWidth={1} borderColor={colors.gray[300]} borderRadius={borderRadius.md} alignItems="center" paddingHorizontal="$3" backgroundColor="white">
            <TextInput
              style={{ flex: 1, fontSize: 15, paddingVertical: 12, paddingHorizontal: 4, color: colors.gray[900] }}
              placeholder="Name on Card"
              placeholderTextColor={colors.gray[400]}
              value={cardName}
              onChangeText={setCardName}
              autoCapitalize="words"
              editable={numericPoints > 0 && !isProcessing}
            />
          </XStack>

          <XStack gap="$2">
            <XStack flex={1} borderWidth={1} borderColor={colors.gray[300]} borderRadius={borderRadius.md} alignItems="center" paddingHorizontal="$3" backgroundColor="white">
              <TextInput
                style={{ flex: 1, fontSize: 15, paddingVertical: 12, paddingHorizontal: 4, color: colors.gray[900] }}
                placeholder="MM/YY"
                placeholderTextColor={colors.gray[400]}
                value={cardExpiry}
                onChangeText={formatExpiry}
                keyboardType="numeric"
                maxLength={5}
                editable={numericPoints > 0 && !isProcessing}
              />
            </XStack>
            <XStack flex={1} borderWidth={1} borderColor={colors.gray[300]} borderRadius={borderRadius.md} alignItems="center" paddingHorizontal="$3" backgroundColor="white">
              <Lock size={14} color={colors.gray[400]} />
              <TextInput
                style={{ flex: 1, fontSize: 15, paddingVertical: 12, paddingHorizontal: 8, color: colors.gray[900] }}
                placeholder="CVC"
                placeholderTextColor={colors.gray[400]}
                value={cardCvc}
                onChangeText={(text) => setCardCvc(text.replace(/\D/g, '').substring(0, 4))}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                editable={numericPoints > 0 && !isProcessing}
              />
            </XStack>
          </XStack>

          <XStack alignItems="center" gap="$1" paddingTop="$1">
            <ShieldCheck size={14} color={colors.gray[400]} />
            <Text fontSize={11} color={colors.gray[400]}>
              Secured by Stripe
            </Text>
          </XStack>
        </YStack>

        {/* Action Button */}
        <Button
          marginTop="$4"
          backgroundColor={numericPoints > 0 ? colors.green[600] : colors.gray[300]}
          paddingVertical="$3"
          borderRadius={borderRadius.md}
          pressStyle={numericPoints > 0 ? { backgroundColor: colors.green[700] } : undefined}
          disabled={numericPoints <= 0 || isProcessing || isSuccess}
          onPress={handlePurchase}
          icon={isProcessing ? undefined : isSuccess ? <CheckCircle2 color="white" /> : undefined}
        >
          <Text color={numericPoints > 0 ? "white" : colors.gray[500]} fontWeight="700" fontSize={16}>
            {isProcessing ? 'Processing...' : isSuccess ? 'Purchase Successful!' : `Pay $${totalCost.toFixed(2)}`}
          </Text>
        </Button>
      </YStack>
    </ScrollView>
  )
}
