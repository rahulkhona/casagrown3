/**
 * FeedPostCard - A single post card in the community feed
 *
 * Based on figma_code/src/components/MainFeed.tsx lines 467-666
 * Uses Tamagui primitives + design tokens for cross-platform rendering.
 */

import { useState, useCallback, useEffect, memo } from 'react'
import { YStack, XStack, Text, Button, Input, ScrollView } from 'tamagui'
import { Image, Platform, Share, Alert, TextInput } from 'react-native'
import { Heart, ShoppingCart, ThumbsUp, MessageCircle, MessagesSquare, Share2, Flag, Play, Send, Calendar, Package } from '@tamagui/lucide-icons'
import { FeedVideoPlayer } from './FeedVideoPlayer'
import { colors, shadows, borderRadius, tc } from '../../design-tokens'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'
import { supabase } from '../auth/auth-hook'
import { getPostComments, addComment } from './feed-service'
import type { FeedPost, PostComment } from './feed-service'

// =============================================================================
// Types
// =============================================================================

export interface FeedPostCardProps {
  post: FeedPost
  currentUserId: string
  currentUserName?: string
  onLikeToggle?: (postId: string, newLiked: boolean) => void
  onOrder?: (postId: string) => void
  onOffer?: (postId: string) => void
  onChat?: (postId: string, authorId: string) => void
  onFlag?: (postId: string) => void
  t: (key: string) => string
}

// =============================================================================
// Helpers
// =============================================================================

const POST_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  want_to_sell: { bg: colors.green[100], text: colors.green[700] },
  want_to_buy: { bg: '#dbeafe', text: '#1d4ed8' }, // blue-100/700
  offering_service: { bg: '#ffedd5', text: '#c2410c' }, // orange-100/700
  need_service: { bg: '#f3e8ff', text: '#7e22ce' }, // purple-100/700
  seeking_advice: { bg: '#fef9c3', text: '#a16207' }, // yellow-100/700
  general_info: { bg: '#fce7f3', text: '#be185d' }, // pink-100/700
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

