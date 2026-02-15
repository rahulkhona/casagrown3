/**
 * BuyPointsSheet - Modal for purchasing points
 *
 * Displayed when a user has insufficient points for an order.
 * Features:
 *  - When deficit < minimum: two radio options
 *    A) Recommended: minimum amount with NO service fee (unused points redeemable)
 *    B) Exact deficit with 3% processing fee
 *  - When deficit >= minimum: single option, no fee needed
 *  - Inline credit card fields (mocked, Stripe-ready)
 *  - Dynamic pricing breakdown
 *
 * UI-only — Stripe integration will replace mocked card fields.
 */

import { useState, useCallback, useEffect } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Spinner } from 'tamagui'
import { Platform, TextInput, TouchableOpacity, View } from 'react-native'
import {
  X,
  CreditCard,
  Check,
  Lock,
  ShieldCheck,
  Info,
  AlertCircle,
  CheckCircle2,
} from '@tamagui/lucide-icons'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { usePaymentService } from '../../hooks/usePaymentService'
import { isMockPaymentMode } from './paymentService'

// =============================================================================
// Configuration — these will come from a country-specific policy API
// =============================================================================

/** Minimum purchase to avoid the service fee */
const MIN_PURCHASE_AMOUNT = 500
/** Points-to-dollar conversion rate */
const POINTS_PER_DOLLAR = 100

/**
 * Service fee policy — varies by country.
 * US default mirrors Stripe's standard rate: 2.9% + $0.30
 * In production this will be fetched from the backend policy API.
 */
const SERVICE_FEE_POLICY = {
  /** Percentage rate (e.g. 0.029 = 2.9%) */
  rate: 0.029,
  /** Fixed fee in dollars (e.g. 0.30 = 30 cents) */
  fixedFee: 0.30,
}

// =============================================================================
// Types
// =============================================================================

export interface BuyPointsSheetProps {
  visible: boolean
  currentBalance: number
  /** Shortfall amount the user needs to cover */
  suggestedAmount?: number
  /** Override the minimum purchase threshold */
  minimumPurchase?: number
  onClose: () => void
  onComplete: (pointsAmount: number) => void
  t: (key: string, opts?: Record<string, any>) => string
}

type PurchaseOption = 'recommended' | 'exact'

// =============================================================================
// Component
// =============================================================================

