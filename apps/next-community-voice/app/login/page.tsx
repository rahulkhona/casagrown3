'use client'

import { useState, useEffect, Suspense } from 'react'
import { YStack, XStack, Text, Button, Input, Card, Spinner, Separator, Image } from 'tamagui'
import { useRouter, useSearchParams } from 'next/navigation'
import { colors } from '@casagrown/app/design-tokens'
import { ArrowLeft, Mail, Chrome } from '@tamagui/lucide-icons'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { supabase } from '@casagrown/app/utils/supabase'
import { checkIsStaffByEmail, linkStaffUserId } from '../../features/feedback/feedback-service'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/'
  const { signInWithOtp, verifyOtp, user, loading: authLoading } = useAuth()

  const [method, setMethod] = useState<'select' | 'email' | 'otp'>('select')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [devOtp, setDevOtp] = useState<string | null>(null)

  // After OAuth redirect or if already logged in, check staff and redirect
  useEffect(() => {
    if (authLoading || !user) return

    const checkAndRedirect = async () => {
      const email = user.email

      // Auto-fill profile display name if not set
      if (email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle()
        if (profile && !profile.full_name) {
          const displayName = email.split('@')[0] || email
          await supabase
            .from('profiles')
            .update({ full_name: displayName })
            .eq('id', user.id)
        }
      }

      if (email) {
        const staffCheck = await checkIsStaffByEmail(email)
        if (staffCheck.isStaff) {
          await linkStaffUserId(email, user.id)
          // If user came from a specific page (flag, vote, etc.), go back there
          // Only auto-redirect to dashboard when no explicit returnTo
          router.replace(returnTo !== '/' ? returnTo : '/staff/dashboard')
          return
        }
      }
      // Community user — go to returnTo
      router.replace(returnTo)
    }

    checkAndRedirect()
  }, [user, authLoading, router, returnTo])

  const handleSocialLogin = async (provider: 'google' | 'apple' | 'facebook') => {
    setError('')
    setLoading(true)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/login?returnTo=${encodeURIComponent(returnTo)}`,
        },
      })
      if (oauthError) {
        setLoading(false)
        setError(oauthError.message)
      }
    } catch (e: any) {
      setLoading(false)
      setError(e.message || 'Social login failed')
    }
  }

  const handleSendCode = async () => {
    if (!email.includes('@')) {
      setError('Please enter a valid email')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await signInWithOtp(email)
      setLoading(false)
      if (result.otpToken) {
        setDevOtp(result.otpToken)
        setOtp(result.otpToken)
      }
      setMethod('otp')
    } catch (e: any) {
      setLoading(false)
      setError(e.message || 'Failed to send verification code')
    }
  }

  const handleVerifyOtp = async () => {
    if (otp.length < 6) {
      setError('Please enter the 6-digit code')
      return
    }
    setError('')
    setLoading(true)
    try {
      await verifyOtp(email, otp)
      // useEffect will handle redirect
    } catch (e: any) {
      setLoading(false)
      setError(e.message || 'Invalid code')
    }
  }

  if (authLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]}>
        <Spinner size="large" color={colors.green[600]} />
      </YStack>
    )
  }

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} padding="$4">
      
      {/* Back Button */}
      <XStack width="100%" maxWidth={400} marginBottom="$2">
        <Button 
            icon={ArrowLeft} 
            chromeless 
            onPress={() => method === 'select' ? router.back() : setMethod('select')}
        >
            {method === 'select' ? 'Back' : 'Back to options'}
        </Button>
      </XStack>

      <Card padding="$6" borderWidth={1} borderColor={colors.gray[200]} backgroundColor="white" borderRadius="$4" width="100%" maxWidth={400} gap="$6" elevation="$2">
        
        {/* Header */}
        <YStack alignItems="center" gap="$2">
             <Image src="/logo.png" width={64} height={64} opacity={method === 'otp' ? 0.5 : 1} />
             <Text fontSize="$7" fontWeight="700" color={colors.gray[900]} textAlign="center" fontFamily="$body">
                {method === 'otp' ? 'Verify Email' : 'Welcome'}
             </Text>
             <Text fontSize="$4" color={colors.gray[600]} textAlign="center" fontFamily="$body" fontWeight="400">
                {method === 'otp' ? `Enter code sent to ${email}` : 'Sign in to submit feedback, comment, and vote'}
             </Text>
        </YStack>

        {error ? (
            <YStack backgroundColor="$red3" padding="$3" borderRadius="$4">
                <Text color="$red11" textAlign="center">{error}</Text>
            </YStack>
        ) : null}

        {/* METHOD: SELECT */}
        {method === 'select' && (
            <YStack gap="$3">
                <SocialButton 
                    icon={<Chrome size={20} color={colors.gray[700]} />} 
                    label="Continue with Google"
                    onPress={() => handleSocialLogin('google')}
                    loading={loading}
                />
                <SocialButton 
                    icon={<Text fontSize={20} fontWeight="900" color={colors.gray[900]}></Text>} 
                    label="Continue with Apple"
                    onPress={() => handleSocialLogin('apple')}
                    loading={loading}
                />
                <SocialButton 
                    icon={<Text fontSize={20} fontWeight="700" color="#1877F2">f</Text>} 
                    label="Continue with Facebook"
                    onPress={() => handleSocialLogin('facebook')}
                    loading={loading}
                />

                <XStack alignItems="center" marginVertical="$2">
                    <Separator flex={1} borderColor={colors.gray[300]} />
                    <Text color={colors.gray[500]} fontSize="$3" marginHorizontal="$3">OR</Text>
                    <Separator flex={1} borderColor={colors.gray[300]} />
                </XStack>

                <Button 
                    backgroundColor={colors.green[600]} 
                    height="$5"
                    borderRadius="$4"
                    icon={<Mail size={20} color="white" />}
                    onPress={() => setMethod('email')}
                    pressStyle={{ backgroundColor: colors.green[700] }}
                    hoverStyle={{ backgroundColor: colors.green[700] }}
                >
                    <Text color="white" fontWeight="600" fontSize="$4">Continue with Email</Text>
                </Button>
            </YStack>
        )}

        {/* METHOD: EMAIL INPUT */}
        {method === 'email' && (
            <YStack gap="$4">
                <YStack gap="$2">
                    <Text fontWeight="500" color={colors.gray[700]}>Email Address</Text>
                    <Input 
                        placeholder="you@example.com" 
                        value={email} 
                        onChangeText={setEmail}
                        size="$5" 
                        borderRadius="$4"
                        borderWidth={1}
                        borderColor={colors.gray[300]}
                        fontWeight="400"
                        autoCapitalize="none" 
                        keyboardType="email-address"
                    />
                </YStack>
                <Button 
                    backgroundColor={colors.green[600]} 
                    height="$5"
                    borderRadius="$4"
                    onPress={handleSendCode}
                    disabled={loading}
                    opacity={loading ? 0.7 : 1}
                    pressStyle={{ backgroundColor: colors.green[700] }}
                    hoverStyle={{ backgroundColor: colors.green[700] }}
                    icon={loading ? <Spinner color="white" /> : undefined}
                >
                    {!loading && <Text color="white" fontWeight="600" fontSize="$4">Send Code</Text>}
                </Button>
            </YStack>
        )}

        {/* METHOD: OTP INPUT */}
        {method === 'otp' && (
            <YStack gap="$4">
                <YStack gap="$2">
                    <Text fontWeight="500" color={colors.gray[700]}>Verification Code</Text>
                    {devOtp && (
                      <Text fontSize={12} color={colors.green[600]}>Dev OTP: {devOtp}</Text>
                    )}
                    <Input 
                        placeholder="123456" 
                        value={otp} 
                        onChangeText={setOtp}
                        size="$5" 
                        borderRadius="$4"
                        textAlign="center"
                        fontSize="$6"
                        letterSpacing={5}
                        maxLength={6}
                        fontWeight="400"
                        borderWidth={1}
                        borderColor={colors.gray[300]}
                        keyboardType="number-pad"
                    />
                </YStack>
                <Button 
                    backgroundColor={otp.length >= 6 ? colors.green[600] : colors.gray[300]} 
                    height="$5"
                    borderRadius="$4"
                    onPress={handleVerifyOtp}
                    disabled={loading}
                    icon={loading ? <Spinner color="white" /> : undefined}
                >
                    {!loading && <Text color="white" fontWeight="600" fontSize="$4">Verify & Sign In</Text>}
                </Button>
                <Button chromeless onPress={() => setMethod('email')}>
                    <Text color={colors.green[600]}>Change Email</Text>
                </Button>
            </YStack>
        )}
        
        {method === 'select' && (
             <Text textAlign="center" fontSize="$2" color={colors.gray[400]} paddingHorizontal="$4">
                By signing in, you agree to our Terms of Service and Privacy Policy.
            </Text>
        )}

      </Card>
    </YStack>
  )
}

function SocialButton({ icon, label, onPress, loading }: { icon: any, label: string, onPress: () => void, loading: boolean }) {
    return (
        <Button 
            backgroundColor="white"
            borderColor={colors.gray[200]}
            borderWidth={1}
            icon={loading ? <Spinner color={colors.gray[700]} /> : icon}
            onPress={onPress}
            size="$5"
            disabled={loading}
            pressStyle={{ backgroundColor: colors.gray[50] }}
        >
            {!loading && <Text color={colors.gray[700]} fontWeight="500" fontSize="$3">{label}</Text>}
        </Button>
    )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner size="large" color={colors.green[600]} />}>
        <LoginContent />
    </Suspense>
  )
}