function getTimeAgo(dateStr: string, t: (k: string) => string): string {
  const seconds = Math.floor(
    (new Date().getTime() - new Date(dateStr).getTime()) / 1000
  )
  if (seconds < 60) return t('feed.time.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function getThumbnailUrl(storagePath: string): string | undefined {
  if (!storagePath) return undefined
  const { data } = supabase.storage
    .from('post-media')
    .getPublicUrl(storagePath)
  return normalizeStorageUrl(data?.publicUrl)
}

// =============================================================================
// Component
// =============================================================================

function FeedPostCardInner({
  post,
  currentUserId,
  currentUserName,
  onLikeToggle,
  onOrder,
  onOffer,
  onChat,
  onFlag,
  t,
}: FeedPostCardProps) {
  const [liked, setLiked] = useState(post.is_liked)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [flagged, setFlagged] = useState(post.is_flagged)
  const [commentsExpanded, setCommentsExpanded] = useState(false)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentCount, setCommentCount] = useState(post.comment_count)
  const [submittingComment, setSubmittingComment] = useState(false)

  // Sync local state when parent re-fetches with updated counts
  useEffect(() => { setLiked(post.is_liked) }, [post.is_liked])
  useEffect(() => { setLikeCount(post.like_count) }, [post.like_count])
  useEffect(() => { setCommentCount(post.comment_count) }, [post.comment_count])
  useEffect(() => { setFlagged(post.is_flagged) }, [post.is_flagged])

  const toggleComments = useCallback(async () => {
    const willExpand = !commentsExpanded
    setCommentsExpanded(willExpand)
    if (willExpand && !commentsLoaded) {
      try {
        const data = await getPostComments(post.id)
        setComments(data)
        setCommentsLoaded(true)
      } catch {
        // Silently fail — user can retry
      }
    }
  }, [commentsExpanded, commentsLoaded, post.id])

  const handleSubmitComment = useCallback(async () => {
    const text = commentText.trim()
    if (!text || submittingComment) return
    setSubmittingComment(true)
    try {
      const newComment = await addComment(post.id, currentUserId, text, currentUserName || null)
      setComments(prev => [...prev, newComment])
      setCommentCount(prev => prev + 1)
      setCommentText('')
    } catch {
      // Silently fail
    } finally {
      setSubmittingComment(false)
    }
  }, [commentText, submittingComment, post.id, currentUserId, currentUserName])

  const typeColor = POST_TYPE_COLORS[post.type] || POST_TYPE_COLORS.general_info

  const firstMedia = post.media.length > 0 ? post.media[0] : null
  const isVideo = firstMedia?.media_type === 'video'
  const thumbnailUrl = firstMedia ? getThumbnailUrl(firstMedia.storage_path) : undefined

  const isOwnPost = post.author_id === currentUserId

  const handleLike = () => {
    const newLiked = !liked
    setLiked(newLiked)
    setLikeCount((prev) => prev + (newLiked ? 1 : -1))
    onLikeToggle?.(post.id, newLiked)
  }

  const handleShare = async () => {
    const shareTitle = post.sell_details?.produce_name || post.buy_details?.produce_names?.[0] || parsedTitle || post.content?.slice(0, 50)
    const shareUrl = Platform.OS === 'web'
      ? `${window.location.origin}/post/${post.id}`
      : `https://casagrown.com/post/${post.id}`
    const shareText = `Check out this post on CasaGrown: ${shareTitle}`
    try {
      if (Platform.OS === 'web') {
        // Use Web Share API for native OS share picker
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ title: shareTitle, text: shareText, url: shareUrl })
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
        }
      } else {
        await Share.share({ message: `${shareText}\n${shareUrl}`, url: shareUrl })
      }
    } catch {
      // User cancelled or share failed — silently ignore
    }
  }

  // Derive display values — content may be JSON {"title":"...","description":"..."}
  const authorInitial = (post.author_name || 'U').charAt(0).toUpperCase()

  let parsedTitle = ''
  let parsedDescription = ''
  try {
    const parsed = JSON.parse(post.content)
    parsedTitle = parsed.title || ''
    parsedDescription = parsed.description || ''
  } catch {
    // Plain text content
    parsedDescription = post.content || ''
  }

  const postTitle =
    post.sell_details?.produce_name ||
    (post.buy_details?.produce_names || []).join(', ') ||
    parsedTitle ||
    parsedDescription.slice(0, 60)
  const postDescription =
    parsedDescription || parsedTitle // show whichever is available
  const price = post.sell_details?.points_per_unit
  const unit = post.sell_details?.unit
  const category =
    post.sell_details?.category || post.buy_details?.category || ''

  return (
    <YStack
      backgroundColor="white"
      borderRadius={borderRadius.lg}
      overflow="hidden"
      shadowColor={shadows.sm.color}
      shadowOffset={shadows.sm.offset}
      shadowOpacity={0.08}
      shadowRadius={shadows.sm.radius}
      elevation={2}
    >
      {/* ─── Post Header ─── */}
      <XStack
        padding="$3"
        borderBottomWidth={1}
        borderBottomColor={colors.gray[100]}
        alignItems="flex-start"
        justifyContent="space-between"
      >
        <XStack gap="$3" alignItems="center" flex={1}>
          {/* Author Avatar */}
          {post.author_avatar_url ? (
            <Image
              source={{ uri: normalizeStorageUrl(post.author_avatar_url) }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
              }}
            />
          ) : (
            <YStack
              width={40}
              height={40}
              borderRadius={20}
              backgroundColor={colors.green[600]}
              alignItems="center"
              justifyContent="center"
            >
              <Text color="white" fontWeight="600" fontSize={16}>
                {authorInitial}
              </Text>
            </YStack>
          )}

          {/* Author Info */}
          <YStack flex={1}>
            <Text fontSize={14} fontWeight="600" color={colors.gray[900]}>
              {post.author_name || t('feed.unknownAuthor')}
            </Text>
            <Text fontSize={12} color={colors.gray[500]} numberOfLines={1}>
              {post.community_name} · {getTimeAgo(post.created_at, t)}
            </Text>
          </YStack>
        </XStack>

        {/* Type Badge */}
        <YStack
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius={12}
          backgroundColor={tc(typeColor.bg)}
        >
          <Text fontSize={11} fontWeight="600" color={tc(typeColor.text)}>
            {getPostTypeLabel(post.type, t)}
          </Text>
        </YStack>
      </XStack>

      {/* ─── Post Content ─── */}
      <YStack>
        {/* Media (image or video thumbnail) */}
        {thumbnailUrl && !isVideo && (
          <YStack width="100%" aspectRatio={16 / 9} overflow="hidden">
            <Image
              source={{ uri: thumbnailUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </YStack>
        )}
        {/* Video: inline player with controls (play btn bottom-left, seekable progress bar) */}
        {isVideo && thumbnailUrl && (
          <FeedVideoPlayer uri={thumbnailUrl} />
        )}

        {/* Text */}
        <YStack padding="$3" gap="$1">
          <Text fontSize={15} fontWeight="600" color={colors.gray[900]} numberOfLines={2}>
            {postTitle}
          </Text>
          {postDescription.length > 0 && postDescription !== postTitle && (
            <Text fontSize={13} color={colors.gray[600]} numberOfLines={2}>
              {postDescription}
            </Text>
          )}
          <XStack gap="$3" alignItems="center" marginTop="$1" flexWrap="wrap">
            {category ? (
              <Text fontSize={12} color={colors.gray[500]}>
                {category}
              </Text>
            ) : null}
            {/* Sell post: price */}
            {price != null && (
              <>
                {category ? (
                  <Text fontSize={12} color={colors.gray[300]}>·</Text>
                ) : null}
                <Text fontSize={13} fontWeight="600" color={colors.green[600]}>
                  {price} {t('feed.points')}{unit ? `/${unit}` : ''}
                </Text>
              </>
            )}
            {/* Sell post: quantity */}
            {post.sell_details?.total_quantity_available != null && (
              <>
                <Text fontSize={12} color={colors.gray[300]}>·</Text>
                <Text fontSize={12} color={colors.gray[500]}>
                  {t('feed.qty')}: {post.sell_details.total_quantity_available}{unit ? ` ${unit === 'dozen' ? unit : unit === 'box' && post.sell_details.total_quantity_available !== 1 ? 'boxes' : unit === 'bag' && post.sell_details.total_quantity_available !== 1 ? 'bags' : unit !== 'piece' ? unit : ''}` : ''}
                </Text>
              </>
            )}
            {/* Buy post: desired quantity & unit */}
            {post.buy_details?.desired_quantity != null && (
              <>
                {category ? (
                  <Text fontSize={12} color={colors.gray[300]}>·</Text>
                ) : null}
                <Text fontSize={13} fontWeight="600" color="#2563eb">
                  {t('feed.lookingFor')}: {post.buy_details.desired_quantity}
                  {post.buy_details.desired_unit ? ` ${post.buy_details.desired_unit}${post.buy_details.desired_quantity !== 1 && post.buy_details.desired_unit === 'box' ? 'es' : post.buy_details.desired_quantity !== 1 && post.buy_details.desired_unit === 'bag' ? 's' : ''}` : ''}
                </Text>
              </>
            )}
            {/* Buy post: need-by date */}
            {post.buy_details?.need_by_date && (
              <>
                <Text fontSize={12} color={colors.gray[300]}>·</Text>
                <Text fontSize={12} color={colors.gray[500]}>
                  {t('feed.needBy')}: {new Date(post.buy_details.need_by_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </>
            )}
          </XStack>
          {/* Buy post: drop-off dates (compact pill row) */}
          {post.buy_details?.delivery_dates && post.buy_details.delivery_dates.length > 0 && (
            <XStack gap="$1" alignItems="center" marginTop="$1" flexWrap="wrap">
              <Text fontSize={11} color={colors.gray[500]}>
                {t('feed.dropOffDates')}:
              </Text>
              {post.buy_details.delivery_dates.map((date) => (
                <YStack
                  key={date}
                  backgroundColor={colors.gray[100]}
                  paddingHorizontal="$1.5"
                  paddingVertical={1}
                  borderRadius={4}
                >
                  <Text fontSize={11} color={colors.gray[600]} fontWeight="500">
                    {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Text>
                </YStack>
              ))}
            </XStack>
          )}
        </YStack>
      </YStack>
      {/* ─── Action Bar ─── */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderTopWidth={1}
        borderTopColor={colors.gray[100]}
        alignItems="center"
        justifyContent="space-between"
      >
        {/* Left actions — Like & Comments always in same position */}
        <XStack gap="$3" alignItems="center">
          {/* Like */}
          <Button
            unstyled
            onPress={handleLike}
            flexDirection="row"
            alignItems="center"
            gap="$1"
            paddingVertical="$1"
          >
            <Heart
              size={20}
              color={liked ? '#ef4444' : colors.gray[600]}
              fill={liked ? '#ef4444' : 'none'}
            />
            <Text fontSize={13} fontWeight="500" color={liked ? '#ef4444' : colors.gray[600]}>
              {likeCount}
            </Text>
          </Button>

          {/* Comment toggle — always in same position for all post types */}
          <Button
            unstyled
            flexDirection="row"
            alignItems="center"
            gap="$1"
            paddingVertical="$1"
            onPress={toggleComments}
          >
            <MessageCircle size={20} color={commentsExpanded ? colors.green[600] : colors.gray[600]} />
            <Text fontSize={13} fontWeight="500" color={commentsExpanded ? colors.green[600] : colors.gray[600]}>
              {commentCount}
            </Text>
          </Button>

          {/* CTA Buttons — vary by post type, but always after Like & Comment */}
          {post.type === 'want_to_sell' && !isOwnPost && (
            <>
              <Button
                size="$2"
                backgroundColor={colors.green[600]}
                borderRadius={8}
                paddingHorizontal="$3"
                paddingVertical="$1"
                gap="$1"
                pressStyle={{ backgroundColor: colors.green[700] }}
                onPress={() => onOrder?.(post.id)}
                icon={<ShoppingCart size={16} color="white" />}
              >
                <Text fontSize={13} fontWeight="600" color="white">{t('feed.order')}</Text>
              </Button>
              <Button
                size="$2"
                backgroundColor="#6366f1"
                borderRadius={8}
                paddingHorizontal="$3"
                paddingVertical="$1"
                gap="$1"
                pressStyle={{ backgroundColor: '#4f46e5' }}
                onPress={() => onChat?.(post.id, post.author_id)}
                icon={<MessagesSquare size={16} color="white" />}
              >
                <Text fontSize={13} fontWeight="600" color="white">{t('feed.chat')}</Text>
              </Button>
            </>
          )}
          {post.type === 'want_to_buy' && !isOwnPost && (
            <>
              <Button
                size="$2"
                backgroundColor="#2563eb"
                borderRadius={8}
                paddingHorizontal="$3"
                paddingVertical="$1"
                gap="$1"
                pressStyle={{ backgroundColor: '#1d4ed8' }}
                onPress={() => onOffer?.(post.id)}
                icon={<ThumbsUp size={16} color="white" />}
              >
                <Text fontSize={13} fontWeight="600" color="white">{t('feed.offer')}</Text>
              </Button>
              <Button
                size="$2"
                backgroundColor="#6366f1"
                borderRadius={8}
                paddingHorizontal="$3"
                paddingVertical="$1"
                gap="$1"
                pressStyle={{ backgroundColor: '#4f46e5' }}
                onPress={() => onChat?.(post.id, post.author_id)}
                icon={<MessagesSquare size={16} color="white" />}
              >
                <Text fontSize={13} fontWeight="600" color="white">{t('feed.chat')}</Text>
              </Button>
            </>
          )}
          {(post.type === 'offering_service' || post.type === 'need_service') && !isOwnPost && (
            <Button
              size="$2"
              backgroundColor={post.type === 'offering_service' ? '#c2410c' : '#7e22ce'}
              borderRadius={8}
              paddingHorizontal="$3"
              paddingVertical="$1"
              gap="$1"
              pressStyle={{ backgroundColor: post.type === 'offering_service' ? '#9a3412' : '#6b21a8' }}
              onPress={() => onChat?.(post.id, post.author_id)}
              icon={<MessagesSquare size={16} color="white" />}
            >
              <Text fontSize={13} fontWeight="600" color="white">{t('feed.chat')}</Text>
            </Button>
          )}
        </XStack>

        {/* Right actions — Share & Flag always in same position */}
        <XStack gap="$1" alignItems="center">
          {/* Share */}
          <Button
            unstyled
            onPress={handleShare}
            padding="$2"
            borderRadius={20}
          >
            <Share2 size={18} color={colors.gray[600]} />
          </Button>

          {/* Flag — only for other people's posts */}
          {!isOwnPost && (
            <Button
              unstyled
              onPress={() => {
                if (!flagged) {
                  setFlagged(true)
                  onFlag?.(post.id)
                }
              }}
              padding="$2"
              borderRadius={20}
              flexDirection="row"
              alignItems="center"
              gap="$1"
              opacity={flagged ? 0.6 : 1}
            >
              <Flag size={18} color={flagged ? '#ef4444' : colors.gray[600]} fill={flagged ? '#ef4444' : 'none'} />
              {flagged && (
                <Text fontSize={11} color="#ef4444" fontWeight="500">
                  {t('feed.reported')}
                </Text>
              )}
            </Button>
          )}
        </XStack>
      </XStack>

      {/* ─── Inline Comments Section ─── */}
      {commentsExpanded && (
        <YStack
          borderTopWidth={1}
          borderTopColor={colors.gray[200]}
          backgroundColor="#f9fafb"
        >
          {/* Existing comments */}
          {comments.length > 0 && (
            <ScrollView style={{ maxHeight: 300 }}>
              <YStack padding="$3" gap="$3">
                {comments.map((comment) => (
                  <XStack key={comment.id} gap="$2" alignItems="flex-start">
                    {/* Avatar */}
                    <YStack
                      width={32}
                      height={32}
                      borderRadius={16}
                      backgroundColor={colors.gray[300]}
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <Text fontSize={13} fontWeight="600" color="white">
                        {(comment.author_name || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </YStack>
                    {/* Comment bubble */}
                    <YStack
                      flex={1}
                      backgroundColor="white"
                      borderRadius={12}
                      padding="$2"
                      paddingHorizontal="$3"
                    >
                      <XStack gap="$2" alignItems="center" marginBottom={2}>
                        <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>
                          {comment.author_name || t('feed.unknownAuthor')}
                        </Text>
                        <Text fontSize={11} color={colors.gray[500]}>
                          {getTimeAgo(comment.created_at, t)}
                        </Text>
                      </XStack>
                      <Text fontSize={13} color={colors.gray[700]}>
                        {comment.content}
                      </Text>
                    </YStack>
                  </XStack>
                ))}
              </YStack>
            </ScrollView>
          )}

          {/* Comment input */}
          <XStack
            padding="$3"
            gap="$2"
            alignItems="center"
            borderTopWidth={1}
            borderTopColor={colors.gray[200]}
          >
            {/* Current user avatar */}
            <YStack
              width={32}
              height={32}
              borderRadius={16}
              backgroundColor={colors.green[600]}
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              <Text fontSize={13} fontWeight="600" color="white">
                {(currentUserName || 'U').charAt(0).toUpperCase()}
              </Text>
            </YStack>
            {Platform.OS === 'web' ? (
              <Input
                flex={1}
                size="$4"
                fontSize={14}
                height={40}
                borderRadius={20}
                borderColor={colors.gray[300]}
                placeholder={t('feed.writeComment')}
                value={commentText}
                onChangeText={setCommentText}
                onSubmitEditing={handleSubmitComment}
                returnKeyType="send"
                fontWeight="400"
              />
            ) : (
              <TextInput
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.gray[300],
                  paddingHorizontal: 16,
                  fontSize: 14,
                  fontWeight: 'normal',
                  fontFamily: Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                  color: colors.gray[900],
                  backgroundColor: 'white',
                }}
                placeholder={t('feed.writeComment')}
                placeholderTextColor={colors.gray[400]}
                value={commentText}
                onChangeText={setCommentText}
                onSubmitEditing={handleSubmitComment}
                returnKeyType="send"
              />
            )}
            <Button
              unstyled
              padding="$2"
              opacity={commentText.trim() ? 1 : 0.4}
              onPress={handleSubmitComment}
              disabled={!commentText.trim() || submittingComment}
            >
              <Send size={20} color={colors.green[600]} />
            </Button>
          </XStack>
        </YStack>
      )}
    </YStack>
  )
}

export const FeedPostCard = memo(FeedPostCardInner)
