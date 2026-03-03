import React, { useState, useEffect, useRef } from 'react'
import { YStack, XStack, Text, Button } from 'tamagui'
import { Platform, TouchableOpacity, Modal, Pressable } from 'react-native'
import { Coins, ShoppingBag, History } from '@tamagui/lucide-icons'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius, shadows } from '../../design-tokens'

interface PointsMenuProps {
  userPoints: number
  isDesktop: boolean
  onNavigateToBuyPoints?: () => void
  onNavigateToRedeemPoints?: () => void
  onNavigateToTransactionHistory?: () => void
}

export function PointsMenu({
  userPoints,
  isDesktop,
  onNavigateToBuyPoints,
  onNavigateToRedeemPoints,
  onNavigateToTransactionHistory,
}: PointsMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [androidSheetOpen, setAndroidSheetOpen] = useState(false)
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

  const handleAction = (action: 'buy' | 'redeem' | 'history') => {
    setOpen(false)
    setAndroidSheetOpen(false)
    if (action === 'buy') {
      onNavigateToBuyPoints?.()
    } else if (action === 'redeem') {
      onNavigateToRedeemPoints?.()
    } else {
      onNavigateToTransactionHistory?.()
    }
  }

  const handleMenuPress = () => {
    if (Platform.OS === 'ios') {
      const { ActionSheetIOS } = require('react-native')
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', t('feed.nav.buyPoints') || 'Buy Points', t('feed.nav.redeem') || 'Redeem Points', 'Transaction History'],
          cancelButtonIndex: 0,
        },
        (buttonIndex: number) => {
          if (buttonIndex === 1) handleAction('buy')
          if (buttonIndex === 2) handleAction('redeem')
          if (buttonIndex === 3) handleAction('history')
        }
      )
    } else if (Platform.OS === 'android') {
      setAndroidSheetOpen(true)
    } else {
      setOpen((prev) => !prev)
    }
  }

  const renderAndroidSheet = () => (
    <Modal
      visible={androidSheetOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setAndroidSheetOpen(false)}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={() => setAndroidSheetOpen(false)}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: 'white',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: 32,
          }}
        >
          {/* Handle indicator */}
          <YStack alignItems="center" paddingVertical={12}>
            <YStack width={40} height={4} borderRadius={2} backgroundColor={colors.gray[300]} />
          </YStack>

          {/* Points header */}
          <YStack alignItems="center" paddingBottom="$3">
            <Text fontSize={22} fontWeight="700" color={colors.gray[900]}>
              {userPoints.toLocaleString()} Points
            </Text>
          </YStack>

          {/* Action buttons */}
          <YStack paddingHorizontal="$4" gap="$1">
            <TouchableOpacity
              onPress={() => handleAction('buy')}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, gap: 12 }}
            >
              <YStack width={40} height={40} borderRadius={20} backgroundColor={colors.green[50]} alignItems="center" justifyContent="center">
                <Coins size={20} color={colors.green[600]} />
              </YStack>
              <Text fontSize={16} fontWeight="500" color={colors.gray[800]}>
                {t('feed.nav.buyPoints') || 'Buy Points'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleAction('redeem')}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, gap: 12 }}
            >
              <YStack width={40} height={40} borderRadius={20} backgroundColor={colors.green[50]} alignItems="center" justifyContent="center">
                <ShoppingBag size={20} color={colors.green[600]} />
              </YStack>
              <Text fontSize={16} fontWeight="500" color={colors.gray[800]}>
                {t('feed.nav.redeem') || 'Redeem Points'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleAction('history')}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, gap: 12 }}
            >
              <YStack width={40} height={40} borderRadius={20} backgroundColor={colors.green[50]} alignItems="center" justifyContent="center">
                <History size={20} color={colors.green[600]} />
              </YStack>
              <Text fontSize={16} fontWeight="500" color={colors.gray[800]}>
                Transaction History
              </Text>
            </TouchableOpacity>
          </YStack>

          {/* Cancel */}
          <YStack paddingHorizontal="$4" paddingTop="$3">
            <TouchableOpacity
              onPress={() => setAndroidSheetOpen(false)}
              activeOpacity={0.7}
              style={{
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: colors.gray[100],
                alignItems: 'center',
              }}
            >
              <Text fontSize={16} fontWeight="600" color={colors.gray[600]}>Cancel</Text>
            </TouchableOpacity>
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  )

  return (
    <YStack position="relative" zIndex={100} ref={menuRef as any}>
      <TouchableOpacity onPress={handleMenuPress} activeOpacity={0.7} testID="points-badge">
        <XStack
          backgroundColor={colors.green[50]}
          paddingHorizontal={12}
          paddingVertical={6}
          borderRadius={999}
          alignItems="center"
          gap={4}
          minHeight={44}
          justifyContent="center"
          borderWidth={1}
          borderColor={colors.green[200]}
        >
          <Text fontWeight="800" fontSize={13} color={colors.green[700]}>
            {userPoints !== null ? userPoints.toLocaleString() : '...'}
          </Text>
          {isDesktop ? (
            <Text fontSize={13} fontWeight="700" color={colors.green[700]}>
              {t('feed.header.points') || 'points'}
            </Text>
          ) : (
            <Text fontSize={13} fontWeight="800" color={colors.green[700]}>
              pts
            </Text>
          )}
        </XStack>
      </TouchableOpacity>

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

          <YStack height={1} backgroundColor={colors.gray[100]} />

          <Button
            unstyled
            paddingVertical="$3"
            paddingHorizontal="$4"
            flexDirection="row"
            alignItems="center"
            gap="$3"
            onPress={() => handleAction('history')}
            hoverStyle={{ backgroundColor: colors.green[50] }}
            pressStyle={{ backgroundColor: colors.green[100] }}
          >
            <History size={18} color={colors.green[600]} />
            <Text fontSize="$4" fontWeight="500" color={colors.gray[800]}>
              Transaction History
            </Text>
          </Button>
        </YStack>
      )}

      {Platform.OS === 'android' && renderAndroidSheet()}
    </YStack>
  )
}
