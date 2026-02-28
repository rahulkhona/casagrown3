/**
 * BuyPointsStandaloneMockup - Points purchase with Stripe Elements integration
 *
 * Uses Stripe.js CardElement for PCI-compliant card collection.
 * Falls back to mock provider if NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set.
 */
'use client'
import { useState, useCallback, useMemo, useEffect } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Spinner } from 'tamagui'
import { Platform, TextInput, View, Text as RNText, TouchableOpacity } from 'react-native'
import {
  CreditCard,
  Lock,
  ShieldCheck,
  Info,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
} from '@tamagui/lucide-icons'
import { useRouter } from 'solito/navigation'
import { supabase, useAuth } from '../auth/auth-hook'
import { usePointsBalance } from '../../hooks/usePointsBalance'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { CardField, useStripe as useNativeStripe } from '@stripe/stripe-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Stripe imports (web only)
let loadStripe: any = null
let Elements: any = null
let CardElement: any = null
let useStripe: any = null
let useElements: any = null

if (Platform.OS === 'web') {
  try {
    const stripeJs = require('@stripe/stripe-js')
    const reactStripe = require('@stripe/react-stripe-js')
    loadStripe = stripeJs.loadStripe
    Elements = reactStripe.Elements
    CardElement = reactStripe.CardElement
    useStripe = reactStripe.useStripe
    useElements = reactStripe.useElements
  } catch (e) {
    console.warn('[BuyPoints] Stripe packages not available, using mock mode')
  }
}

// Configuration
const MIN_PURCHASE_AMOUNT = 500
const POINTS_PER_DOLLAR = 100
const SERVICE_FEE_POLICY = {
  rate: 0.029, // 2.9%
  fixedFee: 0.30, // $0.30
}

// Get the Stripe publishable key from env
const STRIPE_PK = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')
  : ''

// Stripe appearance theme to match app design
const stripeAppearance = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: colors.green[600],
    colorBackground: '#ffffff',
    colorText: colors.gray[900],
    colorDanger: '#ef4444',
    fontFamily: 'Inter, system-ui, sans-serif',
    spacingUnit: '4px',
    borderRadius: '12px',
    fontSizeBase: '15px',
  },
  rules: {
    '.Input': {
      border: `1px solid ${colors.gray[200]}`,
      boxShadow: 'none',
      padding: '12px 14px',
    },
    '.Input:focus': {
      border: `2px solid ${colors.green[500]}`,
      boxShadow: 'none',
    },
    '.Label': {
      fontWeight: '500',
    },
  },
}

export function BuyPointsStandaloneMockup({ t = (k: string) => k }: { t?: (key: string, opts?: any) => string }) {
  const isStripeModeAvailable = Platform.OS === 'web'
    ? !!(STRIPE_PK && loadStripe)
    : true // Native Stripe SDK handles its own keys globally via Provider

  const [stripePromise] = useState(() =>
    (isStripeModeAvailable && Platform.OS === 'web') ? loadStripe(STRIPE_PK) : null
  )

  if (isStripeModeAvailable && Platform.OS === 'web' && stripePromise) {
    return (
      <Elements stripe={stripePromise} options={{ appearance: stripeAppearance }}>
        <BuyPointsForm t={t} useStripePayment />
      </Elements>
    )
  }

  // Fallback: mock mode (no Stripe key configured on web), or native Stripe
  return <BuyPointsForm t={t} useStripePayment={isStripeModeAvailable} />
}

