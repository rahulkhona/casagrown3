'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { YStack, XStack, Text, Button, ScrollView, useMedia, Spinner } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Platform, Image, TouchableOpacity } from 'react-native'
import { Bell, UserPlus, Leaf, Menu, X } from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'

// Import navigation components from feed
import { FeedNavigation } from '../feed/FeedNavigation'
import { InviteModal } from '../feed/InviteModal'

// Import data hooks
import { useAuth, supabase } from '../auth/auth-hook'
import { usePointsBalance } from '../../hooks/usePointsBalance'
import { getUnreadChatCount } from '../chat/chat-service'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'

// Import the standalone mockup we created
import { BuyPointsStandaloneMockup } from './BuyPointsStandaloneMockup'
import { PointsMenu } from './PointsMenu'

export interface BuyPointsScreenProps {
  logoSrc?: any
  onNavigateToProfile?: () => void
  onNavigateToFeed?: () => void
  onNavigateToChats?: () => void
  onNavigateToOrders?: () => void
  onNavigateToOffers?: () => void
  onNavigateToMyPosts?: () => void
  onNavigateToDelegate?: () => void
}

const NAV_KEYS_BASE = [
  { key: 'feed', badge: 0 },
  { key: 'chats', badge: 0 },
  { key: 'orders', badge: 0 },
  { key: 'offers', badge: 0 },
  { key: 'myPosts', badge: 0 },
  { key: 'redeem', badge: 0 },
  { key: 'transferPoints', badge: 0 },
  { key: 'delegateSales', badge: 0 },
  { key: 'buyPoints', badge: 0 },
  { key: 'invite', badge: 0 },
]

