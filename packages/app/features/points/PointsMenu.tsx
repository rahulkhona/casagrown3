import React, { useState, useEffect, useRef } from 'react'
import { YStack, Text, Button } from 'tamagui'
import { Platform, ActionSheetIOS, Alert } from 'react-native'
import { Coins, ShoppingBag } from '@tamagui/lucide-icons'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius, shadows } from '../../design-tokens'

interface PointsMenuProps {
  userPoints: number
  isDesktop: boolean
  onNavigateToBuyPoints?: () => void
  onNavigateToRedeemPoints?: () => void
}

export function PointsMenu({
  userPoints,
  isDesktop,
  onNavigateToBuyPoints,
  onNavigateToRedeemPoints,
}: PointsMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<any>(null)

  // Web-only: click away to close
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const handleAction = (action: 'buy' | 'redeem') => {
    setOpen(false)
    if (action === 'buy') {
      onNavigateToBuyPoints?.()
    } else {
      onNavigateToRedeemPoints?.()
    }
  }

  const handleMenuPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', t('feed.nav.buyPoints') || 'Buy Points', t('feed.nav.redeem') || 'Redeem Points'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) handleAction('buy')
          if (buttonIndex === 2) handleAction('redeem')
        }
      )
    } else if (Platform.OS === 'android') {
      Alert.alert(
        `${userPoints} Points`,
        'Select an action',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: t('feed.nav.buyPoints') || 'Buy Points', onPress: () => handleAction('buy') },
          { text: t('feed.nav.redeem') || 'Redeem Points', onPress: () => handleAction('redeem') }
        ],
        { cancelable: true }
      )
    } else {
      setOpen((prev) => !prev)
    }
  }

  return (
    <YStack position="relative" zIndex={100} ref={menuRef as any}>
      <Button
        unstyled
        backgroundColor={colors.green[50]}
        paddingHorizontal={12}
        paddingVertical={6}
        borderRadius={999}
        flexDirection="row"
        gap={4}
        alignItems="center"
        minHeight={44}
        justifyContent="center"
        pressStyle={{ backgroundColor: colors.green[100] }}
        hoverStyle={{ backgroundColor: colors.green[100] }}
        onPress={handleMenuPress}
      >
        <Text fontWeight="600" color={colors.green[700]}>
          {userPoints}
        </Text>
        {isDesktop ? (
          <Text fontSize="$3" color={colors.green[700]}>
            {t('feed.header.points') || 'points'}
          </Text>
        ) : (
          <Text fontSize="$3" color={colors.green[700]}>
            pts
          </Text>
        )}
      </Button>

      {open && Platform.OS === 'web' && (
        <YStack
          position="absolute"
          top="100%"
          right={0}
          marginTop="$2"
          width={200}
          backgroundColor="white"
          borderRadius={borderRadius.md}
          borderWidth={1}
          borderColor={colors.gray[200]}
          elevation={Platform.OS === 'web' ? undefined : 2}
          shadowColor={shadows.lg.color}
          shadowOffset={shadows.lg.offset}
          shadowOpacity={0.1}
          shadowRadius={shadows.lg.radius}
          overflow="hidden"
          zIndex={1000}
        >
          <Button
            unstyled
            paddingVertical="$3"
            paddingHorizontal="$4"
            flexDirection="row"
            alignItems="center"
            gap="$3"
            onPress={() => handleAction('buy')}
            hoverStyle={{ backgroundColor: colors.green[50] }}
            pressStyle={{ backgroundColor: colors.green[100] }}
          >
            <Coins size={18} color={colors.green[600]} />
            <Text fontSize="$4" fontWeight="500" color={colors.gray[800]}>
              {t('feed.nav.buyPoints') || 'Buy Points'}
            </Text>
          </Button>

          <YStack height={1} backgroundColor={colors.gray[100]} />

          <Button
            unstyled
            paddingVertical="$3"
            paddingHorizontal="$4"
            flexDirection="row"
            alignItems="center"
            gap="$3"
            onPress={() => handleAction('redeem')}
            hoverStyle={{ backgroundColor: colors.green[50] }}
            pressStyle={{ backgroundColor: colors.green[100] }}
          >
            <ShoppingBag size={18} color={colors.green[600]} />
            <Text fontSize="$4" fontWeight="500" color={colors.gray[800]}>
              {t('feed.nav.redeem') || 'Redeem Points'}
            </Text>
          </Button>
        </YStack>
      )}
    </YStack>
  )
}
