import React, { useEffect, useState } from 'react'
import { YStack, XStack, Text, ScrollView, Button, Separator } from 'tamagui'
import { TouchableOpacity, Platform, Alert, Image } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'solito/navigation'
import { useTranslation } from 'react-i18next'
import { 
  User, 
  Settings, 
  HandCoins, 
  Share2, 
  Users, 
  LogOut, 
  ChevronRight,
  ShieldCheck,
  PackageCheck,
  History
} from '@tamagui/lucide-icons'

import { useAuth, supabase } from '../auth/auth-hook'
import { usePointsBalance } from '../../hooks/usePointsBalance'
import { colors, borderRadius, shadows } from '../../design-tokens'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'

export function MenuScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, signOut } = useAuth()
  const { balance: userPoints, refetch: refetchBalance } = usePointsBalance(user?.id)

  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null)
  
  // Re-fetch profile data when menu is opened
  useEffect(() => {
    if (!user?.id) return
    const fetchProfile = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('avatar_url, full_name')
          .eq('id', user.id)
          .single()
          
        if (data) {
          setUserAvatarUrl(normalizeStorageUrl(data.avatar_url) ?? null)
          setUserDisplayName(data.full_name)
        }
      } catch (err) {
        console.error('Error fetching profile for menu:', err)
      }
    }
    fetchProfile()
    refetchBalance()
  }, [user?.id, refetchBalance])

  const handleSignOut = async () => {
    try {
      await signOut()
      router.replace('/login')
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign out')
    }
  }

  const navigateTo = (path: string) => {
    router.push(path)
  }

  const MenuItem = ({ icon: Icon, title, subtitle, onPress, destructive = false }: any) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <XStack 
        paddingVertical="$4" 
        paddingHorizontal="$4" 
        alignItems="center" 
        justifyContent="space-between"
        backgroundColor="white"
      >
        <XStack alignItems="center" gap="$3">
          <YStack 
            width={40} 
            height={40} 
            borderRadius={20} 
            backgroundColor={destructive ? colors.red[50] : colors.gray[100]} 
            alignItems="center" 
            justifyContent="center"
          >
            <Icon size={20} color={destructive ? colors.red[600] : colors.gray[700]} />
          </YStack>
          <YStack>
            <Text fontSize={16} fontWeight="600" color={destructive ? colors.red[600] : colors.gray[900]}>
              {title}
            </Text>
            {subtitle && (
              <Text fontSize={13} color={colors.gray[500]} marginTop={2}>
                {subtitle}
              </Text>
            )}
          </YStack>
        </XStack>
        {!destructive && <ChevronRight size={20} color={colors.gray[400]} />}
      </XStack>
    </TouchableOpacity>
  )

  const renderAvatar = () => {
    if (userAvatarUrl) {
      return (
        <Image 
          source={{ uri: userAvatarUrl }} 
          style={{ width: 64, height: 64, borderRadius: 32 }} 
        />
      )
    }
    
    return (
      <YStack 
        width={64} 
        height={64} 
        borderRadius={32} 
        backgroundColor={colors.green[600]} 
        alignItems="center" 
        justifyContent="center"
      >
        <Text fontSize={24} fontWeight="700" color="white">
          {userDisplayName ? userDisplayName.charAt(0).toUpperCase() : 'U'}
        </Text>
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* Header Profile Section */}
      <YStack 
        backgroundColor={colors.green[700]} 
        paddingTop={insets.top + (Platform.OS === 'ios' ? 10 : 20)}
        paddingBottom="$5"
        paddingHorizontal="$5"
      >
        <XStack alignItems="center" gap="$4">
          {renderAvatar()}
          <YStack flex={1}>
            <Text fontSize={22} fontWeight="700" color="white">
              {userDisplayName || t('header.profileTitle', 'Your Profile')}
            </Text>
            <XStack 
              marginTop="$2" 
              backgroundColor="rgba(255,255,255,0.2)" 
              alignSelf="flex-start"
              paddingHorizontal="$3"
              paddingVertical="$1.5"
              borderRadius="$full"
              alignItems="center"
              gap="$1.5"
            >
              <HandCoins size={14} color="white" />
              <Text fontSize={14} fontWeight="600" color="white">
                {userPoints !== null ? `${userPoints.toLocaleString()} pts` : '...'}
              </Text>
            </XStack>
          </YStack>
        </XStack>
      </YStack>

      <ScrollView flex={1} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        
        {/* Account Settings */}
        <YStack marginTop="$4" backgroundColor="white" borderTopWidth={1} borderBottomWidth={1} borderColor={colors.gray[200]}>
          <MenuItem 
            icon={User} 
            title={t('header.profileTitle', 'Profile & Settings')} 
            subtitle="Manage your location and details"
            onPress={() => navigateTo('/profile')} 
          />
          <Separator marginHorizontal="$4" borderColor={colors.gray[100]} />
          <MenuItem 
            icon={HandCoins} 
            title={t('header.redeem', 'Redeem Points')} 
            subtitle="Cash out your earned points"
            onPress={() => navigateTo('/redeem')} 
          />
          <Separator marginHorizontal="$4" borderColor={colors.gray[100]} />
          <MenuItem 
            icon={HandCoins} 
            title={t('header.buyPoints', 'Buy Points')} 
            subtitle="Purchase more points for the market"
            onPress={() => navigateTo('/buy-points')} 
          />
          <Separator marginHorizontal="$4" borderColor={colors.gray[100]} />
          <MenuItem 
            icon={History} 
            title="Transaction History" 
            subtitle="View all point activity"
            onPress={() => navigateTo('/transaction-history')} 
          />
          <Separator marginHorizontal="$4" borderColor={colors.gray[100]} />
          <MenuItem 
            icon={HandCoins} 
            title={t('header.refundPoints', 'Refund Points')} 
            subtitle="Return unspent points to your card"
            onPress={() => navigateTo('/points/refund')} 
          />
        </YStack>

        {/* Community Activity */}
        <YStack marginTop="$4" backgroundColor="white" borderTopWidth={1} borderBottomWidth={1} borderColor={colors.gray[200]}>
          <Text fontSize={13} fontWeight="700" color={colors.gray[500]} marginHorizontal="$4" marginTop="$4" marginBottom="$2" textTransform="uppercase">
            {t('header.nav.community', 'Community')}
          </Text>
          <MenuItem 
            icon={PackageCheck} 
            title={t('header.nav.delegateSales', 'Delegate Sales')} 
            onPress={() => navigateTo('/delegate')} 
          />
          <Separator marginHorizontal="$4" borderColor={colors.gray[100]} />
          <MenuItem 
            icon={ShieldCheck} 
            title={t('header.nav.acceptDelegation', 'Accept Delegation')} 
            onPress={() => navigateTo('/accept-delegation')} 
          />
          <Separator marginHorizontal="$4" borderColor={colors.gray[100]} />
          <MenuItem 
            icon={Share2} 
            title={t('header.nav.invite', 'Invite Friends')} 
            onPress={() => navigateTo('/invite')} 
          />
          <Separator marginHorizontal="$4" borderColor={colors.gray[100]} />
          <MenuItem 
            icon={Users} 
            title={t('header.nav.myPosts', 'My Posts')} 
            onPress={() => navigateTo('/my-posts')} 
          />
        </YStack>

        {/* System */}
        <YStack marginTop="$4" backgroundColor="white" borderTopWidth={1} borderBottomWidth={1} borderColor={colors.gray[200]}>
          <MenuItem 
            icon={LogOut} 
            title={t('header.signOut', 'Sign Out')} 
            destructive={true}
            onPress={() => {
              Alert.alert(
                t('header.signOut', 'Sign Out'),
                'Are you sure you want to sign out?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign Out', style: 'destructive', onPress: handleSignOut }
                ]
              )
            }} 
          />
        </YStack>
        
        <YStack marginTop="$6" alignItems="center">
          <Text fontSize={12} color={colors.gray[400]}>CasaGrown Version 1.0.0</Text>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
