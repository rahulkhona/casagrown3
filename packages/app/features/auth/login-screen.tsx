import React, { useState, useEffect } from 'react'
import { Platform, Image } from 'react-native'
import { YStack, XStack, Text, Button, Input, ScrollView, Separator, useMedia, Spinner } from 'tamagui'
import { ArrowLeft, Mail, Chrome } from '@tamagui/lucide-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../design-tokens'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'solito/navigation'
import { useAuth } from './auth-hook'

import { EmailSchema, OtpSchema } from './schemas'

interface LoginScreenProps {
  logoSrc?: any
  onLogin?: (email: string, name: string) => void
  onBack?: () => void
}

export function LoginScreen({ logoSrc, onLogin, onBack }: LoginScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { signInWithOtp, verifyOtp, signInWithOAuth, user } = useAuth()
  
  const [loginMethod, setLoginMethod] = useState<'select' | 'email' | 'otp'>('select')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [errors, setErrors] = useState<{ email?: string; otp?: string; general?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const media = useMedia()

  // Redirect if logged in
  useEffect(() => {
    if (user) {
        // Fire callback if provided (non-blocking)
        if (onLogin) onLogin(user.email || '', user.user_metadata.full_name || '')
        
        // Navigate to temporary success page for manual testing
        router.replace('/login-success')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router])

  const handleSocialLogin = async (provider: 'google' | 'apple' | 'facebook') => {
    setIsSubmitting(true)
    try {
        await signInWithOAuth(provider)
    } catch (e: any) {
        setErrors({ ...errors, general: e.message })
    } finally {
        setIsSubmitting(false)
    }
  }

  const handleEmailSubmit = async () => {
    const result = EmailSchema.safeParse(email)
    if (result.success === false) {
      setErrors({ ...errors, email: result.error.errors[0].message })
      return
    }
    setErrors({ ...errors, email: undefined })
    setIsSubmitting(true)
    console.log('📧 Sending OTP to:', email)

    try {
        const { otpToken } = await signInWithOtp(email)
        console.log('✅ OTP Sent successfully')
        
        // DEV MODE: Show OTP token for testing
        if (otpToken) {
          alert(`🔑 DEV MODE\n\nYour OTP Code:\n${otpToken}\n\n(Copy this to verify login)`)
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
    if (result.success === false) {
        setErrors({ ...errors, otp: result.error.errors[0].message })
        return
    }
    setErrors({ ...errors, otp: undefined })
    setIsSubmitting(true)

    try {
        const { session } = await verifyOtp(email, otp)
        if (session) {
             // Success handled by useEffect
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
        await signInWithOtp(email)
        alert(t('auth.login.codeResent')) // Simple feedback, replace with Toast in real app
    } catch (e: any) {
        setErrors({ ...errors, general: e.message })
    }
  }

  return (
    <ScrollView 
      contentContainerStyle={{ flexGrow: 1 }} 
      backgroundColor={colors.green[50]}
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

            {/* ... (Login Methods) ... keep existing logic manually or just replace the wrapper */}
            {loginMethod === 'select' && (
                <YStack gap="$3">
                    <SocialButton 
                        icon={<Chrome size={20} color={colors.gray[700]} />} 
                        label={t('auth.login.continueGoogle')}
                        onPress={() => handleSocialLogin('google')} 
                        isLoading={isSubmitting}
                    />
                    <SocialButton 
                        icon={<Text fontSize={20} fontWeight="900" color="#1877F2">f</Text>}
                        label={t('auth.login.continueFacebook')} 
                        onPress={() => handleSocialLogin('facebook')} 
                        isLoading={isSubmitting}
                    />
                    <SocialButton 
                        icon={<Text fontSize={20} fontWeight="900" color={colors.gray[900]}></Text>}
                        label={t('auth.login.continueApple')} 
                        onPress={() => handleSocialLogin('apple')} 
                        isLoading={isSubmitting}
                    />

                    <XStack alignItems="center" marginVertical="$4">
                        <Separator flex={1} borderColor={colors.gray[300]} />
                        <Text color={colors.gray[500]} fontSize="$3" marginHorizontal="$3">{t('auth.login.orEmail')}</Text>
                        <Separator flex={1} borderColor={colors.gray[300]} />
                    </XStack>

                    <Button 
                        backgroundColor={colors.green[600]} 
                        height="$5"
                        borderRadius="$4"
                        icon={<Mail size={20} color="white" />}
                        onPress={() => setLoginMethod('email')}
                        pressStyle={{ backgroundColor: colors.green[700] }}
                        hoverStyle={{ backgroundColor: colors.green[700] }}
                    >
                        <Text color="white" fontWeight="600" fontSize="$4">{t('auth.login.continueEmail')}</Text>
                    </Button>
                </YStack>
            )}

            {loginMethod === 'email' && (
                <YStack gap="$4">
                    <YStack gap="$2">
                        <Text color={colors.gray[700]} fontWeight="500">{t('auth.login.emailLabel')}</Text>
                        <Input 
                            value={email}
                            onChangeText={(text) => {
                                setEmail(text)
                                if (errors.email) setErrors({ ...errors, email: undefined })
                            }}
                            placeholder={t('auth.login.emailPlaceholder')}
                            size="$5"
                            borderRadius="$4"
                            borderWidth={1}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            fontWeight="400"
                            borderColor={errors.email ? '$red10' : colors.gray[300]}
                            focusStyle={{ borderColor: errors.email ? '$red9' : colors.green[500], borderWidth: 2 }}
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

                    <Button unstyled onPress={() => setLoginMethod('select')} alignItems="center" marginTop="$2">
                        <Text color={colors.gray[600]} fontSize="$3">{t('auth.login.backLogin')}</Text>
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
                    </YStack>
                </YStack>
            )}
        </YStack>

        {/* Footer - Constrained Width */}
        <YStack width="100%" maxWidth={450} alignItems="center">
             <Text textAlign="center" fontSize="$2" color={colors.gray[600]}>
                {t('auth.login.agreement')}
                <Text color={colors.green[600]} fontWeight="600">{t('auth.login.terms')}</Text>
                {' '}&{' '}
                <Text color={colors.green[600]} fontWeight="600">{t('auth.login.privacy')}</Text>
            </Text>
        </YStack>

      </YStack>
    </ScrollView>
  )
}

// Helper Component for Social Buttons
function SocialButton({ icon, label, onPress, isLoading }: { icon: any, label: string, onPress: () => void, isLoading?: boolean }) {
    return (
        <Button 
            backgroundColor="white"
            borderColor={colors.gray[200]}
            borderWidth={2}
            borderRadius="$4"
            height="$5"
            onPress={onPress}
            disabled={isLoading}
            icon={isLoading ? <Spinner color={colors.gray[700]} /> : icon}
            pressStyle={{ backgroundColor: colors.gray[50] }}
            hoverStyle={{ backgroundColor: colors.gray[50] }}
            justifyContent="center"
        >
            {!isLoading && <Text color={colors.gray[700]} fontWeight="500" fontSize="$3">{label}</Text>}
        </Button>
    )
}
