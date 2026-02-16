/**
 * MyPostsScreen - View, manage, repost, and clone your posts
 *
 * Features:
 * - Post cards with type/status badges, stats, action buttons
 * - Filter tabs: All, Selling, Buying, Services, Advice
 * - Repost: re-activate an expired/old post with fresh timestamp
 * - Clone: copy post data to create-post form for editing
 * - Delete: soft-delete with confirmation modal
 * - Empty state with "Create First Post" CTA
 * - Flagged posts alert banner
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Spinner, Separator, Input } from 'tamagui'
import { Platform, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, shadows, borderRadius, tc } from '../../design-tokens'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Plus,
  Eye,
  Edit3,
  Trash2,
  RefreshCw,
  Copy,
  AlertTriangle,
  FileText,
  Search,
} from '@tamagui/lucide-icons'
import { getUserPosts, deletePost, repostPost, getPostTypePolicies, type UserPost } from './my-posts-service'
import { useAuth } from '../auth/auth-hook'

// =============================================================================
// Types
// =============================================================================

type TypeFilter = 'all' | 'want_to_sell' | 'want_to_buy' | 'offering_service' | 'need_service' | 'seeking_advice' | 'general_info'
type StatusFilter = 'all' | 'active' | 'expired' | 'flagged'
type OwnerFilter = 'all' | 'mine' | 'delegate'
type SortOrder = 'newest' | 'oldest'

interface MyPostsScreenProps {
  onBack?: () => void
  onCreatePost?: () => void
  onClone?: (cloneData: string) => void
  onViewPost?: (postId: string) => void
  onEditPost?: (postId: string, postType: string) => void
}

// =============================================================================
// Helpers
// =============================================================================

const POST_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  want_to_sell: { label: 'Selling', color: colors.green[700], bg: colors.green[100] },
  want_to_buy: { label: 'Buying', color: colors.blue[700], bg: colors.blue[100] },
  offering_service: { label: 'Service', color: colors.purple[700], bg: colors.purple[100] },
  need_service: { label: 'Service', color: colors.purple[700], bg: colors.purple[100] },
  seeking_advice: { label: 'Advice', color: colors.amber[700], bg: colors.amber[200] },
  general_info: { label: 'Show & Tell', color: colors.gray[700], bg: colors.gray[100] },
}

function getPostStatus(post: UserPost, policies: Record<string, number>): 'active' | 'expired' {
  const expirationDays = policies[post.type] || 30
  const expirationMs = expirationDays * 24 * 60 * 60 * 1000
  const createdAt = new Date(post.created_at).getTime()
  const now = Date.now()
  return (now - createdAt) > expirationMs ? 'expired' : 'active'
}

function getDaysAgo(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

// =============================================================================
// Post Card Component
// =============================================================================

function PostCard({
  post,
  onView,
  onEdit,
  onRepost,
  onClone,
  onDelete,
  policies,
  t,
}: {
  post: UserPost
  onView: () => void
  onEdit: () => void
  onRepost: () => void
  onClone: () => void
  onDelete: () => void
  policies: Record<string, number>
  t: (key: string) => string
}) {
  const typeConfig = POST_TYPE_CONFIG[post.type] || POST_TYPE_CONFIG.general_info
  const status = getPostStatus(post, policies)
  const daysAgo = getDaysAgo(post.created_at)

  // Parse content JSON for display
  let description = ''
  try {
    const parsed = JSON.parse(post.content)
    description = parsed.description || parsed.title || ''
  } catch {
    description = post.content || ''
  }

  // Truncate description
  const truncated = description.length > 120 ? description.substring(0, 120) + '…' : description

  return (
    <YStack
      backgroundColor="white"
      borderRadius={borderRadius.lg}
      padding="$4"
      gap="$3"
      borderWidth={1}
      borderColor={colors.gray[200]}
      shadowColor={shadows.sm.color}
      shadowOffset={shadows.sm.offset}
      shadowOpacity={0.08}
      shadowRadius={shadows.sm.radius}
      elevation={1}
    >
      {/* Top Row: Type Badge + Status Badge */}
      <XStack justifyContent="space-between" alignItems="center">
        <XStack
          backgroundColor={tc(typeConfig.bg)}
          paddingHorizontal="$2.5"
          paddingVertical="$1"
          borderRadius="$3"
        >
          <Text fontSize={12} fontWeight="600" color={tc(typeConfig.color)}>
            {typeConfig.label}
          </Text>
        </XStack>

        <XStack
          backgroundColor={status === 'active' ? colors.green[50] : colors.gray[100]}
          paddingHorizontal="$2.5"
          paddingVertical="$1"
          borderRadius="$3"
        >
          <Text
            fontSize={11}
            fontWeight="600"
            color={status === 'active' ? colors.green[700] : colors.gray[500]}
          >
            {status === 'active' ? t('myPosts.statusActive') : t('myPosts.statusExpired')}
          </Text>
        </XStack>
      </XStack>

      {/* Description */}
      <Text fontSize={14} color={colors.gray[800]} lineHeight={20} numberOfLines={3}>
        {truncated}
      </Text>

      {/* Category + Price (for sell posts) */}
      {post.sell_details && (
        <XStack gap="$3" flexWrap="wrap">
          <Text fontSize={12} color={colors.gray[500]}>
            {post.sell_details.produce_name} · {post.sell_details.category}
          </Text>
          <Text fontSize={12} fontWeight="600" color={colors.green[600]}>
            ${Number(post.sell_details.points_per_unit).toFixed(2)}/{post.sell_details.unit}
          </Text>
        </XStack>
      )}

      {/* Buy details */}
      {post.buy_details && (
        <Text fontSize={12} color={colors.gray[500]}>
          {Array.isArray(post.buy_details.produce_names)
            ? post.buy_details.produce_names.join(', ')
            : ''}{' '}
          · {post.buy_details.category}
        </Text>
      )}

      {/* Community name */}
      {post.community_name && (
        <Text fontSize={12} color={colors.gray[400]}>
          📍 {post.community_name}
        </Text>
      )}

      {/* Stats Row */}
      <XStack gap="$4" paddingTop="$1">
        <Text fontSize={11} color={colors.gray[400]}>
          {t('myPosts.postedAgo').replace('{{days}}', String(daysAgo))}
        </Text>
      </XStack>

      {/* Separator */}
      <Separator borderColor={colors.gray[100]} />

      {/* Action Buttons */}
      <XStack gap="$2" flexWrap="wrap">
        <ActionButton icon={<Eye size={14} color={colors.gray[600]} />} label={t('myPosts.view')} onPress={onView} />
        <ActionButton icon={<Edit3 size={14} color={colors.blue[600]} />} label={t('myPosts.edit')} onPress={onEdit} />
        {status === 'expired' && (
          <ActionButton icon={<RefreshCw size={14} color={colors.green[600]} />} label={t('myPosts.repost')} onPress={onRepost} />
        )}
        <ActionButton icon={<Copy size={14} color={colors.purple[600]} />} label={t('myPosts.clone')} onPress={onClone} />
        <ActionButton icon={<Trash2 size={14} color={colors.red[500]} />} label={t('myPosts.delete')} onPress={onDelete} variant="danger" />
      </XStack>
    </YStack>
  )
}

