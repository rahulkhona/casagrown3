/**
 * ChatPostCard - Read-only post card header for the chat screen
 *
 * Mirrors the FeedPostCard header layout: avatar, author name, community,
 * timestamp, post type badge, title, description, price, and quantity.
 * No action buttons.
 */

import { YStack, XStack, Text } from 'tamagui'
import { Image } from 'react-native'
import { colors, borderRadius } from '../../design-tokens'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'
import { supabase } from '../auth/auth-hook'
import type { ConversationPost } from './chat-service'

// =============================================================================
// Helpers
// =============================================================================

const POST_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  want_to_sell: { bg: colors.green[100], text: colors.green[700] },
  want_to_buy: { bg: '#dbeafe', text: '#1d4ed8' },
  offering_service: { bg: '#ffedd5', text: '#c2410c' },
  need_service: { bg: '#f3e8ff', text: '#7e22ce' },
  seeking_advice: { bg: '#fef9c3', text: '#a16207' },
  general_info: { bg: '#fce7f3', text: '#be185d' },
}

function getPostTypeLabel(type: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    want_to_sell: t('feed.postType.forSale'),
    want_to_buy: t('feed.postType.wanted'),
    offering_service: t('feed.postType.serviceOffered'),
    need_service: t('feed.postType.serviceNeeded'),
    seeking_advice: t('feed.postType.advice'),
    general_info: t('feed.postType.showAndTell'),
  }
  return map[type] || type
}

function getThumbnailUrl(storagePath: string): string | undefined {
  if (!storagePath) return undefined
  const { data } = supabase.storage
    .from('post-media')
    .getPublicUrl(storagePath)
  return normalizeStorageUrl(data?.publicUrl)
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d`
}

// =============================================================================
// Props
// =============================================================================

interface ChatPostCardProps {
  post: ConversationPost
  t: (key: string) => string
}

// =============================================================================
// Component
// =============================================================================

export function ChatPostCard({ post, t }: ChatPostCardProps) {
  const typeColor = POST_TYPE_COLORS[post.type] || POST_TYPE_COLORS.general_info

  const firstMedia = post.media.length > 0 ? post.media[0] : null
  const thumbnailUrl = firstMedia ? getThumbnailUrl(firstMedia.storage_path) : undefined

  // Parse content (may be JSON)
  let parsedTitle = ''
  let parsedDescription = ''
  try {
    const parsed = JSON.parse(post.content)
    parsedTitle = parsed.title || ''
    parsedDescription = parsed.description || ''
  } catch {
    parsedDescription = post.content || ''
  }

  const postTitle =
    post.sell_details?.produce_name ||
    (post.buy_details?.produce_names || []).join(', ') ||
    parsedTitle ||
    parsedDescription.slice(0, 60)

  const price = post.sell_details?.points_per_unit
  const unit = post.sell_details?.unit
  const quantity = post.sell_details?.total_quantity_available

  // Author info
  const authorName = post.author_name || t('feed.unknownAuthor')
  const authorInitial = authorName.charAt(0).toUpperCase()
  const avatarUrl = normalizeStorageUrl(post.author_avatar_url)

  return (
    <YStack
      backgroundColor="white"
      borderRadius={borderRadius.lg}
      overflow="hidden"
      borderWidth={1}
      borderColor={colors.gray[200]}
    >
      {/* ── Author header row (mirrors FeedPostCard) ── */}
      <XStack padding="$3" alignItems="center" gap="$3">
        {/* Avatar */}
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.gray[200],
            }}
          />
        ) : (
          <YStack
            width={40}
            height={40}
            borderRadius={20}
            backgroundColor={colors.green[100]}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={16} fontWeight="600" color={colors.green[700]}>
              {authorInitial}
            </Text>
          </YStack>
        )}

        {/* Name + community + time */}
        <YStack flex={1} gap={2}>
          <Text fontSize={14} fontWeight="600" color={colors.gray[900]}>
            {authorName}
          </Text>
          <XStack alignItems="center" gap="$1">
            {post.community_name && (
              <Text fontSize={12} color={colors.gray[500]}>
                {post.community_name}
              </Text>
            )}
            {post.community_name && (
              <Text fontSize={12} color={colors.gray[300]}>·</Text>
            )}
            <Text fontSize={12} color={colors.gray[400]}>
              {formatTimeAgo(post.created_at)}
            </Text>
          </XStack>
        </YStack>

        {/* Post type badge */}
        <YStack
          backgroundColor={(typeColor?.bg) as any}
          paddingHorizontal="$2"
          paddingVertical={3}
          borderRadius={6}
        >
          <Text fontSize={11} fontWeight="600" color={(typeColor?.text) as any}>
            {getPostTypeLabel(post.type, t)}
          </Text>
        </YStack>
      </XStack>

      {/* ── Media banner (if present) ── */}
      {thumbnailUrl && (
        <YStack height={140} width="100%">
          <Image
            source={{ uri: thumbnailUrl }}
            style={{ width: '100%', height: 140 }}
            resizeMode="cover"
          />
        </YStack>
      )}

      {/* ── Content area ── */}
      <YStack padding="$3" gap="$1">
        {/* Title */}
        <Text
          fontSize={15}
          fontWeight="600"
          color={colors.gray[900]}
          numberOfLines={2}
        >
          {postTitle}
        </Text>

        {/* Description */}
        {parsedDescription && parsedDescription !== postTitle && (
          <Text
            fontSize={13}
            color={colors.gray[600]}
            numberOfLines={3}
            lineHeight={18}
          >
            {parsedDescription}
          </Text>
        )}

        {/* Price + Quantity row */}
        <XStack alignItems="center" gap="$3" marginTop="$1" flexWrap="wrap">
          {price != null && (
            <Text fontSize={13} fontWeight="600" color={colors.green[700]}>
              {price} {t('feed.points')}{unit ? `/${unit}` : ''}
            </Text>
          )}
          {quantity != null && (
            <>
              <Text fontSize={12} color={colors.gray[300]}>·</Text>
              <Text fontSize={12} color={colors.gray[500]}>
                {t('feed.qty')}: {quantity}{unit ? ` ${unit}${quantity !== 1 ? 's' : ''}` : ''}
              </Text>
            </>
          )}
        </XStack>
      </YStack>
    </YStack>
  )
}
