/**
 * FeedScreen - Main feed page with Figma-aligned header and footer
 * 
 * Based on figma_extracted/src/App.tsx Header (lines 274-570) and Footer (lines 572-640)
 * Adapted from figma_extracted/src/components/MainFeed.tsx
 * 
 * Renders community feed posts with filtering, search, like/flag/share actions.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'
import { YStack, XStack, Text, Button, ScrollView, useMedia, Input, Spinner } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { useTranslation } from 'react-i18next'
import { Search, Bell, UserPlus, Home, Plus, Filter, Leaf, Menu, X } from '@tamagui/lucide-icons'
import { Platform, Image, TouchableOpacity, Alert, TextInput, FlatList } from 'react-native'
import { InviteModal } from './InviteModal'
import { FeedPostCard } from './FeedPostCard'
import { OrderSheet } from './OrderSheet'
import { FeedNavigation } from './FeedNavigation'
import type { OrderFormData } from './OrderSheet'
import { getCommunityFeedPosts, togglePostLike, flagPost } from './feed-service'
import type { FeedPost } from './feed-service'
import { getCachedFeed, setCachedFeed } from './feed-cache'
import { getUnreadChatCount } from '../chat/chat-service'
import { usePointsBalance } from '../../hooks/usePointsBalance'
import { supabase } from '../auth/auth-hook'
import { filterPosts, type PostTypeFilter } from './feed-filter'

// Types for invite rewards
interface InviteRewards {
  signupPoints: number
  transactionPoints: number
}



const FILTER_OPTIONS: { value: PostTypeFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'feed.filterAll' },
  { value: 'want_to_sell', labelKey: 'feed.filterForSale' },
  { value: 'want_to_buy', labelKey: 'feed.filterWanted' },
  { value: 'services', labelKey: 'feed.filterServices' },
  { value: 'seeking_advice', labelKey: 'feed.filterAdvice' },
  { value: 'general_info', labelKey: 'feed.filterShowAndTell' },
]

interface FeedScreenProps {
  onCreatePost?: () => void
  onNavigateToProfile?: () => void
  onNavigateToDelegate?: () => void
  onNavigateToMyPosts?: () => void
  logoSrc?: any
  referralCode?: string
  inviteRewards?: InviteRewards
  userAvatarUrl?: string
  userDisplayName?: string
  /** H3 index of the user's community — used to fetch feed posts */
  communityH3Index?: string
  /** Currently authenticated user's ID */
  userId?: string
  /** Post ID to highlight (from shared link) */
  highlightPostId?: string
  /** Navigate to chat with a post author */
  onNavigateToChat?: (postId: string, authorId: string) => void
  /** Navigate to chat inbox */
  onNavigateToChats?: () => void
}

// Navigation item keys - labels are localized via t()
// Badges show count of pending action items
const NAV_KEYS_BASE = [
  { key: 'feed', active: true, badge: 0 },
  { key: 'chats', badge: 0 },
  { key: 'orders', badge: 0 },
  { key: 'myPosts', badge: 0 },
  { key: 'redeem', badge: 0 },
  { key: 'transferPoints', badge: 0 },
  { key: 'delegateSales', badge: 0 },
]

