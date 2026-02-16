'use client'

import { useState, useEffect } from 'react'
import {
  Button,
  H1,
  H2,
  H3,
  Paragraph,
  ScrollView,
  Text,
  XStack,
  YStack,
} from '@casagrown/ui'
import { useAuth } from '../auth/auth-hook'
import { ArrowRight, Shield, Zap, HandHeart, Sparkles, Ban, TrendingUp, GraduationCap, Download } from '@tamagui/lucide-icons'
import { Platform, useWindowDimensions, Image, Linking, Alert, type ImageSourcePropType } from 'react-native'
// Note: expo-clipboard is imported dynamically only on native platforms
import { colors, tc } from '../../design-tokens'
import { useTranslation } from 'react-i18next'

// ============================================================================
// Hooks
// ============================================================================

function useIsMobile(breakpoint = 768) {
  const { width } = useWindowDimensions()
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    setIsMobile(width < breakpoint)
  }, [width, breakpoint])
  
  return isMobile
}

// ============================================================================
// Types
// ============================================================================
interface HomeScreenProps {
  onLinkPress?: () => void
  heroImageSrc?: ImageSourcePropType
  logoSrc?: ImageSourcePropType
  /** Show app store download buttons alongside the Join CTA */
  showAppStoreButtons?: boolean
  /** App Store URL for iOS downloads */
  appStoreUrl?: string
  /** Play Store URL for Android downloads */
  playStoreUrl?: string
  /** Detect device type: 'ios' | 'android' | 'web' */
  deviceType?: 'ios' | 'android' | 'web'
  /** Referral code to copy to clipboard when downloading app */
  referralCode?: string
}

// ============================================================================
// Language Switcher (Dev / Verification)
// ============================================================================
function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const languages = [
    { code: 'en', label: '🇬🇧 EN' },
    { code: 'es', label: '🇪🇸 ES' },
    { code: 'vi', label: '🇻🇳 VI' },
  ]

  // On native platforms, we need extra top margin to clear the header
  const topOffset = Platform.OS === 'web' ? '$4' : '$2'
  
  return (
    <XStack 
      gap="$2" 
      backgroundColor="white" 
      padding="$2" 
      borderRadius="$3"
      shadowColor="rgba(0,0,0,0.1)"
      shadowOffset={{ width: 0, height: 2 }}
      shadowRadius={4}
      alignSelf="center"
      marginTop={topOffset}
    >
      {languages.map((lang) => (
        <Button
          key={lang.code}
          size="$2"
          backgroundColor={i18n.language?.startsWith(lang.code) ? colors.primaryColor : colors.gray[200]}
          onPress={() => i18n.changeLanguage(lang.code)}
          pressStyle={{ opacity: 0.8 }}
        >
          <Text color={i18n.language?.startsWith(lang.code) ? 'white' : colors.gray[800]} fontSize={12} fontWeight="700">
            {lang.label}
          </Text>
        </Button>
      ))}
      <DevSignOut />
    </XStack>
  )
}

function DevSignOut() {
    const { signOut, user } = useAuth()
    const { t } = useTranslation()
    
    if (!user) return null

    return (
        <Button 
            size="$2" 
            backgroundColor="#fee2e2" 
            onPress={signOut}
            pressStyle={{ opacity: 0.8 }}
        >
            <Text color="#b91c1c" fontSize={12} fontWeight="700">
             Sign Out
            </Text>
        </Button>
    )
}


