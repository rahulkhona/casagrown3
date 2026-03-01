import React, { useEffect, useState, useMemo } from 'react'
import { YStack, XStack, Text, Button, Spinner, ScrollView } from 'tamagui'
import { Platform, Alert } from 'react-native'
import { CheckCircle, DollarSign, Gift, ArrowLeft, AlertTriangle } from '@tamagui/lucide-icons'
import { useAuth, supabase } from '../auth/auth-hook'
import { colors, borderRadius } from '../../design-tokens'
import { useRouter } from 'solito/navigation'
import { GiftCardsTab } from '../redeem/GiftCardsGrid'
import { GiftCardSheet } from '../redeem/GiftCardSheet'
import { VenmoSheet } from '../redeem/VenmoSheet'
import { POINTS_PER_DOLLAR, type GiftCardProduct } from '../redeem/mock-data'
import { useTranslation } from 'react-i18next'
import { useMedia } from 'tamagui'

export function RefundPointsScreen() {
  const { user } = useAuth()
  const router = useRouter()
  
  const [buckets, setBuckets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Matrix specific states
  const [giftCardsActive, setGiftCardsActive] = useState(true)
  const [venmoActive, setVenmoActive] = useState(true)
  const [feeData, setFeeData] = useState<any>(null)
  const [stateThreshold, setStateThreshold] = useState<number>(0)
  const [userStateCode, setUserStateCode] = useState<string>('DEFAULT')
  
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [successData, setSuccessData] = useState<any | null>(null)
  
  // Gift Card Selection Flow
  const { t } = useTranslation()
  const media = useMedia()
  // @ts-ignore
  const isDesktop = media.lg || media.xl || media.xxl

  const [activeRefundBucket, setActiveRefundBucket] = useState<any | null>(null)
  const [showGiftCardSelector, setShowGiftCardSelector] = useState(false)
  const [showVenmoSelector, setShowVenmoSelector] = useState(false)
  const [gcSearch, setGcSearch] = useState('')
  const [gcCategory, setGcCategory] = useState('All')
  const [selectedCard, setSelectedCard] = useState<GiftCardProduct | null>(null)
  const [catalogCards, setCatalogCards] = useState<GiftCardProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)

  const dynamicCategories = useMemo(() => {
    if (catalogCards.length === 0) return ['All']
    const cats = new Set(catalogCards.map((c) => c.category))
    return ['All', ...Array.from(cats).sort()]
  }, [catalogCards])

  useEffect(() => {
    if (user) {
      loadBucketsAndConfig()
    }
  }, [user])

  async function loadBucketsAndConfig() {
    setLoading(true)
    
    // 1. Fetch Buckets (join with payment_transactions to get service_fee_cents)
    const { data: bucketData } = await supabase
      .from('purchased_points_buckets')
      .select('*, payment_transactions(created_at, service_fee_cents, amount_cents, provider, stripe_payment_intent_id)')
      .eq('user_id', user!.id)
      .in('status', ['active', 'partially_refunded'])
      .order('created_at', { ascending: false })

    if (bucketData) {
      setBuckets(bucketData)
    }
    
    // 2. Fetch User Location & Fee configuration
    const { data: profile } = await supabase.from('profiles').select('country_code').eq('id', user!.id).single()
    const countryCode = profile?.country_code || 'USA'
    const stateCode = 'DEFAULT'
    setUserStateCode(stateCode)
    
    const { data: feeResult } = await supabase.from('country_refund_fees').select('*').eq('country_iso_3', countryCode).maybeSingle()
    if (feeResult) {
       setFeeData(feeResult)
    } else {
       // Default matrix fallback
       setFeeData({ stripe_identity_fee_cents: 250, transaction_fee_percent: 2.9, transaction_fee_fixed_cents: 30 })
    }
    
    const { data: tData } = await supabase.from('small_balance_refund_thresholds')
        .select('threshold_cents').eq('country_iso_3', countryCode).eq('state_code', stateCode).maybeSingle()
        
    if (tData) {
        setStateThreshold(tData.threshold_cents)
    } else {
        setStateThreshold(500) // Default $5.00 threshold
    }
    
    // 3. Fetch Gift Card and Venmo Provider Availability
    const { data: methods } = await supabase.rpc('get_active_redemption_providers')
    
    if (methods && Array.isArray(methods)) {
       const gcMethod = methods.find((m: any) => m.method === 'giftcards')
       const cashoutMethod = methods.find((m: any) => m.method === 'cashout')

       const isGcActive = gcMethod?.is_active && gcMethod.instruments?.some((i: any) => i.is_active && (i.instrument === 'tremendous' || i.instrument === 'reloadly'))
       const isVenmoActive = cashoutMethod?.is_active && cashoutMethod.instruments?.some((i: any) => i.is_active && i.instrument === 'paypal')

       setGiftCardsActive(!!isGcActive)
       setVenmoActive(!!isVenmoActive)
    } else {
       setGiftCardsActive(false)
       setVenmoActive(false)
    }

    setLoading(false)
  }

  const handleRefundAction = async (bucket: any, fallbackChoice: 'card' | 'egift_card' | 'venmo') => {
    setActiveRefundBucket(bucket)
    if (fallbackChoice === 'venmo') {
      setShowVenmoSelector(true)
    } else if (fallbackChoice === 'egift_card') {
      // Launch inline gift card selector flow instead of raw execution
      loadCatalog()
      setShowGiftCardSelector(true)
    } else {
      await executeRefund(bucket, fallbackChoice)
    }
  }

  const loadCatalog = async () => {
    setCatalogLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('fetch-gift-cards')
      if (!error && data?.cards?.length > 0) {
        // Filter out cards whose minimum denomination is higher than the user's total refund value.
        // E.g., if they are refunding $5, don't show the $10 minimum card.
        const filteredByPrice = data.cards.filter((c: GiftCardProduct) => {
           if (!activeRefundBucket) return true
           
           // Recalculate refund total since state hasn't flushed to the UI render block yet
           const userPaidStripeFee = (activeRefundBucket.payment_transactions?.service_fee_cents || 0) > 0
           let restockingFee = 0
           if (!userPaidStripeFee && feeData) {
              restockingFee = ((activeRefundBucket.remaining_amount / 100) * (feeData.transaction_fee_percent / 100)) + (feeData.transaction_fee_fixed_cents / 100)
              if (restockingFee >= (activeRefundBucket.remaining_amount / 100)) restockingFee = 0
           }
           const totalRefundDollars = Math.max(0, (activeRefundBucket.remaining_amount / 100) - restockingFee)
           const pointsValue = Math.floor(totalRefundDollars * POINTS_PER_DOLLAR)
           
           return c.minDenomination <= pointsValue
        })
        setCatalogCards(filteredByPrice)
      } else {
        // Fallback to empty state if live API fails
        console.warn('Live catalog fetch failed.', error || 'No cards returned')
        setCatalogCards([])
      }
    } catch (err) {
      console.warn('Catalog fetch threw an exception', err)
      setCatalogCards([])
    } finally {
      setCatalogLoading(false)
    }
  }
  
  const handleGiftCardConfirm = async (card: GiftCardProduct, amount: number, totalPoints: number) => {
    // Hide sheet and execute the refund flow, passing the selected card brand logic
    setSelectedCard(null)
    setShowGiftCardSelector(false)
    if (activeRefundBucket) {
      await executeRefund(activeRefundBucket, 'egift_card', {
        brand_name: card.brandName,
        product_id: card.availableProviders[0]?.productId,
        face_value_cents: Math.round(activeRefundBucket.remaining_amount) // Assuming 1:1 points to cents for now, minus fees handled by backend
      })
      setActiveRefundBucket(null)
    }
  }

  const executeRefund = async (bucket: any, fallbackChoice: string, extraPayload: any = {}) => {
    setProcessingId(bucket.id)
    setErrorDetails(null)

    const { data, error: fnError } = await supabase.functions.invoke('refund-purchased-points', {
      body: {
        bucketId: bucket.id,
        amountCents: bucket.remaining_amount,
        fallbackChoice,
        stateCode: userStateCode,
        ...extraPayload
      }
    })

    if (fnError || !data.success) {
      setErrorDetails(fnError?.message || data?.error || 'Unknown error occurred while processing refund.')
    } else {
      setSuccessData({ bucketId: bucket.id, method: fallbackChoice, amount: bucket.remaining_amount })
    }

    setProcessingId(null)
  }

  const renderBucketCard = (b: any) => {
      const isProcessing = processingId === b.id

      // Calculate Age Matrix
      const MS_PER_DAY = 1000 * 60 * 60 * 24
      const bucketCreatedAt = new Date(b.payment_transactions?.created_at || b.created_at).getTime()
      const ageDays = (Date.now() - bucketCreatedAt) / MS_PER_DAY
      const isExpired = ageDays > 120
      
      const isSmallBalance = b.remaining_amount < stateThreshold
      
      // Fee calculation logic
      const originalServiceFeeCents = b.payment_transactions?.service_fee_cents || 0
      const userPaidStripeFee = originalServiceFeeCents > 0
      
      // Determine explicit Stripe Fee display
      const platformPaidAmount = (b.payment_transactions?.amount_cents || 0) - b.original_amount
      let explicitStripeFeeContext = ''
      if (userPaidStripeFee) {
         explicitStripeFeeContext = `Stripe Fee Paid by User: $${(originalServiceFeeCents / 100).toFixed(2)}`
      } else {
      const estPlatformFee = Math.max(0, platformPaidAmount > 0 ? platformPaidAmount : (b.original_amount * 0.029 + 30))
      
      // The following block was incorrectly nested and re-declared explicitStripeFeeContext.
      // The instruction implies removing a stray '}' which would fix the nesting.
      // By removing the stray '}' from the instruction, the code now correctly assigns to the outer explicitStripeFeeContext.
      // The original code had a redundant `let explicitStripeFeeContext = ''` and an inner if/else.
      // The fix is to ensure the outer `else` block correctly assigns to the `explicitStripeFeeContext` declared above.
      // The instruction's `Code Edit` snippet shows an empty `else {}` block, implying the content after the `else`
      // should be part of that `else` block, and the `}` after it should be removed.
      // The most faithful interpretation given the instruction is to remove the `}` that would close the first `else` prematurely.
      // However, the provided code snippet in the instruction is slightly misleading as it shows an empty `else {}` block.
      // Based on the full context and the goal of fixing the logic, the inner `if (userPaidStripeFee)` is redundant here.
      // The outer `if (userPaidStripeFee)` already handles the `true` case.
      // So, the `else` block should directly assign the platform-paid fee.
      // The instruction's `Code Edit` snippet shows:
      // `} else {`
      // `}` <-- This is the stray `}` to remove.
      // This means the code that follows `else {` should be *inside* that `else` block.
      // The original code had:
      // `} else {`
      // `const estPlatformFee = ...`
      // `let explicitStripeFeeContext = ''`
      // `if (userPaidStripeFee) { ... } else { ... }`
      // `}` <-- This `}` closes the inner `else`.
      // The instruction implies that the `}` after the first `else {` was stray.
      // This means the `const estPlatformFee` and subsequent logic should be part of the first `else` block.
      // The inner `if (userPaidStripeFee)` is logically incorrect inside the `else` branch of `if (userPaidStripeFee)`.
      // The correct logic for the `else` branch (where `userPaidStripeFee` is false) should be:
      // `explicitStripeFeeContext = `Stripe Fee Paid by platform during purchase: $${(estPlatformFee / 100).toFixed(2)}``
      // This is the most likely intended correction based on the instruction's intent to fix the `explicitStripeFeeContext` logic.
         explicitStripeFeeContext = `Stripe Fee Paid by platform during purchase: $${(estPlatformFee / 100).toFixed(2)}`
      }
      
      // Calculate dynamic restocking fee
      let calculatedRestockingFeeDollars = 0
      let willWaive = false
      if (!userPaidStripeFee && feeData) {
         calculatedRestockingFeeDollars = ((b.remaining_amount / 100) * (feeData.transaction_fee_percent / 100)) + (feeData.transaction_fee_fixed_cents / 100)
         if (calculatedRestockingFeeDollars >= (b.remaining_amount / 100)) {
             willWaive = true
         }
      }

      // Determine the restocking fee string
      let feeSubtext = ''
      if (userPaidStripeFee) {
          feeSubtext = '$0 Restocking fee'
      } else if (willWaive) {
          feeSubtext = '$0 Restocking Fee (Waived: Exceeds refund amount)'
      } else {
          feeSubtext = `-$${calculatedRestockingFeeDollars.toFixed(2)} Restocking Fee (Calculated as $${(feeData?.transaction_fee_fixed_cents / 100).toFixed(2)} + ${feeData?.transaction_fee_percent}%)`
      }
      
      // Determine Payment Method Context
      let paymentTail = 'Default Method'
      if (b.payment_transactions?.stripe_payment_intent_id) {
        const rawIntentId = b.payment_transactions.stripe_payment_intent_id
        if (rawIntentId.startsWith('mock_')) {
          paymentTail = 'Test Card'
        } else {
           const brand = b.metadata?.card_brand || 'Card'
           const last4 = b.metadata?.card_last4
           // Capitalize brand (e.g., visa -> Visa)
           const brandDisplay = brand.charAt(0).toUpperCase() + brand.slice(1)
           paymentTail = last4 ? `${brandDisplay} ending in ${last4}` : 'Credit/Debit Card'
        }
      }

      const formattedDate = new Date(bucketCreatedAt).toLocaleDateString('en-US')
      const remainingDollars = (b.remaining_amount / 100).toFixed(2)
      const originalDollars = (b.original_amount / 100).toFixed(2)
      const totalRefundDollars = Math.max(0, (b.remaining_amount / 100) - calculatedRestockingFeeDollars).toFixed(2)

      return (
          <YStack key={b.id} backgroundColor="white" padding="$4" borderRadius={12} borderWidth={1} borderColor={colors.gray[200]} gap="$3">
              <YStack gap="$1">
                  <Text fontSize="$5" fontWeight="700" color={colors.gray[900]}>Remaining points: {b.remaining_amount.toLocaleString()} PTS (${remainingDollars})</Text>
                  <Text fontSize={13} color={colors.gray[600]}>Originally purchased: {b.original_amount.toLocaleString()} PTS (${originalDollars}) on {formattedDate}</Text>
                  <Text fontSize={13} color={colors.gray[600]}>{explicitStripeFeeContext}</Text>
                  <Text fontSize={13} color={colors.gray[600]}>Original Payment Method: {paymentTail}</Text>
              </YStack>

              {/* Explicit Total Refund Display */}
              <YStack backgroundColor={colors.green[50]} padding="$3" borderRadius={8} borderWidth={1} borderColor={colors.green[200]} mt="$2">
                <XStack justifyContent="space-between" alignItems="center">
                  <Text fontSize={14} fontWeight="600" color={colors.green[800]}>Total Refund Amount</Text>
                  <Text fontSize={18} fontWeight="800" color={colors.green[700]}>${totalRefundDollars}</Text>
                </XStack>
                {calculatedRestockingFeeDollars > 0 && !willWaive && !userPaidStripeFee && (
                  <Text fontSize={12} color={colors.green[700]} mt="$1">
                     After {feeSubtext}
                  </Text>
                )}
              </YStack>

              {/* CARD BUTTONS LOGIC */}
              <YStack gap="$2" pt="$2">
                  {isExpired && (
                     <XStack backgroundColor={colors.gray[100]} padding="$2" borderRadius={8} gap="$2" alignItems="center" mt="$1">
                        <CheckCircle size={14} color={colors.gray[600]} />
                        <Text color={colors.gray[700]} fontSize={12} flex={1}>Original purchase is older than 120 days. Stripe refund window closed. Alternative methods available.</Text>
                     </XStack>
                  )}
                  {!isExpired && isSmallBalance && (
                     <XStack backgroundColor={colors.gray[100]} padding="$2" borderRadius={8} gap="$2" alignItems="center" mt="$1">
                        <CheckCircle size={14} color={colors.gray[600]} />
                        <Text color={colors.gray[700]} fontSize={12} flex={1}>Balance is below your state's minimum cashout threshold. Alternative refund methods are unlocked.</Text>
                     </XStack>
                  )}

                  {isExpired ? (
                      <XStack gap="$2">
                          <Button flex={1} size="$4" backgroundColor={venmoActive ? '#008CFF' as any : colors.gray[400]} onPress={() => handleRefundAction(b, 'venmo')} disabled={isProcessing || !venmoActive}>
                              <XStack alignItems="center" gap="$2"><DollarSign size={16} color="white" /><Text color="white" fontWeight="600">{venmoActive ? 'Venmo' : 'Offline'}</Text></XStack>
                          </Button>
                          <Button flex={1} size="$4" backgroundColor={giftCardsActive ? colors.green[600] : colors.gray[400]} onPress={() => handleRefundAction(b, 'egift_card')} disabled={isProcessing || !giftCardsActive}>
                              <XStack alignItems="center" gap="$2"><Gift size={16} color="white" /><Text color="white" fontWeight="600">{giftCardsActive ? 'Gift Card' : 'Offline'}</Text></XStack>
                          </Button>
                      </XStack>
                  ) : (
                      <YStack gap="$2">
                          <XStack gap="$2">
                              {/* Always show Refund To Card if not expired */}
                              <Button flex={1} size="$4" backgroundColor={colors.blue[700]} disabled={isProcessing} onPress={() => handleRefundAction(b, 'card')}>
                                  {isProcessing ? <Spinner color="white" /> : <Text color="white" fontWeight="600">Refund to Card</Text>}
                              </Button>

                              {/* Scenario 3: Under state minimum - offer Venmo and Gift Card inline */}
                              {isSmallBalance && (
                                  <>
                                      <Button flex={1} size="$4" backgroundColor={venmoActive ? '#008CFF' as any : colors.gray[400]} disabled={isProcessing || !venmoActive} onPress={() => handleRefundAction(b, 'venmo')}>
                                          <XStack alignItems="center" gap="$2"><DollarSign size={16} color="white" /><Text color="white" fontWeight="600">{venmoActive ? 'Venmo' : 'Offline'}</Text></XStack>
                                      </Button>
                                      <Button flex={1} size="$4" backgroundColor={giftCardsActive ? colors.green[600] : colors.gray[400]} disabled={isProcessing || !giftCardsActive} onPress={() => handleRefundAction(b, 'egift_card')}>
                                          <XStack alignItems="center" gap="$2"><Gift size={16} color="white" /><Text color="white" fontWeight="600">{giftCardsActive ? 'Gift Card' : 'Offline'}</Text></XStack>
                                      </Button>
                                  </>
                              )}
                          </XStack>
                          <Text fontSize={12} color={colors.gray[500]} textAlign="center">{feeSubtext}</Text>
                      </YStack>
                  )}
              </YStack>
          </YStack>
      )
  }

  // Auto-redirect off the Success Display without requiring user clicks
  useEffect(() => {
    if (successData) {
      const timer = setTimeout(() => {
        router.back()
      }, 3500)
      return () => clearTimeout(timer)
    }
  }, [successData, router])

  if (successData) {
      return (
        <YStack flex={1} backgroundColor={colors.gray[50]}>
          <YStack flex={1} padding="$4" justifyContent="center" alignItems="center">
             <YStack backgroundColor="white" padding="$6" borderRadius={16} alignItems="center" gap="$4" shadowColor="#000" shadowOpacity={0.05} shadowRadius={10} shadowOffset={{ width: 0, height: 4 }} width="100%" maxWidth={400}>
                 <CheckCircle size={56} color={colors.green[500]} />
                 <Text fontSize="$6" fontWeight="700" color={colors.gray[900]}>Transaction Successful</Text>
                 <Text fontSize="$4" color={colors.gray[600]} textAlign="center">
                   {successData.amount.toLocaleString()} PTS has been successfully burned and applied to your chosen refund method ({successData.method}).
                 </Text>
                 <Text fontSize="$3" color={colors.gray[500]} mt="$2" fontStyle="italic">Redirecting you to the wallet...</Text>
                 <Button variant="outlined" size="$4" mt="$4" borderColor={colors.gray[300]} onPress={() => router.back()} width="100%">
                   <Text color={colors.gray[700]} fontWeight="600">Return Now</Text>
                 </Button>
             </YStack>
          </YStack>
        </YStack>
      )
  }

  if (showGiftCardSelector && activeRefundBucket) {
    // Calculate affordability for the active bucket's remaining points
    const bucketCreatedAt = new Date(activeRefundBucket.payment_transactions?.created_at || activeRefundBucket.created_at).getTime()
    const userPaidStripeFee = (activeRefundBucket.payment_transactions?.service_fee_cents || 0) > 0
    let calculatedRestockingFeeDollars = 0
    if (!userPaidStripeFee && feeData) {
       calculatedRestockingFeeDollars = ((activeRefundBucket.remaining_amount / 100) * (feeData.transaction_fee_percent / 100)) + (feeData.transaction_fee_fixed_cents / 100)
       if (calculatedRestockingFeeDollars >= (activeRefundBucket.remaining_amount / 100)) {
           calculatedRestockingFeeDollars = 0 // waived
       }
    }
    const totalRefundDollars = Math.max(0, (activeRefundBucket.remaining_amount / 100) - calculatedRestockingFeeDollars)
    const pointsValue = Math.floor(totalRefundDollars * POINTS_PER_DOLLAR)

    const filteredCards = catalogCards.filter((c) => {
      const matchSearch = c.brandName.toLowerCase().includes(gcSearch.toLowerCase())
      const matchCat = gcCategory === 'All' ? true : c.category === gcCategory
      return matchSearch && matchCat
    })

    return (
      <YStack flex={1} backgroundColor={colors.gray[50]}>
        {/* Header */}
        <XStack padding="$4" paddingBottom="$2" alignItems="center" backgroundColor="white" borderBottomWidth={1} borderBottomColor={colors.gray[200]}>
          <Button unstyled padding="$2" onPress={() => { setShowGiftCardSelector(false); setActiveRefundBucket(null) }} mr="$2">
            <ArrowLeft size={24} color={colors.gray[800]} />
          </Button>
          <YStack>
            <Text fontSize="$5" fontWeight="700" color={colors.gray[800]}>Choose a Gift Card</Text>
            <Text fontSize="$3" color={colors.green[700]} fontWeight="600">Refund Value: {pointsValue.toLocaleString()} pts (${totalRefundDollars.toFixed(2)})</Text>
          </YStack>
        </XStack>
        
        {/* Catalog */}
        <ScrollView contentContainerStyle={{ padding: '$4' }}>
           <GiftCardsTab
              search={gcSearch} setSearch={setGcSearch}
              category={gcCategory} setCategory={setGcCategory}
              categories={dynamicCategories}
              cards={filteredCards}
              onSelect={setSelectedCard}
              isDesktop={isDesktop}
              userPoints={pointsValue}
              loading={catalogLoading}
           />
        </ScrollView>
        
        {/* Sheet */}
        {selectedCard && (
          <GiftCardSheet
            visible={!!selectedCard}
            card={selectedCard}
            balance={pointsValue}
            onClose={() => setSelectedCard(null)}
            onConfirm={handleGiftCardConfirm}
            t={t}
          />
        )}
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      <ScrollView flex={1} contentContainerStyle={{ padding: '$4', paddingBottom: '$10' }}>
         <YStack maxWidth={600} alignSelf="center" width="100%" gap="$4">
             <YStack pb="$2">
               <Text fontSize="$6" fontWeight="700" color={colors.gray[900]}>Refund Points</Text>
               <Text fontSize="$3" color={colors.gray[500]} mt="$1">
                 Select a point purchase below to request a refund. Applicable fees and eligible refund methods are shown for each purchase.
               </Text>
             </YStack>

             {errorDetails && (
               <XStack backgroundColor={colors.red[50]} padding="$3" borderRadius={8} gap="$2" alignItems="center" borderColor={colors.red[200]} borderWidth={1}>
                 <AlertTriangle size={16} color={colors.red[600]} />
                 <Text color={colors.red[700]} flex={1}>{errorDetails}</Text>
               </XStack>
             )}

             {loading ? (
               <YStack padding="$4" alignItems="center"><Spinner size="large" color={colors.blue[600]} /></YStack>
             ) : buckets.length === 0 ? (
               <YStack padding="$4" alignItems="center" backgroundColor="white" borderRadius={12} borderWidth={1} borderColor={colors.gray[200]}>
                 <Text color={colors.gray[500]}>No active purchases available for refund.</Text>
               </YStack>
             ) : (
               <YStack gap="$4">
                   {buckets.map(renderBucketCard)}
               </YStack>
             )}
         </YStack>
      </ScrollView>

      {/* Venmo Sheet */}
      <VenmoSheet
        visible={showVenmoSelector}
        defaultPhoneNumber={user?.phone || ''}
        refundAmountCents={activeRefundBucket?.remaining_amount || 0}
        onClose={() => {
            setShowVenmoSelector(false)
            setActiveRefundBucket(null)
        }}
        onConfirm={(phone) => {
            setShowVenmoSelector(false)
            executeRefund(activeRefundBucket, 'venmo', { targetPhoneNumber: phone })
        }}
      />
    </YStack>
  )
}
