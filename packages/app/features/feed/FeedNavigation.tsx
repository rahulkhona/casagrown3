/**
 * FeedNavigation — Shared navigation list for desktop header and mobile drawer.
 *
 * Renders a list of nav items with badges, active state, and navigation callbacks.
 * Replaces the duplicated NAV_KEYS.map() blocks in FeedScreen.
 */

import React from 'react'
import { YStack, XStack, Text, Button, useMedia } from 'tamagui'
import { useTranslation } from 'react-i18next'
import { Home, MessagesSquare, ShoppingBag, Tag } from '@tamagui/lucide-icons'
import { colors } from '../../design-tokens'

export interface NavItem {
  key: string
  active?: boolean
  badge: number
}

interface FeedNavigationProps {
  navKeys: NavItem[]
  variant: 'desktop' | 'mobile'
  onNavigate: (key: string) => void
  userPoints?: number
}

const NAV_ICONS: Record<string, any> = {
  feed: Home,
  chats: MessagesSquare,
  orders: ShoppingBag,
  offers: Tag,
}

/** Badge pill shown on nav items with a count > 0 */
function NavBadge({ count, size }: { count: number; size: 'sm' | 'md' }) {
  if (count <= 0) return null
  const dim = size === 'sm' ? 18 : 20
  const fontSize = size === 'sm' ? 10 : 11
  return (
    <YStack
      backgroundColor={colors.red[500]}
      borderRadius="$full"
      minWidth={dim}
      height={dim}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal="$1"
      marginLeft={4}
    >
      <Text fontSize={fontSize} color="white" fontWeight="700">
        {count}
      </Text>
    </YStack>
  )
}

export function FeedNavigation({ navKeys, variant, onNavigate, userPoints }: FeedNavigationProps) {
  const { t } = useTranslation()
  const media = useMedia()
  // @ts-ignore
  const isDesktopNav = media.lg || media.xl || media.xxl

  if (variant === 'desktop') {
    return (
      <XStack gap={isDesktopNav ? "$5" : "$3"} paddingHorizontal={isDesktopNav ? "$5" : "$2"} paddingVertical="$1" alignItems="center">
        {navKeys.map((item) => {
          const IconComponent = NAV_ICONS[item.key]
          return (
            <YStack
              key={item.key}
              alignItems="center"
              cursor="pointer"
              gap={2}
              onPress={() => onNavigate(item.key)}
              paddingVertical="$1"
              paddingHorizontal="$2"
              position="relative"
            >
              {IconComponent && (
                <IconComponent
                  size={20}
                  color={item.active ? colors.green[600] : colors.gray[500]}
                />
              )}
              <Text
                fontSize={11}
                color={item.active ? colors.green[600] : colors.gray[600]}
                fontWeight={item.active ? '600' : '500'}
                cursor="pointer"
                hoverStyle={{ color: colors.green[600] }}
              >
                {t(`feed.nav.${item.key}`)}
              </Text>
              {item.badge > 0 && (
                <YStack
                  position="absolute"
                  top={-4}
                  right={-4}
                  backgroundColor={colors.red[500]}
                  borderRadius="$full"
                  minWidth={16}
                  height={16}
                  alignItems="center"
                  justifyContent="center"
                  paddingHorizontal={3}
                >
                  <Text fontSize={9} color="white" fontWeight="700">{item.badge}</Text>
                </YStack>
              )}
            </YStack>
          )
        })}
      </XStack>
    )
  }

  // Mobile drawer variant
  return (
    <YStack
      backgroundColor="white"
      borderTopWidth={1}
      borderTopColor={colors.gray[200]}
      paddingHorizontal="$4"
      paddingVertical="$2"
    >

      {navKeys.map((item) => (
        <Button
          key={item.key}
          unstyled
          paddingVertical="$3"
          paddingHorizontal="$2"
          borderBottomWidth={1}
          borderBottomColor={colors.gray[100]}
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          onPress={() => onNavigate(item.key)}
        >
          <Text
            fontSize={isDesktopNav ? 16 : 14}
            color={item.active ? colors.green[600] : colors.gray[600]}
            fontWeight={item.active ? '700' : '500'}
          >
            {t(`feed.nav.${item.key}`)}
          </Text>
          <NavBadge count={item.badge} size="md" />
        </Button>
      ))}
    </YStack>
  )
}
