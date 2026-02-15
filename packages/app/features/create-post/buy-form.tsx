/**
 * Buy Form - Enhanced with community map, dynamic categories,
 * and camera/gallery media selection
 */

import { useState, useEffect, useRef } from 'react'
import {
  YStack,
  XStack,
  Input,
  Button,
  Text,
  Label,
  Spinner,
  TextArea,
} from 'tamagui'
import {
  Plus,
  Trash2,
  MapPin,
} from '@tamagui/lucide-icons'
import { Platform, Pressable } from 'react-native'
import { CalendarPicker } from './CalendarPicker'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius } from '../../design-tokens'
import { useAuth } from '../auth/auth-hook'
import {
  createBuyPost,
  updateBuyPost,
  getUserCommunitiesWithNeighbors,
  getAvailableCategories,
  type UserCommunitiesResult,
} from './post-service'
import { buildResolveResponseFromIndex } from '../community/h3-utils'
import type { ResolveResponse } from '../community/use-resolve-community'
import { loadMediaFromStorage } from './load-media-helper'
import { useMediaAssets } from './useMediaAssets'
import { CommunityMapWrapper } from './CommunityMapWrapper'
import { PostFormShell } from './PostFormShell'
import { MediaPickerSection } from './MediaPickerSection'

interface BuyFormProps {
  onBack: () => void
  onSuccess: () => void
  editId?: string
  cloneData?: string
}

