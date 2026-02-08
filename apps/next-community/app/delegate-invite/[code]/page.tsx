'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner, ScrollView } from 'tamagui'
import {
  Users,
  UserCheck,
  Clock,
  AlertTriangle,
  Smartphone,
  ArrowRight,
  Copy,
  CheckCircle,
} from '@tamagui/lucide-icons'
import { colors, borderRadius } from '@casagrown/app/design-tokens'
import { supabase } from '@casagrown/app/features/auth/auth-hook'
import { useTranslation } from 'react-i18next'

interface DelegatorProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
}

interface DelegationInfo {
  id: string
  message: string | null
  pairingCode: string | null
  expiresAt: string | null
  delegationCode: string
}

// Detect device type for app store buttons
function useDeviceType() {
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'web'>('web')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent.toLowerCase()
      if (/iphone|ipad|ipod/.test(ua)) setDeviceType('ios')
      else if (/android/.test(ua)) setDeviceType('android')
    }
  }, [])
  return deviceType
}

// ============================================================================
// Step Card — for "How It Works" section
// ============================================================================
function StepCard({ number, title, description }: {
  number: number
  title: string
  description: string
}) {
  return (
    <YStack
      flex={1}
      minWidth={200}
      backgroundColor="white"
      borderRadius={borderRadius.lg}
      padding="$4"
      gap="$2"
      alignItems="center"
      shadowColor="rgba(0,0,0,0.06)"
      shadowRadius={12}
      shadowOffset={{ width: 0, height: 2 }}
      borderWidth={1}
      borderColor={colors.gray[100]}
    >
      <YStack
        width={40}
        height={40}
        borderRadius={20}
        backgroundColor={colors.green[600]}
        alignItems="center"
        justifyContent="center"
        marginBottom="$1"
      >
        <Text fontSize={18} fontWeight="700" color="white">{number}</Text>
      </YStack>
      <Text fontSize={15} fontWeight="700" color={colors.gray[800]} textAlign="center">
        {title}
      </Text>
      <Text fontSize={13} color={colors.gray[500]} textAlign="center" lineHeight={18}>
        {description}
      </Text>
    </YStack>
  )
}

// ── Pairing Code Display with Copy Button ────────────────────
function PairingCodeDisplay({ code, t }: { code: string; t: (k: string) => string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(code)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn('Failed to copy pairing code:', err)
    }
  }, [code])

  return (
    <YStack gap="$3" alignItems="center">
      <Text fontSize={13} fontWeight="600" color={colors.gray[700]}>
        {t('delegateInvite.yourPairingCode')}
      </Text>
      <XStack gap="$2" justifyContent="center" alignItems="center">
        {code.split('').map((digit, i) => (
          <YStack
            key={i}
            width={44}
            height={54}
            borderRadius={borderRadius.lg}
            backgroundColor="white"
            borderWidth={2}
            borderColor={colors.green[300]}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={24} fontWeight="700" color={colors.green[700]}>
              {digit}
            </Text>
          </YStack>
        ))}
        {/* Copy button */}
        <Button
          unstyled
          width={44}
          height={54}
          borderRadius={borderRadius.lg}
          backgroundColor={copied ? colors.green[100] : colors.green[50]}
          borderWidth={2}
          borderColor={copied ? colors.green[500] : colors.green[300]}
          alignItems="center"
          justifyContent="center"
          gap="$1"
          onPress={handleCopy}
          hoverStyle={{ backgroundColor: colors.green[100] }}
          cursor="pointer"
        >
          {copied ? (
            <CheckCircle size={18} color={colors.green[600]} />
          ) : (
            <Copy size={18} color={colors.green[600]} />
          )}
          <Text fontSize={9} fontWeight="600" color={colors.green[700]}>
            {copied ? t('delegateInvite.codeCopied') : t('delegateInvite.copyCode')}
          </Text>
        </Button>
      </XStack>
      <Text fontSize={12} color={colors.gray[400]} textAlign="center" lineHeight={18}>
        {t('delegateInvite.codeInstruction')}
      </Text>
    </YStack>
  )
}