function ActionButton({
  icon,
  label,
  onPress,
  variant,
}: {
  icon: React.ReactElement
  label: string
  onPress: () => void
  variant?: 'danger'
}) {
  return (
    <Button
      size="$2"
      backgroundColor={variant === 'danger' ? colors.red[50] : colors.gray[50]}
      borderWidth={1}
      borderColor={variant === 'danger' ? colors.red[200] : colors.gray[200]}
      borderRadius="$3"
      icon={icon}
      onPress={onPress}
      paddingHorizontal="$2.5"
      hoverStyle={{ backgroundColor: variant === 'danger' ? colors.red[100] : colors.gray[100] }}
      pressStyle={{ opacity: 0.8 }}
    >
      <Text fontSize={12} color={variant === 'danger' ? colors.red[600] : colors.gray[700]} fontWeight="500">
        {label}
      </Text>
    </Button>
  )
}

// =============================================================================
// Filter Dropdowns
// =============================================================================

const TYPE_OPTIONS: { value: TypeFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'myPosts.filterAny' },
  { value: 'want_to_sell', labelKey: 'myPosts.filterSelling' },
  { value: 'want_to_buy', labelKey: 'myPosts.filterBuying' },
  { value: 'offering_service', labelKey: 'myPosts.filterOfferService' },
  { value: 'need_service', labelKey: 'myPosts.filterNeedService' },
  { value: 'seeking_advice', labelKey: 'myPosts.filterAdvice' },
  { value: 'general_info', labelKey: 'myPosts.filterShowTell' },
]

