import React from 'react'
import { XStack, Text } from 'tamagui'
import { Platform, Image, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'solito/navigation'
import { HandCoins, Bell } from '@tamagui/lucide-icons'
import { useAuth } from '../auth/auth-hook'
import { usePointsBalance } from '../../hooks/usePointsBalance'
import { colors } from '../../design-tokens'

export function MobileTabHeader() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user } = useAuth()
  const { balance: userPoints } = usePointsBalance(user?.id)
  
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
        <TouchableOpacity onPress={() => router.push('/buy-points')}>
          <XStack 
            backgroundColor={colors.green[50]} 
            paddingHorizontal="$2.5" 
            paddingVertical="$1.5" 
            borderRadius="$full" 
            alignItems="center" 
            gap="$1.5" 
            borderWidth={1} 
            borderColor={colors.green[200]}
          >
            <HandCoins size={14} color={colors.green[700]} />
            <Text fontSize={13} fontWeight="800" color={colors.green[700]}>
              {userPoints !== null ? `${userPoints.toLocaleString()} pts` : '...'}
            </Text>
          </XStack>
        </TouchableOpacity>

        <TouchableOpacity style={{ position: 'relative' }}>
          <Bell size={24} color={colors.gray[700]} />
        </TouchableOpacity>
      </XStack>
    </XStack>
  )
}