// ============================================================================
// Hero Section
// ============================================================================
function HeroSection({ 
  onLinkPress, 
  heroImageSrc, 
  logoSrc, 
  showAppStoreButtons,
  appStoreUrl,
  playStoreUrl,
  deviceType,
  referralCode
}: { 
  onLinkPress?: () => void
  heroImageSrc?: ImageSourcePropType
  logoSrc?: ImageSourcePropType
  showAppStoreButtons?: boolean
  appStoreUrl?: string
  playStoreUrl?: string
  deviceType?: 'ios' | 'android' | 'web'
  referralCode?: string
}) {
  const { t } = useTranslation()

  const handleAppStorePress = async () => {
    // iOS attribution will use Branch.io (deferred deep links) pre-launch
    const url = appStoreUrl || 'https://apps.apple.com/app/casagrown/id000000000'
    if (Platform.OS === 'web') {
      window.open(url, '_blank')
    } else {
      Linking.openURL(url)
    }
  }

  const handlePlayStorePress = async () => {
    // Build Play Store URL with Install Referrer param for deterministic attribution
    const baseUrl = playStoreUrl || 'https://play.google.com/store/apps/details?id=com.casagrown.app'
    const url = referralCode
      ? `${baseUrl}&referrer=${encodeURIComponent(`ref=${referralCode}`)}`
      : baseUrl
    if (Platform.OS === 'web') {
      window.open(url, '_blank')
    } else {
      Linking.openURL(url)
    }
  }
  
  return (
    <YStack
      width="100%"
      paddingHorizontal="$5"
      paddingTop="$8"
      paddingBottom="$10"
      alignItems="center"
      backgroundColor={colors.green[50]}
    >

      <YStack
        maxWidth={1100}
        width="100%"
        flexDirection="column"
        $md={{ flexDirection: 'row' }}
        alignItems="center"
        gap="$8"
      >
        {/* Text Content */}
        <YStack 
          width="100%" 
          gap="$4" 
          alignItems="center"
          paddingBottom="$6"
          $md={{ 
            flex: 1, 
            alignItems: 'flex-start',
            paddingBottom: 0 
          }}
        >
          {/* Logo and Brand */}
          <XStack alignItems="center" gap="$3">
            {Platform.OS === 'web' ? (
              <img 
                src={typeof logoSrc === 'string' ? logoSrc : '/logo.png'} 
                alt="CasaGrown" 
                style={{ width: 48, height: 48, objectFit: 'contain' }} 
              />
            ) : (
              logoSrc ? (
                <Image
                  source={logoSrc}
                  style={{ width: 48, height: 48 }}
                  resizeMode="contain"
                />
              ) : (
                <Text fontSize={36}>🏠</Text>
              )
            )}
            <YStack>
              <Text 
                fontWeight="700" 
                fontSize={32} 
                color={colors.gray[800]}
                lineHeight={32}
                $md={{ fontSize: 44, lineHeight: 44 }}
              >
                CasaGrown
              </Text>
              <XStack
                backgroundColor="$white"
                paddingHorizontal="$2.5"
                paddingVertical="$1"
                borderRadius="$4"
                marginTop="$1"
                shadowColor="rgba(0,0,0,0.05)"
                shadowOffset={{ width: 0, height: 2 }}
                shadowRadius={4}
                elevation={2}
                alignSelf="center"
                justifyContent="center"
                $md={{ alignSelf: 'flex-start' }}
              >
                <Text
                  fontSize={10}
                  color={colors.primaryColor}
                  fontWeight="800"
                  letterSpacing={1.2}
                  textTransform="uppercase"
                >
                  {t('home.tagline')}
                </Text>
              </XStack>
            </YStack>
          </XStack>
          
          <Text 
            color={colors.green[700]} 
            fontWeight="600" 
            fontSize={24}
            $md={{ fontSize: 30 }}
          >
            {t('home.headline')}
          </Text>
          
          <Paragraph 
            color={colors.gray[700]} 
            fontSize={15} 
            fontWeight="400" 
            textAlign="center" 
            maxWidth={480} 
            lineHeight={24}
            $md={{ textAlign: 'left' }}
          >
            {t('home.subheadline')}
          </Paragraph>
          
          <Button
            size="$4"
            backgroundColor={colors.primaryColor}
            borderRadius={28}
            paddingHorizontal="$6"
            hoverStyle={{ backgroundColor: colors.primaryDark }}
            pressStyle={{ backgroundColor: colors.primaryDark }}
            iconAfter={<ArrowRight color="$white" />}
            onPress={onLinkPress}
          >
            <Text color="$white" fontWeight="600" fontSize={16}>
              {t('home.joinMovement')}
            </Text>
          </Button>

          {/* App Store Buttons - only shown on mobile web (iOS or Android) */}
          {showAppStoreButtons && deviceType && deviceType !== 'web' && (
            <YStack gap="$3" alignItems="center" $md={{ alignItems: 'flex-start' }}>
              <Text color={colors.gray[500]} fontSize={13}>
                Or download the app:
              </Text>
              <XStack gap="$3" flexWrap="wrap" justifyContent="center" $md={{ justifyContent: 'flex-start' }}>
                {/* Show iOS button only for iOS users */}
                {deviceType === 'ios' && (
                  <Button
                    size="$3"
                    backgroundColor={colors.gray[900]}
                    borderRadius={8}
                    paddingHorizontal="$4"
                    hoverStyle={{ backgroundColor: colors.gray[800] }}
                    pressStyle={{ backgroundColor: colors.gray[800] }}
                    onPress={handleAppStorePress}
                    gap="$2"
                  >
                    {Platform.OS === 'web' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                      </svg>
                    ) : (
                      <Download size={16} color="white" />
                    )}
                    <Text color="white" fontWeight="600" fontSize={13}>
                      App Store
                    </Text>
                  </Button>
                )}
                
                {/* Show Android button only for Android users */}
                {deviceType === 'android' && (
                  <Button
                    size="$3"
                    backgroundColor={colors.gray[900]}
                    borderRadius={8}
                    paddingHorizontal="$4"
                    hoverStyle={{ backgroundColor: colors.gray[800] }}
                    pressStyle={{ backgroundColor: colors.gray[800] }}
                    onPress={handlePlayStorePress}
                    gap="$2"
                  >
                    {Platform.OS === 'web' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                        <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 0 1 0 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/>
                      </svg>
                    ) : (
                      <Download size={16} color="white" />
                    )}
                    <Text color="white" fontWeight="600" fontSize={13}>
                      Play Store
                    </Text>
                  </Button>
                )}
              </XStack>
            </YStack>
          )}
        </YStack>

        {/* Hero Image */}
        <YStack
          width="100%"
          height={260}
          borderRadius={20}
          overflow="hidden"
          shadowColor="rgba(0,0,0,0.12)"
          shadowOffset={{ width: 0, height: 6 }}
          shadowRadius={20}
          elevation={8}
          $md={{ 
            flex: 1, 
            width: 'auto',
            height: 360 
          }}
        >
          {Platform.OS === 'web' ? (
            <img 
              src={typeof heroImageSrc === 'string' ? heroImageSrc : '/hero.jpg'} 
              alt="Neighbors sharing produce" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          ) : (
            heroImageSrc ? (
            <Image
              source={heroImageSrc}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            ) : (
              <YStack flex={1} backgroundColor="#c5f0e0" alignItems="center" justifyContent="center">
                <Text fontSize={60}>🥕</Text>
              </YStack>
            )
          )}
        </YStack>
      </YStack>
    </YStack>
  )
}