const STATUS_OPTIONS: { value: StatusFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'myPosts.filterAny' },
  { value: 'active', labelKey: 'myPosts.filterActive' },
  { value: 'expired', labelKey: 'myPosts.filterExpired' },
  { value: 'flagged', labelKey: 'myPosts.filterFlagged' },
]

const OWNER_OPTIONS: { value: OwnerFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'myPosts.filterAny' },
  { value: 'mine', labelKey: 'myPosts.filterMine' },
  { value: 'delegate', labelKey: 'myPosts.filterDelegate' },
]

const SORT_OPTIONS: { value: SortOrder; labelKey: string }[] = [
  { value: 'newest', labelKey: 'myPosts.sortNewest' },
  { value: 'oldest', labelKey: 'myPosts.sortOldest' },
]

function FilterDropdown<T extends string>({
  label,
  options,
  value,
  onChange,
  t,
}: {
  label: string
  options: { value: T; labelKey: string }[]
  value: T
  onChange: (v: T) => void
  t: (key: string) => string
}) {
  const [open, setOpen] = useState(false)
  const selectedLabel = options.find((o) => o.value === value)
  const displayText = selectedLabel ? t(selectedLabel.labelKey) : t('myPosts.filterAll')

  return (
    <YStack flex={1} gap="$1">
      <Text fontSize={11} fontWeight="600" color={colors.gray[500]} textTransform="uppercase">
        {label}
      </Text>
      <Button
        size="$3"
        backgroundColor="white"
        borderWidth={1}
        borderColor={open ? colors.green[400] : colors.gray[300]}
        borderRadius={borderRadius.md}
        onPress={() => setOpen(!open)}
        justifyContent="space-between"
        paddingHorizontal="$3"
      >
        <Text fontSize={13} color={colors.gray[800]} fontWeight="500">
          {displayText}
        </Text>
        <Text fontSize={10} color={colors.gray[400]}>
          {open ? '▲' : '▼'}
        </Text>
      </Button>
      {open && (
        <YStack
          backgroundColor="white"
          borderWidth={1}
          borderColor={colors.gray[200]}
          borderRadius={borderRadius.md}
          shadowColor={shadows.sm.color}
          shadowOffset={shadows.sm.offset}
          shadowOpacity={0.12}
          shadowRadius={shadows.sm.radius}
          elevation={3}
          overflow="hidden"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <Button
                key={opt.value}
                size="$3"
                backgroundColor={isSelected ? colors.green[50] : 'white'}
                borderRadius={0}
                onPress={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                justifyContent="flex-start"
                paddingHorizontal="$3"
                hoverStyle={{ backgroundColor: colors.gray[50] }}
              >
                <Text
                  fontSize={13}
                  fontWeight={isSelected ? '600' : '400'}
                  color={isSelected ? colors.green[700] : colors.gray[700]}
                >
                  {t(opt.labelKey)}
                </Text>
              </Button>
            )
          })}
        </YStack>
      )}
    </YStack>
  )
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState({ onCreatePost, t }: { onCreatePost?: () => void; t: (key: string) => string }) {
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" padding="$8" gap="$4">
      <YStack
        width={80}
        height={80}
        borderRadius={40}
        backgroundColor={colors.green[50]}
        alignItems="center"
        justifyContent="center"
      >
        <FileText size={36} color={colors.green[400]} />
      </YStack>
      <Text fontSize={18} fontWeight="700" color={colors.gray[800]} textAlign="center">
        {t('myPosts.emptyTitle')}
      </Text>
      <Text fontSize={14} color={colors.gray[500]} textAlign="center" maxWidth={300}>
        {t('myPosts.emptyDescription')}
      </Text>
      {onCreatePost && (
        <Button
          backgroundColor={colors.green[600]}
          borderRadius="$4"
          paddingHorizontal="$5"
          height="$4.5"
          icon={<Plus size={18} color="white" />}
          onPress={onCreatePost}
          marginTop="$2"
          hoverStyle={{ backgroundColor: colors.green[700] }}
          pressStyle={{ backgroundColor: colors.green[700] }}
        >
          <Text color="white" fontWeight="600" fontSize={14}>
            {t('myPosts.createFirst')}
          </Text>
        </Button>
      )}
    </YStack>
  )
}

