import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { YStack, XStack, Text, ScrollView } from 'tamagui'
import { Image, TouchableOpacity, Platform } from 'react-native'
import { useAuth, supabase } from '../auth/auth-hook'
import { usePointsBalance } from '../../hooks/usePointsBalance'
import { getUnreadChatCount } from '../chat/chat-service'
import { getOpenOrderCount } from '../orders/order-service'
import { getOpenOfferCount } from '../offers/offer-service'
import { Bell, Menu, X } from '@tamagui/lucide-icons'
import { useRouter } from 'solito/navigation'
import { FeedNavigation } from '../feed/FeedNavigation'
import { PointsMenu } from '../points/PointsMenu'
import { useMedia } from 'tamagui'
import { useTranslation } from 'react-i18next'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../design-tokens'

const NAV_KEYS_BASE = [
  { key: 'feed', active: false, badge: 0 },
  { key: 'chats', badge: 0 },
  { key: 'orders', badge: 0 },
  { key: 'offers', badge: 0 },
  { key: 'myPosts', badge: 0 },
  { key: 'redeem', badge: 0 },
  { key: 'transferPoints', badge: 0 },
  { key: 'delegateSales', badge: 0 },
  { key: 'acceptDelegation', badge: 0 },
  { key: 'buyPoints', badge: 0 },
  { key: 'invite', badge: 0 },
]