// ============================================================================
// How It Works Section
// ============================================================================
function StepCard({ number, title, description }: {
  number: number
  title: string
  description: string
}) {
  return (
    <YStack
      minWidth={200}
      flex={1}
      alignItems="center"
      gap="$4"
      padding="$6"
      backgroundColor="white"
      borderRadius={12}
      shadowColor="rgba(0,0,0,0.05)"
      shadowOffset={{ width: 0, height: 1 }}
      shadowRadius={3}
      elevation={1}
    >
      <YStack
        width={64}
        height={64}
        backgroundColor={colors.primaryColor}
        borderRadius={32}
        alignItems="center"
        justifyContent="center"
        shadowColor="rgba(0,0,0,0.15)"
        shadowOffset={{ width: 0, height: 4 }}
        shadowRadius={8}
        elevation={4}
      >
        <Text color={colors.white} fontWeight="700" fontSize={24}>
          {number}
        </Text>
      </YStack>
      
      <H3 color={colors.gray[800]} fontSize={18} fontWeight="600" textAlign="center" numberOfLines={2}>
        {title}
      </H3>
      
      <Paragraph color={colors.gray[600]} fontSize={15} fontWeight="400" textAlign="center" lineHeight={24}>
        {description}
      </Paragraph>
    </YStack>
  )
}