// =============================================================================
// Main Screen
// =============================================================================

export function MyPostsScreen({
  onBack,
  onCreatePost,
  onClone,
  onViewPost,
  onEditPost,
}: MyPostsScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [posts, setPosts] = useState<UserPost[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [policies, setPolicies] = useState<Record<string, number>>({})

  // Fetch posts and policies
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [data, pols] = await Promise.all([
          getUserPosts(user.id),
          getPostTypePolicies(),
        ])
        if (!cancelled) {
          setPosts(data)
          setPolicies(pols)
        }
      } catch (err) {
        console.error('Failed to load posts:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, refreshKey])

  // Filter posts by type + status + search query
  const filteredPosts = useMemo(() => {
    let result = posts

    // Filter by type
    if (typeFilter !== 'all') {
      result = result.filter((p) => p.type === typeFilter)
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((p) => getPostStatus(p, policies) === statusFilter)
    }

    // Filter by search query (keywords only)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter((p) => {
        // Match against content (description, title, produce name)
        try {
          const parsed = JSON.parse(p.content)
          const text = [parsed.title, parsed.description, parsed.produceName].filter(Boolean).join(' ').toLowerCase()
          if (text.includes(q)) return true
        } catch {
          if ((p.content || '').toLowerCase().includes(q)) return true
        }

        // Match against sell/buy details
        if (p.sell_details) {
          const sellText = [p.sell_details.produce_name, p.sell_details.category].filter(Boolean).join(' ').toLowerCase()
          if (sellText.includes(q)) return true
        }
        if (p.buy_details) {
          const buyText = [p.buy_details.category, ...(p.buy_details.produce_names || [])].filter(Boolean).join(' ').toLowerCase()
          if (buyText.includes(q)) return true
        }

        // Match against community name
        if (p.community_name && p.community_name.toLowerCase().includes(q)) return true

        return false
      })
    }

    // Filter by owner (self vs delegate)
    if (ownerFilter === 'mine') {
      result = result.filter((p) => !p.on_behalf_of)
    } else if (ownerFilter === 'delegate') {
      result = result.filter((p) => !!p.on_behalf_of)
    }

    // Sort by date
    if (sortOrder === 'oldest') {
      result = [...result].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    }
    // 'newest' is already the default order from the query

    return result
  }, [posts, typeFilter, statusFilter, ownerFilter, sortOrder, searchQuery, policies])

  // Only show the owner filter if the user has at least one delegate post
  const hasDelegatePosts = useMemo(() => posts.some((p) => !!p.on_behalf_of), [posts])

  // --- Actions ---

  const handleDelete = useCallback(async (postId: string) => {
    try {
      await deletePost(postId, user!.id)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }, [user, t])

  const handleRepost = useCallback(async (postId: string) => {
    const doRepost = async () => {
      try {
        await repostPost(postId, user!.id)
        setRefreshKey((k) => k + 1) // Refresh to get updated timestamp
      } catch (err) {
        console.error('Repost failed:', err)
      }
    }

    if (Platform.OS === 'web') {
      if (window.confirm(t('myPosts.repostConfirmBody'))) {
        await doRepost()
      }
    } else {
      Alert.alert(
        t('myPosts.repostConfirmTitle'),
        t('myPosts.repostConfirmBody'),
        [
          { text: t('myPosts.cancel'), style: 'cancel' },
          { text: t('myPosts.repost'), onPress: doRepost },
        ]
      )
    }
  }, [user, t])

  const handleClone = useCallback((post: UserPost) => {
    // Serialize relevant data for pre-filling create-post form
    const cloneData = JSON.stringify({
      type: post.type,
      content: post.content,
      community_h3_index: post.community_h3_index,
      sell_details: post.sell_details,
      buy_details: post.buy_details,
      media: post.media,
      delivery_dates: post.delivery_dates,
    })
    onClone?.(cloneData)
  }, [onClone])

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* Header */}
      <YStack
        backgroundColor="white"
        borderBottomWidth={1}
        borderBottomColor={colors.gray[200]}
        paddingTop={insets.top || (Platform.OS === 'web' ? 0 : 16)}
      >
        <XStack
          paddingHorizontal="$4"
          height={56}
          alignItems="center"
          justifyContent="space-between"
        >
          <XStack alignItems="center" gap="$3">
            {onBack && (
              <Button
                icon={<ArrowLeft size={20} color={colors.gray[700]} />}
                unstyled
                onPress={onBack}
                pressStyle={{ opacity: 0.7 }}
                padding="$1"
                accessibilityLabel="Back"
              />
            )}
            <Text fontSize={20} fontWeight="700" color={colors.gray[900]}>
              {t('myPosts.title')}
            </Text>
            {!loading && (
              <YStack
                backgroundColor={colors.green[100]}
                paddingHorizontal="$2"
                paddingVertical="$0.5"
                borderRadius="$full"
              >
                <Text fontSize={12} fontWeight="600" color={colors.green[700]}>
                  {posts.length}
                </Text>
              </YStack>
            )}
          </XStack>

          {onCreatePost && (
            <Button
              size="$3"
              backgroundColor={colors.green[600]}
              borderRadius="$full"
              icon={<Plus size={16} color="white" />}
              onPress={onCreatePost}
              hoverStyle={{ backgroundColor: colors.green[700] }}
              pressStyle={{ backgroundColor: colors.green[700] }}
            >
              <Text color="white" fontWeight="600" fontSize={13}>
                {t('myPosts.newPost')}
              </Text>
            </Button>
          )}
        </XStack>
      </YStack>

      {/* Content */}
      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.green[600]} />
        </YStack>
      ) : posts.length === 0 ? (
        <EmptyState onCreatePost={onCreatePost} t={t} />
      ) : (
        <ScrollView
          flex={1}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
        >
          <YStack gap="$4" maxWidth={600} alignSelf="center" width="100%">
            {/* Search Bar */}
            <XStack
              backgroundColor="white"
              borderRadius={borderRadius.md}
              borderWidth={1}
              borderColor={colors.gray[200]}
              paddingHorizontal="$3"
              alignItems="center"
              gap="$2"
            >
              <Search size={16} color={colors.gray[400]} />
              <Input
                flex={1}
                placeholder={t('myPosts.searchPlaceholder')}
                placeholderTextColor={tc(colors.gray[400])}
                value={searchQuery}
                onChangeText={setSearchQuery}
                borderWidth={0}
                backgroundColor="transparent"
                fontSize={14}
                paddingVertical="$2.5"
                color={colors.gray[800]}
              />
            </XStack>

            {/* Filter Dropdowns */}
            <XStack gap="$3" flexWrap="wrap">
              <FilterDropdown<TypeFilter>
                label={t('myPosts.filterTypeLabel') || 'Type'}
                options={TYPE_OPTIONS}
                value={typeFilter}
                onChange={setTypeFilter}
                t={t}
              />
              <FilterDropdown<StatusFilter>
                label={t('myPosts.filterStatusLabel') || 'Status'}
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
                t={t}
              />
              {hasDelegatePosts && (
                <FilterDropdown<OwnerFilter>
                  label={t('myPosts.filterOwnerLabel') || 'Owner'}
                  options={OWNER_OPTIONS}
                  value={ownerFilter}
                  onChange={setOwnerFilter}
                  t={t}
                />
              )}
              <FilterDropdown<SortOrder>
                label={t('myPosts.sortLabel') || 'Sort'}
                options={SORT_OPTIONS}
                value={sortOrder}
                onChange={setSortOrder}
                t={t}
              />
            </XStack>

            {/* Post Cards */}
            {filteredPosts.length === 0 ? (
              <YStack alignItems="center" padding="$8">
                <Text fontSize={14} color={colors.gray[400]}>
                  {t('myPosts.noPostsInFilter')}
                </Text>
              </YStack>
            ) : (
              filteredPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  policies={policies}
                  t={t}
                  onView={() => onViewPost?.(post.id)}
                  onEdit={() => onEditPost?.(post.id, post.type)}
                  onRepost={() => handleRepost(post.id)}
                  onClone={() => handleClone(post)}
                  onDelete={() => handleDelete(post.id)}
                />
              ))
            )}
          </YStack>
        </ScrollView>
      )}
    </YStack>
  )
}