export default function DelegateInvitePage() {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const code = params.code as string
  const deviceType = useDeviceType()

  const [delegator, setDelegator] = useState<DelegatorProfile | null>(null)
  const [delegation, setDelegation] = useState<DelegationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)
  const [alreadyAccepted, setAlreadyAccepted] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [autoAccepting, setAutoAccepting] = useState(false)

  // Check auth state & auto-accept if logged in
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const loggedIn = !!session
      setIsLoggedIn(loggedIn)

      if (!code) {
        setNotFound(true)
        setLoading(false)
        return
      }

      try {
        const response = await supabase.functions.invoke('pair-delegation', {
          body: { action: 'lookup', code },
        })

        if (response.error) {
          setNotFound(true)
          setLoading(false)
          return
        }

        const data = response.data
        if (data.error === 'expired' || data.expired) {
          setExpired(true)
          setLoading(false)
          return
        } else if (data.error === 'already_accepted' || data.alreadyAccepted) {
          setAlreadyAccepted(true)
          setLoading(false)
          return
        } else if (data.error) {
          setNotFound(true)
          setLoading(false)
          return
        }

        setDelegator(data.delegator)
        setDelegation(data.delegation)
        setLoading(false)

        // Auto-accept if user is logged in
        if (loggedIn) {
          setAutoAccepting(true)
          try {
            const acceptResponse = await supabase.functions.invoke('pair-delegation', {
              body: { action: 'accept-link', code },
            })
            if (acceptResponse.error || acceptResponse.data?.error) {
              const errMsg = acceptResponse.data?.error || acceptResponse.error?.message
              if (errMsg === 'already_accepted') {
                setAlreadyAccepted(true)
              }
              // Silently handle other errors — page shows normally with CTA
              setAutoAccepting(false)
            } else {
              setAccepted(true)
              setAutoAccepting(false)
              setTimeout(() => router.push('/delegate?tab=for'), 1500)
            }
          } catch {
            // Silently handle — page shows normally with CTA
            setAutoAccepting(false)
          }
        }
      } catch (err) {
        setNotFound(true)
        setLoading(false)
      }
    }

    init()
  }, [code, router])

  const handleDownload = async (store: 'ios' | 'android') => {
    if (store === 'ios') {
      // iOS: Direct to App Store — attribution will use Branch.io (deferred deep links) pre-launch
      window.open('https://apps.apple.com/app/casagrown/id6504857758', '_blank')
    } else {
      // Android: Include delegation code in Install Referrer via Play Store URL
      const referrer = encodeURIComponent(`delegate=${code}`)
      window.open(`https://play.google.com/store/apps/details?id=com.casagrown.community&referrer=${referrer}`, '_blank')
    }
  }

  const handleLoginToAccept = () => {
    router.push(`/login?delegate=${code}`)
  }

  const delegatorName = delegator?.full_name || t('delegateInvite.defaultDelegator')

  // ─── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6" minHeight="100vh"
        backgroundColor={colors.gray[50]}>
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>{t('delegateInvite.loading')}</Text>
      </YStack>
    )
  }

  // ─── Error: Not Found ─────────────────────────────────────
  if (notFound) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6" minHeight="100vh"
        backgroundColor={colors.gray[50]}>
        <YStack
          backgroundColor="white" borderRadius={borderRadius['2xl']} padding="$8"
          maxWidth={480} width="100%" alignItems="center" gap="$4"
          shadowColor="rgba(0,0,0,0.1)" shadowRadius={20}
          shadowOffset={{ width: 0, height: 4 }}
        >
          <AlertTriangle size={48} color={colors.gray[400]} />
          <Text fontWeight="700" fontSize={20} color={colors.gray[800]}>
            {t('delegateInvite.notFoundTitle')}
          </Text>
          <Text fontSize={14} color={colors.gray[500]} textAlign="center">
            {t('delegateInvite.notFoundDescription')}
          </Text>
        </YStack>
      </YStack>
    )
  }

  // ─── Error: Expired ───────────────────────────────────────
  if (expired) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6" minHeight="100vh"
        backgroundColor={colors.gray[50]}>
        <YStack
          backgroundColor="white" borderRadius={borderRadius['2xl']} padding="$8"
          maxWidth={480} width="100%" alignItems="center" gap="$4"
          shadowColor="rgba(0,0,0,0.1)" shadowRadius={20}
          shadowOffset={{ width: 0, height: 4 }}
        >
          <Clock size={48} color="#f59e0b" />
          <Text fontWeight="700" fontSize={20} color={colors.gray[800]}>
            {t('delegateInvite.expiredTitle')}
          </Text>
          <Text fontSize={14} color={colors.gray[500]} textAlign="center">
            {t('delegateInvite.expiredDescription')}
          </Text>
        </YStack>
      </YStack>
    )
  }

  // ─── Already Accepted ─────────────────────────────────────
  if (alreadyAccepted) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6" minHeight="100vh"
        backgroundColor={colors.gray[50]}>
        <YStack
          backgroundColor="white" borderRadius={borderRadius['2xl']} padding="$8"
          maxWidth={480} width="100%" alignItems="center" gap="$4"
          shadowColor="rgba(0,0,0,0.1)" shadowRadius={20}
          shadowOffset={{ width: 0, height: 4 }}
        >
          <UserCheck size={48} color={colors.green[500]} />
          <Text fontWeight="700" fontSize={20} color={colors.gray[800]}>
            {t('delegateInvite.alreadyAcceptedTitle')}
          </Text>
          <Text fontSize={14} color={colors.gray[500]} textAlign="center">
            {t('delegateInvite.alreadyAcceptedDescription')}
          </Text>
          {isLoggedIn && (
            <Button
              backgroundColor={colors.green[600]}
              borderRadius={borderRadius.lg}
              paddingVertical="$3"
              paddingHorizontal="$6"
              onPress={() => router.push('/delegate?tab=for')}
              hoverStyle={{ backgroundColor: colors.green[700] }}
            >
              <Text fontWeight="600" color="white">
                {t('delegateInvite.goToManagement')}
              </Text>
            </Button>
          )}
        </YStack>
      </YStack>
    )
  }

  // ─── Success (just accepted) ──────────────────────────────
  if (accepted) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6" minHeight="100vh"
        backgroundColor={colors.gray[50]}>
        <YStack
          backgroundColor="white" borderRadius={borderRadius['2xl']} padding="$8"
          maxWidth={480} width="100%" alignItems="center" gap="$4"
          shadowColor="rgba(0,0,0,0.1)" shadowRadius={20}
          shadowOffset={{ width: 0, height: 4 }}
        >
          <YStack
            width={72} height={72} borderRadius={36}
            backgroundColor={colors.green[100]}
            alignItems="center" justifyContent="center"
          >
            <UserCheck size={36} color={colors.green[600]} />
          </YStack>
          <Text fontWeight="700" fontSize={22} color={colors.green[800]}>
            {t('delegateInvite.successTitle')}
          </Text>
          <Text fontSize={14} color={colors.gray[600]} textAlign="center">
            {t('delegateInvite.successDescription', { name: delegatorName })}
          </Text>
          <Spinner size="small" color={colors.green[600]} />
          <Text fontSize={12} color={colors.gray[400]}>
            {t('delegateInvite.redirecting')}
          </Text>
        </YStack>
      </YStack>
    )
  }

  // ─── Main Landing Page (Rich Marketing Layout) ────────────
  return (
    <ScrollView flex={1} backgroundColor={colors.gray[50]}>
      <YStack minHeight="100vh">

        {/* ── Hero Banner with Delegation Info ── */}
        <YStack
          backgroundColor={colors.green[600]}
          paddingVertical="$8"
          paddingHorizontal="$6"
        >
          <YStack maxWidth={1100} width="100%" alignSelf="center" gap="$6">
            <XStack
              flexWrap="wrap"
              gap="$6"
              alignItems="center"
            >
              {/* Left side: Delegation invite info */}
              <YStack flex={1} minWidth={300} gap="$4">
                {/* Logo */}
                <XStack gap="$3" alignItems="center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="CasaGrown" style={{ height: 44 }} />
                  <YStack>
                    <Text fontSize={28} fontWeight="800" color="white">CasaGrown</Text>
                    <Text fontSize={11} color={colors.green[200]} letterSpacing={2} textTransform="uppercase">
                      Fresh • Local • Trusted
                    </Text>
                  </YStack>
                </XStack>

                {/* Delegation invite text */}
                <YStack gap="$2">
                  <Text fontSize={26} fontWeight="700" color="white" lineHeight={32}>
                    {t('delegateInvite.heroTitle', { name: delegatorName })}
                  </Text>
                  <Text fontSize={16} color={colors.green[100]} lineHeight={24}>
                    {t('delegateInvite.heroSubtitle')}
                  </Text>
                </YStack>

                {/* Auto-accepting banner for logged-in users */}
                {autoAccepting && (
                  <XStack
                    backgroundColor="rgba(255,255,255,0.15)"
                    borderRadius={borderRadius.lg}
                    padding="$4"
                    gap="$3"
                    alignItems="center"
                    alignSelf="flex-start"
                  >
                    <Spinner size="small" color="white" />
                    <Text fontWeight="600" color="white" fontSize={15}>
                      {t('delegateInvite.autoAccepting')}
                    </Text>
                  </XStack>
                )}

                {/* Primary CTA — shown for everyone who hasn't accepted yet */}
                {!autoAccepting && (
                  <Button
                    backgroundColor="white"
                    borderRadius={borderRadius.lg}
                    paddingVertical="$3"
                    paddingHorizontal="$6"
                    gap="$2"
                    alignSelf="flex-start"
                    hoverStyle={{ backgroundColor: colors.green[50] }}
                    onPress={handleLoginToAccept}
                  >
                    <Users size={20} color={colors.green[700]} />
                    <Text fontWeight="700" fontSize={16} color={colors.green[700]}>
                      {isLoggedIn ? t('delegateInvite.acceptButton') : t('delegateInvite.signupToAccept')}
                    </Text>
                    <ArrowRight size={18} color={colors.green[700]} />
                  </Button>
                )}
              </YStack>

              {/* Right side: Hero image */}
              <YStack
                flex={1}
                minWidth={280}
                maxWidth={480}
                borderRadius={borderRadius['2xl']}
                overflow="hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/hero.jpg"
                  alt="CasaGrown Community"
                  style={{
                    width: '100%',
                    height: 'auto',
                    borderRadius: 16,
                    display: 'block',
                  }}
                />
              </YStack>
            </XStack>
          </YStack>
        </YStack>

        {/* ── Personal Message from Delegator ── */}
        {delegation?.message && (
          <YStack paddingHorizontal="$6" paddingTop="$6">
            <YStack
              maxWidth={1100}
              width="100%"
              alignSelf="center"
            >
              <YStack
                backgroundColor="white"
                borderWidth={1}
                borderColor={colors.green[200]}
                borderRadius={borderRadius['2xl']}
                padding="$6"
                shadowColor="rgba(0,0,0,0.06)"
                shadowRadius={16}
                shadowOffset={{ width: 0, height: 4 }}
              >
                <XStack gap="$3" alignItems="flex-start">
                  {/* Delegator avatar */}
                  <YStack
                    width={48}
                    height={48}
                    borderRadius={24}
                    backgroundColor={colors.green[100]}
                    alignItems="center"
                    justifyContent="center"
                    overflow="hidden"
                    flexShrink={0}
                  >
                    {delegator?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={delegator.avatar_url}
                        alt={delegatorName}
                        style={{ width: 48, height: 48, borderRadius: 24, objectFit: 'cover' }}
                      />
                    ) : (
                      <Users size={24} color={colors.green[600]} />
                    )}
                  </YStack>
                  <YStack flex={1} gap="$1">
                    <Text fontSize={12} fontWeight="600" color={colors.green[600]} textTransform="uppercase" letterSpacing={0.5}>
                      {t('delegateInvite.personalMessage', { name: delegatorName })}
                    </Text>
                    <Text fontSize={16} color={colors.gray[800]} lineHeight={24} fontStyle="italic">
                      &ldquo;{delegation.message}&rdquo;
                    </Text>
                  </YStack>
                </XStack>
              </YStack>
            </YStack>
          </YStack>
        )}

        {/* ── How Delegation Works (numbered steps) ── */}
        <YStack paddingVertical="$8" paddingHorizontal="$6">
          <YStack maxWidth={1100} width="100%" alignSelf="center" gap="$6">
            <YStack alignItems="center" gap="$2">
              <Text fontSize={28} fontWeight="800" color={colors.gray[800]} textAlign="center">
                {t('delegateInvite.howItWorksTitle')} 🤝
              </Text>
              <Text fontSize={15} color={colors.gray[500]} textAlign="center" maxWidth={600}>
                {t('delegateInvite.howItWorksSubtitle')}
              </Text>
            </YStack>

            <XStack flexWrap="wrap" gap="$4" justifyContent="center">
              <StepCard
                number={1}
                title={t('delegateInvite.step1Title')}
                description={t('delegateInvite.step1Desc')}
              />
              <StepCard
                number={2}
                title={t('delegateInvite.step2Title')}
                description={t('delegateInvite.step2Desc')}
              />
              <StepCard
                number={3}
                title={t('delegateInvite.step3Title')}
                description={t('delegateInvite.step3Desc')}
              />
              <StepCard
                number={4}
                title={t('delegateInvite.step4Title')}
                description={t('delegateInvite.step4Desc')}
              />
            </XStack>
          </YStack>
        </YStack>



        {/* ── Accept Delegation ── */}
        <YStack paddingVertical="$8" paddingHorizontal="$6" backgroundColor="white">
          <YStack maxWidth={600} width="100%" alignSelf="center" gap="$6">

            {/* Section heading */}
            <YStack alignItems="center" gap="$2">
              <Text fontSize={24} fontWeight="800" color={colors.gray[800]} textAlign="center">
                {t('delegateInvite.getStartedTitle')} ✨
              </Text>
              <Text fontSize={14} color={colors.gray[500]} textAlign="center" maxWidth={480}>
                {t('delegateInvite.getStartedSubtitle')}
              </Text>
            </YStack>

            {/* Option 1: Accept on web */}
            <YStack
              backgroundColor={colors.green[50]}
              borderRadius={borderRadius['2xl']}
              padding="$6"
              gap="$4"
              borderWidth={1}
              borderColor={colors.green[200]}
            >
              <XStack gap="$2" alignItems="center">
                <YStack
                  width={28}
                  height={28}
                  borderRadius={14}
                  backgroundColor={colors.green[600]}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize={14} fontWeight="700" color="white">1</Text>
                </YStack>
                <Text fontSize={16} fontWeight="700" color={colors.gray[800]}>
                  {t('delegateInvite.option1Title')}
                </Text>
              </XStack>
              <Text fontSize={14} color={colors.gray[600]} lineHeight={22}>
                {t('delegateInvite.option1Desc')}
              </Text>
              <Button
                backgroundColor={colors.green[600]}
                borderRadius={borderRadius.lg}
                paddingVertical="$3"
                gap="$2"
                hoverStyle={{ backgroundColor: colors.green[700] }}
                onPress={handleLoginToAccept}
              >
                <Users size={18} color="white" />
                <Text fontWeight="700" color="white" fontSize={15}>
                  {isLoggedIn ? t('delegateInvite.acceptButton') : t('delegateInvite.signupToAccept')}
                </Text>
                <ArrowRight size={16} color="white" />
              </Button>
            </YStack>

            {/* Option 2: Use the mobile app */}
            <YStack
              backgroundColor={colors.gray[50]}
              borderRadius={borderRadius['2xl']}
              padding="$6"
              gap="$4"
              borderWidth={1}
              borderColor={colors.gray[200]}
            >
              <XStack gap="$2" alignItems="center">
                <YStack
                  width={28}
                  height={28}
                  borderRadius={14}
                  backgroundColor={colors.gray[600]}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize={14} fontWeight="700" color="white">2</Text>
                </YStack>
                <Text fontSize={16} fontWeight="700" color={colors.gray[800]}>
                  {t('delegateInvite.option2Title')}
                </Text>
              </XStack>
              <Text fontSize={14} color={colors.gray[600]} lineHeight={22}>
                {t('delegateInvite.option2Desc')}
              </Text>

              {/* Pairing Code */}
              {delegation?.pairingCode && (
                <PairingCodeDisplay code={delegation.pairingCode} t={t} />
              )}

              {/* Device-specific download button */}
              {deviceType !== 'web' && (
                <YStack gap="$3">
                  <Button
                    backgroundColor={colors.gray[900]}
                    borderRadius={borderRadius.lg}
                    paddingVertical="$3"
                    gap="$2"
                    hoverStyle={{ backgroundColor: colors.gray[800] }}
                    onPress={() => handleDownload(deviceType)}
                  >
                    <Smartphone size={18} color="white" />
                    <Text color="white" fontWeight="600" fontSize={14}>
                      {deviceType === 'ios'
                        ? t('delegateInvite.downloadIOS')
                        : t('delegateInvite.downloadAndroid')}
                    </Text>
                  </Button>
                  {/* iOS instruction: revisit this page to auto-accept */}
                  {deviceType === 'ios' && (
                    <YStack
                      backgroundColor="#eff6ff"
                      borderRadius={borderRadius.lg}
                      padding="$4"
                      borderWidth={1}
                      borderColor="#bfdbfe"
                    >
                      <Text fontSize={13} color="#1e40af" lineHeight={20}>
                        💡 {t('delegateInvite.iosInstruction')}
                      </Text>
                    </YStack>
                  )}
                </YStack>
              )}
            </YStack>

          </YStack>
        </YStack>

        {/* ── Footer ── */}
        <YStack
          backgroundColor={colors.green[800]}
          paddingVertical="$6"
          paddingHorizontal="$6"
          alignItems="center"
        >
          <YStack maxWidth={1100} width="100%" alignItems="center" gap="$3">
            <Text fontSize={18} fontWeight="700" color="white">CasaGrown</Text>
            <Text fontSize={13} color={colors.green[200]} textAlign="center">
              Fresh from Neighbors&apos; backyard 🌿
            </Text>
            <Text fontSize={11} color={colors.green[300]}>
              © {new Date().getFullYear()} CasaGrown. All rights reserved.
            </Text>
          </YStack>
        </YStack>

      </YStack>
    </ScrollView>
  )
}
