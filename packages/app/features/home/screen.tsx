'use client'

import { useState, useEffect } from 'react'
// ... (imports)
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
import { ArrowRight, Shield, Zap, Heart, Sprout, Leaf, TrendingUp, GraduationCap, Sparkles, Ban, HandHeart } from '@tamagui/lucide-icons'
import { Platform, useWindowDimensions, Image as NativeImage } from 'react-native'
// ...
import { colors, typography, howItWorksSteps, whyTradeCards, safetyFeatures } from '../../design-tokens'

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
  heroImageSrc?: any
  logoSrc?: any
}

// ============================================================================
// Hero Section
// ============================================================================
function HeroSection({ onLinkPress, heroImageSrc, logoSrc }: { onLinkPress?: () => void, heroImageSrc?: any, logoSrc?: any }) {
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
          // Desktop overrides
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
                <NativeImage
                  source={logoSrc}
                  style={{ width: 48, height: 48 }}
                  resizeMode="contain"
                />
              ) : (
                <Text fontSize={36}>🏠</Text>
              )
            )}
            <Text 
              fontWeight="700" 
              fontSize={36} 
              color={colors.gray[800]}
              $md={{ fontSize: 48 }}
            >
              CasaGrown
            </Text>
          </XStack>
          
          <Text 
            color={colors.green[700]} 
            fontWeight="600" 
            fontSize={24}
            $md={{ fontSize: 30 }}
          >
            Fresh from Neighbors' backyard 🌱
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
            Buy and sell fresh, locally-grown produce from your neighbors' backyards. 
            Join a hyper-local community working together to reduce waste and expand access to fresh food.
          </Paragraph>
          
          <Button
            size="$4"
            backgroundColor={colors.primary}
            textProps={{ color: '$white' }}
            borderRadius={28}
            paddingHorizontal="$6"
            hoverStyle={{ backgroundColor: colors.primaryDark }}
            pressStyle={{ backgroundColor: colors.primaryDark }}
            iconAfter={ArrowRight}
            onPress={onLinkPress}
          >
            Join the Movement!
          </Button>
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
          // Desktop overrides
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
              <NativeImage
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
// How It Works Section (5 steps in single horizontal line)
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
        backgroundColor={colors.primary}
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
  const steps = howItWorksSteps

  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$10" backgroundColor={colors.white} alignItems="center">
      <YStack maxWidth={1300} width="100%" gap="$8" alignItems="center">
        <YStack alignItems="center" gap="$2">
          <H2 color={colors.gray[800]} fontSize={isMobile ? 30 : 36} fontWeight="700" textAlign="center">
            How It Works 🎯
          </H2>
          <Paragraph color={colors.gray[600]} fontSize={15} fontWeight="400" textAlign="center" maxWidth={650}>
            Join your hyper-local community and start buying, selling, and connecting with neighbors
          </Paragraph>
        </YStack>

        <XStack 
          flexWrap="wrap" 
          gap="$6" 
          justifyContent="center" 
          width="100%"
        >
          {steps.map((step, index) => (
            <StepCard
              key={step.title}
              number={index + 1}
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
// Why Use a Points System Section
// ============================================================================
function PointsSystemSection({ onLinkPress }: { onLinkPress?: () => void }) {
  const isMobile = useIsMobile()
  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$12" backgroundColor={colors.primary} alignItems="center">
      <YStack maxWidth={700} width="100%" gap="$5" alignItems="center">
        <H2 color={colors.white} fontSize={isMobile ? 30 : 36} fontWeight="700" textAlign="center">
          Why Use a Points System?
        </H2>
          <Paragraph color={colors.green[50]} fontSize={15} fontWeight="400" textAlign="center" lineHeight={26} opacity={0.95} maxWidth={680}>
          Our closed-loop point system minimizes payment processing fees and keeps more money in 
          your community. Points are available instantly (unlike credit cards that take 2-5 days), making 
          escrow and returns seamless. Buy points once, trade with neighbors, and redeem for gift cards 
          or donate to charity.
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
          <Text color={colors.primary} fontWeight="600">Join CasaGrown Today</Text>
        </Button>
      </YStack>
    </YStack>
  )
}

// ============================================================================
// Built for Safety & Convenience Section
// ============================================================================
function FeatureCard({ icon: Icon, iconBg, title, bullets, introText }: {
  icon: any
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
        backgroundColor={iconBg as any}
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
      
      {introText && (
        <Paragraph color={colors.gray[700]} fontSize={15} fontWeight="400" lineHeight={22}>
          {introText}
        </Paragraph>
      )}
      
      <YStack gap="$2">
        {bullets.map((bullet, i) => (
          <XStack key={i} gap="$2" alignItems="flex-start">
            <Text color={colors.primary} fontWeight="700" fontSize={15}>•</Text>
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
  const features = [
    {
      icon: Shield,
      iconBg: '#16a34a',
      title: 'Transaction Safety & Security',
      bullets: [
        'Built-in escrow system protects buyers and sellers',
        'Drop-off option for safety and convenience',
        'Safe for teen sellers',
        'Local-only membership keeps community trusted',
        'Dispute handling for complete peace of mind',
      ],
    },
    {
      icon: Zap,
      iconBg: '#16a34a',
      title: 'Instant Point Availability',
      introText: 'Unlike credit cards or Venmo which take 2-5 business days to make funds available, CasaGrown points are available immediately upon order completion.',
      bullets: [
        'No waiting periods or banking delays',
        'Start spending points instantly',
        'Redeem for gift cards anytime',
      ],
    },
    {
      icon: HandHeart,
      iconBg: '#16a34a',
      title: 'Give Back to Your Community',
      introText: 'Turn your backyard surplus into community support by donating points to local charities and food banks.',
      bullets: [
        'Donate points to local charities',
        'Support community food banks',
        'Every transaction reduces food waste',
        'Make a difference with every sale',
      ],
    },
  ]

  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$16" backgroundColor={colors.white} alignItems="center">
      <YStack maxWidth={1200} width="100%" gap="$8" alignItems="center">
        <YStack alignItems="center" gap="$4">
          <H2 color={colors.gray[800]} fontSize={isMobile ? 30 : 36} fontWeight="700" textAlign="center">
            Built for Safety & Convenience
          </H2>
          <Paragraph color={colors.gray[600]} fontSize={15} fontWeight="400" textAlign="center" maxWidth={750}>
            CasaGrown is designed with features that make buying and selling homegrown produce, simple, safe and rewarding
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
// Footer Section
// ============================================================================
function Footer() {
  const isMobile = useIsMobile()

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
              Connecting communities through sustainable food sharing.
            </Paragraph>
          </YStack>

          <XStack gap="$8" flexWrap="wrap" justifyContent="center">
            <YStack gap="$2" alignItems={isMobile ? 'center' : 'flex-start'}>
              <Text color={colors.white} fontWeight="600" fontSize={14}>Product</Text>
              <Text color={colors.gray[400]} fontSize={13}>Features</Text>
              <Text color={colors.gray[400]} fontSize={13}>How It Works</Text>
              <Text color={colors.gray[400]} fontSize={13}>Pricing</Text>
            </YStack>
            <YStack gap="$2" alignItems={isMobile ? 'center' : 'flex-start'}>
              <Text color={colors.white} fontWeight="600" fontSize={14}>Company</Text>
              <Text color={colors.gray[400]} fontSize={13}>About</Text>
              <Text color={colors.gray[400]} fontSize={13}>Blog</Text>
              <Text color={colors.gray[400]} fontSize={13}>Contact</Text>
            </YStack>
            <YStack gap="$2" alignItems={isMobile ? 'center' : 'flex-start'}>
              <Text color={colors.white} fontWeight="600" fontSize={14}>Legal</Text>
              <Text color={colors.gray[400]} fontSize={13}>Privacy</Text>
              <Text color={colors.gray[400]} fontSize={13}>Terms</Text>
            </YStack>
          </XStack>
        </XStack>

        <YStack borderTopWidth={1} borderColor={colors.gray[700]} paddingTop="$4" alignItems="center">
          <Text color={colors.gray[500]} fontSize={12}>
            © 2026 CasaGrown. All rights reserved.
          </Text>
        </YStack>
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
  icon: any
  title: string
  description: string
}) {
  return (
    <YStack
      flex={1}
      minWidth={240}
      maxWidth={280}
      backgroundColor={bgColor as any}
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
        backgroundColor={iconBg as any}
        borderRadius={24}
        alignItems="center"
        justifyContent="center"
      >
        <Icon size={24} color={iconColor} />
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
  const cards = [
    {
      bgColor: colors.emerald[200],
      iconBg: colors.emerald[300],
      iconColor: colors.emerald[700],
      icon: Sparkles,
      title: whyTradeCards[0].title,
      description: whyTradeCards[0].description,
    },
    {
      bgColor: colors.amber[200],
      iconBg: colors.amber[300],
      iconColor: colors.amber[700],
      icon: Ban,
      title: whyTradeCards[1].title,
      description: whyTradeCards[1].description,
    },
    {
      bgColor: colors.sky[200],
      iconBg: colors.sky[300],
      iconColor: colors.sky[700],
      icon: TrendingUp,
      title: whyTradeCards[2].title,
      description: whyTradeCards[2].description,
    },
    {
      bgColor: colors.pink[200],
      iconBg: colors.pink[300],
      iconColor: colors.pink[700],
      icon: GraduationCap,
      title: whyTradeCards[3].title,
      description: whyTradeCards[3].description,
    },
  ]

  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$12" backgroundColor={colors.white} alignItems="center">
      <YStack maxWidth={1100} width="100%" gap="$8" alignItems="center">
        <YStack alignItems="center" gap="$2">
          <H2 color={colors.gray[800]} fontSize={isMobile ? 30 : 36} fontWeight="700" textAlign="center">
            Why Trade Homegrown?
          </H2>
          <Paragraph color={colors.gray[600]} fontSize={15} fontWeight="400" textAlign="center" maxWidth={750}>
            We're on a mission to eliminate wastage of food grown in American backyards and expand access to freshly picked produce to many more people.
          </Paragraph>
        </YStack>

        <XStack flexWrap="wrap" gap="$4" justifyContent="center" width="100%">
          {cards.map((card) => (
            <TradeCard
              key={card.title}
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
  return (
    <YStack width="100%" paddingHorizontal="$4" paddingVertical="$12" backgroundColor={colors.primary} alignItems="center">
      <YStack maxWidth={700} width="100%" gap="$5" alignItems="center">
        <H2 color={colors.white} fontSize={isMobile ? 30 : 36} fontWeight="700" textAlign="center">
          Ready to Make a Difference?
        </H2>
        <Paragraph color={colors.green[50]} fontSize={15} fontWeight="400" textAlign="center" lineHeight={28} opacity={0.95}>
          Join thousands of neighbors already trading homegrown produce. Start saving money, reducing waste, and building community today.
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
          <Text color={colors.primary} fontWeight="600">Get Started for Free</Text>
        </Button>
      </YStack>
    </YStack>
  )
}

// ============================================================================
// Main Component
// ============================================================================
export function HomeScreen({ onLinkPress, heroImageSrc, logoSrc }: HomeScreenProps) {
  return (
    <ScrollView
      flex={1}
      backgroundColor="#ffffff"
      showsVerticalScrollIndicator={Platform.OS === 'web'}
    >
      <YStack flex={1} minHeight="100%">
        <HeroSection onLinkPress={onLinkPress} heroImageSrc={heroImageSrc} logoSrc={logoSrc} />
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
