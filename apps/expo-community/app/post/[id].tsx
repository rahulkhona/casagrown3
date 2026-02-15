import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { YStack, Text, Spinner, Button, Paragraph, H2, ScrollView, XStack, Input } from 'tamagui'
import { Heart, MessageCircle, Share2, Send, ArrowLeft } from '@tamagui/lucide-icons'
import { Share, Platform } from 'react-native'
import { colors, borderRadius } from '@casagrown/app/design-tokens'
import { normalizeStorageUrl } from '@casagrown/app/utils/normalize-storage-url'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'
import { getPostComments, addComment, togglePostLike } from '@casagrown/app/features/feed/feed-service'
import type { FeedPost, PostComment } from '@casagrown/app/features/feed/feed-service'
import { Image } from 'react-native'
import { useTranslation } from 'react-i18next'

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

async function fetchPost(postId: string, userId?: string): Promise<FeedPost | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id, author_id, type, reach, content, created_at, community_h3_index,
      author:profiles!posts_author_id_fkey ( full_name, avatar_url ),
      community:communities!posts_community_h3_index_fkey ( name ),
      want_to_sell_details ( category, produce_name, unit, total_quantity_available, points_per_unit ),
      want_to_buy_details ( category, produce_names, need_by_date ),
      post_media ( media_id, position, media_asset:media_assets!post_media_media_id_fkey ( storage_path, media_type ) ),
      post_likes ( user_id ),
      post_comments ( id ),
      post_flags ( user_id )
    `)
    .eq('id', postId)
    .single()

  if (error || !data) return null
  const row = data as any
  return {
    id: row.id,
    author_id: row.author_id,
    author_name: row.author?.full_name || null,
    author_avatar_url: row.author?.avatar_url || null,
    type: row.type,
    reach: row.reach,
    content: row.content,
    created_at: row.created_at,
    community_h3_index: row.community_h3_index,
    community_name: row.community?.name || null,
    sell_details: row.want_to_sell_details?.[0] || null,
    buy_details: row.want_to_buy_details?.[0] || null,
    media: (row.post_media || [])
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
      .map((pm: any) => ({
        storage_path: pm.media_asset?.storage_path || '',
        media_type: pm.media_asset?.media_type || 'image',
      }))
      .filter((m: any) => m.storage_path),
    like_count: (row.post_likes || []).length,
    comment_count: (row.post_comments || []).length,
    is_liked: userId ? (row.post_likes || []).some((l: any) => l.user_id === userId) : false,
    is_flagged: userId ? (row.post_flags || []).some((f: any) => f.user_id === userId) : false,
  }
}

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const { t } = useTranslation()

  const [post, setPost] = useState<FeedPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const data = await fetchPost(id, user?.id)
      if (data) {
        setPost(data)
        setLiked(data.is_liked)
        setLikeCount(data.like_count)
        try {
          const c = await getPostComments(id)
          setComments(c)
        } catch { /* ignore */ }
      }
      setLoading(false)
    }
    load()
  }, [id, user?.id])

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setUserDisplayName(data.full_name)
      })
  }, [user?.id])

  const handleLike = async () => {
    if (!user || !post) return
    const newLiked = !liked
    setLiked(newLiked)
    setLikeCount((prev) => prev + (newLiked ? 1 : -1))
    try {
      await togglePostLike(post.id, user.id, !newLiked)
    } catch {
      setLiked(!newLiked)
      setLikeCount((prev) => prev + (newLiked ? -1 : 1))
    }
  }

  const handleComment = async () => {
    if (!user || !post) return
    const text = commentText.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      const newComment = await addComment(post.id, user.id, text, userDisplayName)
      setComments((prev) => [...prev, newComment])
      setCommentText('')
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  const handleShare = async () => {
    if (!post) return
    const url = `https://casagrown.com/post/${post.id}`
    await Share.share({ message: `Check out this post on CasaGrown\n${url}`, url })
  }

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]}>
        <Spinner size="large" color={colors.green[600]} />
      </YStack>
    )
  }

  if (!post) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} gap="$4" padding="$6">
        <H2 color={colors.gray[900]}>Post Not Found</H2>
        <Paragraph color={colors.gray[600]}>This post may have been removed.</Paragraph>
        <Button size="$4" backgroundColor={colors.green[600]} borderRadius={8} onPress={() => router.back()}>
          <Text color="white" fontWeight="600">Go Back</Text>
        </Button>
      </YStack>
    )
  }

  let parsedTitle = ''
  let parsedDescription = ''
  try {
    const parsed = JSON.parse(post.content)
    parsedTitle = parsed.title || ''
    parsedDescription = parsed.description || ''
  } catch {
    parsedDescription = post.content
  }
  const displayTitle = post.sell_details?.produce_name || post.buy_details?.produce_names?.[0] || parsedTitle || ''
  const firstMedia = post.media.length > 0 ? post.media[0] : null

  return (
    <YStack flex={1} backgroundColor={colors.green[50]}>
      {/* Header */}
      <XStack paddingHorizontal="$4" paddingTop="$6" paddingBottom="$3" backgroundColor="white" alignItems="center" gap="$3">
        <Button unstyled onPress={() => router.back()} padding="$2">
          <ArrowLeft size={24} color={colors.gray[800]} />
        </Button>
        <Text fontSize={18} fontWeight="700" color={colors.gray[900]} flex={1}>Post</Text>
      </XStack>

      <ScrollView>
        <YStack padding="$4" gap="$4">
          <YStack backgroundColor="white" borderRadius={borderRadius.lg} overflow="hidden">
            {/* Author */}
            <XStack padding="$4" gap="$3" alignItems="center">
              <YStack width={44} height={44} borderRadius={22} backgroundColor={colors.green[600]} alignItems="center" justifyContent="center">
                <Text fontSize={18} fontWeight="700" color="white">
                  {(post.author_name || 'U').charAt(0).toUpperCase()}
                </Text>
              </YStack>
              <YStack flex={1}>
                <Text fontSize={15} fontWeight="600" color={colors.gray[900]}>{post.author_name || 'Unknown'}</Text>
                <Text fontSize={12} color={colors.gray[500]}>{getTimeAgo(post.created_at)}</Text>
              </YStack>
            </XStack>

            {displayTitle ? (
              <YStack paddingHorizontal="$4" paddingBottom="$2">
                <Text fontSize={20} fontWeight="700" color={colors.gray[900]}>{displayTitle}</Text>
              </YStack>
            ) : null}

            {parsedDescription ? (
              <YStack paddingHorizontal="$4" paddingBottom="$3">
                <Text fontSize={15} color={colors.gray[700]}>{parsedDescription}</Text>
              </YStack>
            ) : null}

            {post.sell_details && (
              <XStack paddingHorizontal="$4" paddingBottom="$3" gap="$4">
                <YStack>
                  <Text fontSize={12} color={colors.gray[500]}>Price</Text>
                  <Text fontSize={18} fontWeight="700" color={colors.green[600]}>
                    ${post.sell_details.points_per_unit}/{post.sell_details.unit}
                  </Text>
                </YStack>
              </XStack>
            )}

            {firstMedia && (
              <YStack width="100%" aspectRatio={16 / 9} overflow="hidden">
                <Image
                  source={{ uri: normalizeStorageUrl(firstMedia.storage_path) }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </YStack>
            )}

            {/* Action bar */}
            <XStack padding="$3" paddingHorizontal="$4" borderTopWidth={1} borderTopColor={colors.gray[100]} gap="$4" alignItems="center">
              <Button unstyled flexDirection="row" alignItems="center" gap="$1" onPress={handleLike}>
                <Heart size={22} color={liked ? '#ef4444' : colors.gray[600]} fill={liked ? '#ef4444' : 'none'} />
                <Text fontSize={14} fontWeight="500" color={liked ? '#ef4444' : colors.gray[600]}>{likeCount}</Text>
              </Button>
              <XStack alignItems="center" gap="$1">
                <MessageCircle size={22} color={colors.green[600]} />
                <Text fontSize={14} fontWeight="500" color={colors.green[600]}>{comments.length || post.comment_count}</Text>
              </XStack>
              <Button unstyled onPress={handleShare}>
                <Share2 size={22} color={colors.gray[600]} />
              </Button>
            </XStack>

            {/* Comments */}
            <YStack borderTopWidth={1} borderTopColor={colors.gray[200]} backgroundColor="#f9fafb">
              {comments.length > 0 && (
                <YStack padding="$3" gap="$3">
                  {comments.map((comment) => (
                    <XStack key={comment.id} gap="$2" alignItems="flex-start">
                      <YStack width={32} height={32} borderRadius={16} backgroundColor={colors.gray[300]} alignItems="center" justifyContent="center">
                        <Text fontSize={13} fontWeight="600" color="white">{(comment.author_name || 'U').charAt(0).toUpperCase()}</Text>
                      </YStack>
                      <YStack flex={1} backgroundColor="white" borderRadius={12} padding="$2" paddingHorizontal="$3">
                        <XStack gap="$2" alignItems="center" marginBottom={2}>
                          <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>{comment.author_name || 'Unknown'}</Text>
                          <Text fontSize={11} color={colors.gray[500]}>{getTimeAgo(comment.created_at)}</Text>
                        </XStack>
                        <Text fontSize={13} color={colors.gray[700]}>{comment.content}</Text>
                      </YStack>
                    </XStack>
                  ))}
                </YStack>
              )}

              {user && (
                <XStack padding="$3" gap="$2" alignItems="center" borderTopWidth={comments.length > 0 ? 1 : 0} borderTopColor={colors.gray[200]}>
                  <YStack width={32} height={32} borderRadius={16} backgroundColor={colors.green[600]} alignItems="center" justifyContent="center">
                    <Text fontSize={13} fontWeight="600" color="white">{(userDisplayName || 'U').charAt(0).toUpperCase()}</Text>
                  </YStack>
                  <Input
                    flex={1}
                    size="$3"
                    borderRadius={20}
                    borderColor={colors.gray[300]}
                    placeholder={t('feed.writeComment')}
                    value={commentText}
                    onChangeText={setCommentText}
                    onSubmitEditing={handleComment}
                    returnKeyType="send"
                  />
                  <Button
                    unstyled
                    padding="$2"
                    opacity={commentText.trim() ? 1 : 0.4}
                    onPress={handleComment}
                    disabled={!commentText.trim() || submitting}
                  >
                    <Send size={20} color={colors.green[600]} />
                  </Button>
                </XStack>
              )}
            </YStack>
          </YStack>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
