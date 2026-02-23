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

import { useState, useCallback, useEffect, useRef } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Spinner } from 'tamagui'
import { Platform, TextInput, TouchableOpacity, View, useWindowDimensions, Text as RNText } from 'react-native'
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
import { CardField, useStripe } from '@stripe/stripe-react-native'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { usePaymentService } from '../../hooks/usePaymentService'
import { isMockPaymentMode, getPaymentMode } from './paymentService'
import { supabase } from '../auth/auth-hook'

// Lazy import StripeCardForm (web only)
let StripeCardForm: any = null
let StripeCardFormHandle: any = null
if (Platform.OS === 'web') {
  try {
    const mod = require('./StripeCardForm')
    StripeCardForm = mod.StripeCardForm
  } catch {
    // Not available
  }
}

const isStripeWebMode = Platform.OS === 'web' && getPaymentMode() === 'stripe' && StripeCardForm != null

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
  const { height: windowHeight } = useWindowDimensions()
  // The deficit: how many points the user needs
  const deficit = Math.max(suggestedAmount, 0)

  // Recommended amount: max(minimum, deficit), round up to nearest 50
  const recommendedAmount = Math.ceil(Math.max(minimumPurchase, deficit) / 50) * 50
  // Exact amount: just the deficit, rounded up to nearest 10
  const exactAmount = Math.ceil(deficit / 10) * 10

  // Do we need two choices? Only when deficit < minimum (i.e. recommended > exact)
  const hasTwoOptions = exactAmount > 0 && exactAmount < recommendedAmount

  const [selectedOption, setSelectedOption] = useState<PurchaseOption>('recommended')

  // Card fields
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

  // Stripe Elements (web only)
  const stripeFormRef = useRef<any>(null)
  const [stripeCardReady, setStripeCardReady] = useState(false)
  const [stripeError, setStripeError] = useState<string | null>(null)

  // In mock mode, skip card validation
  // In stripe web mode, use Stripe Elements validation
  // In native mode, we use Stripe's CardField validation flag
  const [nativeCardReady, setNativeCardReady] = useState(false)
  const isCardValid = isStripeWebMode
    ? stripeCardReady
    : nativeCardReady

  const { initPaymentSheet, presentPaymentSheet, confirmPayment } = useStripe()



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

  // Stripe payment state (separate from mock flow's paymentStatus)
  const [stripePaymentError, setStripePaymentError] = useState<string | null>(null)
  const [stripeProcessing, setStripeProcessing] = useState(false)

  const handleComplete = useCallback(async () => {
    if (purchaseAmount <= 0) return
    const totalCents = Math.round(totalCost * 100)
    const feeCents = Math.round(serviceFee * 100)

    if (isStripeWebMode && stripeFormRef.current) {
      // Stripe Elements flow
      setStripePaymentError(null)
      setStripeProcessing(true)
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          'create-payment-intent',
          {
            body: {
              amountCents: totalCents,
              pointsAmount: purchaseAmount,
              serviceFeeCents: feeCents,
              provider: 'stripe',
            },
          },
        )

        if (fnError || !data?.clientSecret) {
          throw new Error(fnError?.message || 'Failed to create payment intent')
        }

        // Confirm with Stripe Elements
        const result = await stripeFormRef.current.confirmPayment(data.clientSecret)

        if (!result.success) {
          throw new Error(result.error || 'Payment failed')
        }

        // Credit points server-side
        await supabase.functions.invoke('confirm-payment', {
          body: { paymentTransactionId: data.transactionId },
        })

        // Trigger success
        setStripeProcessing(false)
        onComplete(purchaseAmount)
      } catch (err: any) {
        console.error('[STRIPE ELEMENTS]', err)
        setStripePaymentError(err.message || 'Payment failed. Please try again.')
        setStripeProcessing(false)
      }
    } else {
      // ── Native Stripe Flow ──
      setStripePaymentError(null)
      setStripeProcessing(true)
      try {
        // 1. Create Payment Intent
        const { data, error: fnError } = await supabase.functions.invoke(
          'create-payment-intent',
          {
            body: {
              amountCents: totalCents,
              pointsAmount: purchaseAmount,
              serviceFeeCents: feeCents,
              provider: 'stripe',
            },
          },
        )

        if (fnError || !data?.clientSecret) {
          throw new Error(fnError?.message || 'Failed to create payment intent')
        }

        // 2. Confirm Payment using Native SDK context (CardField)
        const { error: stripeErr } = await confirmPayment(data.clientSecret, {
          paymentMethodType: 'Card',
          paymentMethodData: {
            billingDetails: {
              name: cardName || undefined,
            }
          }
        })

        if (stripeErr) {
          throw new Error(stripeErr.message || 'Payment failed')
        }

        // 3. Confirm with our backend to finalize internal balances
        await supabase.functions.invoke('confirm-payment', {
          body: { paymentTransactionId: data.transactionId },
        })

        // Success!
        setStripeProcessing(false)
        onComplete(purchaseAmount)
      } catch (err: any) {
        console.error('[STRIPE NATIVE]', err)
        setStripePaymentError(err.message || 'Payment failed. Please try again.')
        setStripeProcessing(false)
      }
    }
  }, [purchaseAmount, totalCost, serviceFee, confirmPayment, cardName])

  if (!visible) return null

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="rgba(0,0,0,0.5)"
      alignItems="center"
      justifyContent="center"
      zIndex={200}
      padding="$4"
    >
      <YStack
        backgroundColor="white"
        borderRadius={borderRadius.xl}
        width="100%"
        maxWidth={440}
        maxHeight={windowHeight - (Platform.OS === 'web' ? 40 : 160)}
        shadowColor={shadows.lg.color}
        shadowOffset={shadows.lg.offset}
        shadowOpacity={0.15}
        shadowRadius={shadows.lg.radius}
        overflow="hidden"
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator
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

            {isStripeWebMode ? (
              /* ── Stripe Elements (web) ── */
              <YStack gap="$2">
                <View style={{
                  borderWidth: 1,
                  borderColor: stripeError ? '#dc2626' : colors.gray[300],
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: 'white',
                }}>
                  <StripeCardForm
                    ref={stripeFormRef}
                    onReady={setStripeCardReady}
                    onError={setStripeError}
                  />
                </View>
                {stripeError && (
                  <Text fontSize={12} color="#dc2626">{stripeError}</Text>
                )}
                <XStack alignItems="center" gap="$1" paddingTop="$1">
                  <ShieldCheck size={14} color={colors.gray[400]} />
                  <Text fontSize={11} color={colors.gray[400]}>
                    {t('feed.buyPoints.securedByStripe')}
                  </Text>
                </XStack>
              </YStack>
            ) : (
              /* ── Stripe Native CardField ── */
              <YStack gap="$3">
                <View style={{
                  borderWidth: 1,
                  borderColor: stripePaymentError ? '#dc2626' : colors.gray[300],
                  borderRadius: borderRadius.md,
                  backgroundColor: 'white',
                  overflow: 'hidden'
                }}>
                  <CardField
                    postalCodeEnabled={false}
                    onCardChange={(cardDetails) => {
                      setNativeCardReady(cardDetails.complete)
                    }}
                    style={{
                      width: '100%',
                      height: 56,
                      backgroundColor: 'transparent'
                    }}
                    cardStyle={{
                      backgroundColor: '#FFFFFF',
                      textColor: colors.gray[900],
                      placeholderColor: colors.gray[400],
                      fontSize: 16,
                      borderRadius: borderRadius.md,
                    }}
                  />
                </View>

                {/* Name on Card (optional for Stripe, but good for UI) */}
                <XStack
                  borderWidth={1}
                  borderColor={colors.gray[300]}
                  borderRadius={borderRadius.md}
                  alignItems="center"
                  paddingHorizontal="$3"
                  backgroundColor="white"
                  height={52}
                >
                  <TextInput
                    style={{
                      flex: 1,
                      fontSize: 16,
                      paddingVertical: 14,
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

                {stripePaymentError && (
                  <Text fontSize={12} color="#dc2626">{stripePaymentError}</Text>
                )}

                {/* Stripe badge */}
                <XStack alignItems="center" gap="$1" paddingTop="$1">
                  <ShieldCheck size={14} color={colors.gray[400]} />
                  <Text fontSize={11} color={colors.gray[400]}>
                    {t('feed.buyPoints.securedByStripe')}
                  </Text>
                </XStack>
              </YStack>
            )}
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
          {(isProcessing || stripeProcessing || paymentStatus === 'success' || paymentStatus === 'error' || stripePaymentError) && (
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
              {(isProcessing || stripeProcessing) && paymentStatus !== 'error' && !stripePaymentError && (
                <>
                  <Spinner size="large" color={colors.green[600]} />
                  <Text fontSize={16} fontWeight="600" color={colors.gray[700]}>
                    Processing payment...
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
              {(paymentStatus === 'error' || stripePaymentError) && (
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
                      const msg = (stripePaymentError || paymentError || '').toLowerCase()
                      if (
                        msg.includes('edge function') ||
                        msg.includes('non-2xx') ||
                        msg.includes('jwt') ||
                        msg.includes('credentials') ||
                        msg.includes('supabase') ||
                        msg.includes('bundle') ||
                        msg.includes('relay') ||
                        msg.includes('fetch') ||
                        msg.includes('isolate') ||
                        msg.includes('name resolution')
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
                    onPress={() => { resetPayment(); setStripePaymentError(null) }}
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
          {!isProcessing && !stripeProcessing && paymentStatus !== 'success' && !stripePaymentError && (
            <XStack gap="$3">
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: colors.gray[100],
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 50,
                }}
                activeOpacity={0.7}
                onPress={onClose}
                disabled={isProcessing}
              >
                <RNText style={{ color: colors.gray[700], fontWeight: '600', fontSize: 15 }}>
                  {t('feed.buyPoints.cancel')}
                </RNText>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: purchaseAmount > 0 && isCardValid ? colors.green[600] : colors.gray[300],
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 50,
                }}
                activeOpacity={0.7}
                disabled={purchaseAmount <= 0 || !isCardValid}
                onPress={handleComplete}
              >
                <RNText style={{ color: 'white', fontWeight: '600', fontSize: 15 }}>
                  {t('feed.buyPoints.complete')}
                </RNText>
              </TouchableOpacity>
            </XStack>
          )}
        </ScrollView>
      </YStack>
    </YStack>
  )
}