export function FeedScreen({ onCreatePost, onNavigateToProfile, onNavigateToDelegate, onNavigateToMyPosts, logoSrc, referralCode, inviteRewards, userAvatarUrl: rawAvatarUrl, userDisplayName, communityH3Index, userId, highlightPostId, onNavigateToChat, onNavigateToChats }: FeedScreenProps) {
  const userAvatarUrl = normalizeStorageUrl(rawAvatarUrl)
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const media = useMedia()
  const isWeb = Platform.OS === 'web'
  const isDesktop = media.md || media.lg
  
  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  // Feed state
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<PostTypeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  /** Tracks the cached latestCreatedAt so focus checks can avoid refetch */
  const cachedTimestampRef = React.useRef<string | null>(null)
  /** Whether initial load (with cache restore) has completed */
  const initialLoadDone = React.useRef(false)

  // Flag modal state
  const [flagModalVisible, setFlagModalVisible] = useState(false)
  const [flagPostId, setFlagPostId] = useState<string | null>(null)
  const [flagReason, setFlagReason] = useState('')
  const [flagSubmitting, setFlagSubmitting] = useState(false)

  // Order modal state
  const [orderPost, setOrderPost] = useState<FeedPost | null>(null)

  // User data — load real balance from point_ledger
  const { balance: userPoints, refetch: refetchBalance } = usePointsBalance(userId)
  const unreadNotificationsCount = 0
  const userInitial = userDisplayName ? userDisplayName.charAt(0).toUpperCase() : 'A'

  // Unread chat count
  const [unreadChats, setUnreadChats] = useState(0)

  // Fetch unread chat count on mount and focus
  const fetchUnreadChats = useCallback(async () => {
    if (!userId) return
    try {
      const count = await getUnreadChatCount(userId)
      setUnreadChats(count)
    } catch {
      // Non-critical: badge just stays at 0
    }
  }, [userId])

  useEffect(() => {
    fetchUnreadChats()
  }, [fetchUnreadChats])

  // Build NAV_KEYS with dynamic badge count
  const NAV_KEYS = useMemo(() =>
    NAV_KEYS_BASE.map((item) =>
      item.key === 'chats' ? { ...item, badge: unreadChats } : item
    ),
    [unreadChats],
  )

  // Consolidated navigation handler — used by FeedNavigation for both variants
  const handleNavPress = useCallback((key: string) => {
    if (key === 'delegateSales') onNavigateToDelegate?.()
    else if (key === 'myPosts') onNavigateToMyPosts?.()
    else if (key === 'chats') onNavigateToChats?.()
  }, [onNavigateToDelegate, onNavigateToMyPosts, onNavigateToChats])

  // ── Full fetch: download all posts and update cache ──
  const fullFetch = useCallback(async (showSpinner: boolean) => {
    if (!communityH3Index || !userId) return
    if (showSpinner) setLoading(true)
    setError(null)
    try {
      const data = await getCommunityFeedPosts(communityH3Index, userId)
      setPosts(data)
      // Update latestCreatedAt ref synchronously so focus checks see fresh value
      if (data.length > 0) {
        cachedTimestampRef.current = data.reduce(
          (latest, p) => (p.created_at > latest ? p.created_at : latest),
          data[0]!.created_at,
        )
      } else {
        cachedTimestampRef.current = null
      }
      // Persist to cache in background (non-blocking)
      setCachedFeed(communityH3Index, data).catch(() => { /* non-critical */ })
    } catch (err: any) {
      // Only show error if we have no cached data to display
      if (posts.length === 0) {
        setError(err?.message || 'Failed to load feed')
      }
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [communityH3Index, userId])

  // ── Initial load: restore cache then conditionally fetch ──
  useEffect(() => {
    if (!communityH3Index || !userId) return
    let cancelled = false

    const init = async () => {
      // 1. Restore from cache for instant display
      const cached = await getCachedFeed(communityH3Index)
      if (cancelled) return

      if (cached && cached.posts.length > 0) {
        setPosts(cached.posts)
        cachedTimestampRef.current = cached.latestCreatedAt
      }

      // 2. Always do a full fetch to get fresh like/comment counts.
      //    Show spinner only when we have nothing cached to display.
      await fullFetch(!cached || cached.posts.length === 0)

      if (!cancelled) initialLoadDone.current = true
    }

    init()
    return () => { cancelled = true }
  }, [communityH3Index, userId, fullFetch])

  // ── Re-focus: conditional refresh (native only) ──
  const focusCallback = useCallback(() => {
    if (!communityH3Index || !userId || !initialLoadDone.current) return

    // Always refresh to pick up new likes, comments, and posts from other users
    fullFetch(false)
    // Also refresh unread chat count
    fetchUnreadChats()
  }, [communityH3Index, userId, fullFetch, fetchUnreadChats])

  if (Platform.OS !== 'web') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useFocusEffect(focusCallback)
  }

  // Filtered posts
  const filteredPosts = useMemo(
    () => filterPosts(posts, selectedFilter, searchQuery),
    [posts, selectedFilter, searchQuery],
  )

  // Handlers
  const handleLikeToggle = useCallback(async (postId: string, newLiked: boolean) => {
    if (!userId) return
    try {
      await togglePostLike(postId, userId, !newLiked)
    } catch {
      // Optimistic update already happened in card; silently fail
    }
  }, [userId])

  const handleOpenFlag = useCallback((postId: string) => {
    setFlagPostId(postId)
    setFlagReason('')
    setFlagModalVisible(true)
  }, [])

  // Keep a stable ref to filteredPosts for use in callbacks
  const postsRef = useRef(filteredPosts)
  postsRef.current = filteredPosts

  const handleOpenOrder = useCallback((postId: string) => {
    const post = postsRef.current.find(p => p.id === postId)
    if (post) setOrderPost(post)
  }, [])

  const handleOrderSubmit = useCallback(async (data: OrderFormData) => {
    if (!userId || !orderPost) return

    try {
      const { data: result, error } = await supabase.functions.invoke('create-order', {
        body: {
          postId: orderPost.id,
          sellerId: orderPost.author_id,
          quantity: data.quantity,
          pointsPerUnit: orderPost.sell_details?.points_per_unit ?? 0,
          totalPrice: data.totalPrice,
          category: orderPost.sell_details?.category ?? 'fruits',
          product: orderPost.sell_details?.produce_name ?? orderPost.content?.slice(0, 50) ?? 'Item',
          deliveryDate: data.latestDate,
          deliveryInstructions: data.instructions,
          deliveryAddress: data.address,
        },
      })

      if (error) {
        Alert.alert('Order Failed', error.message || 'Failed to place order')
        return
      }

      // Refresh balance after successful order
      await refetchBalance()
      setOrderPost(null)
      Alert.alert('Order Placed', `Your order has been placed! New balance: ${result?.newBalance ?? userPoints} points`)
    } catch (err) {
      Alert.alert('Error', 'An unexpected error occurred while placing your order')
      console.error('Order submission error:', err)
    }
  }, [userId, orderPost, refetchBalance, userPoints])


  const handleSubmitFlag = useCallback(async () => {
    if (!flagPostId || !userId || !flagReason.trim()) return
    setFlagSubmitting(true)
    try {
      await flagPost(flagPostId, userId, flagReason.trim())
      setFlagModalVisible(false)
      setFlagPostId(null)
      setFlagReason('')
    } catch {
      // Error handling — could show toast
    } finally {
      setFlagSubmitting(false)
    }
  }, [flagPostId, userId, flagReason])

  const hasPosts = filteredPosts.length > 0 || loading

  // Reorder posts if one is highlighted (move to top)
  const orderedPosts = useMemo(() => {
    if (!highlightPostId) return filteredPosts
    const idx = filteredPosts.findIndex(p => p.id === highlightPostId)
    if (idx <= 0) return filteredPosts
    return [
      filteredPosts[idx]!,
      ...filteredPosts.slice(0, idx),
      ...filteredPosts.slice(idx + 1),
    ]
  }, [filteredPosts, highlightPostId])

  // FlatList renderItem
  const renderPostItem = useCallback(({ item: post }: { item: FeedPost }) => (
    <YStack
      borderWidth={post.id === highlightPostId ? 2 : 0}
      borderColor={post.id === highlightPostId ? colors.green[500] : 'transparent'}
      borderRadius={post.id === highlightPostId ? borderRadius.lg : 0}
      overflow="hidden"
    >
      <FeedPostCard
        post={post}
        currentUserId={userId || ''}
        currentUserName={userDisplayName}
        onLikeToggle={handleLikeToggle}
        onOrder={handleOpenOrder}
        onChat={onNavigateToChat}
        onFlag={handleOpenFlag}
        t={t}
      />
    </YStack>
  ), [highlightPostId, userId, userDisplayName, handleLikeToggle, handleOpenOrder, onNavigateToChat, handleOpenFlag, t])

  const keyExtractor = useCallback((item: FeedPost) => item.id, [])

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* ============ HEADER ============ */}
      {/* Based on figma_extracted/src/App.tsx lines 279-569 */}
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

            {/* Desktop Navigation */}
            {isDesktop && (
              <FeedNavigation
                navKeys={NAV_KEYS}
                variant="desktop"
                onNavigate={handleNavPress}
              />
            )}
          </XStack>

          {/* Right Actions - Based on App.tsx lines 371-466 */}
          <XStack alignItems="center" gap={isDesktop ? '$3' : '$2'}>

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
                accessibilityLabel="Menu"
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
            onNavigate={(key) => {
              setMobileMenuOpen(false)
              handleNavPress(key)
            }}
          />
        )}
      </YStack>

      {/* ============ MAIN CONTENT ============ */}
      <FlatList
        data={loading || error ? [] : orderedPosts}
        renderItem={renderPostItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        ListHeaderComponent={
          <YStack 
            maxWidth={896}
            width="100%"
            alignSelf="center"
            padding={isDesktop ? '$6' : '$4'}
            gap="$4"
          >
            <YStack 
              backgroundColor="white" 
              borderRadius={borderRadius.lg}
              padding="$4"
              shadowColor={shadows.sm.color}
              shadowOffset={shadows.sm.offset}
              shadowOpacity={0.05}
              shadowRadius={shadows.sm.radius}
              gap="$3"
            >
              {/* Search Input */}
              <XStack 
                backgroundColor="white"
                borderRadius="$3"
                paddingHorizontal="$3"
                alignItems="center"
                gap="$2"
                borderWidth={1}
                borderColor={colors.gray[300]}
              >
                <Search size={18} color={colors.gray[400]} />
                {Platform.OS === 'web' ? (
                  <input
                    type="text"
                    placeholder={t('feed.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e: any) => setSearchQuery(e.target.value)}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      fontSize: 14,
                      fontWeight: '400',
                      padding: '8px 0',
                      color: colors.gray[900],
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <TextInput
                    style={{
                      flex: 1,
                      backgroundColor: 'transparent',
                      fontSize: 14,
                      paddingVertical: 8,
                      fontWeight: 'normal',
                      fontFamily: Platform.OS === 'ios' ? 'System' : undefined,
                      color: colors.gray[900],
                      letterSpacing: 0,
                    }}
                    placeholder={t('feed.searchPlaceholder')}
                    placeholderTextColor={colors.gray[400]}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                )}
              </XStack>

              {/* Filter Pills — below search, above create post */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <XStack gap="$2" paddingVertical="$1">
                  {FILTER_OPTIONS.map((opt) => {
                    const isActive = selectedFilter === opt.value
                    return (
                      <Button
                        key={opt.value}
                        size="$3"
                        backgroundColor={isActive ? colors.green[600] : colors.gray[100]}
                        borderRadius={20}
                        paddingHorizontal="$3"
                        paddingVertical="$1"
                        pressStyle={isActive ? { backgroundColor: colors.green[700] } : { backgroundColor: colors.gray[200] }}
                        onPress={() => setSelectedFilter(opt.value)}
                      >
                        <Text
                          fontSize={13}
                          fontWeight={isActive ? '600' : '500'}
                          color={isActive ? 'white' : colors.gray[700]}
                        >
                          {t(opt.labelKey)}
                        </Text>
                      </Button>
                    )
                  })}
                </XStack>
              </ScrollView>

              {/* Create Post Button — inline on desktop */}
              {isDesktop && (
                <Button
                  backgroundColor={colors.green[600]}
                  paddingHorizontal="$4"
                  paddingVertical="$2"
                  borderRadius="$3"
                  gap="$2"
                  hoverStyle={{ backgroundColor: colors.green[700] }}
                  pressStyle={{ backgroundColor: colors.green[700] }}
                  onPress={onCreatePost}
                  icon={<Plus size={18} color="white" />}
                >
                  <Text color="white" fontSize="$3" fontWeight="500">{t('feed.createPost')}</Text>
                </Button>
              )}

              {/* Create Post Button — full-width on mobile */}
              {!isDesktop && (
                <Button
                  backgroundColor={colors.green[600]}
                  paddingVertical="$3"
                  borderRadius="$3"
                  gap="$2"
                  minHeight={48}
                  pressStyle={{ backgroundColor: colors.green[700], scale: 0.98 }}
                  onPress={onCreatePost}
                  icon={<Plus size={20} color="white" />}
                >
                  <Text color="white" fontSize="$4" fontWeight="600">{t('feed.createPost')}</Text>
                </Button>
              )}
            </YStack>

            {/* ─── Loading / Error states (above the list) ─── */}
            {loading ? (
              <YStack padding="$8" alignItems="center">
                <Spinner size="large" color={colors.green[600]} />
                <Text marginTop="$3" color={colors.gray[500]}>{t('feed.loading')}</Text>
              </YStack>
            ) : error ? (
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
                <Text fontSize="$4" color={colors.gray[600]} textAlign="center">{error}</Text>
                <Button
                  backgroundColor={colors.green[600]}
                  paddingHorizontal="$5"
                  paddingVertical="$2"
                  borderRadius="$3"
                  pressStyle={{ backgroundColor: colors.green[700] }}
                  onPress={() => fullFetch(true)}
                >
                  <Text color="white" fontWeight="500">{t('feed.retry')}</Text>
                </Button>
              </YStack>
            ) : null}
          </YStack>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <YStack
              maxWidth={896}
              width="100%"
              alignSelf="center"
              paddingHorizontal={isDesktop ? '$6' : '$4'}
            >
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
          ) : null
        }
        ItemSeparatorComponent={() => <YStack height={16} />}
        ListFooterComponent={
          isWeb ? (
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
          ) : null
        }
      />

      {/* Floating Action Button (FAB) for mobile - Based on Figma mobile design */}
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

      {/* Invite Modal */}
      <InviteModal
        visible={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        referralCode={referralCode}
        inviteRewards={inviteRewards}
      />

      {/* ─── Flag Modal ─── */}
      {flagModalVisible && (
        <YStack
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor="rgba(0,0,0,0.5)"
          justifyContent="center"
          alignItems="center"
          zIndex={100}
          padding="$4"
        >
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius.lg}
            padding="$5"
            width="100%"
            maxWidth={400}
            gap="$4"
          >
            <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
              {t('feed.flag.title')}
            </Text>
            <Text fontSize={14} color={colors.gray[600]}>
              {t('feed.flag.description')}
            </Text>
            <YStack
              borderWidth={1}
              borderColor={colors.gray[300]}
              borderRadius={borderRadius.md}
              padding="$3"
              minHeight={100}
            >
              <TextInput
                placeholder={t('feed.flag.placeholder')}
                value={flagReason}
                onChangeText={setFlagReason}
                multiline
                numberOfLines={4}
                style={{ fontSize: 14, color: colors.gray[800], minHeight: 80 }}
              />
            </YStack>
            <XStack gap="$3" justifyContent="flex-end">
              <Button
                backgroundColor={colors.gray[100]}
                paddingHorizontal="$4"
                paddingVertical="$2"
                borderRadius="$3"
                pressStyle={{ backgroundColor: colors.gray[200] }}
                onPress={() => {
                  setFlagModalVisible(false)
                  setFlagPostId(null)
                  setFlagReason('')
                }}
              >
                <Text color={colors.gray[700]} fontWeight="500">{t('feed.flag.cancel')}</Text>
              </Button>
              <Button
                backgroundColor={flagReason.trim() ? '#ef4444' : colors.gray[300]}
                paddingHorizontal="$4"
                paddingVertical="$2"
                borderRadius="$3"
                disabled={!flagReason.trim() || flagSubmitting}
                pressStyle={{ backgroundColor: '#dc2626' }}
                onPress={handleSubmitFlag}
              >
                <Text color="white" fontWeight="500">
                  {flagSubmitting ? t('feed.flag.submitting') : t('feed.flag.submit')}
                </Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      )}

      {/* ─── Order Modal ─── */}
      <OrderSheet
        visible={orderPost !== null}
        post={orderPost}
        userPoints={userPoints}
        onClose={() => setOrderPost(null)}
        onSubmit={handleOrderSubmit}
        onBalanceChanged={refetchBalance}
        t={t}
      />
    </YStack>
  )
}