function HowItWorksSection() {
  const isMobile = useIsMobile()
  const { t } = useTranslation()
  
  const steps = [
    { number: 1, title: t('home.howItWorks.steps.1.title'), description: t('home.howItWorks.steps.1.description') },
    { number: 2, title: t('home.howItWorks.steps.2.title'), description: t('home.howItWorks.steps.2.description') },
    { number: 3, title: t('home.howItWorks.steps.3.title'), description: t('home.howItWorks.steps.3.description') },
    { number: 4, title: t('home.howItWorks.steps.4.title'), description: t('home.howItWorks.steps.4.description') },
    { number: 5, title: t('home.howItWorks.steps.5.title'), description: t('home.howItWorks.steps.5.description') },
  ]

  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$10" backgroundColor={colors.white} alignItems="center">
      <YStack maxWidth={1300} width="100%" gap="$8" alignItems="center">
        <YStack alignItems="center" gap="$2">
          <H2 color={colors.gray[800]} fontSize={isMobile ? 30 : 36} fontWeight="700" textAlign="center">
            {t('home.howItWorks.title')}
          </H2>
          <Paragraph color={colors.gray[600]} fontSize={15} fontWeight="400" textAlign="center" maxWidth={650}>
            {t('home.howItWorks.subtitle')}
          </Paragraph>
        </YStack>

        <XStack 
          flexWrap="wrap" 
          gap="$6" 
          justifyContent="center" 
          width="100%"
        >
          {steps.map((step) => (
            <StepCard
              key={step.number}
              number={step.number}
              title={step.title}
              description={step.description}
            />
          ))}
        </XStack>
      </YStack>
    </YStack>
  )
}

// ============================================================================
// Points System Section
// ============================================================================
function PointsSystemSection({ onLinkPress }: { onLinkPress?: () => void }) {
  const isMobile = useIsMobile()
  const { t } = useTranslation()
  
  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$12" backgroundColor={colors.primaryColor} alignItems="center">
      <YStack maxWidth={700} width="100%" gap="$5" alignItems="center">
        <H2 color={colors.white} fontSize={isMobile ? 30 : 36} fontWeight="700" textAlign="center">
          {t('home.pointsSection.title')}
        </H2>
        <Paragraph color={colors.green[50]} fontSize={15} fontWeight="400" textAlign="center" lineHeight={26} opacity={0.95} maxWidth={680}>
          {t('home.pointsSection.description')}
        </Paragraph>
        
        <Button
          size="$4"
          backgroundColor={colors.white}
          borderRadius={28}
          paddingHorizontal="$6"
          hoverStyle={{ backgroundColor: colors.gray[100] }}
          iconAfter={ArrowRight}
          onPress={onLinkPress}
        >
          <Text color={colors.primaryColor} fontWeight="600">{t('home.pointsSection.cta')}</Text>
        </Button>
      </YStack>
    </YStack>
  )
}