function BuyPointsForm({ t, useStripePayment }: { t: (key: string, opts?: any) => string; useStripePayment: boolean }) {
  const [pointsInput, setPointsInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [cardComplete, setCardComplete] = useState(false)
  const [nativeCardReady, setNativeCardReady] = useState(false)

  // Card fields
  const [cardName, setCardName] = useState('')

  const { user } = useAuth()
  const { refetch: refetchBalance, adjustBalance } = usePointsBalance(user?.id)

  const stripe = useStripePayment && useStripe ? useStripe() : null
  const elements = useStripePayment && useElements ? useElements() : null
  const { confirmPayment } = useNativeStripe()

  // Derived calculations
  const numericPoints = parseInt(pointsInput.replace(/\D/g, ''), 10) || 0
  const baseCost = numericPoints / POINTS_PER_DOLLAR
  
  const appliesFee = numericPoints > 0 && numericPoints < MIN_PURCHASE_AMOUNT
  const serviceFee = appliesFee 
    ? (baseCost * SERVICE_FEE_POLICY.rate) + SERVICE_FEE_POLICY.fixedFee 
    : 0
  
  const totalCost = baseCost + serviceFee

  const router = useRouter()

  const canSubmit = useMemo(() => {
    if (numericPoints <= 0 || isProcessing || isSuccess) return false
    if (!cardName.trim()) return false
    if (useStripePayment && Platform.OS === 'web') return cardComplete
    if (useStripePayment && Platform.OS !== 'web') return nativeCardReady
    return false // Mock deprecated
  }, [numericPoints, isProcessing, isSuccess, useStripePayment, cardComplete, nativeCardReady, cardName])

  const handlePurchase = async () => {
    if (numericPoints <= 0) return
    setIsProcessing(true)
    setErrorMessage(null)

    try {
      const amountCents = Math.round(totalCost * 100)
      const serviceFeeCents = Math.round(serviceFee * 100)
      
      if (useStripePayment && stripe && elements) {
        // ─── STRIPE MODE ───────────────────────────────────────────
        // 1. Create PaymentIntent via backend
        const { data: intentData, error: intentError } = await supabase.functions.invoke(
          'create-payment-intent',
          {
            body: {
              amountCents,
              pointsAmount: numericPoints,
              serviceFeeCents,
              provider: 'stripe'
            }
          }
        )

        if (intentError) throw intentError
        if (intentData?.error) throw new Error(intentData.error)

        const { clientSecret, transactionId } = intentData

        // 2. Confirm payment with Stripe.js
        const cardElement = elements.getElement(CardElement)
        if (!cardElement) throw new Error('Card element not found')

        const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
          clientSecret,
          { 
            payment_method: { 
              card: cardElement,
              billing_details: { name: cardName.trim() }
            } 
          }
        )

        if (stripeError) {
          // Don't throw for expected card errors — show inline error instead
          setErrorMessage(stripeError.message || 'Payment failed. Please try again.')
          setIsProcessing(false)
          return
        }

        if (paymentIntent?.status !== 'succeeded') {
          setErrorMessage(`Payment status: ${paymentIntent?.status}. Please try again.`)
          setIsProcessing(false)
          return
        }

        // 3. Confirm payment on backend (credits points)
        const { data: confirmData, error: confirmError } = await supabase.functions.invoke(
          'confirm-payment',
          { body: { paymentTransactionId: transactionId } }
        )

        if (confirmError) throw confirmError
        if (confirmData?.error) throw new Error(confirmData.error)

      } else if (useStripePayment && Platform.OS !== 'web') {
        // ─── NATIVE STRIPE MODE ────────────────────────────────────
        // 1. Create PaymentIntent via backend
        const { data: intentData, error: intentError } = await supabase.functions.invoke(
          'create-payment-intent',
          {
            body: {
              amountCents,
              pointsAmount: numericPoints,
              serviceFeeCents,
              provider: 'stripe'
            }
          }
        )

        if (intentError) throw intentError
        if (intentData?.error) throw new Error(intentData.error)

        // 2. Confirm payment natively with CardField
        const { error: stripeError } = await confirmPayment(intentData.clientSecret, {
          paymentMethodType: 'Card',
          paymentMethodData: {
            billingDetails: {
              name: cardName.trim(),
            }
          }
        })

        if (stripeError) {
          setErrorMessage(stripeError.message || 'Payment failed. Please try again.')
          setIsProcessing(false)
          return
        }

        // 3. Confirm payment on backend
        const { data: confirmData, error: confirmError } = await supabase.functions.invoke(
          'confirm-payment',
          { body: { paymentTransactionId: intentData.transactionId } }
        )

        if (confirmError) throw confirmError
        if (confirmData?.error) throw new Error(confirmData.error)

      } else {
        throw new Error('Payment method unavailable.')
      }

      // Success!
      setIsSuccess(true)
      
      // Optimistic update + DB refetch
      adjustBalance(numericPoints)
      await new Promise(r => setTimeout(r, 1000))
      await refetchBalance()
      setTimeout(() => refetchBalance(), 2000)
        
      setTimeout(() => {
        setIsSuccess(false)
        router.back()
      }, 2000)

    } catch (err) {
      console.error('Purchase failed', err)
      const msg = err instanceof Error ? err.message : 'Payment processing failed. Please try again.'
      setErrorMessage(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const insets = useSafeAreaInsets()

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.gray[50] }}
      contentContainerStyle={{ alignItems: 'center', padding: 20, paddingBottom: (insets?.bottom || 20) + 40 }}
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
        {/* Cancel / Back */}
        <XStack alignItems="center" marginBottom="$1">
          {Platform.OS === 'web' ? (
            <button
              onClick={() => router.back()}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 14, color: colors.gray[500], padding: 0,
              }}
            >
              <ArrowLeft size={16} color={colors.gray[500]} />
              Back
            </button>
          ) : (
            <Button unstyled onPress={() => router.back()} flexDirection="row" alignItems="center" gap="$1">
              <ArrowLeft size={16} color={colors.gray[500]} />
              <Text fontSize={14} color={colors.gray[500]}>Back</Text>
            </Button>
          )}
        </XStack>

        {/* Header (Hidden on Web as it's redundant with the page layout) */}
        {Platform.OS !== 'web' && (
          <YStack gap="$1">
            <Text fontSize={22} fontWeight="700" color={colors.gray[900]}>
              Buy Points
            </Text>
            <Text fontSize={14} color={colors.gray[500]}>
              Add points to your balance instantly using your credit card.
            </Text>
          </YStack>
        )}

        {/* Points Input */}
        <YStack gap="$2" marginTop="$2">
          <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
            How many points do you want to buy?
          </Text>
          <XStack
            borderWidth={1}
            borderColor={colors.gray[200]}
            borderRadius={borderRadius.lg}
            alignItems="center"
            paddingHorizontal="$3"
            backgroundColor="white"
            height={52}
          >
            <TextInput
              style={{
                flex: 1,
                fontSize: 16,
                paddingVertical: 12,
                paddingHorizontal: 8,
                fontWeight: '400',
                color: colors.gray[900],
                backgroundColor: 'white',
                ...(Platform.OS === 'web' ? { outlineStyle: 'none', background: 'white' } : {}),
              } as any}
              placeholder="0"
              placeholderTextColor={colors.gray[400]}
              value={pointsInput}
              onChangeText={(text) => setPointsInput(text.replace(/\D/g, ''))}
              keyboardType="number-pad"
            />
            <Text fontSize={14} fontWeight="400" color={colors.gray[500]}>
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

        {/* Payment Details */}
        <YStack gap="$3" marginTop="$2" opacity={numericPoints > 0 ? 1 : 0.5}>
          <XStack alignItems="center" gap="$2">
            <CreditCard size={16} color={colors.gray[700]} />
            <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
              Payment Details
            </Text>
            {useStripePayment && (
              <YStack backgroundColor={colors.green[100]} paddingHorizontal={8} paddingVertical={2} borderRadius={10}>
                <Text fontSize={10} fontWeight="600" color={colors.green[700]}>LIVE</Text>
              </YStack>
            )}
            {!useStripePayment && (
              <YStack backgroundColor={colors.amber[100]} paddingHorizontal={8} paddingVertical={2} borderRadius={10}>
                <Text fontSize={10} fontWeight="600" color={colors.amber[700]}>MOCK</Text>
              </YStack>
            )}
          </XStack>

          {/* Name Field (Shared) */}
          <XStack borderWidth={1} borderColor={colors.gray[200]} borderRadius={borderRadius.lg} alignItems="center" paddingHorizontal="$3" backgroundColor="white" height={52} opacity={numericPoints > 0 ? 1 : 0.5}>
            <TextInput
              style={{
                flex: 1, fontSize: 16, paddingVertical: 14, paddingHorizontal: 8,
                color: colors.gray[900],
                backgroundColor: 'transparent',
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
              } as any}
              placeholder="Name on Card (Required)"
              placeholderTextColor={colors.gray[400]}
              value={cardName}
              onChangeText={setCardName}
              autoCapitalize="words"
              editable={numericPoints > 0 && !isProcessing}
            />
          </XStack>

          {/* Stripe CardElement or Mock fields */}
          {useStripePayment && Platform.OS === 'web' ? (
            <YStack gap="$2">
              <div style={{
                border: `1px solid ${colors.gray[200]}`,
                borderRadius: borderRadius.lg,
                padding: '14px 16px',
                backgroundColor: 'white',
                transition: 'border-color 0.15s',
              }}>
                {CardElement && (
                  <CardElement
                    options={{
                      style: {
                        base: {
                          fontSize: '16px',
                          fontFamily: 'Inter, system-ui, sans-serif',
                          color: colors.gray[900],
                          '::placeholder': { color: colors.gray[400] },
                        },
                        invalid: { color: '#ef4444' },
                      },
                      hidePostalCode: true,
                    }}
                    onChange={(e: any) => {
                      setCardComplete(e.complete)
                      if (e.error) setErrorMessage(e.error.message)
                      else setErrorMessage(null)
                    }}
                  />
                )}
              </div>
              <XStack alignItems="center" gap="$2" paddingTop="$1">
                <Text fontSize={11} fontWeight="600" color={colors.green[600]}>
                  Stripe Sandbox
                </Text>
                <Text fontSize={11} color={colors.gray[400]}>•</Text>
                <Text fontSize={11} color={colors.gray[400]}>
                  Use 4242 4242 4242 4242 for test payments
                </Text>
              </XStack>
            </YStack>
          ) : useStripePayment && Platform.OS !== 'web' ? (
            // Native Stripe CardField
            <YStack gap="$3">
              <View style={{
                borderWidth: 1,
                borderColor: colors.gray[200],
                borderRadius: borderRadius.lg,
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
                  }}
                  cardStyle={{
                    backgroundColor: '#FFFFFF',
                    textColor: colors.gray[900],
                    placeholderColor: colors.gray[400],
                    fontSize: 16,
                    borderRadius: borderRadius.lg,
                  }}
                />
              </View>
            </YStack>
          ) : null}

          <XStack alignItems="center" gap="$1" paddingTop="$1">
            <ShieldCheck size={14} color={colors.gray[400]} />
            <Text fontSize={11} color={colors.gray[400]}>
              {useStripePayment ? 'Payments securely processed by Stripe' : 'Mock payment — no real charges'}
            </Text>
          </XStack>
        </YStack>

        {/* Error Message */}
        {errorMessage && (
          <XStack
            backgroundColor="#fef2f2"
            borderWidth={1}
            borderColor="#fecaca"
            borderRadius={borderRadius.lg}
            padding="$3"
            gap="$2"
            alignItems="flex-start"
          >
            <AlertCircle size={16} color="#ef4444" style={{ marginTop: 2 }} />
            <Text fontSize={13} color="#dc2626" flex={1}>
              {errorMessage}
            </Text>
          </XStack>
        )}

        {/* Action Button */}
        {Platform.OS === 'web' ? (
          <button
            onClick={handlePurchase}
            disabled={!canSubmit}
            style={{
              marginTop: 16,
              padding: '14px 0',
              borderRadius: 24,
              border: 'none',
              cursor: canSubmit ? 'pointer' : 'default',
              backgroundColor: isSuccess
                ? colors.green[600]
                : canSubmit
                  ? colors.green[600]
                  : colors.gray[300],
              color: canSubmit || isSuccess ? 'white' : colors.gray[500],
              fontSize: 16,
              fontWeight: 700,
              width: '100%',
              textAlign: 'center' as const,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'background-color 0.15s',
            }}
          >
            {isProcessing && <Spinner size="small" color="white" />}
            {isSuccess && <CheckCircle2 size={18} color="white" />}
            {isProcessing ? 'Processing...' : isSuccess ? 'Purchase Successful!' : `Pay $${totalCost.toFixed(2)}`}
          </button>
        ) : (
          <TouchableOpacity
            style={{
              marginTop: 16,
              backgroundColor: canSubmit ? colors.green[600] : colors.gray[300],
              paddingVertical: 14,
              borderRadius: 24,
              minHeight: 50,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
            activeOpacity={0.7}
            disabled={!canSubmit || isProcessing}
            onPress={handlePurchase}
          >
            {!isProcessing && isSuccess && <CheckCircle2 size={18} color="white" />}
            <RNText style={{ color: canSubmit ? "white" : colors.gray[500], fontWeight: '700', fontSize: 16 }}>
              {isProcessing ? 'Processing...' : isSuccess ? 'Purchase Successful!' : `Pay $${totalCost.toFixed(2)}`}
            </RNText>
          </TouchableOpacity>
        )}
      </YStack>
      
      {/* Physical spacer block to prevent iOS scroll clipping */}
      <View style={{ height: (insets?.bottom || 20) + 80, width: '100%' }} />
    </ScrollView>
  )
}
