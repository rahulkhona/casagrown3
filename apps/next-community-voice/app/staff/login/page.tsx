'use client'

import { useState, useEffect, Suspense } from 'react'
import { YStack, XStack, Text, Button, Input, Card, Spinner, Separator } from 'tamagui'
import { useRouter, useSearchParams } from 'next/navigation'
import { colors } from '@casagrown/app/design-tokens'
import { ArrowLeft, Mail, Chrome, Shield } from '@tamagui/lucide-icons'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { supabase } from '@casagrown/app/utils/supabase'
import { checkIsStaffByEmail, linkStaffUserId } from '../../../features/feedback/feedback-service'

function StaffLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signInWithOtp, verifyOtp, user, loading: authLoading } = useAuth()

  const [method, setMethod] = useState<'select' | 'email' | 'otp'>('select')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [devOtp, setDevOtp] = useState<string | null>(null)

  // After OAuth redirect or if already logged in, check staff status
  useEffect(() => {
    if (authLoading || !user) return

    const checkStaffAndRedirect = async () => {
      const userEmail = user.email
      if (!userEmail) {
        setError('Could not retrieve your email from the login provider.')
        await supabase.auth.signOut()
        return
      }

      const staffCheck = await checkIsStaffByEmail(userEmail)
      if (!staffCheck.isStaff) {
        setError('This email is not registered as a staff member. Contact your admin.')
        await supabase.auth.signOut()
        return
      }

      // Link user_id to staff_members on first login
      await linkStaffUserId(userEmail, user.id)

      // Redirect to dashboard
      router.push('/staff/dashboard')
    }

    checkStaffAndRedirect()
  }, [user, authLoading, router])

  const handleSocialLogin = async (provider: 'google' | 'apple' | 'facebook') => {
    setError('')
    setLoading(true)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/staff/login`,
        },
      })
      if (oauthError) {
        setLoading(false)
        setError(oauthError.message)
      }
      // Redirect happens automatically — useEffect handles the rest
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

    // First check if email is in staff_members
    const staffCheck = await checkIsStaffByEmail(email)
    if (!staffCheck.isStaff) {
      setError('This email is not registered as a staff member. Contact your admin.')
      return
    }

    setError('')
    setLoading(true)
    try {
      const result = await signInWithOtp(email)
      setLoading(false)

      // In dev, the OTP is auto-fetched from Mailpit
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
      const data = await verifyOtp(email, otp)
      
      // Link user_id to staff_members on first login
      if (data?.user) {
        await linkStaffUserId(email, data.user.id)
      }

      setLoading(false)
      router.push('/staff/dashboard')
    } catch (e: any) {
      setLoading(false)
      setError(e.message || 'Invalid verification code')
    }
  }

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} padding="$4">
      
      {/* Back Button */}
      <XStack width="100%" maxWidth={400} marginBottom="$2">
        <Button 
            icon={ArrowLeft} 
            chromeless 
            onPress={() => method === 'select' ? router.push('/') : setMethod('select')}
        >
            <Text color={colors.gray[600]}>{method === 'select' ? 'Back' : 'Back to options'}</Text>
        </Button>
      </XStack>

      <Card padding="$6" borderWidth={1} borderColor={colors.gray[200]} backgroundColor="white" borderRadius="$4" width="100%" maxWidth={400} gap="$6" elevation="$2">
        
        {/* Header */}
        <YStack alignItems="center" gap="$2">
             <YStack width={64} height={64} borderRadius={32} backgroundColor={colors.green[100]} alignItems="center" justifyContent="center">
                <Shield size={32} color={colors.green[700]} />
             </YStack>
             <Text fontSize="$7" fontWeight="700" color={colors.gray[900]} textAlign="center" fontFamily="$body">
                {method === 'otp' ? 'Verify Email' : 'Staff Portal'}
             </Text>
             <Text fontSize="$4" color={colors.gray[600]} textAlign="center" fontFamily="$body" fontWeight="400">
                {method === 'otp' ? `Enter code sent to ${email}` : 'Sign in to manage community feedback'}
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
                    icon={<Text fontSize={20} fontWeight="900" color="#1877F2">f</Text>} 
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
                    <Text fontWeight="500" color={colors.gray[700]}>Staff Email Address</Text>
                    <Input 
                        placeholder="staff@casagrown.com" 
                        value={email} 
                        onChangeText={setEmail}
                        size="$5" 
                        borderRadius="$4"
                        borderWidth={1}
                        borderColor={colors.gray[300]}
                        fontWeight="400"
                        style={{ fontWeight: 400 }}
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
                    {!loading && <Text color="white" fontWeight="600" fontSize="$4">Send Verification Code</Text>}
                </Button>
            </YStack>
        )}

        {/* METHOD: OTP INPUT */}
        {method === 'otp' && (
            <YStack gap="$4">
                <YStack gap="$2">
                    <Text fontWeight="500" color={colors.gray[700]}>Verification Code</Text>
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
                        style={{ fontWeight: 400 }}
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
                {devOtp && (
                  <Text fontSize="$3" color={colors.green[600]} textAlign="center" fontWeight="500">
                    🔑 Dev OTP auto-filled: {devOtp}
                  </Text>
                )}
                <Button chromeless onPress={() => setMethod('email')}>
                    <Text color={colors.green[600]}>Change Email</Text>
                </Button>
            </YStack>
        )}
        
        {method === 'select' && (
             <Text textAlign="center" fontSize="$2" color={colors.gray[400]} paddingHorizontal="$4">
                Staff access only. Your email must be registered as a staff member.
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

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<Spinner size="large" color={colors.green[600]} />}>
        <StaffLoginContent />
    </Suspense>
  )
}
