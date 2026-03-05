import React, { useState } from 'react'
import { XStack, YStack, Text } from 'tamagui'
import { Platform, Image, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'solito/navigation'
import { HandCoins, Bell } from '@tamagui/lucide-icons'
import { useAuth } from '../auth/auth-hook'
import { usePointsBalance } from '../../hooks/usePointsBalance'
import { colors } from '../../design-tokens'
import { PointsMenu } from '../points/PointsMenu'
import { useNotificationContext } from '../notifications/NotificationContext'
import { NotificationPanel } from '../notifications/NotificationPanel'

export function MobileTabHeader() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user } = useAuth()
  const { balance: userPoints } = usePointsBalance(user?.id)
  const { unreadCount } = useNotificationContext()
  const [notifPanelOpen, setNotifPanelOpen] = useState(false)
  
  if (Platform.OS === 'web') return null

  return (
    <XStack 
      paddingHorizontal="$4" 
      paddingVertical="$2" 
      paddingTop={insets.top + (Platform.OS === 'ios' ? 10 : 20)}
      alignItems="center" 
      justifyContent="space-between"
      backgroundColor="white"
      borderBottomWidth={1}
      borderBottomColor={colors.gray[200]}
      zIndex={100}
      width="100%"
    >
      <XStack alignItems="center" gap="$2">
        <Image 
          source={require('../../assets/images/logo.png')} 
          style={{ width: 32, height: 32 }} 
          resizeMode="contain" 
          accessible={true}
          accessibilityLabel="CasaGrown Logo"
        />
      </XStack>

      <XStack alignItems="center" gap="$3">
        <PointsMenu 
          userPoints={userPoints || 0}
          isDesktop={false}
          onNavigateToBuyPoints={() => router.push('/buy-points')}
          onNavigateToRedeemPoints={() => router.push('/redeem')}
          onNavigateToTransactionHistory={() => router.push('/transaction-history')}
        />

        <XStack position="relative">
          <TouchableOpacity 
            style={{ position: 'relative' }}
            onPress={() => setNotifPanelOpen(!notifPanelOpen)}
          >
            <Bell size={24} color={colors.gray[700]} />
          </TouchableOpacity>
          {unreadCount > 0 && (
            <YStack 
              position="absolute" 
              top={-4} 
              right={-4} 
              backgroundColor={colors.red[500]} 
              borderRadius={999} 
              minWidth={16}
              height={16}
              alignItems="center" 
              justifyContent="center"
              paddingHorizontal={3}
              pointerEvents="none"
            >
              <Text fontSize={9} color="white" fontWeight="700">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </YStack>
          )}
          <NotificationPanel 
            visible={notifPanelOpen} 
            onClose={() => setNotifPanelOpen(false)} 
            userId={user?.id} 
          />
        </XStack>
      </XStack>
    </XStack>
  )
}