// ============================================================================
// Safety & Convenience Section
// ============================================================================
function FeatureCard({ icon: Icon, iconBg, title, bullets, introText }: {
  icon: typeof Shield
  iconBg: string
  title: string
  bullets: string[]
  introText?: string
}) {
  return (
    <YStack
      flex={1}
      minWidth={300}
      maxWidth={380}
      backgroundColor="white"
      borderRadius={16}
      padding="$8"
      gap="$5"
      borderWidth={2}
      borderColor={colors.borderPrimary}
      shadowColor="rgba(0,0,0,0.1)"
      shadowOffset={{ width: 0, height: 4 }}
      shadowRadius={8}
      elevation={3}
    >
      <YStack
        width={56}
        height={56}
        backgroundColor={tc(iconBg)}
        borderRadius={12}
        alignItems="center"
        justifyContent="center"
        shadowColor="rgba(0,0,0,0.15)"
        shadowOffset={{ width: 0, height: 4 }}
        shadowRadius={8}
        elevation={4}
      >
        <Icon size={28} color="white" />
      </YStack>
      
      <H3 color={colors.gray[800]} fontSize={20} fontWeight="700">
        {title}
      </H3>
      
      {!!introText && (
        <Paragraph color={colors.gray[700]} fontSize={15} fontWeight="400" lineHeight={22}>
          {introText}
        </Paragraph>
      )}
      
      <YStack gap="$2">
        {Array.isArray(bullets) && bullets.map((bullet, i) => (
          <XStack key={i} gap="$2" alignItems="flex-start">
            <Text color={colors.primaryColor} fontWeight="700" fontSize={15}>{'•'}</Text>
            <Text color={colors.gray[700]} fontSize={15} fontWeight="400" flex={1} lineHeight={20}>
              {bullet}
            </Text>
          </XStack>
        ))}
      </YStack>
    </YStack>
  )
}

function SafetyConvenienceSection() {
  const isMobile = useIsMobile()
  const { t } = useTranslation()
  
  const features = [
    {
      icon: Shield,
      iconBg: '#16a34a',
      title: t('home.safetySection.features.transaction.title'),
      introText: t('home.safetySection.features.transaction.description'),
      bullets: t('home.safetySection.features.transaction.bullets', { returnObjects: true }) as string[],
    },
    {
      icon: Zap,
      iconBg: '#16a34a',
      title: t('home.safetySection.features.instant.title'),
      introText: t('home.safetySection.features.instant.description'),
      bullets: t('home.safetySection.features.instant.bullets', { returnObjects: true }) as string[],
    },
    {
      icon: HandHeart,
      iconBg: '#16a34a',
      title: t('home.safetySection.features.community.title'),
      introText: t('home.safetySection.features.community.description'),
      bullets: t('home.safetySection.features.community.bullets', { returnObjects: true }) as string[],
    },
  ]

  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$16" backgroundColor={colors.white} alignItems="center">
      <YStack maxWidth={1200} width="100%" gap="$8" alignItems="center">
        <YStack alignItems="center" gap="$4">
          <H2 color={colors.gray[800]} fontSize={isMobile ? 30 : 36} fontWeight="700" textAlign="center">
            {t('home.safetySection.title')}
          </H2>
          <Paragraph color={colors.gray[600]} fontSize={15} fontWeight="400" textAlign="center" maxWidth={750}>
            {t('home.safetySection.description')}
          </Paragraph>
        </YStack>

        <XStack flexWrap="wrap" gap="$8" justifyContent="center" width="100%">
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              iconBg={feature.iconBg}
              title={feature.title}
              introText={feature.introText}
              bullets={feature.bullets}
            />
          ))}
        </XStack>
      </YStack>
    </YStack>
  )
}

// ============================================================================
// Why Trade Homegrown Section
// ============================================================================
function TradeCard({ bgColor, iconBg, iconColor, icon: Icon, title, description }: {
  bgColor: string
  iconBg: string
  iconColor: string
  icon: typeof Shield
  title: string
  description: string
}) {
  return (
    <YStack
      flex={1}
      minWidth={240}
      maxWidth={280}
      backgroundColor={tc(bgColor)}
      borderRadius={12}
      padding="$6"
      gap="$4"
      shadowColor="rgba(0,0,0,0.05)"
      shadowOffset={{ width: 0, height: 1 }}
      shadowRadius={3}
      elevation={1}
    >
      <YStack
        width={48}
        height={48}
        backgroundColor={tc(iconBg)}
        borderRadius={24}
        alignItems="center"
        justifyContent="center"
      >
        <Icon size={24} color={tc(iconColor)} />
      </YStack>
      
      <H3 color={colors.gray[800]} fontSize={16} fontWeight="600">
        {title}
      </H3>
      
      <Paragraph color={colors.gray[700]} fontSize={15} fontWeight="400" lineHeight={20}>
        {description}
      </Paragraph>
    </YStack>
  )
}