export function BuyPointsSheet({
  visible,
  currentBalance,
  suggestedAmount = 0,
  minimumPurchase = MIN_PURCHASE_AMOUNT,
  onClose,
  onComplete,
  t,
}: BuyPointsSheetProps) {
  // The deficit: how many points the user needs
  const deficit = Math.max(suggestedAmount, 0)

  // Recommended amount: max(minimum, deficit), round up to nearest 50
  const recommendedAmount = Math.ceil(Math.max(minimumPurchase, deficit) / 50) * 50
  // Exact amount: just the deficit, rounded up to nearest 10
  const exactAmount = Math.ceil(deficit / 10) * 10

  // Do we need two choices? Only when deficit < minimum (i.e. recommended > exact)
  const hasTwoOptions = exactAmount > 0 && exactAmount < recommendedAmount

  const [selectedOption, setSelectedOption] = useState<PurchaseOption>('recommended')

  // Card fields (mocked — will be replaced by Stripe Elements)
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [cardName, setCardName] = useState('')

  // Precomputed costs for each option (used in labels)
  const recommendedCost = recommendedAmount / POINTS_PER_DOLLAR
  const exactCost = exactAmount / POINTS_PER_DOLLAR

  // Computed pricing for the selected option
  const activeOption = hasTwoOptions ? selectedOption : 'recommended'
  const purchaseAmount = activeOption === 'recommended' ? recommendedAmount : exactAmount
  const baseCost = purchaseAmount / POINTS_PER_DOLLAR
  const serviceFee = activeOption === 'exact'
    ? baseCost * SERVICE_FEE_POLICY.rate + SERVICE_FEE_POLICY.fixedFee
    : 0
  const totalCost = baseCost + serviceFee
  const afterPurchase = currentBalance + purchaseAmount

  // Payment service integration
  const { processPayment, status: paymentStatus, isProcessing, error: paymentError, isMock, reset: resetPayment } = usePaymentService()

  // In mock mode, skip card validation
  const isCardValid = isMockPaymentMode()
    ? true
    : cardNumber.replace(/\s/g, '').length >= 15 &&
      cardExpiry.length >= 4 &&
      cardCvc.length >= 3

  // Format card number with spaces
  const formatCardNumber = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '').substring(0, 16)
    const groups = cleaned.match(/.{1,4}/g)
    setCardNumber(groups ? groups.join(' ') : cleaned)
  }, [])

  // Format expiry as MM/YY
  const formatExpiry = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '').substring(0, 4)
    if (cleaned.length > 2) {
      setCardExpiry(`${cleaned.substring(0, 2)}/${cleaned.substring(2)}`)
    } else {
      setCardExpiry(cleaned)
    }
  }, [])

  // Reset payment state when modal opens/closes
  useEffect(() => {
    if (visible) {
      resetPayment()
    }
  }, [visible, resetPayment])

  // Auto-close after successful payment
  useEffect(() => {
    if (paymentStatus === 'success') {
      const timer = setTimeout(() => {
        onComplete(purchaseAmount)
      }, 1500) // Show success for 1.5s then close
      return () => clearTimeout(timer)
    }
  }, [paymentStatus, purchaseAmount, onComplete])

  const handleComplete = useCallback(async () => {
    if (purchaseAmount <= 0) return
    const totalCents = Math.round(totalCost * 100)
    const feeCents = Math.round(serviceFee * 100)
    await processPayment(totalCents, purchaseAmount, feeCents, {
      number: cardNumber,
      expiry: cardExpiry,
      cvc: cardCvc,
      name: cardName,
    })
  }, [purchaseAmount, totalCost, serviceFee, processPayment, cardNumber, cardExpiry, cardCvc, cardName])

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
      zIndex={200}
      padding="$4"
    >
      <ScrollView
        style={{ width: '100%', maxWidth: 440, maxHeight: '90%' }}
        contentContainerStyle={{ flexGrow: 0 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.xl}
          padding="$5"
          width="100%"
          gap="$4"
          shadowColor={shadows.lg.color}
          shadowOffset={shadows.lg.offset}
          shadowOpacity={0.15}
          shadowRadius={shadows.lg.radius}
        >
          {/* ─── Header ─── */}
          <XStack justifyContent="space-between" alignItems="center">
            <YStack gap="$1">
              <Text fontSize={20} fontWeight="700" color={colors.gray[900]}>
                {t('feed.buyPoints.title')}
              </Text>
              <Text fontSize={13} color={colors.gray[500]}>
                {t('feed.buyPoints.subtitle')}
              </Text>
            </YStack>
            <TouchableOpacity
              onPress={onClose}
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

          {/* ─── Purchase Options ─── */}
          <YStack gap="$2">
            {hasTwoOptions && (
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                {t('feed.buyPoints.chooseAmount')}
              </Text>
            )}

            {hasTwoOptions ? (
              <>
                {/* ── Option A: Recommended — no fee ── */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedOption('recommended')}
                >
                  <YStack
                    borderWidth={2}
                    borderColor={
                      selectedOption === 'recommended'
                        ? colors.green[600]
                        : colors.gray[200]
                    }
                    borderRadius={borderRadius.xl}
                    padding="$3"
                    gap="$2"
                    backgroundColor={
                      selectedOption === 'recommended' ? colors.green[50] : 'white'
                    }
                  >
                    <XStack gap="$3" alignItems="center">
                      {/* Radio circle */}
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 2,
                          borderColor:
                            selectedOption === 'recommended'
                              ? colors.green[600]
                              : colors.gray[300],
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {selectedOption === 'recommended' && (
                          <View
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              backgroundColor: colors.green[600],
                            }}
                          />
                        )}
                      </View>

                      <YStack flex={1} gap={2}>
                        <XStack alignItems="center" gap="$2">
                          <Text
                            fontSize={16}
                            fontWeight="700"
                            color={colors.gray[900]}
                          >
                            {recommendedAmount} {t('feed.buyPoints.pointsUnit')}
                          </Text>
                          <YStack
                            backgroundColor={colors.green[600]}
                            paddingHorizontal={8}
                            paddingVertical={2}
                            borderRadius={borderRadius.full}
                          >
                            <Text fontSize={10} fontWeight="700" color="white">
                              {t('feed.buyPoints.recommended')}
                            </Text>
                          </YStack>
                        </XStack>
                        <Text fontSize={13} color={colors.green[700]}>
                          ${recommendedCost.toFixed(2)} ·{' '}
                          {t('feed.buyPoints.noServiceFee')}
                        </Text>
                      </YStack>
                      <Check
                        size={18}
                        color={
                          selectedOption === 'recommended'
                            ? colors.green[600]
                            : colors.gray[300]
                        }
                      />
                    </XStack>

                    {/* Reassurance note */}
                    <XStack
                      gap="$2"
                      alignItems="flex-start"
                      paddingTop="$1"
                      borderTopWidth={1}
                      borderTopColor={
                        selectedOption === 'recommended'
                          ? colors.green[200]
                          : colors.gray[100]
                      }
                    >
                      <Info
                        size={14}
                        color={colors.green[600]}
                        style={{ marginTop: 2 }}
                      />
                      <Text
                        fontSize={12}
                        color={colors.green[700]}
                        flex={1}
                        lineHeight={17}
                      >
                        {t('feed.buyPoints.redeemNote')}
                      </Text>
                    </XStack>
                  </YStack>
                </TouchableOpacity>

                {/* ── Option B: Exact deficit — with fee ── */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedOption('exact')}
                >
                  <YStack
                    borderWidth={2}
                    borderColor={
                      selectedOption === 'exact'
                        ? colors.amber[500]
                        : colors.gray[200]
                    }
                    borderRadius={borderRadius.xl}
                    padding="$3"
                    gap="$2"
                    backgroundColor={
                      selectedOption === 'exact' ? colors.amber[50] : 'white'
                    }
                  >
                    <XStack gap="$3" alignItems="center">
                      {/* Radio circle */}
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 2,
                          borderColor:
                            selectedOption === 'exact'
                              ? colors.amber[500]
                              : colors.gray[300],
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {selectedOption === 'exact' && (
                          <View
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              backgroundColor: colors.amber[500],
                            }}
                          />
                        )}
                      </View>

                      <YStack flex={1} gap={2}>
                        <Text
                          fontSize={16}
                          fontWeight="700"
                          color={colors.gray[900]}
                        >
                          {exactAmount} {t('feed.buyPoints.pointsUnit')}
                        </Text>
                        <Text fontSize={13} color={colors.amber[700]}>
                          ${exactCost.toFixed(2)} +{' '}
                          {t('feed.buyPoints.serviceFeeShort', {
                            rate: (SERVICE_FEE_POLICY.rate * 100).toFixed(1),
                            fixed: SERVICE_FEE_POLICY.fixedFee.toFixed(2),
                          })}
                        </Text>
                      </YStack>
                    </XStack>

                    {/* Fee explanation */}
                    <XStack
                      gap="$2"
                      alignItems="flex-start"
                      paddingTop="$1"
                      borderTopWidth={1}
                      borderTopColor={
                        selectedOption === 'exact'
                          ? colors.amber[200]
                          : colors.gray[100]
                      }
                    >
                      <Info
                        size={14}
                        color={colors.amber[600]}
                        style={{ marginTop: 2 }}
                      />
                      <Text
                        fontSize={12}
                        color={colors.amber[700]}
                        flex={1}
                        lineHeight={17}
                      >
                        {t('feed.buyPoints.feeExplanation', {
                          rate: (SERVICE_FEE_POLICY.rate * 100).toFixed(1),
                          fixed: SERVICE_FEE_POLICY.fixedFee.toFixed(2),
                        })}
                      </Text>
                    </XStack>
                  </YStack>
                </TouchableOpacity>
              </>
            ) : (
              /* ── Single option: deficit >= minimum, no fee ── */
              <YStack
                borderWidth={2}
                borderColor={colors.green[600]}
                borderRadius={borderRadius.xl}
                padding="$3"
                gap="$2"
                backgroundColor={colors.green[50]}
              >
                <XStack gap="$3" alignItems="center">
                  <YStack flex={1} gap={2}>
                    <XStack alignItems="center" gap="$2">
                      <Text
                        fontSize={16}
                        fontWeight="700"
                        color={colors.gray[900]}
                      >
                        {recommendedAmount} {t('feed.buyPoints.pointsUnit')}
                      </Text>
                      <YStack
                        backgroundColor={colors.green[600]}
                        paddingHorizontal={8}
                        paddingVertical={2}
                        borderRadius={borderRadius.full}
                      >
                        <Text fontSize={10} fontWeight="700" color="white">
                          {t('feed.buyPoints.noFee')}
                        </Text>
                      </YStack>
                    </XStack>
                    <Text fontSize={13} color={colors.green[700]}>
                      ${recommendedCost.toFixed(2)} ·{' '}
                      {t('feed.buyPoints.noServiceFee')}
                    </Text>
                  </YStack>
                  <Check size={18} color={colors.green[600]} />
                </XStack>
              </YStack>
            )}
          </YStack>

          {/* ─── Pricing Breakdown ─── */}
          <YStack
            backgroundColor={
              activeOption === 'recommended' ? colors.green[50] : colors.amber[50]
            }
            borderWidth={1}
            borderColor={
              activeOption === 'recommended'
                ? colors.green[200]
                : colors.amber[200]
            }
            borderRadius={borderRadius.lg}
            padding="$3"
            gap="$2"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={13} color={colors.gray[700]}>
                {purchaseAmount} {t('feed.buyPoints.pointsUnit')}
              </Text>
              <Text fontSize={14} fontWeight="600" color={colors.gray[900]}>
                ${baseCost.toFixed(2)}
              </Text>
            </XStack>

            <XStack
              justifyContent="space-between"
              alignItems="center"
              paddingTop="$1"
              borderTopWidth={1}
              borderTopColor={
                activeOption === 'recommended'
                  ? colors.green[200]
                  : colors.amber[200]
              }
            >
              <Text
                fontSize={13}
                color={
                  activeOption === 'recommended'
                    ? colors.green[700]
                    : colors.amber[700]
                }
              >
                {activeOption === 'recommended'
                  ? t('feed.buyPoints.noFee')
                  : t('feed.buyPoints.serviceFee')}
              </Text>
              <XStack alignItems="center" gap="$1">
                {activeOption === 'recommended' && (
                  <Check size={14} color={colors.green[600]} />
                )}
                <Text
                  fontSize={14}
                  fontWeight="600"
                  color={
                    activeOption === 'recommended'
                      ? colors.green[600]
                      : colors.amber[700]
                  }
                >
                  {activeOption === 'recommended'
                    ? '$0.00'
                    : `$${serviceFee.toFixed(2)}`}
                </Text>
              </XStack>
            </XStack>

            <XStack
              justifyContent="space-between"
              alignItems="center"
              paddingTop="$1"
              borderTopWidth={1}
              borderTopColor={
                activeOption === 'recommended'
                  ? colors.green[200]
                  : colors.amber[200]
              }
            >
              <Text fontSize={14} fontWeight="700" color={colors.gray[900]}>
                {t('feed.buyPoints.totalCost')}
              </Text>
              <Text
                fontSize={18}
                fontWeight="700"
                color={
                  activeOption === 'recommended'
                    ? colors.green[700]
                    : colors.amber[700]
                }
              >
                ${totalCost.toFixed(2)}
              </Text>
            </XStack>
          </YStack>

          {/* ─── Credit Card Details ─── */}
          <YStack gap="$2">
            <XStack alignItems="center" gap="$2">
              <CreditCard size={16} color={colors.gray[700]} />
              <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
                {t('feed.buyPoints.cardDetails')}
              </Text>
            </XStack>

            {/* Card Number */}
            <XStack
              borderWidth={1}
              borderColor={colors.gray[300]}
              borderRadius={borderRadius.md}
              alignItems="center"
              paddingHorizontal="$3"
              backgroundColor="white"
            >
              <CreditCard size={16} color={colors.gray[400]} />
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 15,
                  paddingVertical: 12,
                  paddingHorizontal: 10,
                  color: colors.gray[900],
                  letterSpacing: 1,
                  fontFamily:
                    Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                }}
                placeholder={t('feed.buyPoints.cardNumberPlaceholder')}
                placeholderTextColor={colors.gray[400]}
                value={cardNumber}
                onChangeText={formatCardNumber}
                keyboardType="numeric"
                maxLength={19}
              />
            </XStack>

            {/* Name on Card */}
            <XStack
              borderWidth={1}
              borderColor={colors.gray[300]}
              borderRadius={borderRadius.md}
              alignItems="center"
              paddingHorizontal="$3"
              backgroundColor="white"
            >
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 15,
                  paddingVertical: 12,
                  paddingHorizontal: 4,
                  color: colors.gray[900],
                  fontFamily:
                    Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                }}
                placeholder={t('feed.buyPoints.cardNamePlaceholder')}
                placeholderTextColor={colors.gray[400]}
                value={cardName}
                onChangeText={setCardName}
                autoCapitalize="words"
              />
            </XStack>

            {/* Expiry + CVC row */}
            <XStack gap="$2">
              <XStack
                flex={1}
                borderWidth={1}
                borderColor={colors.gray[300]}
                borderRadius={borderRadius.md}
                alignItems="center"
                paddingHorizontal="$3"
                backgroundColor="white"
              >
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 15,
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    color: colors.gray[900],
                    fontFamily:
                      Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                  }}
                  placeholder={t('feed.buyPoints.expiryPlaceholder')}
                  placeholderTextColor={colors.gray[400]}
                  value={cardExpiry}
                  onChangeText={formatExpiry}
                  keyboardType="numeric"
                  maxLength={5}
                />
              </XStack>
              <XStack
                flex={1}
                borderWidth={1}
                borderColor={colors.gray[300]}
                borderRadius={borderRadius.md}
                alignItems="center"
                paddingHorizontal="$3"
                backgroundColor="white"
              >
                <Lock size={14} color={colors.gray[400]} />
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 15,
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    color: colors.gray[900],
                    fontFamily:
                      Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                  }}
                  placeholder={t('feed.buyPoints.cvcPlaceholder')}
                  placeholderTextColor={colors.gray[400]}
                  value={cardCvc}
                  onChangeText={(text) =>
                    setCardCvc(text.replace(/\D/g, '').substring(0, 4))
                  }
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </XStack>
            </XStack>

            {/* Stripe badge */}
            <XStack alignItems="center" gap="$1" paddingTop="$1">
              <ShieldCheck size={14} color={colors.gray[400]} />
              <Text fontSize={11} color={colors.gray[400]}>
                {t('feed.buyPoints.securedByStripe')}
              </Text>
            </XStack>
          </YStack>

          {/* ─── Balance Summary ─── */}
          <YStack
            backgroundColor={colors.gray[50]}
            borderRadius={borderRadius.md}
            padding="$3"
            borderWidth={1}
            borderColor={colors.gray[200]}
            gap="$2"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={13} color={colors.gray[700]}>
                {t('feed.buyPoints.currentBalance')}
              </Text>
              <Text fontSize={14} fontWeight="600" color={colors.gray[900]}>
                {currentBalance} {t('feed.buyPoints.pointsUnit')}
              </Text>
            </XStack>
            <XStack
              justifyContent="space-between"
              alignItems="center"
              paddingTop="$2"
              borderTopWidth={1}
              borderTopColor={colors.gray[300]}
            >
              <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>
                {t('feed.buyPoints.afterPurchase')}
              </Text>
              <Text fontSize={16} fontWeight="700" color={colors.green[600]}>
                {afterPurchase} {t('feed.buyPoints.pointsUnit')}
              </Text>
            </XStack>
          </YStack>

          {/* ─── Payment Status Overlay ─── */}
          {(isProcessing || paymentStatus === 'success' || paymentStatus === 'error') && (
            <YStack
              backgroundColor="rgba(255,255,255,0.95)"
              borderRadius={borderRadius.lg}
              padding="$5"
              alignItems="center"
              justifyContent="center"
              gap="$3"
              borderWidth={1}
              borderColor={colors.gray[200]}
            >
              {isProcessing && (
                <>
                  <Spinner size="large" color={colors.green[600]} />
                  <Text fontSize={16} fontWeight="600" color={colors.gray[700]}>
                    {isMock ? 'Processing mock payment…' : 'Processing payment…'}
                  </Text>
                  <Text fontSize={13} color={colors.gray[500]}>
                    {isMock ? 'Simulating payment flow' : 'Please wait while we process your card'}
                  </Text>
                </>
              )}
              {paymentStatus === 'success' && (
                <>
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: colors.green[100],
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircle2 size={32} color={colors.green[600]} />
                  </View>
                  <Text fontSize={16} fontWeight="600" color={colors.green[700]}>
                    Payment successful!
                  </Text>
                  <Text fontSize={13} color={colors.gray[500]}>
                    {purchaseAmount} points added to your balance
                  </Text>
                </>
              )}
              {paymentStatus === 'error' && (
                <>
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: '#fef2f2',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AlertCircle size={32} color="#ef4444" />
                  </View>
                  <Text fontSize={16} fontWeight="600" color="#ef4444">
                    Payment failed
                  </Text>
                  <Text fontSize={13} color={colors.gray[500]} textAlign="center">
                    {(() => {
                      // Never expose internal errors to users
                      const msg = (paymentError || '').toLowerCase()
                      if (
                        msg.includes('edge function') ||
                        msg.includes('non-2xx') ||
                        msg.includes('jwt') ||
                        msg.includes('credentials') ||
                        msg.includes('supabase') ||
                        msg.includes('bundle') ||
                        msg.includes('relay') ||
                        msg.includes('fetch') ||
                        msg.includes('isolate')
                      ) {
                        return 'Something went wrong processing your payment. Please try again.'
                      }
                      return msg || 'An unexpected error occurred. Please try again.'
                    })()}
                  </Text>
                  <Button
                    backgroundColor={colors.gray[100]}
                    paddingVertical="$2"
                    paddingHorizontal="$4"
                    borderRadius={borderRadius.md}
                    pressStyle={{ backgroundColor: colors.gray[200] }}
                    onPress={resetPayment}
                  >
                    <Text color={colors.gray[700]} fontWeight="600" fontSize={14}>
                      Try Again
                    </Text>
                  </Button>
                </>
              )}
            </YStack>
          )}

          {/* ─── Action Buttons ─── */}
          {!isProcessing && paymentStatus !== 'success' && (
            <XStack gap="$3">
              <Button
                flex={1}
                backgroundColor={colors.gray[100]}
                paddingVertical="$2.5"
                borderRadius={borderRadius.md}
                pressStyle={{ backgroundColor: colors.gray[200] }}
                onPress={onClose}
                disabled={isProcessing}
              >
                <Text color={colors.gray[700]} fontWeight="600" fontSize={15}>
                  {t('feed.buyPoints.cancel')}
                </Text>
              </Button>
              <Button
                flex={1}
                backgroundColor={
                  purchaseAmount > 0 && isCardValid ? colors.green[600] : colors.gray[300]
                }
                paddingVertical="$2.5"
                borderRadius={borderRadius.md}
                pressStyle={
                  purchaseAmount > 0 && isCardValid
                    ? { backgroundColor: colors.green[700] }
                    : undefined
                }
                disabled={purchaseAmount <= 0 || !isCardValid}
                onPress={handleComplete}
              >
                <Text color="white" fontWeight="600" fontSize={15}>
                  {t('feed.buyPoints.complete')}
                </Text>
              </Button>
            </XStack>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  )
}
