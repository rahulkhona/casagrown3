import React, { useState, useEffect } from 'react'
import {
  Sheet,
  YStack,
  XStack,
  Text,
  Button,
  Input,
  Spinner,
  ScrollView,
} from 'tamagui'
import { Banknote, X, AlertCircle, CheckCircle } from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'
import { supabase } from '../auth/auth-hook'
import { Alert, Platform } from 'react-native'

interface CashoutSheetProps {
  visible: boolean
  onClose: () => void
  balance: number
  userId?: string
  pointsToRedeem: number
  adjustBalance: (delta: number) => void
}

export function CashoutSheet({ 
  visible, 
  onClose, 
  balance, 
  userId, 
  pointsToRedeem,
  adjustBalance
}: CashoutSheetProps) {
  const [payoutId, setPayoutId] = useState('')
  const [savedPayoutId, setSavedPayoutId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  const usdAmount = pointsToRedeem / 100

  // 1. Fetch saved payout ID on mount
  useEffect(() => {
    if (visible && userId) {
      setIsLoadingProfile(true)
      
      const fetchProfile = async () => {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('paypal_payout_id')
            .eq('id', userId)
            .single()

          if (data?.paypal_payout_id) {
            setSavedPayoutId(data.paypal_payout_id)
            setPayoutId(data.paypal_payout_id)
          }
        } finally {
          setIsLoadingProfile(false)
        }
      }

      fetchProfile()
    }
  }, [visible, userId])

  // 2. Handle Cashout
  const handleCashout = async () => {
    setErrorText(null)
    if (!payoutId.trim()) {
      setErrorText("Please enter a valid Venmo Phone Number or PayPal Email.")
      return
    }

    if (balance < pointsToRedeem) {
        setErrorText("You do not have enough points for this cashout.")
        return
    }

    if (pointsToRedeem < 1) {
        setErrorText("You must cashout at least 1 point.")
        return
    }

    setIsProcessing(true)
    try {
      const { data, error } = await supabase.functions.invoke('redeem-paypal-payout', {
        body: {
          pointsToRedeem,
          payoutId: payoutId.trim(),
        }
      })

      if (error) {
        console.error("Supabase function error:", error);
        setErrorText("Network or server error. Please try again.");
        setIsProcessing(false)
        return
      }

      if (!data?.success) {
          throw new Error(data?.error || "Payout API rejected the transfer.")
      }

      // Success! Deduct points explicitly on the frontend so UI feels fast
      adjustBalance(-pointsToRedeem)
      setIsSuccess(true)

      // Dispatch custom event for cross-page balance sync
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('points-balance-changed'))
      }

    } catch (err: any) {
      console.error("Cashout Failed:", err)
      
      let errorMessage = "An unexpected error occurred."
      if (typeof err.message === 'string' && err.message.trim() !== '') {
        errorMessage = err.message
      }
      setErrorText(errorMessage)
    } finally {
      setIsProcessing(false)
    }
  }

  // 3. Reset state on close
  const handleClose = () => {
      onClose()
      setTimeout(() => {
          setIsSuccess(false)
          setErrorText(null)
      }, 300)
  }

  return (
    <Sheet
      modal
      open={visible}
      onOpenChange={(isOpen) => !isOpen && handleClose()}
      snapPoints={[60]}
      position={0}
      dismissOnSnapToBottom
      zIndex={100000}
    >
      <Sheet.Overlay backgroundColor="rgba(0,0,0,0.5)" />
      <Sheet.Handle />
      <Sheet.Frame 
        backgroundColor="white" 
        padding="$0" 
        borderTopLeftRadius={24} 
        borderTopRightRadius={24}
        maxWidth={500}
        width="100%"
        alignSelf="center"
      >
        
        {/* Header */}
        <XStack padding="$4" borderBottomWidth={1} borderBottomColor={colors.gray[200]} alignItems="center" justifyContent="center" position="relative">
          <Text fontSize="$5" fontWeight="700" color={colors.gray[900]}>Cash Out via PayPal/Venmo</Text>
          <Button unstyled position="absolute" right={16} padding="$2" onPress={handleClose}>
            <X size={24} color={colors.gray[500]} />
          </Button>
        </XStack>

        <ScrollView
          flex={1}
          contentContainerStyle={{
            padding: 24,
            flexGrow: 1,
            justifyContent: isSuccess ? "center" : "flex-start",
            gap: 16,
          }}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
        >
          
          {isLoadingProfile ? (
              <YStack alignItems="center" justifyContent="center" flex={1}>
                  <Spinner size="large" color={colors.green[600]} />
              </YStack>
          ) : isSuccess ? (
              // Success Screen
              <YStack alignItems="center" gap="$4">
                <YStack width={80} height={80} borderRadius={40} backgroundColor={colors.green[100]} alignItems="center" justifyContent="center">
                    <CheckCircle size={40} color={colors.green[600]} />
                </YStack>
                <Text fontSize="$6" fontWeight="700" color={colors.gray[900]}>Funds Sent!</Text>
                <Text fontSize="$4" color={colors.gray[600]} textAlign="center">
                    ${usdAmount.toFixed(2)} is on its way to {payoutId}. It should arrive in your account momentarily!
                </Text>
                <Button
                    unstyled paddingVertical="$3" paddingHorizontal="$6" borderRadius={24}
                    backgroundColor={colors.green[600]} alignItems="center" marginTop="$4" alignSelf="stretch"
                    onPress={handleClose}
                >
                    <Text fontSize="$4" fontWeight="600" color="white">Done</Text>
                </Button>
              </YStack>
          ) : (
            // Input Screen
            <>
                <YStack alignItems="center" gap="$2" marginBottom="$4">
                    <YStack width={64} height={64} borderRadius={32} backgroundColor={colors.green[100]} alignItems="center" justifyContent="center">
                        <Banknote size={32} color={colors.green[600]} />
                    </YStack>
                    <Text fontSize="$7" fontWeight="800" color={colors.gray[900]}>${usdAmount.toFixed(2)}</Text>
                    <Text fontSize="$4" color={colors.gray[600]}>Cost: {pointsToRedeem} points</Text>
                </YStack>

                <YStack gap="$2">
                    <Text fontSize="$3" fontWeight="600" color={colors.gray[800]}>
                        Where should we send your money?
                    </Text>
                    <Input
                        unstyled
                        borderWidth={1} borderColor={colors.gray[300]} borderRadius={borderRadius.md} padding="$3"
                        fontSize="$4" color={colors.gray[900]} backgroundColor="white"
                        placeholder="Venmo # (+15555555555) or PayPal Email"
                        value={payoutId}
                        onChangeText={setPayoutId}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
                    />
                    <XStack gap="$2" alignItems="flex-start" marginTop="$2" backgroundColor={colors.amber[50]} padding="$2" borderRadius={8}>
                        <AlertCircle size={14} color={colors.amber[700]} marginTop={2} />
                        <Text fontSize={12} color={colors.amber[800]} flex={1} lineHeight={16}>
                            Please double-check this matches your account exactly. Reversing a transfer is difficult.
                        </Text>
                    </XStack>
                </YStack>

                <YStack marginTop="auto" gap="$3">
                    {errorText && (
                        <Text color="$red10" fontSize="$3" textAlign="center" marginBottom="$2">
                            {errorText}
                        </Text>
                    )}
                    <Button
                        unstyled paddingVertical="$3" borderRadius={24}
                        backgroundColor={!payoutId.trim() || isProcessing || balance < pointsToRedeem || pointsToRedeem < 1 ? colors.gray[300] : colors.green[600]}
                        alignItems="center" justifyContent="center" shadowColor="rgba(0,0,0,0.1)" shadowRadius={4} shadowOffset={{width:0, height:2}}
                        opacity={!payoutId.trim() || isProcessing || balance < pointsToRedeem || pointsToRedeem < 1 ? 0.7 : 1}
                        onPress={handleCashout}
                        disabled={!payoutId.trim() || isProcessing || balance < pointsToRedeem || pointsToRedeem < 1}
                    >
                        {isProcessing ? (
                            <Spinner color="white" />
                        ) : (
                            <Text fontSize="$4" fontWeight="600" color={!payoutId.trim() || balance < pointsToRedeem || pointsToRedeem < 1 ? colors.gray[500] : 'white'}>
                                {pointsToRedeem < 1 ? 'Enter Amount' : balance < pointsToRedeem ? `Need ${pointsToRedeem} Points` : 'Confirm Cashout'}
                            </Text>
                        )}
                    </Button>
                </YStack>
            </>
          )}

        </ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}