export function AppHeader({ activeKey = 'feed' }: { activeKey?: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { balance: userPoints } = usePointsBalance(user?.id)
  const media = useMedia()
  // @ts-ignore
  const isDesktop = media.lg || media.xl || media.xxl
  const insets = useSafeAreaInsets()
  
  const [unreadChats, setUnreadChats] = useState(0)
  const [openOrders, setOpenOrders] = useState(0)
  const [openOffers, setOpenOffers] = useState(0)
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  // Unread notifications (stubbed for now to 0 like FeedScreen)
  const unreadNotificationsCount = 0

  useEffect(() => {
    if (!user?.id) return
    const fetchProfile = async () => {
      const { data } = await supabase.from('profiles').select('avatar_url, full_name').eq('id', user.id).single()
      if (data) {
        setUserAvatarUrl(normalizeStorageUrl(data.avatar_url) ?? null)
        setUserDisplayName(data.full_name)
      }
    }
    fetchProfile()
    
    const fetchCounts = async () => {
      try {
        const [chatCount, orderCount, offerCount] = await Promise.all([
          getUnreadChatCount(user.id),
          getOpenOrderCount(user.id),
          getOpenOfferCount(user.id)
        ])
        setUnreadChats(chatCount)
        setOpenOrders(orderCount)
        setOpenOffers(offerCount)
      } catch (err) {
        console.error('Failed to fetch header counts:', err)
      }
    }
    fetchCounts()
  }, [user?.id])

  const NAV_KEYS = useMemo(() =>
    NAV_KEYS_BASE.map((item) => {
      let badge = item.badge
      if (item.key === 'chats') badge = unreadChats
      else if (item.key === 'orders') badge = openOrders
      else if (item.key === 'offers') badge = openOffers
      
      return {
        ...item,
        badge,
        active: item.key === activeKey
      }
    }),
    [unreadChats, openOrders, openOffers, activeKey],
  )

  const PRIMARY_NAV_KEYS = ['feed', 'chats', 'orders', 'offers']

  const headerNavKeys = useMemo(() => 
    NAV_KEYS.filter(item => PRIMARY_NAV_KEYS.includes(item.key)),
  [NAV_KEYS])

  const hamburgerNavKeys = useMemo(() => 
    NAV_KEYS.filter(item => !PRIMARY_NAV_KEYS.includes(item.key)),
  [NAV_KEYS])

  const handleNavPress = useCallback((key: string) => {
    if (key === 'feed') router.push('/feed')
    else if (key === 'delegateSales') router.push('/delegate')
    else if (key === 'acceptDelegation') router.push('/accept-delegation')
    else if (key === 'myPosts') router.push('/my-posts')
    else if (key === 'chats') router.push('/chats')
    else if (key === 'orders') router.push('/orders')
    else if (key === 'offers') router.push('/offers')
    else if (key === 'buyPoints') router.push('/buy-points')
    else if (key === 'redeem') router.push('/redeem')
    else if (key === 'invite') router.push('/invite')
  }, [router])

  const userInitial = userDisplayName ? userDisplayName.charAt(0).toUpperCase() : 'A'

  return (
    <YStack 
      backgroundColor="white" 
      borderBottomWidth={1} 
      borderBottomColor={colors.gray[200]}
      paddingTop={insets.top || 0}
      position="sticky"
      top={0}
      zIndex={50}
    >
      <XStack 
        paddingHorizontal={isDesktop ? '$6' : '$4'} 
        minHeight={64}
        paddingVertical={isDesktop ? "$2" : "$3"}
        alignItems="center"
        justifyContent="space-between"
        maxWidth={1280}
        width="100%"
        alignSelf="center"
      >
        <XStack alignItems="center" gap="$2" flex={1}>
          <XStack 
            alignItems="center" 
            gap="$2" 
            cursor="pointer"
            onPress={() => handleNavPress('feed')}
            flexShrink={0}
          >
            {Platform.OS === 'web' ? (
              <img 
                src="/logo.png" 
                alt="CasaGrown" 
                style={{ width: 32, height: 32, objectFit: 'contain' }} 
              />
            ) : (
              <Image 
                source={require('../../assets/images/logo.png')} 
                style={{ width: 32, height: 32 }} 
                resizeMode="contain" 
              />
            )}
            {isDesktop && (
              <Text fontSize="$5" fontWeight="700" color={colors.gray[900]}>
                CasaGrown
              </Text>
            )}
          </XStack>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} flex={1}>
              <FeedNavigation
                navKeys={headerNavKeys}
                variant="desktop"
                onNavigate={handleNavPress}
              />
          </ScrollView>
        </XStack>

        <XStack alignItems="center" gap={isDesktop ? '$3' : '$2'}>
          <PointsMenu
            userPoints={userPoints}
            isDesktop={isDesktop}
            onNavigateToBuyPoints={() => handleNavPress('buyPoints')}
            onNavigateToRedeemPoints={() => handleNavPress('redeem')}
          />

          <XStack position="relative">
            <TouchableOpacity
              style={{ padding: 8, borderRadius: 999, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              activeOpacity={0.6}
            >
              <Bell size={20} color={colors.gray[600]} />
            </TouchableOpacity>
            {unreadNotificationsCount > 0 && (
              <YStack 
                position="absolute" 
                top={0} 
                right={0} 
                backgroundColor={colors.red[500]} 
                borderRadius="$full" 
                minWidth={18}
                height={18}
                alignItems="center" 
                justifyContent="center"
                paddingHorizontal="$1"
              >
                <Text fontSize={10} color="white" fontWeight="700">
                  {unreadNotificationsCount}
                </Text>
              </YStack>
            )}
          </XStack>

          <TouchableOpacity
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: userAvatarUrl ? undefined : colors.green[600],
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
            activeOpacity={0.7}
            onPress={() => router.push('/profile')}
          >
            {userAvatarUrl ? (
              <Image 
                source={{ uri: userAvatarUrl }}
                style={{ width: 44, height: 44, borderRadius: 22 }}
              />
            ) : (
              <Text color="white" fontWeight="600" fontSize="$3">{userInitial}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={{ padding: 8, borderRadius: 999, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.6}
            onPress={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? (
              <X size={24} color={colors.gray[700]} />
            ) : (
              <Menu size={24} color={colors.gray[700]} />
            )}
          </TouchableOpacity>
        </XStack>
      </XStack>

      {mobileMenuOpen && (
        <FeedNavigation
          navKeys={hamburgerNavKeys}
          variant="mobile"
          userPoints={userPoints}
          onNavigate={(key) => {
            setMobileMenuOpen(false)
            handleNavPress(key)
          }}
        />
      )}
    </YStack>
  )
}
