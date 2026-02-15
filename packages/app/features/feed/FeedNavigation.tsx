/**
 * FeedNavigation — Shared navigation list for desktop header and mobile drawer.
 *
 * Renders a list of nav items with badges, active state, and navigation callbacks.
 * Replaces the duplicated NAV_KEYS.map() blocks in FeedScreen.
 */

import React from 'react'
import { YStack, XStack, Text, Button } from 'tamagui'
import { useTranslation } from 'react-i18next'
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
      {...(size === 'sm' && {
        position: 'absolute' as const,
        top: -8,
        right: -14,
      })}
    >
      <Text fontSize={fontSize} color="white" fontWeight="700">
        {count}
      </Text>
    </YStack>
  )
}

export function FeedNavigation({ navKeys, variant, onNavigate }: FeedNavigationProps) {
  const { t } = useTranslation()

  if (variant === 'desktop') {
    return (
      <XStack gap="$5" marginLeft="$5">
        {navKeys.map((item) => (
          <XStack
            key={item.key}
            alignItems="center"
            position="relative"
            cursor="pointer"
            onPress={() => onNavigate(item.key)}
          >
            <Text
              fontSize="$3"
              color={item.active ? colors.green[600] : colors.gray[700]}
              fontWeight={item.active ? '600' : '500'}
              cursor="pointer"
              hoverStyle={{ color: colors.green[600] }}
            >
              {t(`feed.nav.${item.key}`)}
            </Text>
            <NavBadge count={item.badge} size="sm" />
          </XStack>
        ))}
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
            fontSize="$4"
            color={item.active ? colors.green[600] : colors.gray[700]}
            fontWeight={item.active ? '600' : '400'}
          >
            {t(`feed.nav.${item.key}`)}
          </Text>
          <NavBadge count={item.badge} size="md" />
        </Button>
      ))}
    </YStack>
  )
}
