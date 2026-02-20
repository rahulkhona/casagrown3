/**
 * OfferSheet — Full-page form for creating/modifying offers on buy posts.
 *
 * Mirrors the sell-form layout exactly (PostFormShell, community + map,
 * category, product, description, quantity + unit, price + platform fee,
 * media, multiple delivery dates).
 *
 * Category & product are pre-filled from the buy post (read-only).
 * "Match from My Posts" auto-fills from seller's existing sell posts.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  YStack,
  XStack,
  Input,
  Button,
  Text,
  Label,
  TextArea,
  Spinner,
} from 'tamagui'
import { Platform, Pressable, Alert } from 'react-native'
import {
  Search,
  Info,
  MapPin,
  Plus,
  Trash2,
} from '@tamagui/lucide-icons'
import { colors, borderRadius } from '../../design-tokens'
import { CalendarPicker } from '../create-post/CalendarPicker'
import { PostFormShell } from '../create-post/PostFormShell'
import { MediaPickerSection } from '../create-post/MediaPickerSection'
import { useMediaAssets } from '../create-post/useMediaAssets'
import { loadMediaFromStorage } from '../create-post/load-media-helper'
import {
  getPlatformFeePercent,
  getUserCommunitiesWithNeighbors,
  buildCommunityMapData,
  type UserCommunitiesResult,
} from '../create-post/post-service'
import type { ResolveResponse } from '../community/use-resolve-community'
import { CommunityMapWrapper } from '../create-post/CommunityMapWrapper'
import { useAuth } from '../auth/auth-hook'
import type { FeedPost } from './feed-service'
import type { Offer } from '../offers/offer-types'

// =============================================================================
// Types
// =============================================================================

export interface OfferFormData {
  quantity: number
  pointsPerUnit: number
  category: string
  product: string
  unit: string
  deliveryDates: string[]
  description: string
  sellerPostId?: string
  mediaAssets?: Array<{ uri: string; type: 'image' | 'video' }>
  communityH3Index?: string
  additionalCommunityH3Indices?: string[]
}

export interface OfferSheetProps {
  visible: boolean
  buyPost: FeedPost | null
  existingOffer?: Offer | null
  sellerPosts?: FeedPost[]
  onClose: () => void
  onSubmit: (data: OfferFormData) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

// =============================================================================
// Constants
// =============================================================================

const UNITS = ['piece', 'dozen', 'box', 'bag']

// =============================================================================
// Component
// =============================================================================

export function OfferSheet({
  visible,
  buyPost,
  existingOffer,
  sellerPosts = [],
  onClose,
  onSubmit,
  t,
}: OfferSheetProps) {
  const { user } = useAuth()

  // ── Form State ─────────────────────────────────────────────
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('piece')
  const [price, setPrice] = useState('')
  const [dropoffDates, setDropoffDates] = useState<string[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [showPostSearch, setShowPostSearch] = useState(false)
  const [postSearchQuery, setPostSearchQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Native date picker state
  const [datePickerVisible, setDatePickerVisible] = useState(false)
  const [editingDateIndex, setEditingDateIndex] = useState<number | null>(null)
  const [isAddingNewDate, setIsAddingNewDate] = useState(false)

  // Hidden date input ref for web
  const hiddenDateRef = useRef<HTMLInputElement>(null)

  // ── Platform Fee State ─────────────────────────────────────
  const [platformFeePercent, setPlatformFeePercent] = useState<number>(10)

  // ── Community State ────────────────────────────────────────
  const [communityName, setCommunityName] = useState('')
  const [communityH3Index, setCommunityH3Index] = useState<string | null>(null)
  const [communitiesData, setCommunitiesData] = useState<UserCommunitiesResult | null>(null)
  const [communityMapData, setCommunityMapData] = useState<ResolveResponse | null>(null)
  const [selectedNeighborH3Indices, setSelectedNeighborH3Indices] = useState<string[]>([])
  const [loadingCommunity, setLoadingCommunity] = useState(true)

  const media = useMediaAssets()

  // ── Pre-filled from buy post (read-only) ───────────────────
  const category = buyPost?.buy_details?.category ?? ''
  const produceNames = buyPost?.buy_details?.produce_names ?? []
  const product = produceNames[0] ?? ''
  const desiredUnit = buyPost?.buy_details?.desired_unit ?? 'piece'
  const desiredQuantity = buyPost?.buy_details?.desired_quantity ?? null
  const isModify = !!existingOffer

  // ── Load community + platform fee on mount ────────────────
  useEffect(() => {
    if (!visible || !user?.id) return
    loadCommunityData(user.id)
    getPlatformFeePercent().then(setPlatformFeePercent).catch(() => {})
  }, [visible, user?.id])

  async function loadCommunityData(userId: string) {
    setLoadingCommunity(true)
    try {
      const communities = await getUserCommunitiesWithNeighbors(userId)
      setCommunitiesData(communities)
      if (communities.primary) {
        setCommunityH3Index(communities.primary.h3Index)
        setCommunityName(communities.primary.name)
        const mapData = await buildCommunityMapData(communities.primary, communities.neighbors)
        setCommunityMapData(mapData)
      }
    } catch (err) {
      console.error('Error loading community:', err)
    } finally {
      setLoadingCommunity(false)
    }
  }

  // ── Pre-fill unit and quantity from buy post ───────────────────────────
  useEffect(() => {
    if (visible && buyPost && !existingOffer) {
      setUnit(desiredUnit)
      // Pre-fill quantity from the buyer's desired quantity
      if (desiredQuantity != null) {
        setQuantity(String(desiredQuantity))
      }
    }
  }, [visible, buyPost, desiredUnit, desiredQuantity, existingOffer])

  // ── Pre-fill from existing offer when modifying ───────────
  useEffect(() => {
    if (existingOffer && visible) {
      setQuantity(String(existingOffer.quantity))
      setPrice(String(existingOffer.points_per_unit))
      setUnit(existingOffer.unit ?? desiredUnit)
      setSelectedPostId(existingOffer.seller_post_id ?? null)

      // Pre-fill delivery dates (prefer array, fall back to single)
      const offerRow = existingOffer as Record<string, unknown>
      const dates = offerRow.delivery_dates as string[] | null
      if (dates && dates.length > 0) {
        setDropoffDates(dates)
      } else if (existingOffer.delivery_date) {
        setDropoffDates([existingOffer.delivery_date])
      }

      // Pre-fill description from message (description was merged into message)
      if (existingOffer.message) {
        setDescription(existingOffer.message)
      }

      if (existingOffer.media && existingOffer.media.length > 0) {
        loadMediaFromStorage(existingOffer.media, { isExisting: true })
          .then((assets) => media.setMediaAssets(assets))
          .catch(console.error)
      }
    }
  }, [existingOffer, visible])

  // ── Derived ───────────────────────────────────────────────
  const numericQty = parseFloat(quantity) || 0
  const numericPpu = parseInt(price, 10) || 0
  const totalPoints = numericQty * numericPpu
  const canSubmit = numericQty > 0 && numericPpu > 0

  // ── Filter seller posts ───────────────────────────────────
  const filteredSellerPosts = useMemo(() => {
    if (!postSearchQuery.trim()) return sellerPosts
    const q = postSearchQuery.toLowerCase()
    return sellerPosts.filter(
      (p) =>
        p.sell_details?.produce_name?.toLowerCase().includes(q) ||
        p.sell_details?.category?.toLowerCase().includes(q) ||
        p.content?.toLowerCase().includes(q),
    )
  }, [sellerPosts, postSearchQuery])

  // ── Date Management (mirrored from sell-form) ─────────────
  function handleAddDate() {
    if (Platform.OS === 'web') {
      try {
        hiddenDateRef.current?.showPicker()
      } catch {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        setDropoffDates([...dropoffDates, tomorrow.toISOString().split('T')[0]!])
      }
    } else {
      setIsAddingNewDate(true)
      setDatePickerVisible(true)
    }
  }

  function removeDate(index: number) {
    setDropoffDates(dropoffDates.filter((_, i) => i !== index))
  }

  function updateDate(index: number, value: string) {
    const updated = [...dropoffDates]
    updated[index] = value
    setDropoffDates(updated)
  }

  // ── Handlers ──────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setDescription('')
    setQuantity('')
    setUnit(desiredUnit)
    setPrice('')
    setDropoffDates([])
    setSelectedPostId(null)
    setShowPostSearch(false)
    setPostSearchQuery('')
    setFormError('')
    setSelectedNeighborH3Indices([])
    media.setMediaAssets([])
  }, [desiredUnit])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  const handleSubmit = useCallback(() => {
    if (!canSubmit) {
      setFormError(t('offers.form.requiredFields'))
      return
    }
    const validDates = dropoffDates.filter(d => d.trim() !== '')
    if (validDates.length === 0) {
      setFormError(t('createPost.validation.dropoffRequired'))
      return
    }
    setFormError('')
    onSubmit({
      quantity: numericQty,
      pointsPerUnit: numericPpu,
      category,
      product,
      unit,
      deliveryDates: validDates,
      description: description.trim(),
      sellerPostId: selectedPostId ?? undefined,
      mediaAssets: media.mediaAssets.map((a) => ({
        uri: a.uri,
        type: (a.type === 'video' ? 'video' : 'image') as 'image' | 'video',
      })),
      communityH3Index: communityH3Index ?? undefined,
      additionalCommunityH3Indices:
        selectedNeighborH3Indices.length > 0
          ? selectedNeighborH3Indices
          : undefined,
    })
    resetForm()
  }, [
    canSubmit, numericQty, numericPpu, category, product, unit,
    dropoffDates, description, selectedPostId, media.mediaAssets,
    communityH3Index, selectedNeighborH3Indices,
    onSubmit, resetForm, t,
  ])

  /** Fill form from a seller's sell post */
  const handleSelectPost = useCallback(
    (post: FeedPost) => {
      if (post.sell_details) {
        setQuantity(
          String(
            desiredQuantity &&
              desiredQuantity <= (post.sell_details.total_quantity_available ?? Infinity)
              ? desiredQuantity
              : post.sell_details.total_quantity_available ?? '',
          ),
        )
        setPrice(String(post.sell_details.points_per_unit ?? ''))
        setUnit(post.sell_details.unit ?? desiredUnit)
        setSelectedPostId(post.id)
        // Auto-fill description from the post content
        try {
          const content = JSON.parse(post.content ?? '{}')
          if (content.description) setDescription(content.description)
        } catch {}
        // Auto-fill delivery dates from the post
        if (Array.isArray(post.delivery_dates) && post.delivery_dates.length > 0) {
          setDropoffDates(post.delivery_dates)
        }
      }
      setShowPostSearch(false)
      setPostSearchQuery('')
    },
    [desiredQuantity, desiredUnit],
  )

  // Helper to format category name
  function formatCategory(cat: string) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  if (!visible || !buyPost) return null

  const buyerName = buyPost.author_name || t('feed.unknownAuthor')

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={100}
    >
      <PostFormShell
        title={isModify ? t('offers.form.modifyTitle') : t('offers.form.title')}
        onBack={handleClose}
        onSubmit={handleSubmit}
        submitting={submitting}
        formError={formError}
        onClearError={() => setFormError('')}
        submitLabel={isModify ? t('offers.form.updateOffer') : t('offers.form.submitOffer')}
        submittingLabel={t('offers.form.submitting')}
      >
        {/* ════════════════════════════════════════════════════
            BUYER'S REQUIREMENTS (info box)
            ════════════════════════════════════════════════════ */}
        <YStack
          backgroundColor="#f0fdf4"
          borderRadius={borderRadius.lg}
          padding="$4"
          borderWidth={1}
          borderColor="#86efac"
          gap="$2"
        >
          <Text
            fontSize={12}
            fontWeight="700"
            color={colors.green[700]}
            textTransform="uppercase"
          >
            {t('offers.form.buyerNeeds')}
          </Text>
          <Text fontSize={14} fontWeight="600" color={colors.green[800]}>
            {buyerName} — {produceNames.join(', ')} ({formatCategory(category)})
          </Text>
          {desiredQuantity && (
            <Text fontSize={13} color={colors.green[700]}>
              {t('offers.form.desiredQty')}: {desiredQuantity}{' '}
              {desiredUnit}
            </Text>
          )}
          {buyPost.buy_details?.need_by_date && (
            <Text fontSize={13} color={colors.green[700]}>
              {t('offers.form.needBy')}:{' '}
              {new Date(
                buyPost.buy_details.need_by_date + 'T00:00:00',
              ).toLocaleDateString()}
            </Text>
          )}
        </YStack>

        {/* ════════════════════════════════════════════════════
            COMMUNITY + MAP
            ════════════════════════════════════════════════════ */}
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.lg}
          padding="$4"
          gap="$3"
          borderWidth={1}
          borderColor={colors.neutral[200]}
        >
          <Label fontWeight="600" color={colors.neutral[900]}>
            {t('createPost.fields.community')}
          </Label>

          {loadingCommunity ? (
            <XStack alignItems="center" gap="$2" padding="$3">
              <Spinner size="small" color={colors.primary[600]} />
              <Text color={colors.neutral[500]}>{t('createPost.loading.community')}</Text>
            </XStack>
          ) : communityName ? (
            <YStack gap="$3">
              <XStack alignItems="center" gap="$2">
                <MapPin size={18} color={colors.primary[600]} />
                <Text fontWeight="500" color={colors.neutral[900]}>
                  {communityName}
                </Text>
              </XStack>

              {/* Adjacent communities — selectable */}
              {communitiesData?.neighbors && communitiesData.neighbors.length > 0 && (
                <YStack gap="$2">
                  <Text fontSize="$2" fontWeight="500" color={colors.neutral[600]}>
                    {t('createPost.neighbors.alsoPostTo')}
                  </Text>
                  <XStack flexWrap="wrap" gap="$2">
                    {communitiesData.neighbors.map((n) => {
                      const isSelected = selectedNeighborH3Indices.includes(n.h3Index)
                      return (
                        <Pressable
                          key={n.h3Index}
                          onPress={() => {
                            setSelectedNeighborH3Indices((prev) =>
                              prev.includes(n.h3Index)
                                ? prev.filter((h) => h !== n.h3Index)
                                : [...prev, n.h3Index]
                            )
                          }}
                        >
                          <XStack
                            alignItems="center"
                            gap="$1.5"
                            backgroundColor={isSelected ? colors.green[600] : 'white'}
                            borderWidth={1}
                            borderColor={isSelected ? colors.green[600] : colors.neutral[300]}
                            borderRadius={borderRadius.full}
                            paddingHorizontal="$3"
                            paddingVertical="$1.5"
                          >
                            <MapPin size={12} color={isSelected ? 'white' : colors.neutral[500]} />
                            <Text fontSize="$2" color={isSelected ? 'white' : colors.neutral[700]} fontWeight="500">
                              {n.name}
                            </Text>
                          </XStack>
                        </Pressable>
                      )
                    })}
                  </XStack>
                  {selectedNeighborH3Indices.length > 0 && (
                    <Text fontSize="$1" color={colors.green[600]}>
                      {t('createPost.neighbors.additionalCount', { count: selectedNeighborH3Indices.length })}
                    </Text>
                  )}
                </YStack>
              )}

              {/* Community Map */}
              {communityMapData && (
                <YStack borderRadius={borderRadius.md} overflow="hidden">
                  <CommunityMapWrapper
                    resolveData={communityMapData}
                    height={200}
                    showLabels={true}
                    selectedNeighborH3Indices={selectedNeighborH3Indices}
                  />
                </YStack>
              )}
            </YStack>
          ) : (
            <XStack alignItems="center" gap="$2" padding="$3">
              <Spinner size="small" color={colors.primary[600]} />
              <Text color={colors.neutral[500]}>{t('createPost.loading.communityData')}</Text>
            </XStack>
          )}
        </YStack>

        {/* ════════════════════════════════════════════════════
            MATCH FROM MY POSTS
            ════════════════════════════════════════════════════ */}
        {sellerPosts.length > 0 && (
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius.lg}
            padding="$4"
            gap="$3"
            borderWidth={1}
            borderColor={colors.neutral[200]}
          >
            <Pressable
              onPress={() => setShowPostSearch(!showPostSearch)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Search size={16} color={colors.blue[600]} />
              <Text fontSize={14} fontWeight="600" color={colors.blue[600]}>
                {t('offers.form.matchFromPosts')}
              </Text>
            </Pressable>

            {showPostSearch && (
              <YStack gap="$2">
                <XStack
                  borderWidth={1}
                  borderColor={colors.neutral[300]}
                  borderRadius={borderRadius.md}
                  alignItems="center"
                  paddingHorizontal="$3"
                >
                  <Search size={14} color={colors.neutral[400]} />
                  <Input
                    unstyled
                    flex={1}
                    size="$4"
                    placeholder={t('offers.form.searchPostsPlaceholder')}
                    value={postSearchQuery}
                    onChangeText={setPostSearchQuery}
                    backgroundColor="transparent"
                    borderWidth={0}
                    fontWeight="400"
                  />
                </XStack>

                <YStack maxHeight={180} overflow="hidden">
                  {filteredSellerPosts.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => handleSelectPost(p)}
                      style={{
                        padding: 10,
                        borderWidth: 1,
                        borderColor:
                          selectedPostId === p.id
                            ? colors.blue[400]
                            : colors.neutral[200],
                        borderRadius: 8,
                        marginBottom: 6,
                        backgroundColor:
                          selectedPostId === p.id ? '#eff6ff' : 'white',
                      }}
                    >
                      <Text
                        fontSize={14}
                        fontWeight="600"
                        color={colors.neutral[800]}
                      >
                        {p.sell_details?.produce_name ??
                          p.content?.slice(0, 40)}
                      </Text>
                      <XStack gap="$2" marginTop={2}>
                        {p.sell_details?.points_per_unit != null && (
                          <Text fontSize={12} color={colors.neutral[500]}>
                            {p.sell_details.points_per_unit} pts/
                            {p.sell_details.unit ?? 'unit'}
                          </Text>
                        )}
                        {p.sell_details?.total_quantity_available != null && (
                          <Text fontSize={12} color={colors.neutral[500]}>
                            {p.sell_details.total_quantity_available}{' '}
                            {p.sell_details.unit ?? 'units'} avail
                          </Text>
                        )}
                      </XStack>
                    </Pressable>
                  ))}
                  {filteredSellerPosts.length === 0 && (
                    <Text
                      fontSize={13}
                      color={colors.neutral[400]}
                      padding="$2"
                    >
                      {t('offers.form.noMatchingPosts')}
                    </Text>
                  )}
                </YStack>
              </YStack>
            )}
          </YStack>
        )}

        {/* ════════════════════════════════════════════════════
            CATEGORY (read-only, pre-filled from buy post)
            ════════════════════════════════════════════════════ */}
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.lg}
          padding="$4"
          gap="$3"
          borderWidth={1}
          borderColor={colors.neutral[200]}
        >
          <Label fontWeight="600" color={colors.neutral[900]}>
            {t('offers.form.category')}
          </Label>
          <XStack flexWrap="wrap" gap="$2">
            <Button
              size="$3"
              backgroundColor={colors.primary[600]}
              borderWidth={1}
              borderColor={colors.primary[600]}
              borderRadius={borderRadius.full}
              disabled
            >
              <Text color="white" fontWeight="600" fontSize="$3">
                {formatCategory(category)}
              </Text>
            </Button>
          </XStack>
        </YStack>

        {/* ════════════════════════════════════════════════════
            PRODUCT DETAILS
            ════════════════════════════════════════════════════ */}
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.lg}
          padding="$4"
          gap="$4"
          borderWidth={1}
          borderColor={colors.neutral[200]}
        >
          {/* Product Name (read-only) */}
          <YStack gap="$2">
            <Label fontWeight="600" color={colors.neutral[900]}>
              {t('offers.form.product')}
            </Label>
            <Input
              size="$4"
              value={product}
              disabled
              borderColor={colors.neutral[300]}
              backgroundColor={colors.neutral[50]}
              fontWeight="400"
              color={colors.neutral[700]}
              opacity={0.8}
            />
          </YStack>

          {/* Description */}
          <YStack gap="$2">
            <Label fontWeight="600" color={colors.neutral[900]}>
              {t('offers.form.description')}
            </Label>
            <TextArea
              value={description}
              onChangeText={setDescription}
              placeholder={t('offers.form.descriptionPlaceholder')}
              borderColor={colors.neutral[300]}
              focusStyle={{ borderColor: colors.primary[500] }}
              backgroundColor="white"
              numberOfLines={3}
              size="$4"
              style={
                {
                  fontWeight: '400',
                  textAlignVertical: 'top',
                } as Record<string, string>
              }
            />
          </YStack>

          {/* Quantity + Unit */}
          <XStack gap="$3">
            <YStack gap="$2" flex={1}>
              <Label fontWeight="600" color={colors.neutral[900]}>
                {t('offers.form.quantity')} *
              </Label>
              <Input
                size="$4"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="1"
                keyboardType="numeric"
                borderColor={colors.neutral[300]}
                focusStyle={{ borderColor: colors.primary[500] }}
                backgroundColor="white"
                fontWeight="400"
              />
              {desiredQuantity != null &&
                numericQty > 0 &&
                numericQty > desiredQuantity && (
                  <Text fontSize="$1" color={colors.amber[600]} fontWeight="600">
                    {t('offers.form.exceedsDesired', {
                      desired: desiredQuantity,
                      unit,
                    })}
                  </Text>
                )}
            </YStack>
            <YStack gap="$2" flex={1}>
              <Label fontWeight="600" color={colors.neutral[900]}>
                {t('offers.form.unit')}
              </Label>
              <XStack flexWrap="wrap" gap="$1">
                {UNITS.map((u) => (
                  <Button
                    key={u}
                    size="$2"
                    backgroundColor={
                      unit === u ? colors.primary[600] : 'white'
                    }
                    borderWidth={1}
                    borderColor={
                      unit === u
                        ? colors.primary[600]
                        : colors.neutral[300]
                    }
                    borderRadius={borderRadius.md}
                    onPress={() => setUnit(u)}
                  >
                    <Text
                      color={
                        unit === u ? 'white' : colors.neutral[700]
                      }
                      fontSize="$2"
                      fontWeight={unit === u ? '600' : '400'}
                      textTransform="capitalize"
                    >
                      {u}
                    </Text>
                  </Button>
                ))}
              </XStack>
            </YStack>
          </XStack>

          {/* Price */}
          <YStack gap="$2">
            <Label fontWeight="600" color={colors.neutral[900]}>
              {t('offers.form.pricePerUnit')} *
            </Label>
            <Input
              size="$4"
              value={price}
              onChangeText={setPrice}
              placeholder="0"
              keyboardType="numeric"
              borderColor={colors.neutral[300]}
              focusStyle={{ borderColor: colors.primary[500] }}
              backgroundColor="white"
              fontWeight="400"
            />
            {numericQty > 0 && numericPpu > 0 && (
              <Text fontSize="$2" color={colors.neutral[500]}>
                {t('offers.form.totalPoints')}: {totalPoints} pts
              </Text>
            )}
            {/* Platform Fee Notice */}
            <XStack
              backgroundColor={colors.amber[50]}
              padding="$3"
              borderRadius={borderRadius.md}
              gap="$2"
              alignItems="flex-start"
            >
              <Info
                size={16}
                color={colors.amber[600]}
                style={{ marginTop: 2 }}
              />
              <Text fontSize="$2" color={colors.amber[700]} flex={1}>
                {t('createPost.fields.platformFee', {
                  percent: platformFeePercent,
                })}
              </Text>
            </XStack>
          </YStack>
        </YStack>

        {/* ════════════════════════════════════════════════════
            PHOTO / VIDEO
            ════════════════════════════════════════════════════ */}
        <MediaPickerSection media={media} />

        {/* ════════════════════════════════════════════════════
            DROP-OFF DATES (multiple, mirrored from sell-form)
            ════════════════════════════════════════════════════ */}
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.lg}
          padding="$4"
          gap="$3"
          borderWidth={1}
          borderColor={colors.neutral[200]}
        >
          <Label fontWeight="600" color={colors.neutral[900]}>
            {t('createPost.fields.dropoffDates')} *
          </Label>
          <Text fontSize="$2" color={colors.neutral[500]}>
            {t('createPost.fields.dropoffDatesHint')}
          </Text>

          {dropoffDates.map((date, index) => (
            <XStack key={index} alignItems="center" gap="$2">
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={date}
                  onChange={(e: any) => updateDate(index, e.target.value)}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 8,
                    border: `1px solid ${colors.neutral[300]}`,
                    padding: '0 12px',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    fontWeight: 400,
                    backgroundColor: 'white',
                    color: colors.neutral[900],
                  }}
                />
              ) : (
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => {
                    setEditingDateIndex(index)
                    setDatePickerVisible(true)
                  }}
                >
                  <XStack
                    flex={1}
                    height={44}
                    alignItems="center"
                    paddingHorizontal="$3"
                    borderWidth={1}
                    borderColor={colors.neutral[300]}
                    borderRadius={8}
                    backgroundColor="white"
                  >
                    <Text
                      flex={1}
                      fontSize="$3"
                      color={date ? colors.neutral[900] : colors.neutral[400]}
                      fontWeight="400"
                    >
                      {date || 'Select date'}
                    </Text>
                    <Text fontSize="$3" color={colors.neutral[400]}>📅</Text>
                  </XStack>
                </Pressable>
              )}
              <Button
                unstyled
                padding="$2"
                onPress={() => removeDate(index)}
              >
                <Trash2 size={20} color={colors.red[500]} />
              </Button>
            </XStack>
          ))}

          <Button
            size="$3"
            backgroundColor={colors.primary[50]}
            borderWidth={1}
            borderColor={colors.primary[200]}
            icon={<Plus size={18} color={colors.primary[600]} />}
            onPress={handleAddDate}
          >
            <Text color={colors.primary[600]} fontWeight="600">
              {t('createPost.fields.addDate')}
            </Text>
          </Button>

          {/* Hidden date input for web — showPicker() opens browser calendar directly */}
          {Platform.OS === 'web' && (
            <input
              ref={hiddenDateRef}
              type="date"
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                if (e.target.value) {
                  setDropoffDates(prev => [...prev, e.target.value])
                  e.target.value = ''
                }
              }}
            />
          )}

          {/* Calendar Picker modal (native only — web uses <input type="date">) */}
          {Platform.OS !== 'web' && datePickerVisible && (editingDateIndex !== null || isAddingNewDate) && (
            <CalendarPicker
              visible={datePickerVisible}
              initialDate={
                isAddingNewDate
                  ? undefined
                  : dropoffDates[editingDateIndex!] || undefined
              }
              minimumDate={new Date()}
              onSelect={(dateStr) => {
                if (isAddingNewDate) {
                  setDropoffDates(prev => [...prev, dateStr])
                  setIsAddingNewDate(false)
                } else if (editingDateIndex !== null) {
                  updateDate(editingDateIndex, dateStr)
                }
                setDatePickerVisible(false)
                setEditingDateIndex(null)
              }}
              onCancel={() => {
                setIsAddingNewDate(false)
                setDatePickerVisible(false)
                setEditingDateIndex(null)
              }}
            />
          )}
        </YStack>
      </PostFormShell>
    </YStack>
  )
}
