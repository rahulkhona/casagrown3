'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { YStack, XStack, Text, Button, Spinner, H2, Paragraph, ScrollView, Input } from 'tamagui'
import { Heart, MessageCircle, Share2, ShoppingCart, ThumbsUp, Send, Download, Smartphone, LogIn, ArrowRight, Sparkles, Ban, TrendingUp, GraduationCap, Users, Leaf, Star } from '@tamagui/lucide-icons'
import { colors, borderRadius } from '@casagrown/app/design-tokens'
import { normalizeStorageUrl } from '@casagrown/app/utils/normalize-storage-url'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'
import { getPostComments, addComment, togglePostLike } from '@casagrown/app/features/feed/feed-service'
import type { FeedPost, PostComment } from '@casagrown/app/features/feed/feed-service'
import { useTranslation } from 'react-i18next'

// Post type display config
const POST_TYPE_LABELS: Record<string, string> = {
  want_to_sell: 'For Sale',
  want_to_buy: 'Looking to Buy',
  seeking_advice: 'Seeking Advice',
  show_and_tell: 'Show & Tell',
  general_info: 'General',
}

const POST_TYPE_COLORS: Record<string, string> = {
  want_to_sell: colors.green[600],
  want_to_buy: '#2563eb',
  seeking_advice: '#f59e0b',
  show_and_tell: '#8b5cf6',
  general_info: colors.gray[600],
}

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
      id,
      author_id,
      type,
      reach,
      content,
      created_at,
      community_h3_index,
      author:profiles!posts_author_id_fkey (
        full_name,
        avatar_url
      ),
      community:communities!posts_community_h3_index_fkey (
        name
      ),
      want_to_sell_details (
        category,
        produce_name,
        unit,
        total_quantity_available,
        points_per_unit
      ),
      want_to_buy_details (
        category,
        produce_names,
        need_by_date
      ),
      post_media (
        media_id,
        position,
        media_asset:media_assets!post_media_media_id_fkey (
          storage_path,
          media_type
        )
      ),
      post_likes (
        user_id
      ),
      post_comments (
        id
      ),
      post_flags (
        user_id
      )
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
    is_liked: userId
      ? (row.post_likes || []).some((l: any) => l.user_id === userId)
      : false,
    is_flagged: userId
      ? (row.post_flags || []).some((f: any) => f.user_id === userId)
      : false,
  }
}