export function BuyPointsScreen({
  logoSrc,
  onNavigateToProfile,
  onNavigateToFeed,
  onNavigateToChats,
  onNavigateToOrders,
  onNavigateToOffers,
  onNavigateToMyPosts,
  onNavigateToDelegate
}: BuyPointsScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const media = useMedia()
  const isWeb = Platform.OS === 'web'
  const isDesktop = media.md || media.lg

  const { user } = useAuth()
  const userId = user?.id

  // User Profile State
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | undefined>(undefined)
  const [userDisplayName, setUserDisplayName] = useState<string | undefined>(undefined)

  const normalizedAvatarUrl = normalizeStorageUrl(userAvatarUrl)
  const userInitial = userDisplayName ? userDisplayName.charAt(0).toUpperCase() : 'A'

  // Points Balance
  const { balance: userPoints } = usePointsBalance(userId)

  // Layout State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [unreadChats, setUnreadChats] = useState(0)

  // Fetch Unread Chats
  useEffect(() => {
    if (!userId) return
    const fetchChats = async () => {
      try {
        const count = await getUnreadChatCount(userId)
        setUnreadChats(count)
      } catch {
        // fail silently
      }
    }
    fetchChats()
  }, [userId])

  // Fetch User Profile Data
  useEffect(() => {
    if (!userId) return
    const fetchUserProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('avatar_url, full_name')
          .eq('id', userId)
          .single()
        
        if (!error && data) {
          if (data.avatar_url) setUserAvatarUrl(data.avatar_url)
          if (data.full_name) setUserDisplayName(data.full_name)
        }
      } catch (err) {
        console.error('Error fetching user profile:', err)
      }
    }
    fetchUserProfile()
  }, [userId])

  // Compute Badges
  const NAV_KEYS = useMemo(() =>
    NAV_KEYS_BASE.map((item) =>
      item.key === 'chats' ? { ...item, badge: unreadChats } : item
    ),
    [unreadChats]
  )

  const handleNavPress = useCallback((key: string) => {
    if (key === 'feed') onNavigateToFeed?.()
    else if (key === 'delegateSales') onNavigateToDelegate?.()
    else if (key === 'myPosts') onNavigateToMyPosts?.()
    else if (key === 'chats') onNavigateToChats?.()
    else if (key === 'orders') onNavigateToOrders?.()
    else if (key === 'offers') onNavigateToOffers?.()
  }, [onNavigateToFeed, onNavigateToDelegate, onNavigateToMyPosts, onNavigateToChats, onNavigateToOrders, onNavigateToOffers])

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* HEADER (Replicated from FeedScreen) */}
      <YStack 
        backgroundColor="white" 
        borderBottomWidth={1} 
        borderBottomColor={colors.gray[200]}
        paddingTop={insets.top || (isWeb ? 0 : 16)}
        position={isWeb ? ('sticky' as 'sticky') : 'relative'}
        top={0}
        zIndex={50}
      >
        <XStack 
          paddingHorizontal={isDesktop ? '$6' : '$4'} 
          height={64}
          alignItems="center"
          justifyContent="space-between"
          maxWidth={1280}
          width="100%"
          alignSelf="center"
        >
          {/* Left: Logo + Nav */}
          <XStack alignItems="center" gap="$2" flex={1}>
            <XStack 
              alignItems="center" 
              gap="$2" 
              cursor="pointer"
              onPress={onNavigateToFeed}
            >
              {isWeb ? (
                <img 
                  src="/logo.png" 
                  alt="CasaGrown" 
                  style={{ width: 32, height: 32, objectFit: 'contain' }} 
                />
              ) : logoSrc ? (
                <Image
                  source={logoSrc}
                  style={{ width: 32, height: 32 }}
                  resizeMode="contain"
                />
              ) : (
                <YStack 
                  width={32} 
                  height={32} 
                  borderRadius="$full" 
                  backgroundColor={colors.green[600]} 
                  alignItems="center" 
                  justifyContent="center"
                >
                  <Leaf size={18} color="white" />
                </YStack>
              )}
              {isDesktop && (
                <Text fontSize="$5" fontWeight="700" color={colors.gray[900]}>
                  CasaGrown
                </Text>
              )}
            </XStack>

            {isDesktop && (
              <FeedNavigation
                navKeys={NAV_KEYS}
                variant="desktop"
                onNavigate={handleNavPress}
              />
            )}
          </XStack>

          {/* Right Actions */}
          <XStack alignItems="center" gap={isDesktop ? '$3' : '$2'}>

            {/* Points Sub-Menu */}
            <PointsMenu
              userPoints={userPoints}
              isDesktop={isDesktop}
              onNavigateToBuyPoints={() => {}}
              onNavigateToRedeemPoints={() => console.log('Redeem clicked')}
            />

            {/* Notifications */}
            <XStack position="relative">
              <TouchableOpacity
                style={{ padding: 8, borderRadius: 999, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                activeOpacity={0.6}
              >
                <Bell size={20} color={colors.gray[600]} />
              </TouchableOpacity>
            </XStack>

            {/* Profile Avatar */}
            <TouchableOpacity
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: normalizedAvatarUrl ? undefined : colors.green[600],
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
              activeOpacity={0.7}
              onPress={onNavigateToProfile}
            >
              {normalizedAvatarUrl ? (
                <Image 
                  source={{ uri: normalizedAvatarUrl }}
                  style={{ width: 44, height: 44, borderRadius: 22 }}
                />
              ) : (
                <Text color="white" fontWeight="600" fontSize="$3">{userInitial}</Text>
              )}
            </TouchableOpacity>

            {/* Mobile Hamburger Menu */}
            {!isDesktop && (
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
            )}
          </XStack>
        </XStack>

        {/* Mobile Navigation Drawer */}
        {!isDesktop && mobileMenuOpen && (
          <FeedNavigation
            navKeys={NAV_KEYS}
            variant="mobile"
            userPoints={userPoints}
            onNavigate={(key) => {
              setMobileMenuOpen(false)
              if (key === 'invite') {
                setInviteModalOpen(true)
              } else if (key === 'buyPoints') {
                // Already on Buy Points screen, maybe just close drawer
              } else {
                handleNavPress(key)
              }
            }}
          />
        )}
      </YStack>

      <InviteModal 
        visible={inviteModalOpen} 
        onClose={() => setInviteModalOpen(false)} 
        referralCode={undefined} // Minimal mock for modal
        inviteRewards={{ signupPoints: 50, transactionPoints: 100 }}
      />
      
      {/* MAIN CONTENT AREA */}
      <ScrollView 
        flex={1} 
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <YStack
          maxWidth={896}
          width="100%"
          alignSelf="center"
          paddingHorizontal={isDesktop ? '$6' : '$4'}
          paddingVertical="$6"
        >
          {/* Embedded Standalone Mockup */}
          <BuyPointsStandaloneMockup t={t} />
        </YStack>
      </ScrollView>

    </YStack>
  )
}
