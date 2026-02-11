/**
 * CreatePostScreen - Post type selection + form orchestrator
 *
 * Two states:
 * 1. Post Type Selection — 6 cards matching Figma design
 * 2. Type-specific form based on selection
 */

import { useState } from 'react'
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui'
import { Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, borderRadius, shadows } from '../../design-tokens'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  DollarSign,
  ShoppingCart,
  Wrench,
  HelpCircle,
  Camera,
  Briefcase,
} from '@tamagui/lucide-icons'
import { SellForm } from './sell-form'
import { BuyForm } from './buy-form'
import { GeneralForm } from './general-form'

export type PostTypeKey =
  | 'want_to_sell'
  | 'want_to_buy'
  | 'need_service'
  | 'offering_service'
  | 'seeking_advice'
  | 'general_info'

interface PostTypeOption {
  key: PostTypeKey
  labelKey: string
  descKey: string
  icon: any
  iconBg: string
  iconColor: string
}

const POST_TYPES: PostTypeOption[] = [
  {
    key: 'want_to_sell',
    labelKey: 'createPost.types.sell.title',
    descKey: 'createPost.types.sell.description',
    icon: DollarSign,
    iconBg: colors.green[100],
    iconColor: colors.green[700],
  },
  {
    key: 'want_to_buy',
    labelKey: 'createPost.types.buy.title',
    descKey: 'createPost.types.buy.description',
    icon: ShoppingCart,
    iconBg: colors.sky[200],
    iconColor: colors.sky[700],
  },
  {
    key: 'need_service',
    labelKey: 'createPost.types.needService.title',
    descKey: 'createPost.types.needService.description',
    icon: Wrench,
    iconBg: colors.amber[200],
    iconColor: colors.amber[700],
  },
  {
    key: 'offering_service',
    labelKey: 'createPost.types.offerService.title',
    descKey: 'createPost.types.offerService.description',
    icon: Briefcase,
    iconBg: colors.pink[100],
    iconColor: colors.pink[600],
  },
  {
    key: 'seeking_advice',
    labelKey: 'createPost.types.advice.title',
    descKey: 'createPost.types.advice.description',
    icon: HelpCircle,
    iconBg: '#FEF9C3', // yellow-100
    iconColor: '#A16207', // yellow-700
  },
  {
    key: 'general_info',
    labelKey: 'createPost.types.showTell.title',
    descKey: 'createPost.types.showTell.description',
    icon: Camera,
    iconBg: colors.emerald[200],
    iconColor: colors.emerald[700],
  },
]

export interface CreatePostScreenProps {
  onBack: () => void
  onSuccess?: () => void
  /** If provided, skips the type picker and goes directly to the form for this post type */
  initialType?: PostTypeKey
  /** If provided, opens the form in edit mode with existing post data */
  editId?: string
  /** If provided, pre-fills the form with cloned post data (JSON string) */
  cloneData?: string
}

export function CreatePostScreen({ onBack, onSuccess, initialType, editId, cloneData }: CreatePostScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [selectedType, setSelectedType] = useState<PostTypeKey | null>(initialType ?? null)

  const handleBack = () => {
    if (editId || cloneData) {
      // In edit/clone mode, go directly back (to My Posts)
      onBack()
    } else if (selectedType) {
      setSelectedType(null)
    } else {
      onBack()
    }
  }

  const handlePostSuccess = () => {
    setSelectedType(null)
    onSuccess?.()
  }

  // Render form for selected post type
  if (selectedType) {
    const formBack = (editId || cloneData) ? onBack : () => setSelectedType(null)
    switch (selectedType) {
      case 'want_to_sell':
        return (
          <SellForm
            onBack={formBack}
            onSuccess={handlePostSuccess}
            editId={editId}
            cloneData={cloneData}
          />
        )
      case 'want_to_buy':
        return (
          <BuyForm
            onBack={formBack}
            onSuccess={handlePostSuccess}
            editId={editId}
            cloneData={cloneData}
          />
        )
      default:
        return (
          <GeneralForm
            postType={selectedType}
            onBack={formBack}
            onSuccess={handlePostSuccess}
            editId={editId}
            cloneData={cloneData}
          />
        )
    }
  }

  // Post Type Selection
  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* Header */}
      <YStack
        backgroundColor="white"
        borderBottomWidth={1}
        borderBottomColor={colors.gray[200]}
        paddingTop={insets.top || 16}
      >
        <XStack
          paddingHorizontal="$4"
          height={56}
          alignItems="center"
          gap="$3"
        >
          <Button
            unstyled
            onPress={handleBack}
            padding={8}
            borderRadius={999}
            minWidth={44}
            minHeight={44}
            alignItems="center"
            justifyContent="center"
            pressStyle={{ opacity: 0.6 }}
          >
            <ArrowLeft size={24} color={colors.gray[700]} />
          </Button>
          <Text fontSize="$5" fontWeight="700" color={colors.gray[900]}>
            {t('createPost.title')}
          </Text>
        </XStack>
      </YStack>

      {/* Post Type Cards */}
      <ScrollView flex={1} contentContainerStyle={{ padding: 16 }}>
        <Text
          fontSize="$4"
          color={colors.gray[600]}
          marginBottom="$4"
          textAlign="center"
        >
          {t('createPost.subtitle')}
        </Text>

        <XStack flexWrap="wrap" gap="$3" justifyContent="center">
          {POST_TYPES.map((type) => {
            const Icon = type.icon
            return (
              <Pressable
                key={type.key}
                onPress={() => {
                  console.log('Card pressed:', type.key)
                  setSelectedType(type.key)
                }}
                style={{ flexBasis: '47%', minWidth: 150 }}
              >
                <YStack
                  backgroundColor="white"
                  borderRadius={borderRadius.xl}
                  padding="$5"
                  borderWidth={2}
                  borderColor={colors.gray[200]}
                  shadowColor={shadows.sm.color}
                  shadowOffset={shadows.sm.offset}
                  shadowOpacity={0.05}
                  shadowRadius={shadows.sm.radius}
                  gap="$3"
                >
                  <YStack
                    width={48}
                    height={48}
                    borderRadius={24}
                    backgroundColor={type.iconBg as any}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Icon size={24} color={type.iconColor} />
                  </YStack>
                  <Text
                    fontSize="$4"
                    fontWeight="600"
                    color={colors.gray[900]}
                  >
                    {t(type.labelKey)}
                  </Text>
                  <Text
                    fontSize="$3"
                    color={colors.gray[500]}
                  >
                    {t(type.descKey)}
                  </Text>
                </YStack>
              </Pressable>
            )
          })}
        </XStack>
      </ScrollView>
    </YStack>
  )
}
