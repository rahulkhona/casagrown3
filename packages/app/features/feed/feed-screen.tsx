/**
 * FeedScreen - Main feed page with Figma-aligned header and footer
 * 
 * Based on figma_extracted/src/App.tsx Header (lines 274-570) and Footer (lines 572-640)
 * Adapted from figma_extracted/src/components/MainFeed.tsx
 * 
 * Currently shows empty state - only Profile link is functional
 */

import { useState } from 'react'
import { YStack, XStack, Text, Button, ScrollView, useMedia, Input } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { useTranslation } from 'react-i18next'
import { Search, Bell, UserPlus, Home, Plus, Filter, Leaf, Menu, X } from '@tamagui/lucide-icons'
import { Platform, Image, TouchableOpacity } from 'react-native'
import { InviteModal } from './InviteModal'

// Types for invite rewards
interface InviteRewards {
  signupPoints: number
  transactionPoints: number
}

interface FeedScreenProps {
  onCreatePost?: () => void
  onNavigateToProfile?: () => void
  onNavigateToDelegate?: () => void
  logoSrc?: any // Logo image source for mobile (use require('../assets/logo.png'))
  /** User's referral code for invite link - from profile.referral_code */
  referralCode?: string
  /** Reward points for invites - from incentive_rules */
  inviteRewards?: InviteRewards
  /** User's avatar URL from profile */
  userAvatarUrl?: string
  /** User's display name - first letter used as fallback */
  userDisplayName?: string
}

// Navigation item keys - labels are localized via t()
// Badges show count of pending action items - currently 0 (will be populated from backend)
const NAV_KEYS = [
  { key: 'feed', active: true, badge: 0 },
  { key: 'chats', badge: 0 },
  { key: 'orders', badge: 0 },
  { key: 'myPosts', badge: 0 },
  { key: 'redeem', badge: 0 },
  { key: 'transferPoints', badge: 0 },
  { key: 'delegateSales', badge: 0 },
]

