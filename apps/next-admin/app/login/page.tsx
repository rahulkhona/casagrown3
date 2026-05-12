'use client'

import { useState, useEffect, Suspense } from 'react'
import { YStack, XStack, Text, Button, Input, Card, Spinner, Image } from 'tamagui'
import { useRouter, useSearchParams } from 'next/navigation'
import { colors } from '@casagrown/app/design-tokens'
import { ArrowLeft, Mail } from 'lucide-react'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import ClientOnly from '../ClientOnly'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/'
  const { signInWithOtp, verifyOtp, user, loading: authLoading } = useAuth()

  const [method, setMethod] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [devOtp, setDevOtp] = useState<string | null>(null)

  // Redirect if logged in
  useEffect(() => {
    if (authLoading) return
    if (user) {
      router.replace(returnTo)
    }
  }, [user, authLoading, router, returnTo])

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
      
      <XStack width="100%" maxWidth={400} marginBottom="$2">
        <Button 
            icon={ArrowLeft} 
            chromeless 
            onPress={() => method === 'email' ? router.back() : setMethod('email')}
        >
            {method === 'email' ? 'Back' : 'Change Email'}
        </Button>
      </XStack>

      <Card padding="$6" borderWidth={1} borderColor={colors.gray[200]} backgroundColor="white" borderRadius="$4" width="100%" maxWidth={400} gap="$6" elevation="$2">
        
        <YStack alignItems="center" gap="$2">
             <Image src="/logo.png" width={64} height={64} opacity={method === 'otp' ? 0.5 : 1} />
             <Text fontSize="$7" fontWeight="700" color={colors.gray[900]} textAlign="center" fontFamily="$body">
                CasaGrown Admin
             </Text>
             <Text fontSize="$4" color={colors.gray[600]} textAlign="center" fontFamily="$body" fontWeight="400">
                {method === 'otp' ? `Enter verification code for ${email}` : 'Secure Administrator Portal'}
             </Text>
        </YStack>

        {error ? (
            <YStack backgroundColor="$red3" padding="$3" borderRadius="$4">
                <Text color="$red11" textAlign="center">{error}</Text>
            </YStack>
        ) : null}

        {method === 'email' && (
            <YStack gap="$4">
                <YStack gap="$2">
                    <Text fontWeight="500" color={colors.gray[700]}>Admin Email Address</Text>
                    <Input 
                        placeholder="admin@casagrown.com" 
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
                    icon={loading ? <Spinner color="white" /> : <Mail size={20} color="white" />}
                >
                    {!loading && <Text color="white" fontWeight="600" fontSize="$4">Send Access Code</Text>}
                </Button>
            </YStack>
        )}

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
                    {!loading && <Text color="white" fontWeight="600" fontSize="$4">Verify Identity</Text>}
                </Button>
                <Button chromeless onPress={() => setMethod('email')}>
                    <Text color={colors.green[600]}>Cancel</Text>
                </Button>
            </YStack>
        )}

      </Card>
    </YStack>
  )
}

export default function LoginPage() {
  return (
    <ClientOnly>
      <Suspense fallback={<Spinner size="large" color={colors.green[600]} />}>
          <LoginContent />
      </Suspense>
    </ClientOnly>
  )
}
