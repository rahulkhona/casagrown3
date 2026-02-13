/**
 * FeedScreen - Main feed page with Figma-aligned header and footer
 * 
 * Based on figma_extracted/src/App.tsx Header (lines 274-570) and Footer (lines 572-640)
 * Adapted from figma_extracted/src/components/MainFeed.tsx
 * 
 * Renders community feed posts with filtering, search, like/flag/share actions.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'
import { YStack, XStack, Text, Button, ScrollView, useMedia, Input, Spinner } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { useTranslation } from 'react-i18next'
import { Search, Bell, UserPlus, Home, Plus, Filter, Leaf, Menu, X } from '@tamagui/lucide-icons'
import { Platform, Image, TouchableOpacity, Alert, TextInput } from 'react-native'
import { InviteModal } from './InviteModal'
import { FeedPostCard } from './FeedPostCard'
import { getCommunityFeedPosts, togglePostLike, flagPost } from './feed-service'
import type { FeedPost } from './feed-service'
import { getCachedFeed, setCachedFeed } from './feed-cache'
import { getUnreadChatCount } from '../chat/chat-service'

// Types for invite rewards
interface InviteRewards {
  signupPoints: number
  transactionPoints: number
}

type PostTypeFilter = 'all' | 'want_to_sell' | 'want_to_buy' | 'services' | 'seeking_advice' | 'general_info'

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

  // User data
  const userPoints = 0
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
  const filteredPosts = useMemo(() => {
    let result = posts
    if (selectedFilter !== 'all') {
      if (selectedFilter === 'services') {
        result = result.filter((p) => p.type === 'offering_service' || p.type === 'need_service')
      } else {
        result = result.filter((p) => p.type === selectedFilter)
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((p) => {
        const title = p.sell_details?.produce_name || (p.buy_details?.produce_names || []).join(' ') || ''
        // Parse JSON content for search
        let contentText = p.content || ''
        try {
          const parsed = JSON.parse(p.content)
          contentText = [parsed.title, parsed.description].filter(Boolean).join(' ')
        } catch {
          // plain text, use as-is
        }
        return (
          title.toLowerCase().includes(q) ||
          contentText.toLowerCase().includes(q) ||
          (p.author_name || '').toLowerCase().includes(q) ||
          (p.sell_details?.category || '').toLowerCase().includes(q) ||
          (p.buy_details?.category || '').toLowerCase().includes(q)
        )
      })
    }
    return result
  }, [posts, selectedFilter, searchQuery])

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
                      } else if (item.key === 'myPosts' && onNavigateToMyPosts) {
                        onNavigateToMyPosts()
                      } else if (item.key === 'chats' && onNavigateToChats) {
                        onNavigateToChats()
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
                  } else if (item.key === 'myPosts' && onNavigateToMyPosts) {
                    onNavigateToMyPosts()
                  } else if (item.key === 'chats' && onNavigateToChats) {
                    onNavigateToChats()
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
        {/* Search Bar Section */}
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
              flex={1}
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
                <Input
                  flex={1}
                  placeholder={t('feed.searchPlaceholder')}
                  placeholderTextColor={colors.gray[400] as any}
                  backgroundColor="transparent"
                  borderWidth={0}
                  fontSize={14}
                  paddingVertical="$2"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  fontWeight="400"
                />
              ) : (
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    fontSize: 14,
                    paddingVertical: 8,
                    fontWeight: 'normal',
                    fontFamily: Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                    color: colors.gray[900],
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

          {/* ─── Feed Content ─── */}
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
          ) : hasPosts ? (
            <YStack gap="$4">
              {(() => {
                // If a post is highlighted, move it to the top
                let orderedPosts = filteredPosts
                if (highlightPostId) {
                  const idx = filteredPosts.findIndex(p => p.id === highlightPostId)
                  if (idx > 0) {
                    orderedPosts = [
                      filteredPosts[idx]!,
                      ...filteredPosts.slice(0, idx),
                      ...filteredPosts.slice(idx + 1),
                    ]
                  }
                }
                return orderedPosts.map((post) => (
                <YStack
                  key={post.id}
                  borderWidth={post.id === highlightPostId ? 2 : 0}
                  borderColor={post.id === highlightPostId ? colors.green[500] : 'transparent'}
                  borderRadius={post.id === highlightPostId ? borderRadius.lg : 0}
                  overflow="hidden"
                >
                <FeedPostCard
                  key={post.id}
                  post={post}
                  currentUserId={userId || ''}
                  currentUserName={userDisplayName}
                  onLikeToggle={handleLikeToggle}
                  onChat={onNavigateToChat}
                  onFlag={handleOpenFlag}
                  t={t}
                />
                </YStack>
              ))
              })()}
            </YStack>
          ) : (
            /* Empty State */
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
          )}
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
    </YStack>
  )
}