export function FeedScreen({ onCreatePost, onNavigateToProfile, onNavigateToDelegate, logoSrc, referralCode, inviteRewards, userAvatarUrl, userDisplayName }: FeedScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const media = useMedia()
  const isWeb = Platform.OS === 'web'
  const isDesktop = media.md || media.lg
  
  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  // User data - badges only appear when there are actual pending items
  const userPoints = 0
  const unreadNotificationsCount = 0 // No pending notifications in empty state
  const userInitial = userDisplayName ? userDisplayName.charAt(0).toUpperCase() : 'A' // First letter for avatar fallback

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* ============ HEADER ============ */}
      {/* Based on figma_extracted/src/App.tsx lines 279-569 */}
      <YStack 
        backgroundColor="white" 
        borderBottomWidth={1} 
        borderBottomColor={colors.gray[200]}
        paddingTop={insets.top || (isWeb ? 0 : 16)}
        position={isWeb ? 'sticky' as any : 'relative'}
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
            {/* Logo - Using actual CasaGrown logo */}
            <XStack 
              alignItems="center" 
              gap="$2" 
              cursor="pointer"
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

            {/* Desktop Navigation - Based on App.tsx lines 291-367 */}
            {isDesktop && (
              <XStack gap="$5" marginLeft="$5">
                {NAV_KEYS.map((item) => (
                  <XStack 
                    key={item.key} 
                    alignItems="center" 
                    position="relative"
                    cursor="pointer"
                    onPress={() => {
                      if (item.key === 'delegateSales' && onNavigateToDelegate) {
                        onNavigateToDelegate()
                      }
                    }}
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
                    {item.badge > 0 && (
                      <YStack 
                        position="absolute"
                        top={-8}
                        right={-14}
                        backgroundColor={colors.red[500]} 
                        borderRadius="$full" 
                        minWidth={18}
                        height={18}
                        alignItems="center" 
                        justifyContent="center"
                        paddingHorizontal="$1"
                      >
                        <Text fontSize={10} color="white" fontWeight="700">
                          {item.badge}
                        </Text>
                      </YStack>
                    )}
                  </XStack>
                ))}
              </XStack>
            )}
          </XStack>

          {/* Right Actions - Based on App.tsx lines 371-466 */}
          <XStack alignItems="center" gap={isDesktop ? '$3' : '$2'}>
            {/* Search Icon */}
            <TouchableOpacity
              style={{ padding: 8, borderRadius: 999, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              activeOpacity={0.6}
            >
              <Search size={20} color={colors.gray[600]} />
            </TouchableOpacity>

            {/* Invite Button - Based on App.tsx lines 381-398 */}
            {isDesktop ? (
              <Button
                backgroundColor={colors.green[600]}
                paddingHorizontal="$3"
                paddingVertical="$1.5"
                borderRadius="$full"
                gap="$2"
                hoverStyle={{ backgroundColor: colors.green[700] }}
                icon={<UserPlus size={16} color="white" />}
                onPress={() => setInviteModalOpen(true)}
              >
                <Text color="white" fontSize="$3" fontWeight="500">{t('feed.header.invite')}</Text>
              </Button>
            ) : (
              <TouchableOpacity
                style={{ padding: 8, borderRadius: 999, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                activeOpacity={0.6}
                onPress={() => {
                  setInviteModalOpen(true)
                }}
              >
                <UserPlus size={20} color={colors.green[600]} />
              </TouchableOpacity>
            )}

            {/* Points Display - Based on App.tsx lines 400-431 */}
            <TouchableOpacity
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: colors.green[50],
                borderRadius: 999,
                flexDirection: 'row',
                gap: 4,
                alignItems: 'center',
                minHeight: 44,
                justifyContent: 'center',
              }}
              activeOpacity={0.6}
            >
              <Text fontWeight="600" color={colors.green[700]}>{userPoints}</Text>
              {isDesktop && (
                <Text fontSize="$3" color={colors.green[700]}>{t('feed.header.points')}</Text>
              )}
            </TouchableOpacity>

            {/* Notifications - Based on App.tsx lines 433-444 */}
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

            {/* Profile Avatar - Based on App.tsx lines 446-458 */}
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
              onPress={onNavigateToProfile}
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

            {/* Mobile Hamburger Menu */}
            {!isDesktop && (
              <TouchableOpacity
                style={{ padding: 8, borderRadius: 999, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                activeOpacity={0.6}
                onPress={() => setMobileMenuOpen(!mobileMenuOpen)}
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
          <YStack 
            backgroundColor="white"
            borderTopWidth={1}
            borderTopColor={colors.gray[200]}
            paddingHorizontal="$4"
            paddingVertical="$2"
          >
            {NAV_KEYS.map((item) => (
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
                onPress={() => {
                  setMobileMenuOpen(false)
                  if (item.key === 'delegateSales' && onNavigateToDelegate) {
                    onNavigateToDelegate()
                  }
                }}
              >
                <Text 
                  fontSize="$4" 
                  color={item.active ? colors.green[600] : colors.gray[700]}
                  fontWeight={item.active ? '600' : '400'}
                >
                  {t(`feed.nav.${item.key}`)}
                </Text>
                {item.badge > 0 && (
                  <YStack 
                    backgroundColor={colors.red[500]} 
                    borderRadius="$full" 
                    minWidth={20}
                    height={20}
                    alignItems="center" 
                    justifyContent="center"
                    paddingHorizontal="$1"
                  >
                    <Text fontSize={11} color="white" fontWeight="700">
                      {item.badge}
                    </Text>
                  </YStack>
                )}
              </Button>
            ))}
          </YStack>
        )}
      </YStack>

      {/* ============ MAIN CONTENT ============ */}
      <ScrollView 
        flex={1}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Bar Section - Based on MainFeed.tsx lines 333-376 */}
        <YStack 
          maxWidth={896}
          width="100%"
          alignSelf="center"
          padding={isDesktop ? '$6' : '$4'}
        >
          <YStack 
            backgroundColor="white" 
            borderRadius={borderRadius.lg}
            padding="$4"
            shadowColor={shadows.sm.color}
            shadowOffset={shadows.sm.offset}
            shadowOpacity={0.05}
            shadowRadius={shadows.sm.radius}
            marginBottom="$4"
          >
            <XStack gap="$3" flexWrap={isDesktop ? 'nowrap' : 'wrap'}>
              {/* Search Input */}
              <XStack 
                flex={1}
                minWidth={200}
                backgroundColor="white"
                borderRadius="$3"
                paddingHorizontal="$3"
                alignItems="center"
                gap="$2"
                borderWidth={1}
                borderColor={colors.gray[300]}
              >
                <Search size={18} color={colors.gray[400]} />
                <Input
                  flex={1}
                  placeholder={t('feed.searchPlaceholder')}
                  placeholderTextColor={colors.gray[400]}
                  backgroundColor="transparent"
                  borderWidth={0}
                  fontSize="$3"
                  paddingVertical="$2"
                />
              </XStack>

              {/* Filter Button */}
              <Button
                backgroundColor="white"
                borderWidth={1}
                borderColor={colors.gray[300]}
                paddingHorizontal="$3"
                paddingVertical="$2"
                borderRadius="$3"
                gap="$2"
                hoverStyle={{ backgroundColor: colors.gray[50] }}
                icon={<Filter size={18} color={colors.gray[600]} />}
              >
                {isDesktop && <Text color={colors.gray[700]} fontSize="$3">{t('feed.filter')}</Text>}
              </Button>

              {/* Create Post Button */}
              <Button
                backgroundColor={colors.green[600]}
                paddingHorizontal="$4"
                paddingVertical="$2"
                borderRadius="$3"
                gap="$2"
                hoverStyle={{ backgroundColor: colors.green[700] }}
                onPress={onCreatePost}
                icon={<Plus size={18} color="white" />}
              >
                <Text color="white" fontSize="$3" fontWeight="500">{t('feed.createPost')}</Text>
              </Button>
            </XStack>
          </YStack>

          {/* Empty State - Based on MainFeed.tsx lines 449-463 */}
          <YStack 
            backgroundColor="white" 
            borderRadius={borderRadius.lg}
            padding="$8"
            alignItems="center"
            gap="$4"
            shadowColor={shadows.sm.color}
            shadowOffset={shadows.sm.offset}
            shadowOpacity={0.05}
            shadowRadius={shadows.sm.radius}
          >
            <YStack 
              width={64} 
              height={64} 
              borderRadius={32} 
              backgroundColor={colors.gray[100]} 
              alignItems="center" 
              justifyContent="center"
            >
              <Search size={32} color={colors.gray[400]} />
            </YStack>
            
            <Text fontSize="$5" fontWeight="600" color={colors.gray[900]} textAlign="center">
              {t('feed.emptyTitle')}
            </Text>
            
            <Text fontSize="$4" color={colors.gray[600]} textAlign="center">
              {t('feed.emptyDescription')}
            </Text>

            {onCreatePost && (
              <Button
                backgroundColor={colors.green[600]}
                paddingHorizontal="$5"
                paddingVertical="$3"
                borderRadius="$3"
                gap="$2"
                marginTop="$2"
                hoverStyle={{ backgroundColor: colors.green[700] }}
                onPress={onCreatePost}
                icon={<Plus size={18} color="white" />}
              >
                <Text color="white" fontSize="$4" fontWeight="500">{t('feed.createFirstPost')}</Text>
              </Button>
            )}
          </YStack>
        </YStack>

        {/* ============ FOOTER ============ */}
        {/* Based on figma_extracted/src/App.tsx lines 572-640 */}
        {/* Only show on web - mobile has navigation in header */}
        {isWeb && (
        <YStack 
          backgroundColor={colors.gray[50]} 
          borderTopWidth={1}
          borderTopColor={colors.gray[200]}
          marginTop="auto"
        >
          <YStack 
            maxWidth={896}
            width="100%"
            alignSelf="center"
            paddingHorizontal={isDesktop ? '$6' : '$4'}
            paddingVertical="$8"
          >
            {/* 3-column grid layout - matches Figma grid grid-cols-1 md:grid-cols-3 gap-8 */}
            <XStack 
              flexWrap="wrap"
              gap="$8"
              justifyContent={isDesktop ? 'space-between' : 'flex-start'}
            >
              {/* Branding Column - First column takes more space */}
              <YStack flex={1} minWidth={250} maxWidth={350}>
                {/* Logo + Brand - mb-4 in Figma */}
                <XStack alignItems="center" gap="$2" marginBottom="$4">
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
                      <Leaf size={20} color="white" />
                    </YStack>
                  )}
                  <Text fontSize="$5" fontWeight="700" color={colors.gray[900]}>
                    CasaGrown
                  </Text>
                </XStack>
                {/* Description - text-sm in Figma */}
                <Text fontSize="$3" color={colors.gray[600]} lineHeight={20}>
                  {t('feed.footer.description')}
                </Text>
              </YStack>

              {/* Learn More Column */}
              <YStack minWidth={120}>
                {/* Heading - mb-4 in Figma */}
                <Text fontSize="$3" fontWeight="600" color={colors.gray[900]} marginBottom="$4">
                  {t('feed.footer.learnMore')}
                </Text>
                {/* Links - space-y-2 in Figma */}
                <YStack gap="$2">
                  <Text fontSize="$3" color={colors.gray[600]} cursor="pointer" hoverStyle={{ color: colors.green[600] }}>
                    {t('feed.footer.whyPoints')}
                  </Text>
                  <Text fontSize="$3" color={colors.gray[600]} cursor="pointer" hoverStyle={{ color: colors.green[600] }}>
                    {t('feed.footer.howItWorks')}
                  </Text>
                  <Text fontSize="$3" color={colors.gray[600]} cursor="pointer" hoverStyle={{ color: colors.green[600] }}>
                    {t('feed.footer.support')}
                  </Text>
                </YStack>
              </YStack>

              {/* Legal Column */}
              <YStack minWidth={120}>
                {/* Heading - mb-4 in Figma */}
                <Text fontSize="$3" fontWeight="600" color={colors.gray[900]} marginBottom="$4">
                  {t('feed.footer.legal')}
                </Text>
                {/* Links - space-y-2 in Figma */}
                <YStack gap="$2">
                  <Text fontSize="$3" color={colors.gray[600]} cursor="pointer" hoverStyle={{ color: colors.green[600] }}>
                    {t('feed.footer.privacyPolicy')}
                  </Text>
                  <Text fontSize="$3" color={colors.gray[600]} cursor="pointer" hoverStyle={{ color: colors.green[600] }}>
                    {t('feed.footer.userAgreement')}
                  </Text>
                  <Text fontSize="$3" color={colors.gray[600]} cursor="pointer" hoverStyle={{ color: colors.green[600] }}>
                    {t('feed.footer.termsOfService')}
                  </Text>
                </YStack>
              </YStack>
            </XStack>

            {/* Copyright */}
            <YStack 
              marginTop="$8" 
              paddingTop="$8" 
              borderTopWidth={1} 
              borderTopColor={colors.gray[200]}
            >
              <Text fontSize="$2" color={colors.gray[500]} textAlign="center">
                {t('feed.footer.copyright')}
              </Text>
            </YStack>
          </YStack>
        </YStack>
        )}
      </ScrollView>

      {/* Floating Action Button (FAB) for mobile - Based on Figma mobile design */}
      {/* TODO: Uncomment when Create Post feature is implemented
      {!isDesktop && (
        <Button
          position="absolute"
          bottom={insets.bottom + 24}
          right={24}
          width={56}
          height={56}
          borderRadius="$full"
          backgroundColor={colors.green[600]}
          alignItems="center"
          justifyContent="center"
          elevation={4}
          shadowColor="black"
          shadowOffset={{ width: 0, height: 2 }}
          shadowOpacity={0.25}
          shadowRadius={4}
          hoverStyle={{ backgroundColor: colors.green[700] }}
          pressStyle={{ backgroundColor: colors.green[700], scale: 0.95 }}
          onPress={onCreatePost}
        >
          <Plus size={28} color="white" />
        </Button>
      )}
      */}

      {/* Invite Modal */}
      <InviteModal
        visible={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        referralCode={referralCode}
        inviteRewards={inviteRewards}
      />
    </YStack>
  )
}
