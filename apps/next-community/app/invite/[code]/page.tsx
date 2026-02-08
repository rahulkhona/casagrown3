'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { UserPlus, X } from '@tamagui/lucide-icons'
import { colors } from '@casagrown/app/design-tokens'
import { supabase } from '@casagrown/app/features/auth/auth-hook'
import { HomeScreen } from '@casagrown/app/features/home/screen'
import { useTranslation } from 'react-i18next'

interface InviterProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
}

// Detect if user is on iOS or Android
function useDeviceType() {
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'web'>('web')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userAgent = window.navigator.userAgent.toLowerCase()
      if (/iphone|ipad|ipod/.test(userAgent)) {
        setDeviceType('ios')
      } else if (/android/.test(userAgent)) {
        setDeviceType('android')
      } else {
        setDeviceType('web')
      }
    }
  }, [])

  return deviceType
}

export default function InviteLandingPage() {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const referralCode = params.code as string
  const deviceType = useDeviceType()
  
  const [inviter, setInviter] = useState<InviterProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showBanner, setShowBanner] = useState(true)

  useEffect(() => {
    async function lookupInviter() {
      if (!referralCode) {
        setError(t('inviteLanding.invalidLink'))
        setLoading(false)
        return
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('referral_code', referralCode)
          .single()

        if (fetchError || !data) {
          // Still show the home page, just without the inviter banner
          setInviter(null)
        } else {
          setInviter(data)
        }
      } catch (err) {
        console.warn('Could not lookup inviter:', err)
      }
      setLoading(false)
    }

    lookupInviter()
  }, [referralCode])

  const handleJoin = () => {
    // Pass referral code to signup via URL parameter
    router.push(`/login?ref=${referralCode}`)
  }

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6" minHeight="100vh">
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>{t('inviteLanding.loading')}</Text>
      </YStack>
    )
  }

  const inviterName = inviter?.full_name || t('inviteLanding.defaultInviter')

  return (
    <YStack flex={1} minHeight="100vh">
      {/* Inviter Banner - Shows at top if we have inviter info */}
      {inviter && showBanner && (
        <YStack
          backgroundColor={colors.green[600]}
          paddingVertical="$3"
          paddingHorizontal="$4"
        >
          <XStack 
            alignItems="center" 
            justifyContent="center" 
            gap="$3"
            maxWidth={1100}
            alignSelf="center"
            width="100%"
          >
            {/* Inviter Avatar */}
            <YStack
              width={40}
              height={40}
              borderRadius={20}
              backgroundColor="rgba(255,255,255,0.2)"
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
            >
              {inviter.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={inviter.avatar_url} 
                  alt={inviterName}
                  style={{ width: 40, height: 40, borderRadius: 20, objectFit: 'cover' }}
                />
              ) : (
                <UserPlus size={20} color="white" />
              )}
            </YStack>
            
            {/* Invitation Text */}
            <YStack flex={1}>
              <Text color="white" fontWeight="600" fontSize={14}>
                {t('inviteLanding.invitedYou', { name: inviterName })}
              </Text>
              <Text color={colors.green[100]} fontSize={12}>
                {t('inviteLanding.joinSubtitle')}
              </Text>
            </YStack>

            {/* Close Button */}
            <Button
              unstyled
              padding="$2"
              onPress={() => setShowBanner(false)}
            >
              <X size={20} color="white" />
            </Button>
          </XStack>
        </YStack>
      )}

      {/* Reuse the Home Screen content with app store buttons enabled */}
      <HomeScreen 
        onLinkPress={handleJoin} 
        heroImageSrc="/hero.jpg" 
        logoSrc="/logo.png"
        showAppStoreButtons={true}
        deviceType={deviceType}
        referralCode={referralCode}
      />
    </YStack>
  )
}