export function BuyForm({ onBack, onSuccess, editId, cloneData }: BuyFormProps) {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const media = useMediaAssets()

  // ── Form State ──────────────────────────────────────────────
  const [category, setCategory] = useState('')
  const [lookingFor, setLookingFor] = useState('')
  const [description, setDescription] = useState('')
  const [needByDate, setNeedByDate] = useState('')
  const [acceptDates, setAcceptDates] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [datePickerVisible, setDatePickerVisible] = useState(false)
  const [editingDateIndex, setEditingDateIndex] = useState<number | null>(null)
  const [isAddingNewDate, setIsAddingNewDate] = useState(false)
  const [formError, setFormError] = useState('')

  // ── Community State ─────────────────────────────────────────
  const [communityName, setCommunityName] = useState('')
  const [communityH3Index, setCommunityH3Index] = useState<string | null>(null)
  const [communitiesData, setCommunitiesData] = useState<UserCommunitiesResult | null>(null)
  const [communityMapData, setCommunityMapData] = useState<ResolveResponse | null>(null)
  const [selectedNeighborH3Indices, setSelectedNeighborH3Indices] = useState<string[]>([])
  const [loadingCommunity, setLoadingCommunity] = useState(true)

  // ── Categories State ────────────────────────────────────────
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)

  // ── Load community and categories on mount ──────────────────
  useEffect(() => {
    if (!user?.id) return
    loadData()
  }, [user?.id])

  // ── Load edit data ─────────────────────────────────────────
  useEffect(() => {
    if (!editId && !cloneData) return
    let cancelled = false
    ;(async () => {
      try {
        // Clone mode: parse inline JSON data
        if (cloneData && !editId) {
          try {
            const parsed = JSON.parse(cloneData)
            const content = parsed.content ? JSON.parse(parsed.content) : {}
            if (content.description) setDescription(content.description)
            if (content.produceNames) setLookingFor(content.produceNames.join(', '))
            if (parsed.buy_details) {
              setCategory(parsed.buy_details.category || '')
              if (Array.isArray(parsed.buy_details.produce_names)) {
                setLookingFor(parsed.buy_details.produce_names.join(', '))
              }
              if (parsed.buy_details.need_by_date) setNeedByDate(parsed.buy_details.need_by_date)
            }
            // Copy accept drop-off dates
            if (Array.isArray(parsed.delivery_dates) && parsed.delivery_dates.length > 0) {
              setAcceptDates(parsed.delivery_dates)
            }
            // Load media from storage paths
            if (parsed.media && parsed.media.length > 0) {
              const loadedAssets = await loadMediaFromStorage(parsed.media)
              if (!cancelled && loadedAssets.length > 0) {
                media.setMediaAssets(loadedAssets)
              }
            }
          } catch {}
          return
        }
        // Edit mode: fetch from DB
        const { getPostById } = await import('../my-posts/my-posts-service')
        const { supabase } = await import('../auth/auth-hook')
        const post = await getPostById(editId!)
        if (cancelled || !post) return
        // Pre-fill from content JSON
        try {
          const parsed = JSON.parse(post.content)
          if (parsed.description) setDescription(parsed.description)
          if (parsed.produceNames) setLookingFor(parsed.produceNames.join(', '))
        } catch {}
        // Pre-fill from buy_details
        if (post.buy_details) {
          setCategory(post.buy_details.category || '')
          if (Array.isArray(post.buy_details.produce_names)) {
            setLookingFor(post.buy_details.produce_names.join(', '))
          }
          if (post.buy_details.need_by_date) setNeedByDate(post.buy_details.need_by_date)
        }
        // Pre-fill accept drop-off dates
        if (Array.isArray(post.delivery_dates) && post.delivery_dates.length > 0) {
          setAcceptDates(post.delivery_dates)
        }
        if (post.media && post.media.length > 0) {
          const loadedAssets = await loadMediaFromStorage(post.media, { isExisting: true })
          if (!cancelled && loadedAssets.length > 0) {
            media.setMediaAssets(loadedAssets)
          }
        }
      } catch (err) {
        console.error('Error loading edit data:', err)
      }
    })()
    return () => { cancelled = true }
  }, [editId])

  async function loadData() {
    if (!user?.id) return
    setLoadingCommunity(true)
    setLoadingCategories(true)

    try {
      const communities = await getUserCommunitiesWithNeighbors(user.id)
      setCommunitiesData(communities)

      if (communities.primary) {
        setCommunityH3Index(communities.primary.h3Index)
        setCommunityName(communities.primary.name)
        const mapData = buildResolveResponseFromIndex(
          communities.primary.h3Index,
          communities.primary.name,
          communities.primary.city || '',
          communities.primary.lat,
          communities.primary.lng,
        )
        if (communities.neighbors.length > 0) {
          ;(mapData as any).neighbors = communities.neighbors.map((n) => ({
            h3_index: n.h3Index,
            name: n.name,
            status: 'active' as const,
          }))
        }
        setCommunityMapData(mapData as unknown as ResolveResponse)
      } else {
        // No community means stale session — sign out and redirect
        await signOut()
        if (typeof window !== 'undefined') { window.location.href = '/' } else { onBack() }
        return
      }

      const cats = await getAvailableCategories(communities.primary?.h3Index)
      setAvailableCategories(cats)
    } catch (err) {
      console.error('Error loading data:', err)
      // Network/auth error — sign out and redirect
      await signOut()
      if (typeof window !== 'undefined') { window.location.href = '/' } else { onBack() }
    } finally {
      setLoadingCommunity(false)
      setLoadingCategories(false)
    }
  }

  // ── Date Management ─────────────────────────────────────────
  const hiddenDateRef = useRef<HTMLInputElement>(null)

  function handleAddDate() {
    if (Platform.OS === 'web') {
      // Open browser date picker directly via hidden input
      try {
        hiddenDateRef.current?.showPicker()
      } catch {
        // Fallback: add row with tomorrow's date
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        setAcceptDates([...acceptDates, tomorrow.toISOString().split('T')[0]!])
      }
    } else {
      // Native: open CalendarPicker first, add date only on confirm
      setIsAddingNewDate(true)
      setDatePickerVisible(true)
    }
  }

  function removeAcceptDate(index: number) {
    setAcceptDates(acceptDates.filter((_, i) => i !== index))
  }

  function updateAcceptDate(index: number, value: string) {
    const updated = [...acceptDates]
    updated[index] = value
    setAcceptDates(updated)
  }

  // ── Submit ──────────────────────────────────────────────────
  async function handleSubmit() {
    if (!user?.id) return
    if (!lookingFor.trim() || !category) {
      setFormError(t('createPost.validation.requiredFields'))
      return
    }

    setFormError('')
    setSubmitting(true)
    try {
      const postData = {
        authorId: user.id,
        communityH3Index: communityH3Index || undefined,
        additionalCommunityH3Indices: selectedNeighborH3Indices.length > 0 ? selectedNeighborH3Indices : undefined,
        description,
        category,
        produceNames: lookingFor.split(',').map((s) => s.trim()).filter(Boolean),
        needByDate: needByDate || undefined,
        acceptDates: acceptDates.length > 0 ? acceptDates : undefined,
        mediaAssets: media.mediaAssets.length > 0 ? media.mediaAssets.map(a => ({ uri: a.uri, type: a.type ?? undefined })) : undefined,
      }
      if (editId) {
        await updateBuyPost(editId, postData)
      } else {
        await createBuyPost(postData)
      }
      onSuccess()
    } catch (err) {
      console.error('Error creating buy post:', err)
      setFormError(t('createPost.error.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  function formatCategory(cat: string) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <PostFormShell
      title={t('createPost.types.buy.formTitle')}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      formError={formError}
      onClearError={() => setFormError('')}
    >
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
              <Text fontWeight="500" color={colors.neutral[900]}>{communityName}</Text>
            </XStack>

            {communityMapData && (
              <YStack borderRadius={borderRadius.md} overflow="hidden">
                <CommunityMapWrapper
                  resolveData={communityMapData}
                  height={200}
                  showLabels={true}
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
          CATEGORY (Dynamic)
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
          {t('createPost.fields.category')} *
        </Label>

        {loadingCategories ? (
          <XStack alignItems="center" gap="$2" padding="$2">
            <Spinner size="small" color={colors.primary[600]} />
            <Text color={colors.neutral[500]}>{t('createPost.loading.categories')}</Text>
          </XStack>
        ) : (
          <XStack flexWrap="wrap" gap="$2">
            {availableCategories.map((cat) => (
              <Button
                key={cat}
                size="$3"
                backgroundColor={category === cat ? colors.primary[600] : 'white'}
                borderWidth={1}
                borderColor={category === cat ? colors.primary[600] : colors.neutral[300]}
                borderRadius={borderRadius.full}
                onPress={() => setCategory(cat)}
                pressStyle={{ scale: 0.97 }}
              >
                <Text
                  color={category === cat ? 'white' : colors.neutral[700]}
                  fontWeight={category === cat ? '600' : '400'}
                  fontSize="$3"
                >
                  {formatCategory(cat)}
                </Text>
              </Button>
            ))}
          </XStack>
        )}
      </YStack>

      {/* ════════════════════════════════════════════════════
          WHAT ARE YOU LOOKING FOR
          ════════════════════════════════════════════════════ */}
      <YStack
        backgroundColor="white"
        borderRadius={borderRadius.lg}
        padding="$4"
        gap="$4"
        borderWidth={1}
        borderColor={colors.neutral[200]}
      >
        <YStack gap="$2">
          <Label fontWeight="600" color={colors.neutral[900]}>
            {t('createPost.fields.lookingFor')} *
          </Label>
          <Input
            size="$4"
            value={lookingFor}
            onChangeText={setLookingFor}
            placeholder={t('createPost.fields.lookingForPlaceholder')}
            borderColor={colors.neutral[300]}
            focusStyle={{ borderColor: colors.primary[500] }}
            backgroundColor="white"
            fontWeight="400"
          />
          <Text fontSize="$1" color={colors.neutral[400]}>
            {t('createPost.fields.lookingForHint')}
          </Text>
        </YStack>

        <YStack gap="$2">
          <Label fontWeight="600" color={colors.neutral[900]}>
            {t('createPost.fields.description')}
          </Label>
          <TextArea
            size="$4"
            value={description}
            onChangeText={setDescription}
            placeholder={t('createPost.fields.descriptionPlaceholder')}
            borderColor={colors.neutral[300]}
            focusStyle={{ borderColor: colors.primary[500] }}
            backgroundColor="white"
            numberOfLines={3}
            style={{ fontWeight: '400', textAlignVertical: 'top' } as any}
          />
        </YStack>

        {/* Need By Date */}
        <YStack gap="$2">
          <Label fontWeight="600" color={colors.neutral[900]}>
            {t('createPost.fields.needByDate')}
          </Label>
          {Platform.OS === 'web' ? (
            <input
              type="date"
              value={needByDate}
              onChange={(e: any) => setNeedByDate(e.target.value)}
              style={{
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
              onPress={() => {
                setEditingDateIndex(-1)
                setDatePickerVisible(true)
              }}
            >
              <XStack
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
                  color={needByDate ? colors.neutral[900] : colors.neutral[400]}
                  fontWeight="400"
                >
                  {needByDate || 'Select date'}
                </Text>
                <Text fontSize="$3" color={colors.neutral[400]}>📅</Text>
              </XStack>
            </Pressable>
          )}
          <Text fontSize="$1" color={colors.neutral[400]}>
            {t('createPost.fields.needByDateHint')}
          </Text>
        </YStack>

        {/* Accept Drop-off Dates */}
        <YStack gap="$2">
          <Label fontWeight="600" color={colors.neutral[900]}>
            {t('createPost.fields.acceptDropoffDates')}
          </Label>
          <Text fontSize="$1" color={colors.neutral[400]}>
            {t('createPost.fields.acceptDropoffDatesHint')}
          </Text>

          {acceptDates.map((date, index) => (
            <XStack key={index} alignItems="center" gap="$2">
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={date}
                  onChange={(e: any) => updateAcceptDate(index, e.target.value)}
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
              <Button unstyled padding="$2" onPress={() => removeAcceptDate(index)}>
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
              ref={hiddenDateRef as any}
              type="date"
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
              onChange={(e: any) => {
                if (e.target.value) {
                  setAcceptDates(prev => [...prev, e.target.value])
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
                  : editingDateIndex === -1
                    ? needByDate || undefined
                    : acceptDates[editingDateIndex!] || undefined
              }
              minimumDate={new Date()}
              onSelect={(dateStr) => {
                if (isAddingNewDate) {
                  setAcceptDates(prev => [...prev, dateStr])
                  setIsAddingNewDate(false)
                } else if (editingDateIndex === -1) {
                  setNeedByDate(dateStr)
                } else if (editingDateIndex !== null) {
                  updateAcceptDate(editingDateIndex, dateStr)
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
      </YStack>

      {/* ════════════════════════════════════════════════════
          PHOTO / VIDEO
          ════════════════════════════════════════════════════ */}
      <MediaPickerSection media={media} />
    </PostFormShell>
  )
}