function WhyTradeHomegrownSection() {
  const isMobile = useIsMobile()
  const { t } = useTranslation()

  const cards = [
    {
      bgColor: colors.emerald[200],
      iconBg: colors.emerald[300],
      iconColor: colors.emerald[700],
      icon: Sparkles,
      title: t('home.missionSection.cards.freshness.title'),
      description: t('home.missionSection.cards.freshness.description'),
    },
    {
      bgColor: colors.amber[200],
      iconBg: colors.amber[300],
      iconColor: colors.amber[700],
      icon: Ban,
      title: t('home.missionSection.cards.waste.title'),
      description: t('home.missionSection.cards.waste.description'),
    },
    {
      bgColor: colors.sky[200],
      iconBg: colors.sky[300],
      iconColor: colors.sky[700],
      icon: TrendingUp,
      title: t('home.missionSection.cards.inflation.title'),
      description: t('home.missionSection.cards.inflation.description'),
    },
    {
      bgColor: colors.pink[200],
      iconBg: colors.pink[300],
      iconColor: colors.pink[700],
      icon: GraduationCap,
      title: t('home.missionSection.cards.teen.title'),
      description: t('home.missionSection.cards.teen.description'),
    },
  ]

  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$12" backgroundColor={colors.white} alignItems="center">
      <YStack maxWidth={1100} width="100%" gap="$8" alignItems="center">
        <YStack alignItems="center" gap="$2">
          <H2 color={colors.gray[800]} fontSize={isMobile ? 30 : 36} fontWeight="700" textAlign="center">
            {t('home.missionSection.title')}
          </H2>
          <Paragraph color={colors.gray[600]} fontSize={15} fontWeight="400" textAlign="center" maxWidth={750}>
            {t('home.missionSection.description')}
          </Paragraph>
        </YStack>

        <XStack flexWrap="wrap" gap="$4" justifyContent="center" width="100%">
          {cards.map((card, i) => (
            <TradeCard
              key={i}
              bgColor={card.bgColor}
              iconBg={card.iconBg}
              iconColor={card.iconColor}
              icon={card.icon}
              title={card.title}
              description={card.description}
            />
          ))}
        </XStack>
      </YStack>
    </YStack>
  )
}

// ============================================================================
// Ready to Make a Difference CTA Section
// ============================================================================
function ReadyToMakeDifferenceSection({ onLinkPress }: { onLinkPress?: () => void }) {
  const isMobile = useIsMobile()
  const { t } = useTranslation()

  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$12" backgroundColor={colors.primaryColor} alignItems="center">
      <YStack maxWidth={700} width="100%" gap="$5" alignItems="center">
        <H2 color={colors.white} fontSize={isMobile ? 30 : 36} fontWeight="700" textAlign="center">
          {t('home.ctaSection.title')}
        </H2>
        <Paragraph color={colors.green[50]} fontSize={15} fontWeight="400" textAlign="center" lineHeight={28} opacity={0.95}>
          {t('home.ctaSection.description')}
        </Paragraph>
        
        <Button
          size="$4"
          backgroundColor="white"
          borderRadius={28}
          paddingHorizontal="$6"
          hoverStyle={{ backgroundColor: '#f3f4f6' }}
          iconAfter={ArrowRight}
          onPress={onLinkPress}
        >
          <Text color={colors.primaryColor} fontWeight="600">{t('home.ctaSection.button')}</Text>
        </Button>
      </YStack>
    </YStack>
  )
}