export default function PostPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { t } = useTranslation()
  const postId = params.id as string

  const [post, setPost] = useState<FeedPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Interaction state
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile browser
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase()
      setIsMobile(/iphone|ipad|ipod|android/.test(ua))
    }
  }, [])

  // Fetch post
  useEffect(() => {
    if (authLoading) return

    // Signed-in users go to the feed with this post highlighted
    if (user) {
      router.replace(`/feed?postId=${postId}`)
      return
    }

    const load = async () => {
      setLoading(true)
      const data = await fetchPost(postId)
      if (data) {
        setPost(data)
        setLiked(data.is_liked)
        setLikeCount(data.like_count)
        // Also fetch comments
        try {
          const c = await getPostComments(postId)
          setComments(c)
        } catch { /* ignore */ }
      } else {
        setNotFound(true)
      }
      setLoading(false)
    }
    load()
  }, [postId, user?.id, authLoading, router])

  // Fetch user display name for comment avatar
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
    if (!user) {
      router.push(`/login?returnTo=/post/${postId}`)
      return
    }
    const newLiked = !liked
    setLiked(newLiked)
    setLikeCount((prev) => prev + (newLiked ? 1 : -1))
    try {
      await togglePostLike(postId, user.id, !newLiked)
    } catch {
      setLiked(!newLiked)
      setLikeCount((prev) => prev + (newLiked ? -1 : 1))
    }
  }

  const handleComment = async () => {
    if (!user) {
      router.push(`/login?returnTo=/post/${postId}`)
      return
    }
    const text = commentText.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      const newComment = await addComment(postId, user.id, text, userDisplayName)
      setComments((prev) => [...prev, newComment])
      setCommentText('')
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({ title: 'CasaGrown Post', url })
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url)
    }
  }

  // Parse content
  let parsedTitle = ''
  let parsedDescription = ''
  if (post) {
    try {
      const parsed = JSON.parse(post.content)
      parsedTitle = parsed.title || ''
      parsedDescription = parsed.description || ''
    } catch {
      parsedDescription = post.content
    }
  }

  const displayTitle = post?.sell_details?.produce_name
    || post?.buy_details?.produce_names?.[0]
    || parsedTitle
    || ''

  // Loading state
  if (loading || authLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" minHeight="100vh" backgroundColor={colors.green[50]}>
        <Spinner size="large" color={colors.green[600]} />
      </YStack>
    )
  }

  // Not found
  if (notFound || !post) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" minHeight="100vh" backgroundColor={colors.green[50]} gap="$4">
        <H2 color={colors.gray[900]}>Post Not Found</H2>
        <Paragraph color={colors.gray[600]}>This post may have been removed or the link is invalid.</Paragraph>
        <Button
          size="$4"
          backgroundColor={colors.green[600]}
          borderRadius={8}
          onPress={() => router.push('/feed')}
        >
          <Text color="white" fontWeight="600">Go to Feed</Text>
        </Button>
      </YStack>
    )
  }

  const typeColor = POST_TYPE_COLORS[post.type] || POST_TYPE_COLORS.general_info
  const typeLabel = POST_TYPE_LABELS[post.type] || 'Post'
  const firstMedia = post.media.length > 0 ? post.media[0] : null
  const isVideo = firstMedia?.media_type === 'video'

  return (
    <YStack flex={1} minHeight="100vh" backgroundColor={colors.green[50]}>
      {/* Header — matches feed page layout */}
      <XStack
        backgroundColor="white"
        borderBottomWidth={1}
        borderBottomColor={colors.gray[200]}
        justifyContent="center"
      >
        <XStack
          paddingHorizontal="$6"
          height={64}
          alignItems="center"
          justifyContent="space-between"
          maxWidth={1280}
          width="100%"
        >
          {/* Logo */}
          <XStack alignItems="center" gap="$2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="CasaGrown" style={{ width: 32, height: 32, objectFit: 'contain' }} />
            <Text fontSize="$5" fontWeight="700" color={colors.gray[900]}>CasaGrown</Text>
          </XStack>

          {/* Mobile: Get App button */}
          {isMobile && (
            <Button
              size="$3"
              backgroundColor={colors.green[600]}
              borderRadius={20}
              paddingHorizontal="$3"
              onPress={() => {
                const ua = navigator.userAgent.toLowerCase()
                if (/iphone|ipad|ipod/.test(ua)) {
                  window.open('https://apps.apple.com/app/casagrown/id0000000000', '_blank')
                } else if (/android/.test(ua)) {
                  window.open('https://play.google.com/store/apps/details?id=dev.casagrown.community', '_blank')
                }
              }}
              icon={<Download size={14} color="white" />}
            >
              <Text fontSize={12} fontWeight="600" color="white">Get App</Text>
            </Button>
          )}

          {/* Desktop: Sign In button when not logged in */}
          {!user && !isMobile && (
            <Button
              size="$3"
              backgroundColor={colors.green[600]}
              borderRadius={20}
              paddingHorizontal="$3"
              onPress={() => router.push(`/login?returnTo=/post/${postId}`)}
              icon={<LogIn size={14} color="white" />}
            >
              <Text fontSize={12} fontWeight="600" color="white">Join the Movement</Text>
            </Button>
          )}
        </XStack>
      </XStack>

      {/* Post Content */}
      <ScrollView>
        <YStack maxWidth={640} width="100%" alignSelf="center" padding="$4" gap="$4">
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius.lg}
            overflow="hidden"
            // @ts-ignore - web shadow
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
          >
            {/* Author header */}
            <XStack padding="$4" gap="$3" alignItems="center">
              <YStack
                width={44}
                height={44}
                borderRadius={22}
                backgroundColor={typeColor as any}
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize={18} fontWeight="700" color="white">
                  {(post.author_name || 'U').charAt(0).toUpperCase()}
                </Text>
              </YStack>
              <YStack flex={1}>
                <Text fontSize={15} fontWeight="600" color={colors.gray[900]}>
                  {post.author_name || 'Unknown'}
                </Text>
                <XStack gap="$2" alignItems="center">
                  <Text
                    fontSize={11}
                    fontWeight="600"
                    color={typeColor as any}
                    backgroundColor={`${typeColor}15` as any}
                    paddingHorizontal={6}
                    paddingVertical={2}
                    borderRadius={4}
                  >
                    {typeLabel}
                  </Text>
                  <Text fontSize={12} color={colors.gray[500]}>{getTimeAgo(post.created_at)}</Text>
                </XStack>
              </YStack>
            </XStack>

            {/* Title */}
            {displayTitle ? (
              <YStack paddingHorizontal="$4" paddingBottom="$2">
                <Text fontSize={20} fontWeight="700" color={colors.gray[900]}>
                  {displayTitle}
                </Text>
              </YStack>
            ) : null}

            {/* Description */}
            {parsedDescription ? (
              <YStack paddingHorizontal="$4" paddingBottom="$3">
                <Paragraph fontSize={15} color={colors.gray[700]} lineHeight={22}>
                  {parsedDescription}
                </Paragraph>
              </YStack>
            ) : null}

            {/* Sell/Buy Details */}
            {post.sell_details && (
              <XStack paddingHorizontal="$4" paddingBottom="$3" gap="$4">
                <YStack>
                  <Text fontSize={12} color={colors.gray[500]}>Price</Text>
                  <Text fontSize={18} fontWeight="700" color={colors.green[600]}>
                    ${post.sell_details.points_per_unit}/{post.sell_details.unit}
                  </Text>
                </YStack>
                <YStack>
                  <Text fontSize={12} color={colors.gray[500]}>Available</Text>
                  <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
                    {post.sell_details.total_quantity_available} {post.sell_details.unit}
                  </Text>
                </YStack>
              </XStack>
            )}
            {post.buy_details?.need_by_date && (
              <YStack paddingHorizontal="$4" paddingBottom="$3">
                <Text fontSize={12} color={colors.gray[500]}>Need by</Text>
                <Text fontSize={15} fontWeight="600" color={colors.gray[800]}>
                  {new Date(post.buy_details.need_by_date).toLocaleDateString()}
                </Text>
              </YStack>
            )}

            {/* Media */}
            {firstMedia && !isVideo && (
              <YStack width="100%" aspectRatio={16 / 9} overflow="hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={normalizeStorageUrl(firstMedia.storage_path)}
                  alt={displayTitle || 'Post image'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </YStack>
            )}
            {firstMedia && isVideo && (
              <YStack width="100%" aspectRatio={16 / 9} overflow="hidden">
                <video
                  src={normalizeStorageUrl(firstMedia.storage_path)}
                  controls
                  preload="metadata"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' }}
                />
              </YStack>
            )}

            {/* Action bar — only shown for authenticated users */}
            {user && (
              <XStack
                padding="$3"
                paddingHorizontal="$4"
                borderTopWidth={1}
                borderTopColor={colors.gray[100]}
                justifyContent="space-between"
                alignItems="center"
              >
                <XStack gap="$4" alignItems="center">
                  <Button
                    unstyled
                    flexDirection="row"
                    alignItems="center"
                    gap="$1"
                    onPress={handleLike}
                  >
                    <Heart
                      size={22}
                      color={liked ? '#ef4444' : colors.gray[600]}
                      fill={liked ? '#ef4444' : 'none'}
                    />
                    <Text fontSize={14} fontWeight="500" color={liked ? '#ef4444' : colors.gray[600]}>
                      {likeCount}
                    </Text>
                  </Button>
                  <XStack alignItems="center" gap="$1">
                    <MessageCircle size={22} color={colors.green[600]} />
                    <Text fontSize={14} fontWeight="500" color={colors.green[600]}>
                      {comments.length || post.comment_count}
                    </Text>
                  </XStack>
                  <Button unstyled onPress={handleShare}>
                    <Share2 size={22} color={colors.gray[600]} />
                  </Button>
                </XStack>
              </XStack>
            )}

            {/* Comments section - always visible on post page */}
            <YStack
              borderTopWidth={1}
              borderTopColor={colors.gray[200]}
              backgroundColor="#f9fafb"
            >
              {comments.length > 0 && (
                <YStack padding="$3" gap="$3" maxHeight={400}>
                  {comments.map((comment) => (
                    <XStack key={comment.id} gap="$2" alignItems="flex-start">
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
                      <YStack
                        flex={1}
                        backgroundColor="white"
                        borderRadius={12}
                        padding="$2"
                        paddingHorizontal="$3"
                      >
                        <XStack gap="$2" alignItems="center" marginBottom={2}>
                          <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>
                            {comment.author_name || 'Unknown'}
                          </Text>
                          <Text fontSize={11} color={colors.gray[500]}>
                            {getTimeAgo(comment.created_at)}
                          </Text>
                        </XStack>
                        <Text fontSize={13} color={colors.gray[700]}>{comment.content}</Text>
                      </YStack>
                    </XStack>
                  ))}
                </YStack>
              )}

              {/* Comment input */}
              {user ? (
                <XStack
                  padding="$3"
                  gap="$2"
                  alignItems="center"
                  borderTopWidth={comments.length > 0 ? 1 : 0}
                  borderTopColor={colors.gray[200]}
                >
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
                      {(userDisplayName || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </YStack>
                  <Input
                    flex={1}
                    size="$3"
                    borderRadius={20}
                    borderColor={colors.gray[300]}
                    placeholder="Write a comment..."
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
              ) : (
                <YStack padding="$4" alignItems="center" gap="$3">
                  <Text fontSize={15} fontWeight="600" color={colors.gray[800]}>Join the Movement 🌱</Text>
                  <Text fontSize={13} color={colors.gray[500]} textAlign="center">
                    Join CasaGrown to like, comment, and trade fresh produce with your neighbors
                  </Text>

                  {isMobile ? (
                    /* Mobile web: offer app + web sign-in options */
                    <YStack gap="$2" width="100%" maxWidth={320}>
                      {/* Open in app (deep link) */}
                      <Button
                        size="$4"
                        backgroundColor={colors.green[600]}
                        borderRadius={8}
                        onPress={() => {
                          window.location.href = `casagrowncom://post/${postId}`
                        }}
                        icon={<Smartphone size={16} color="white" />}
                      >
                        <Text color="white" fontWeight="600">Open in App</Text>
                      </Button>

                      {/* Download the app */}
                      <Button
                        size="$4"
                        backgroundColor="white"
                        borderWidth={1}
                        borderColor={colors.green[600]}
                        borderRadius={8}
                        onPress={() => {
                          const ua = navigator.userAgent.toLowerCase()
                          if (/iphone|ipad|ipod/.test(ua)) {
                            window.open('https://apps.apple.com/app/casagrown/id0000000000', '_blank')
                          } else {
                            window.open('https://play.google.com/store/apps/details?id=dev.casagrown.community', '_blank')
                          }
                        }}
                        icon={<Download size={16} color={colors.green[600]} />}
                      >
                        <Text color={colors.green[600]} fontWeight="600">Download the App</Text>
                      </Button>

                      {/* Sign in on web */}
                      <Button
                        unstyled
                        alignSelf="center"
                        paddingVertical="$2"
                        onPress={() => router.push(`/login?returnTo=/post/${postId}`)}
                      >
                        <Text fontSize={13} color={colors.green[600]} fontWeight="500" textDecorationLine="underline">
                          Join on web instead
                        </Text>
                      </Button>
                    </YStack>
                  ) : (
                    /* Desktop web: just sign in */
                    <Button
                      size="$4"
                      backgroundColor={colors.green[600]}
                      borderRadius={8}
                      paddingHorizontal="$6"
                      onPress={() => router.push(`/login?returnTo=/post/${postId}`)}
                      icon={<LogIn size={16} color="white" />}
                    >
                      <Text color="white" fontWeight="600">Join the Movement</Text>
                    </Button>
                  )}
                </YStack>
              )}
            </YStack>
          </YStack>
        </YStack>

        {/* Marketing content — only shown to guests */}
        {!user && (
          <YStack width="100%" alignItems="center" gap={0}>
            {/* Tagline / Hero Section */}
            <YStack width="100%" paddingHorizontal="$4" paddingVertical="$10" backgroundColor={colors.green[50]} alignItems="center">
              <YStack maxWidth={600} width="100%" gap="$4" alignItems="center">
                <XStack
                  backgroundColor="white"
                  paddingHorizontal="$3"
                  paddingVertical="$1.5"
                  borderRadius={20}
                  shadowColor="rgba(0,0,0,0.05)"
                  shadowOffset={{ width: 0, height: 2 }}
                  shadowRadius={4}
                >
                  <Text fontSize={11} color={colors.green[600]} fontWeight="800" letterSpacing={1.2} textTransform="uppercase">
                    Fresh • Local • Trusted
                  </Text>
                </XStack>
                <Text fontSize={28} fontWeight="700" color={colors.green[700]} textAlign="center">
                  Fresh from Neighbors&apos; backyard 🌱
                </Text>
                <Text fontSize={15} color={colors.gray[600]} textAlign="center" lineHeight={24}>
                  Buy and sell fresh, locally-grown produce from your neighbors&apos; backyards. Join a hyper-local community working together to reduce waste and expand access to fresh food.
                </Text>
                <Button
                  size="$4"
                  backgroundColor={colors.green[600]}
                  borderRadius={28}
                  paddingHorizontal="$6"
                  hoverStyle={{ backgroundColor: colors.green[700] }}
                  onPress={() => router.push(`/login?returnTo=/post/${postId}`)}
                  iconAfter={<ArrowRight size={16} color="white" />}
                >
                  <Text color="white" fontWeight="600">Join the Movement!</Text>
                </Button>
              </YStack>
            </YStack>

            {/* How It Works Section */}
            <YStack width="100%" paddingHorizontal="$4" paddingVertical="$10" backgroundColor="white" alignItems="center">
              <YStack maxWidth={800} width="100%" gap="$6" alignItems="center">
                <Text fontSize={28} fontWeight="700" color={colors.gray[800]} textAlign="center">
                  How It Works
                </Text>
                <XStack flexWrap="wrap" gap="$4" justifyContent="center" width="100%">
                  {[
                    { num: 1, title: 'Join Your Community', desc: 'Sign up and connect with neighbors in your area.' },
                    { num: 2, title: 'Post What You Grow', desc: 'List your surplus produce, from tomatoes to herbs.' },
                    { num: 3, title: 'Browse & Request', desc: 'Find fresh produce from neighbors near you.' },
                    { num: 4, title: 'Arrange Pickup', desc: 'Coordinate pickup or porch drop-off with sellers.' },
                    { num: 5, title: 'Earn Points', desc: 'Get rewarded for sharing and building community.' },
                  ].map((step) => (
                    <YStack key={step.num} minWidth={140} maxWidth={160} alignItems="center" gap="$3" padding="$4" backgroundColor="white" borderRadius={12}
                      shadowColor="rgba(0,0,0,0.05)" shadowOffset={{ width: 0, height: 1 }} shadowRadius={3}
                    >
                      <YStack width={48} height={48} backgroundColor={colors.green[600]} borderRadius={24} alignItems="center" justifyContent="center">
                        <Text color="white" fontWeight="700" fontSize={20}>{step.num}</Text>
                      </YStack>
                      <Text fontWeight="600" fontSize={14} color={colors.gray[800]} textAlign="center">{step.title}</Text>
                      <Text fontSize={12} color={colors.gray[500]} textAlign="center" lineHeight={18}>{step.desc}</Text>
                    </YStack>
                  ))}
                </XStack>
              </YStack>
            </YStack>

            {/* Points System Section */}
            <YStack width="100%" paddingHorizontal="$4" paddingVertical="$10" backgroundColor={colors.gray[800]} alignItems="center">
              <YStack maxWidth={700} width="100%" gap="$4" alignItems="center">
                <Text fontSize={28} fontWeight="700" color="white" textAlign="center">
                  Why Use a Points System?
                </Text>
                <Text fontSize={15} color={colors.gray[300]} textAlign="center" lineHeight={24} opacity={0.95} maxWidth={680}>
                  Our closed-loop point system minimizes payment processing fees and keeps more money in your community. Points are available instantly (unlike credit cards that take 2-5 days), making escrow and returns seamless. Buy points once, trade with neighbors, and redeem for gift cards or donate to charity.
                </Text>
                <Button
                  size="$4"
                  backgroundColor="white"
                  borderRadius={28}
                  paddingHorizontal="$6"
                  hoverStyle={{ backgroundColor: colors.gray[100] }}
                  onPress={() => router.push(`/login?returnTo=/post/${postId}`)}
                  iconAfter={<ArrowRight size={16} color={colors.green[600]} />}
                >
                  <Text color={colors.green[600]} fontWeight="600">Join CasaGrown Today</Text>
                </Button>
              </YStack>
            </YStack>

            {/* Why Trade Homegrown Section */}
            <YStack width="100%" paddingHorizontal="$4" paddingVertical="$10" backgroundColor={colors.green[50]} alignItems="center">
              <YStack maxWidth={800} width="100%" gap="$6" alignItems="center">
                <YStack alignItems="center" gap="$2">
                  <Text fontSize={28} fontWeight="700" color={colors.gray[800]} textAlign="center">
                    Why Trade Homegrown? 🌱
                  </Text>
                  <Text fontSize={15} color={colors.gray[600]} textAlign="center" maxWidth={600}>
                    We&apos;re on a mission to eliminate wastage of food grown in American backyards and expand access to freshly picked produce.
                  </Text>
                </YStack>

                <XStack flexWrap="wrap" gap="$3" justifyContent="center" width="100%">
                  {/* Trade cards */}
                  <YStack flex={1} minWidth={220} maxWidth={260} backgroundColor={colors.emerald[100] as any} borderRadius={12} padding="$4" gap="$3">
                    <YStack width={44} height={44} backgroundColor={colors.emerald[200] as any} borderRadius={22} alignItems="center" justifyContent="center">
                      <Sparkles size={22} color={colors.emerald[700]} />
                    </YStack>
                    <Text fontWeight="600" fontSize={15} color={colors.gray[800]}>Incredible Freshness</Text>
                    <Text fontSize={13} color={colors.gray[600]} lineHeight={20}>Produce picked fresh from a neighbor&apos;s tree, not sitting in a warehouse for weeks.</Text>
                  </YStack>

                  <YStack flex={1} minWidth={220} maxWidth={260} backgroundColor={colors.amber[100] as any} borderRadius={12} padding="$4" gap="$3">
                    <YStack width={44} height={44} backgroundColor={colors.amber[200] as any} borderRadius={22} alignItems="center" justifyContent="center">
                      <Ban size={22} color={colors.amber[700]} />
                    </YStack>
                    <Text fontWeight="600" fontSize={15} color={colors.gray[800]}>Stop Food Waste</Text>
                    <Text fontSize={13} color={colors.gray[600]} lineHeight={20}>Over 11.5B lbs of backyard produce goes to waste every year. Help us save it.</Text>
                  </YStack>

                  <YStack flex={1} minWidth={220} maxWidth={260} backgroundColor={colors.sky[100] as any} borderRadius={12} padding="$4" gap="$3">
                    <YStack width={44} height={44} backgroundColor={colors.sky[200] as any} borderRadius={22} alignItems="center" justifyContent="center">
                      <TrendingUp size={22} color={colors.sky[700]} />
                    </YStack>
                    <Text fontWeight="600" fontSize={15} color={colors.gray[800]}>Beat Inflation</Text>
                    <Text fontSize={13} color={colors.gray[600]} lineHeight={20}>Earn extra cash from your garden or save money on high-quality local produce.</Text>
                  </YStack>

                  <YStack flex={1} minWidth={220} maxWidth={260} backgroundColor={colors.pink[100] as any} borderRadius={12} padding="$4" gap="$3">
                    <YStack width={44} height={44} backgroundColor={colors.pink[200] as any} borderRadius={22} alignItems="center" justifyContent="center">
                      <GraduationCap size={22} color={colors.pink[700]} />
                    </YStack>
                    <Text fontWeight="600" fontSize={15} color={colors.gray[800]}>Teen Opportunity</Text>
                    <Text fontSize={13} color={colors.gray[600]} lineHeight={20}>Empower teens to learn business skills and earn pocket money selling homegrown produce.</Text>
                  </YStack>
                </XStack>
              </YStack>
            </YStack>

            {/* Final CTA Section */}
            <YStack width="100%" paddingHorizontal="$4" paddingVertical="$10" backgroundColor={colors.green[600]} alignItems="center">
              <YStack maxWidth={600} width="100%" gap="$4" alignItems="center">
                <Text fontSize={28} fontWeight="700" color="white" textAlign="center">
                  Ready to Make a Difference?
                </Text>
                <Text fontSize={15} color={colors.green[100]} textAlign="center" lineHeight={24}>
                  Join thousands of neighbors already trading homegrown produce. Start saving money, reducing waste, and building community today.
                </Text>
                <Button
                  size="$4"
                  backgroundColor="white"
                  borderRadius={28}
                  paddingHorizontal="$6"
                  hoverStyle={{ backgroundColor: colors.gray[100] }}
                  onPress={() => router.push(`/login?returnTo=/post/${postId}`)}
                  iconAfter={<ArrowRight size={16} color={colors.green[600]} />}
                >
                  <Text color={colors.green[600]} fontWeight="600">Get Started for Free</Text>
                </Button>
              </YStack>
            </YStack>

            {/* Footer */}
            <YStack width="100%" paddingHorizontal="$4" paddingVertical="$6" backgroundColor={colors.gray[800]} alignItems="center">
              <YStack maxWidth={800} width="100%" gap="$3" alignItems="center">
                <XStack alignItems="center" gap="$2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="CasaGrown" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                  <Text fontWeight="600" fontSize={16} color="white">CasaGrown</Text>
                </XStack>
                <Text fontSize={13} color={colors.gray[400]} textAlign="center">
                  Connecting communities through sustainable food sharing.
                </Text>
                <Text fontSize={11} color={colors.gray[500]}>© 2025 CasaGrown. All rights reserved.</Text>
              </YStack>
            </YStack>
          </YStack>
        )}
      </ScrollView>
    </YStack>
  )
}
