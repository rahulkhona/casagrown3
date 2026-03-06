import React, { useState, useEffect } from 'react'
import { Platform, Image, TextInput, Pressable, Linking } from 'react-native'
import { YStack, XStack, Text, Button, Input, ScrollView, Separator, useMedia, Spinner } from 'tamagui'
import { ArrowLeft, Mail } from '@tamagui/lucide-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../design-tokens'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'solito/navigation'
import { useAuth, supabase } from './auth-hook'

import { EmailSchema, OtpSchema } from './schemas'

interface LoginScreenProps {
  logoSrc?: any
  onLogin?: (email: string, name: string) => void
  onBack?: () => void
  /** Referral code from invite link - will be stored for profile creation */
  referralCode?: string
  /** Delegation code from delegate-invite link - stored for post-login auto-accept */
  delegationCode?: string
}

export function LoginScreen({ logoSrc, onLogin, onBack, referralCode, delegationCode }: LoginScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { signInWithOtp, verifyOtp, user, loading: authLoading, markTosAccepted: markTosAcceptedHook } = useAuth()
  
  const [loginMethod, setLoginMethod] = useState<'email' | 'otp' | 'tos'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [errors, setErrors] = useState<{ email?: string; otp?: string; general?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [codeResent, setCodeResent] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [tosAccepted, setTosAccepted] = useState(false)
  const media = useMedia()

  // Store referral code if present - will be used in profile creation
  // On Android, also check Install Referrer for referral/delegation codes
  useEffect(() => {
    const storeReferralCode = async (code: string) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.localStorage.setItem('casagrown_referral_code', code)
      } else {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default
        await AsyncStorage.setItem('casagrown_referral_code', code)
      }
      console.log('📋 Stored referral code:', code)
    }

    // If referral code passed as prop (from URL), use it
    if (referralCode) {
      storeReferralCode(referralCode)
      return
    }

    // On native platforms, check for referral/delegation code from Install Referrer (Android only).
    // Note: iOS attribution will be handled by Branch.io (deferred deep links) pre-launch.
    // Clipboard bridge was removed to avoid OS privacy notices on iOS 14+ / Android 13+.
    const checkNativeReferralSources = async () => {
      if (Platform.OS === 'web') return

      const storeDelegationCodeNative = async (dCode: string) => {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default
        await AsyncStorage.setItem('casagrown_delegation_code', dCode)
        console.log('📋 Stored delegation code from native source:', dCode)
      }

      // Install Referrer (Android only — deterministic, no privacy notice)
      if (Platform.OS === 'android') {
        try {
          const Application = require('expo-application')
          const referrer: string | null = await Application.getInstallReferrerAsync()
          if (referrer) {
            // Check for referral code (ref=xxxxxxxx)
            const refMatch = referrer.match(/ref=([a-z0-9]{8})/)
            if (refMatch) {
              console.log('📲 Found referral code from Install Referrer:', refMatch[1])
              await storeReferralCode(refMatch[1])
            }
            // Check for delegation code (delegate=d-xxxxx)
            const delegateMatch = referrer.match(/delegate=(d-[a-z0-9]+)/)
            if (delegateMatch) {
              console.log('📲 Found delegation code from Install Referrer:', delegateMatch[1])
              await storeDelegationCodeNative(delegateMatch[1])
            }
          }
        } catch (err) {
          console.warn('Install Referrer unavailable:', err)
        }
      }
    }

    checkNativeReferralSources()
  }, [referralCode])

  // Store delegation code if present — will be used for auto-accept after login
  useEffect(() => {
    if (!delegationCode) return
    const storeDelegationCode = async (code: string) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.localStorage.setItem('casagrown_delegation_code', code)
      } else {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default
        await AsyncStorage.setItem('casagrown_delegation_code', code)
      }
      console.log('📋 Stored delegation code:', code)
    }
    storeDelegationCode(delegationCode)
  }, [delegationCode])

  // Redirect based on onboarding status
  useEffect(() => {
    const checkProfileAndRedirect = async () => {
      if (!user) return
      
      // Set redirecting to prevent showing login form
      setIsRedirecting(true)
      
      // Fire callback if provided (non-blocking)
      if (onLogin) onLogin(user.email || '', user.user_metadata.full_name || '')
      
      // Check if user has completed onboarding by checking profile.full_name
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, home_community_h3_index, tos_accepted_at')
          .eq('id', user.id)
          .single()
        
        // Must accept ToS before any redirect
        if (!profile?.tos_accepted_at) {
          setLoginMethod('tos')
          setIsRedirecting(false)
          return
        }

      // Check if user came from a delegation link — redirect to accept it
      let storedDelegationCode: string | null = null
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          storedDelegationCode = window.localStorage.getItem('casagrown_delegation_code')
        } else {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default
          storedDelegationCode = await AsyncStorage.getItem('casagrown_delegation_code')
        }
      } catch (e) {
        console.warn('Could not read delegation code:', e)
      }

      if (storedDelegationCode) {
        // Clear the stored code
        try {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.localStorage.removeItem('casagrown_delegation_code')
          } else {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default
            await AsyncStorage.removeItem('casagrown_delegation_code')
          }
        } catch (e) { /* best effort */ }

        if (Platform.OS === 'web') {
          // On web, redirect to the delegate-invite page for auto-accept
          router.replace(`/delegate-invite/${storedDelegationCode}`)
        } else {
          // On native, call pair-delegation directly then navigate to Delegating For
          try {
            await supabase.functions.invoke('pair-delegation', {
              body: { action: 'accept-link', code: storedDelegationCode },
            })
            console.log('✅ Delegation auto-accepted:', storedDelegationCode)
          } catch (err) {
            console.warn('⚠️ Delegation auto-accept failed, user can enter code manually:', err)
          }
          // Navigate to Delegating For tab regardless — user can enter code manually if needed
          router.replace('/delegate?tab=for')
        }
        return
      }

      // User needs both profile name AND community to go to main feed
      // Otherwise → Profile Wizard to complete onboarding
      if (profile?.full_name && profile?.home_community_h3_index) {
        router.replace('/feed')
      } else {
        // New user or incomplete onboarding → Profile Wizard
        router.replace('/profile-wizard')
      }
      } catch (err) {
        // On error, check ToS status before defaulting to wizard
        console.error('Error checking profile:', err)
        try {
          const { data: fallbackProfile } = await supabase
            .from('profiles')
            .select('tos_accepted_at')
            .eq('id', user.id)
            .single()
          if (!fallbackProfile?.tos_accepted_at) {
            setLoginMethod('tos')
            setIsRedirecting(false)
            return
          }
        } catch (_) {
          // If even this fails, show ToS to be safe
          setLoginMethod('tos')
          setIsRedirecting(false)
          return
        }
        router.replace('/profile-wizard')
      }
    }
    
    checkProfileAndRedirect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router])

  // Show loading spinner while checking auth or redirecting
  if (authLoading || isRedirecting) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]}>
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>
          {isRedirecting ? t('auth.login.redirecting') : t('auth.login.checking')}
        </Text>
      </YStack>
    )
  }



  const handleEmailSubmit = async () => {
    const result = EmailSchema.safeParse(email)
    if (!result.success) {
      setErrors({ ...errors, email: result.error.issues[0]?.message })
      return
    }
    setErrors({ ...errors, email: undefined })
    setIsSubmitting(true)
    console.log('📧 Sending OTP to:', email)

    try {
        const { otpToken } = await signInWithOtp(email)
        console.log('✅ OTP Sent successfully')
        
        // DEV MODE: Auto-fill OTP for testing (no alert)
        if (otpToken) {
          setOtp(otpToken) // Auto-fill OTP input for E2E testing
          console.log('🔑 DEV MODE - OTP auto-filled:', otpToken)
        }
        
        setLoginMethod('otp')
    } catch (e: any) {
        console.error('❌ OTP Send Failed:', e)
        setErrors({ ...errors, general: e.message || 'Network Error' })
    } finally {
        setIsSubmitting(false)
    }
  }

  const handleOtpSubmit = async () => {
    const result = OtpSchema.safeParse(otp)
    if (!result.success) {
        setErrors({ ...errors, otp: result.error.issues[0]?.message })
        return
    }
    setErrors({ ...errors, otp: undefined })
    setIsSubmitting(true)

    try {
        const { session } = await verifyOtp(email, otp)
        if (session) {
             // Check if user has already accepted ToS
             if (session.user?.id) {
               const { data: tosProfile } = await supabase
                 .from('profiles')
                 .select('tos_accepted_at')
                 .eq('id', session.user.id)
                 .single()
               if (!tosProfile?.tos_accepted_at) {
                 // First-time user — show ToS acceptance step
                 setLoginMethod('tos')
                 setIsSubmitting(false)
                 return
               }
             }
             // Returning user with ToS already accepted — useEffect will redirect
        } else {
             setErrors({ ...errors, general: 'Invalid code' })
        }
    } catch (e: any) {
         setErrors({ ...errors, general: e.message })
    } finally {
        setIsSubmitting(false)
    }
  }

  const handleResendOtp = async () => {
    try {
        setCodeResent(false)
        await signInWithOtp(email)
        setCodeResent(true)
        // Auto-hide success message after 3 seconds
        setTimeout(() => setCodeResent(false), 3000)
    } catch (e: any) {
        setErrors({ ...errors, general: e.message })
    }
  }

  return (
    <ScrollView 
      contentContainerStyle={{ flexGrow: 1 }} 
      backgroundColor={colors.green[50]}
      keyboardShouldPersistTaps="always"
      automaticallyAdjustKeyboardInsets
    >
      <YStack 
        flex={1} 
        alignItems="center" 
        justifyContent="center" 
        padding="$4" 
        paddingTop={Math.max(insets.top, 16)}
        gap="$5"
      >
        
        {/* Back Button (Mobile/Desktop) */}
        <XStack width="100%" maxWidth={450} marginBottom="$2">
            <Button 
                icon={ArrowLeft} 
                unstyled 
                onPress={onBack}
                pressStyle={{ opacity: 0.7 }}
                cursor="pointer"
            >
                <Text color={colors.gray[600]} fontSize="$4" marginLeft="$2">{t('auth.login.backSimple')}</Text>
            </Button>
        </XStack>

        {/* Card */}
        <YStack 
            width="100%" 
            maxWidth={450} 
            backgroundColor="white" 
            borderRadius="$6" 
            padding="$6" 
            shadowColor={colors.gray[900]} 
            shadowOpacity={0.1} 
            shadowRadius={20}
            shadowOffset={{ width: 0, height: 10 }}
            elevation={5} // Android shadow
            gap="$6"
        >
            {/* Logo */}
            <YStack alignItems="center" gap="$4">
                {Platform.OS === 'web' ? (
                  <img 
                    src={typeof logoSrc === 'string' ? logoSrc : '/logo.png'} 
                    alt="CasaGrown" 
                    style={{ width: 64, height: 64, objectFit: 'contain' }} 
                  />
                ) : (
                  logoSrc ? (
                    <Image 
                        source={logoSrc} 
                        style={{ width: 64, height: 64 }}
                        resizeMode="contain" 
                        alt="CasaGrown Logo"
                    />
                  ) : (
                    <Text fontSize="$6">🏠</Text>
                  )
                )}
            </YStack>

            {/* General Error Message */}
            {errors.general && (
                <YStack backgroundColor="$red3" padding="$3" borderRadius="$4">
                    <Text color="$red11" textAlign="center">{errors.general}</Text>
                </YStack>
            )}

            <YStack gap="$2">
                <Text fontSize="$7" fontWeight="700" color={colors.gray[900]} textAlign="center">
                    {t('auth.login.welcome')}
                </Text>
                <Text fontSize="$4" color={colors.gray[600]} textAlign="center">
                    {t('auth.login.subtitle')}
                </Text>
            </YStack>



            {loginMethod === 'email' && (
                <YStack gap="$4">
                    <YStack gap="$2">
                        <Text color={colors.gray[700]} fontWeight="500">{t('auth.login.emailLabel')}</Text>
                        <TextInput
                            testID="email_input"
                            value={email}
                            onChangeText={(text) => {
                                setEmail(text)
                                if (errors.email) setErrors({ ...errors, email: undefined })
                            }}
                            placeholder={t('auth.login.emailPlaceholder')}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            returnKeyType="send"
                            onSubmitEditing={handleEmailSubmit}
                            style={{
                                height: 48,
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: errors.email ? '#E53E3E' : colors.gray[300],
                                paddingHorizontal: 16,
                                fontSize: 16,
                                fontWeight: '400',
                                backgroundColor: 'white',
                                color: colors.gray[900],
                            }}
                            placeholderTextColor={colors.gray[400]}
                        />
                        {errors.email && (
                            <Text color="$red10" fontSize="$2">{errors.email}</Text>
                        )}
                    </YStack>

                    <Button 
                        backgroundColor={colors.green[600]} 
                        height="$5"
                        borderRadius="$4"
                        onPress={handleEmailSubmit}
                        disabled={isSubmitting}
                        opacity={isSubmitting ? 0.7 : 1}
                        pressStyle={{ backgroundColor: colors.green[700] }}
                        hoverStyle={{ backgroundColor: colors.green[700] }}
                        icon={isSubmitting ? <Spinner color="white" /> : undefined}
                    >
                        {!isSubmitting && <Text color="white" fontWeight="600" fontSize="$4">{t('auth.login.sendCode')}</Text>}
                    </Button>


                </YStack>
            )}

            {loginMethod === 'otp' && (
                <YStack gap="$4">
                    <YStack alignItems="center" gap="$1" marginBottom="$2">
                        <Text color={colors.gray[600]} fontSize="$3">{t('auth.login.verifyTitle')}</Text>
                        <Text color={colors.gray[900]} fontWeight="600">{email}</Text>
                    </YStack>

                    <YStack gap="$2">
                         <Text color={colors.gray[700]} fontWeight="500">{t('auth.login.codeLabel')}</Text>
                         <Input 
                            testID="otp_input"
                            value={otp}
                            onChangeText={(text) => {
                                setOtp(text)
                                if (errors.otp) setErrors({ ...errors, otp: undefined })
                            }}
                            placeholder={t('auth.login.codePlaceholder')}
                            size="$5"
                            borderRadius="$4"
                            textAlign="center"
                            fontSize="$6"
                            letterSpacing={5}
                            maxLength={6}
                            fontWeight="400"
                            borderWidth={1}
                            borderColor={errors.otp ? '$red10' : colors.gray[300]}
                            focusStyle={{ borderColor: errors.otp ? '$red9' : colors.green[500], borderWidth: 2 }}
                        />
                        {errors.otp && (
                            <Text color="$red10" fontSize="$2" textAlign="center">{errors.otp}</Text>
                        )}
                    </YStack>

                     <Button 
                        backgroundColor={otp.length >= 4 ? colors.green[600] : colors.gray[300]} 
                        height="$5"
                        borderRadius="$4"
                        onPress={handleOtpSubmit}
                        // disabled={otp.length < 4} // Let Zod handle the error for feedback
                    >
                        <Text color="white" fontWeight="600" fontSize="$4">{t('auth.login.verifyContinue')}</Text>
                    </Button>

                    <YStack gap="$3" marginTop="$2">
                        <Button unstyled onPress={() => setLoginMethod('email')} alignItems="center">
                            <Text color={colors.gray[600]} fontSize="$3">{t('auth.login.back')}</Text>
                        </Button>
                        <Button unstyled alignItems="center" onPress={handleResendOtp}>
                            <Text color={colors.green[600]} fontSize="$3">{t('auth.login.resend')}</Text>
                        </Button>
                        {codeResent && (
                            <Text color={colors.green[600]} fontSize="$3" textAlign="center">
                              ✓ {t('auth.login.codeResent')}
                            </Text>
                        )}
                    </YStack>
                </YStack>
            )}

            {loginMethod === 'tos' && (
                <YStack gap="$4">
                    <YStack alignItems="center" gap="$2" marginBottom="$2">
                        <Text fontSize={20} fontWeight="700" color={colors.gray[900]}>📋</Text>
                        <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
                          {t('auth.login.tosTitle')}
                        </Text>
                        <Text color={colors.gray[600]} fontSize={14} textAlign="center">
                          {t('auth.login.tosSubtitle')}
                        </Text>
                    </YStack>

                    {/* ToS Acceptance Checkbox */}
                    <Pressable onPress={() => setTosAccepted(!tosAccepted)} testID="tos_checkbox">
                      <XStack alignItems="center" gap="$3" paddingVertical="$2">
                        <YStack
                          width={24}
                          height={24}
                          borderRadius={6}
                          borderWidth={2}
                          borderColor={tosAccepted ? colors.green[600] : colors.gray[300]}
                          backgroundColor={tosAccepted ? colors.green[600] : 'white'}
                          alignItems="center"
                          justifyContent="center"
                        >
                          {tosAccepted && (
                            <Text color="white" fontSize={14} fontWeight="700">✓</Text>
                          )}
                        </YStack>
                        <Text fontSize={14} color={colors.gray[700]} flex={1}>
                          {t('auth.login.tosAgree')}{' '}
                          <Text color={colors.green[600]} fontWeight="600" onPress={() => router.push('/terms')}>{t('auth.login.terms')}</Text>
                          {' '}&{' '}
                          <Text color={colors.green[600]} fontWeight="600" onPress={() => router.push('/privacy')}>{t('auth.login.privacy')}</Text>
                        </Text>
                      </XStack>
                    </Pressable>

                    <Button 
                        backgroundColor={tosAccepted ? colors.green[600] : colors.gray[300]} 
                        height="$5"
                        borderRadius="$4"
                        onPress={async () => {
                          // Set tos_accepted_at in DB
                          if (user?.id) {
                            const { error: tosError } = await supabase.from('profiles').update({
                              tos_accepted_at: new Date().toISOString(),
                            }).eq('id', user.id)
                            if (tosError) {
                              console.error('Failed to accept ToS:', tosError)
                              return
                            }
                            // Sync auth hook state so the auth guard knows ToS is accepted
                            markTosAcceptedHook()
                            
                            // Redirect based on profile completeness
                            const { data: profile } = await supabase
                              .from('profiles')
                              .select('full_name, home_community_h3_index')
                              .eq('id', user.id)
                              .single()
                            
                            if (profile?.full_name && profile?.home_community_h3_index) {
                              router.replace('/feed')
                            } else {
                              router.replace('/profile-wizard')
                            }
                          }
                        }}
                        disabled={!tosAccepted}
                        pressStyle={{ backgroundColor: colors.green[700] }}
                        hoverStyle={{ backgroundColor: colors.green[700] }}
                        testID="tos_accept_button"
                    >
                        <Text color="white" fontWeight="600" fontSize="$4">{t('auth.login.tosAcceptButton')}</Text>
                    </Button>
                </YStack>
            )}
        </YStack>

        {/* Footer - Constrained Width */}
        {loginMethod !== 'tos' && (
          <YStack width="100%" maxWidth={450} alignItems="center">
            <Text textAlign="center" fontSize="$2" color={colors.gray[600]}>
                {t('auth.login.agreement')}
                <Text color={colors.green[600]} fontWeight="600" onPress={() => router.push('/terms')}>{t('auth.login.terms')}</Text>
                {' '}&{' '}
                <Text color={colors.green[600]} fontWeight="600" onPress={() => router.push('/privacy')}>{t('auth.login.privacy')}</Text>
            </Text>
          </YStack>
        )}

      </YStack>
    </ScrollView>
  )
}