// ============================================================================
// Footer Section
// ============================================================================
function Footer() {
  const isMobile = useIsMobile()
  const { t } = useTranslation()

  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$8" backgroundColor={colors.gray[800]} alignItems="center">
      <YStack maxWidth={1000} width="100%" gap="$6">
        <XStack
          flexDirection={isMobile ? 'column' : 'row'}
          justifyContent="space-between"
          alignItems={isMobile ? 'center' : 'flex-start'}
          gap="$6"
        >
          <YStack alignItems={isMobile ? 'center' : 'flex-start'} gap="$2">
            <XStack alignItems="center" gap="$2">
              {Platform.OS === 'web' ? (
                <img src="/logo.png" alt="CasaGrown" style={{ width: 32, height: 32, objectFit: 'contain' }} />
              ) : (
                <Text>🏠</Text>
              )}
              <Text fontWeight="600" fontSize={18} color={colors.white}>
                CasaGrown
              </Text>
            </XStack>
            <Paragraph color={colors.gray[400]} fontSize={13} textAlign={isMobile ? 'center' : 'left'} maxWidth={280}>
              {t('home.footer.tagline')}
            </Paragraph>
          </YStack>

          <XStack gap="$8" flexWrap="wrap" justifyContent="center">
            <YStack gap="$2" alignItems={isMobile ? 'center' : 'flex-start'}>
              <Text color={colors.white} fontWeight="600" fontSize={14}>{t('home.footer.product')}</Text>
              <Text color={colors.gray[400]} fontSize={13}>{t('home.footer.features')}</Text>
              <Text color={colors.gray[400]} fontSize={13}>{t('home.footer.howItWorks')}</Text>
              <Text color={colors.gray[400]} fontSize={13}>{t('home.footer.pricing')}</Text>
            </YStack>
            <YStack gap="$2" alignItems={isMobile ? 'center' : 'flex-start'}>
              <Text color={colors.white} fontWeight="600" fontSize={14}>{t('home.footer.company')}</Text>
              <Text color={colors.gray[400]} fontSize={13}>{t('home.footer.about')}</Text>
              <Text color={colors.gray[400]} fontSize={13}>{t('home.footer.blog')}</Text>
              <Text color={colors.gray[400]} fontSize={13}>{t('home.footer.contact')}</Text>
            </YStack>
            <YStack gap="$2" alignItems={isMobile ? 'center' : 'flex-start'}>
              <Text color={colors.white} fontWeight="600" fontSize={14}>{t('home.footer.legal')}</Text>
              <Text color={colors.gray[400]} fontSize={13}>{t('home.footer.privacy')}</Text>
              <Text color={colors.gray[400]} fontSize={13}>{t('home.footer.terms')}</Text>
            </YStack>
          </XStack>
        </XStack>

        <YStack borderTopWidth={1} borderColor={colors.gray[700]} paddingTop="$4" alignItems="center">
          <Text color={colors.gray[500]} fontSize={12}>
            {t('home.footer.copyright')}
          </Text>
        </YStack>
      </YStack>
    </YStack>
  )
}

// ============================================================================
// Main Component
// ============================================================================
export function HomeScreen({ 
  onLinkPress, 
  heroImageSrc, 
  logoSrc,
  showAppStoreButtons,
  appStoreUrl,
  playStoreUrl,
  deviceType,
  referralCode
}: HomeScreenProps) {
  return (
    <ScrollView
      flex={1}
      backgroundColor="#ffffff"
      showsVerticalScrollIndicator={Platform.OS === 'web'}
      keyboardShouldPersistTaps="handled"
    >
      {/* Language is detected from device settings - user can override in profile later */}
      <YStack flex={1} minHeight="100%">
        <HeroSection 
          onLinkPress={onLinkPress} 
          heroImageSrc={heroImageSrc} 
          logoSrc={logoSrc}
          showAppStoreButtons={showAppStoreButtons}
          appStoreUrl={appStoreUrl}
          playStoreUrl={playStoreUrl}
          deviceType={deviceType}
          referralCode={referralCode}
        />
        <HowItWorksSection />
        <PointsSystemSection onLinkPress={onLinkPress} />
        <SafetyConvenienceSection />
        <WhyTradeHomegrownSection />
        <ReadyToMakeDifferenceSection onLinkPress={onLinkPress} />
        <Footer />
      </YStack>
    </ScrollView>
  )
}
