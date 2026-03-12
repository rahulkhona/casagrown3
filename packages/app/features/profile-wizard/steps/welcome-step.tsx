import { YStack, XStack, Text, Button, Separator } from 'tamagui'
import { useRouter } from 'solito/navigation'
import { useWizard } from '../wizard-context'
import { colors, borderRadius, shadows } from '../../../design-tokens'
import { useTranslation } from 'react-i18next'
import {
  ShoppingBag,
  ShoppingCart,
  HelpCircle,
  Wrench,
  MessageCircle,
} from '@tamagui/lucide-icons'

const PROMPT_CARDS = [
  {
    key: 'sell',
    postType: 'want_to_sell',
    emoji: '🥬',
    Icon: ShoppingBag,
    i18nKey: 'profileWizard.welcome.promptSell',
    fallback: 'I have excess produce that I would like to sell',
  },
  {
    key: 'buy',
    postType: 'want_to_buy',
    emoji: '🛒',
    Icon: ShoppingCart,
    i18nKey: 'profileWizard.welcome.promptBuy',
    fallback: 'I am looking to buy produce',
  },
  {
    key: 'advice',
    postType: 'seeking_advice',
    emoji: '🌱',
    Icon: HelpCircle,
    i18nKey: 'profileWizard.welcome.promptAdvice',
    fallback: 'I need some advice about my garden',
  },
  {
    key: 'service',
    postType: 'need_service',
    emoji: '🧑‍🌾',
    Icon: Wrench,
    i18nKey: 'profileWizard.welcome.promptService',
    fallback: 'I am looking for somebody to help with gardening needs',
  },
  {
    key: 'intro',
    postType: 'general_info',
    emoji: '👋',
    Icon: MessageCircle,
    i18nKey: 'profileWizard.welcome.promptIntro',
    fallback: 'I just want to introduce myself to the community',
  },
] as const

export const WelcomeStep = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const { data } = useWizard()

  const communityName = data.community?.name || t('profileWizard.welcome.defaultCommunity', { defaultValue: 'your community' })

  // Check for first-post campaign points
  const firstPostPoints = data.campaignPoints?.['first_post'] || data.campaignPoints?.['create_post'] || 0

  const handlePromptPress = (postType: string) => {
    router.replace(`/create-post?type=${postType}`)
  }

  const handleSkip = () => {
    router.replace('/')
  }

  return (
    <YStack flex={1} paddingHorizontal="$4" paddingBottom="$8" alignItems="center">
      <YStack
        width="100%"
        maxWidth={500}
        gap="$5"
        alignItems="center"
      >
        {/* Welcome Header */}
        <YStack gap="$2" alignItems="center" paddingTop="$4">
          <Text fontSize={48} testID="welcome-emoji">🎉</Text>
          <Text
            fontSize="$8"
            fontWeight="700"
            color={colors.green[800]}
            textAlign="center"
            testID="welcome-title"
          >
            {t('profileWizard.welcome.title', {
              defaultValue: 'Welcome to {{community}}!',
              community: communityName,
            })}
          </Text>
          <Text
            fontSize="$4"
            color={colors.gray[600]}
            textAlign="center"
            maxWidth={400}
          >
            {t('profileWizard.welcome.subtitle', {
              defaultValue: 'Get started by making your first post. What would you like to do?',
            })}
          </Text>
        </YStack>

        {/* Points Callout */}
        {firstPostPoints > 0 && (
          <XStack
            backgroundColor={colors.green[50]}
            borderWidth={1}
            borderColor={colors.green[300]}
            borderRadius={borderRadius.lg}
            padding="$3"
            alignItems="center"
            gap="$2"
            width="100%"
            testID="points-callout"
          >
            <Text fontSize={20}>⭐</Text>
            <Text fontSize="$3" color={colors.green[700]} fontWeight="600" flex={1}>
              {t('profileWizard.welcome.pointsCallout', {
                defaultValue: 'Earn {{points}} points for your first post!',
                points: firstPostPoints,
              })}
            </Text>
          </XStack>
        )}

        <Separator borderColor={colors.gray[200]} width="100%" />

        {/* Prompt Cards */}
        <YStack gap="$3" width="100%">
          {PROMPT_CARDS.map((card) => (
            <Button
              key={card.key}
              backgroundColor="white"
              borderWidth={1}
              borderColor={colors.gray[200]}
              borderRadius={borderRadius.xl}
              padding="$4"
              height="auto"
              onPress={() => handlePromptPress(card.postType)}
              pressStyle={{
                backgroundColor: colors.green[50],
                borderColor: colors.green[400],
              }}
              hoverStyle={{
                backgroundColor: colors.green[50],
                borderColor: colors.green[300],
              }}
              shadowColor={shadows.sm.color}
              shadowOffset={shadows.sm.offset}
              shadowOpacity={0.06}
              shadowRadius={shadows.sm.radius}
              testID={`prompt-${card.key}`}
            >
              <XStack alignItems="center" gap="$3" width="100%">
                <YStack
                  width={44}
                  height={44}
                  borderRadius={22}
                  backgroundColor={colors.green[100]}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize={22}>{card.emoji}</Text>
                </YStack>
                <Text
                  fontSize="$4"
                  color={colors.gray[800]}
                  fontWeight="500"
                  flex={1}
                >
                  {t(card.i18nKey, { defaultValue: card.fallback })}
                </Text>
                <Text fontSize="$4" color={colors.gray[400]}>›</Text>
              </XStack>
            </Button>
          ))}
        </YStack>

        {/* Skip Button */}
        <Button
          backgroundColor="transparent"
          onPress={handleSkip}
          height="$4"
          marginTop="$2"
          testID="welcome-skip"
        >
          <Text color={colors.gray[500]} fontSize="$3" textDecorationLine="underline">
            {t('profileWizard.welcome.skip', { defaultValue: 'Skip for now' })}
          </Text>
        </Button>
      </YStack>
    </YStack>
  )
}
