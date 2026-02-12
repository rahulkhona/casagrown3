/**
 * Buy Form - Enhanced with community map, dynamic categories,
 * and camera/gallery media selection
 */

import { useState, useEffect, lazy, Suspense } from 'react'
import {
  YStack,
  XStack,
  Input,
  Button,
  Text,
  ScrollView,
  Label,
  Spinner,
  TextArea,
} from 'tamagui'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Camera,
  Video,
  MapPin,
  Image as ImageIcon,
  X,
} from '@tamagui/lucide-icons'
import { Platform, Image, Pressable } from 'react-native'
import { CalendarPicker } from './CalendarPicker'
import * as ImagePicker from 'expo-image-picker'
import { useRef } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius } from '../../design-tokens'
import { useAuth } from '../auth/auth-hook'
import {
  createBuyPost,
  updateBuyPost,
  getUserCommunitiesWithNeighbors,
  getAvailableCategories,
  type CommunityInfo,
  type UserCommunitiesResult,
} from './post-service'
import { buildResolveResponseFromIndex } from '../community/h3-utils'
import type { ResolveResponse } from '../community/use-resolve-community'
import { loadMediaFromStorage } from './load-media-helper'

interface WebMediaAsset {
  uri: string
  type: 'image' | 'video'
  width?: number
  height?: number
  fileName?: string
  isExisting?: boolean
}

const WebCameraModal = Platform.OS === 'web'
  ? require('./WebCameraModal').WebCameraModal
  : null

// Platform-conditional lazy import for CommunityMap
const CommunityMapLazy = Platform.OS === 'web'
  ? lazy(() => import('../community/CommunityMap'))
  : null
const CommunityMapNative = Platform.OS !== 'web'
  ? require('../community/CommunityMap').default
  : null

function CommunityMapWrapper(props: { resolveData: ResolveResponse; height?: number; showLabels?: boolean; selectedNeighborH3Indices?: string[] }) {
  if (Platform.OS === 'web' && CommunityMapLazy) {
    return (
      <Suspense fallback={<YStack height={props.height || 220} alignItems="center" justifyContent="center" backgroundColor={colors.neutral[50]} borderRadius={12}><Spinner size="large" color={colors.primary[600]} /></YStack>}>
        <CommunityMapLazy {...props} />
      </Suspense>
    )
  }
  if (CommunityMapNative) {
    return <CommunityMapNative {...props} />
  }
  return null
}

interface BuyFormProps {
  onBack: () => void
  onSuccess: () => void
  editId?: string
  cloneData?: string
}

export function BuyForm({ onBack, onSuccess, editId, cloneData }: BuyFormProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { user, signOut } = useAuth()

  // ── Form State ──────────────────────────────────────────────
  const [category, setCategory] = useState('')
  const [lookingFor, setLookingFor] = useState('')
  const [description, setDescription] = useState('')
  const [needByDate, setNeedByDate] = useState('')
  const [acceptDates, setAcceptDates] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [datePickerVisible, setDatePickerVisible] = useState(false)
  const [editingDateIndex, setEditingDateIndex] = useState<number | null>(null)
  const [mediaAssets, setMediaAssets] = useState<(ImagePicker.ImagePickerAsset | WebMediaAsset)[]>([])
  const [formError, setFormError] = useState('')
  const [showMediaMenu, setShowMediaMenu] = useState(false)

  // Web file input ref & camera modal state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameraMode, setCameraMode] = useState<'photo' | 'video' | null>(null)

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
                setMediaAssets(loadedAssets)
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
            setMediaAssets(loadedAssets)
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

  // ── Media Picker ────────────────────────────────────────────

  function handleWebFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]!
    const url = URL.createObjectURL(file)
    setMediaAssets([{
      uri: url,
      type: file.type.startsWith('video') ? 'video' : 'image',
      fileName: file.name,
    }])
    e.target.value = ''
  }

  function handleWebCameraCapture(asset: { uri: string; type: 'image' | 'video'; fileName: string }) {
    setMediaAssets([asset])
    setCameraMode(null)
  }

  async function handlePickMedia() {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click()
    } else {
      setShowMediaMenu(!showMediaMenu)
    }
  }

  async function takePhoto() {
    if (Platform.OS === 'web') { setCameraMode('photo'); return }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        exif: false,
      })
      if (!result.canceled && result.assets.length > 0) setMediaAssets([result.assets[0]!])
    } catch (e) {
      console.warn('Camera unavailable:', e)
    }
  }

  async function pickFromGallery() {
    if (Platform.OS === 'web') { fileInputRef.current?.click(); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      exif: false,
      videoMaxDuration: 30,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    })
    if (!result.canceled && result.assets.length > 0) setMediaAssets([result.assets[0]!])
  }

  async function recordVideo() {
    if (Platform.OS === 'web') { setCameraMode('video'); return }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 30,
        quality: 0.8,
        videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
      })
      if (!result.canceled && result.assets.length > 0) setMediaAssets([result.assets[0]!])
    } catch (e) {
      console.warn('Camera unavailable:', e)
    }
  }

  function removeMedia(index: number) {
    setMediaAssets((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Date Management ─────────────────────────────────────────
  function addAcceptDate() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setAcceptDates([...acceptDates, tomorrow.toISOString().split('T')[0]!])
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
        mediaAssets: mediaAssets.length > 0 ? mediaAssets.map(a => ({ uri: a.uri, type: a.type ?? undefined })) : undefined,
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
    <YStack flex={1} backgroundColor={colors.neutral[50]}>
      {/* Header */}
      <XStack
        paddingTop={insets.top + 8}
        paddingHorizontal="$4"
        paddingBottom="$3"
        backgroundColor="white"
        alignItems="center"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor={colors.neutral[200]}
      >
        <Button unstyled onPress={onBack} padding="$2">
          <ArrowLeft size={24} color={colors.neutral[700]} />
        </Button>
        <Text fontSize="$6" fontWeight="700" color={colors.neutral[900]}>
          {t('createPost.types.buy.formTitle')}
        </Text>
      </XStack>

      <ScrollView flex={1} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        <YStack gap="$5" maxWidth={600} alignSelf="center" width="100%">

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
                onPress={() => {
                  addAcceptDate()
                  if (Platform.OS !== 'web') {
                    setEditingDateIndex(acceptDates.length)
                    setDatePickerVisible(true)
                  }
                }}
              >
                <Text color={colors.primary[600]} fontWeight="600">
                  {t('createPost.fields.addDate')}
                </Text>
              </Button>

              {/* Calendar Picker modal (native only — web uses <input type="date">) */}
              {Platform.OS !== 'web' && datePickerVisible && editingDateIndex !== null && (
                <CalendarPicker
                  visible={datePickerVisible}
                  initialDate={
                    editingDateIndex === -1
                      ? needByDate || undefined
                      : acceptDates[editingDateIndex] || undefined
                  }
                  minimumDate={new Date()}
                  onSelect={(dateStr) => {
                    if (editingDateIndex === -1) {
                      setNeedByDate(dateStr)
                    } else if (editingDateIndex !== null) {
                      updateAcceptDate(editingDateIndex, dateStr)
                    }
                    setDatePickerVisible(false)
                    setEditingDateIndex(null)
                  }}
                  onCancel={() => {
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
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius.lg}
            padding="$4"
            gap="$3"
            borderWidth={1}
            borderColor={colors.neutral[200]}
          >
            <Label fontWeight="600" color={colors.neutral[900]}>
              {t('createPost.fields.media')}
            </Label>

            {mediaAssets.length > 0 && (
              <XStack flexWrap="wrap" gap="$2">
                {mediaAssets.map((asset, index) => (
                  <YStack key={`${asset.uri}-${index}`} width={80} height={80} borderRadius={borderRadius.md} overflow="hidden" position="relative">
                    {Platform.OS === 'web' && asset.type === 'video' ? (
                      <video
                        src={`${asset.uri}#t=0.1`}
                        style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' as any }}
                        muted
                        playsInline
                        preload="metadata"
                        controls={false}
                      />
                    ) : Platform.OS === 'web' ? (
                      <img
                        src={asset.uri}
                        style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' as any }}
                        alt=""
                      />
                    ) : (
                      <Image source={{ uri: asset.uri }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                    )}
                    <Button unstyled position="absolute" top={2} right={2} width={22} height={22} borderRadius={11} backgroundColor="rgba(0,0,0,0.6)" alignItems="center" justifyContent="center" onPress={() => removeMedia(index)}>
                      <X size={14} color="white" />
                    </Button>
                    {asset.type === 'video' && (
                      <YStack position="absolute" bottom={4} left={4} backgroundColor="rgba(0,0,0,0.5)" borderRadius={4} paddingHorizontal={4} paddingVertical={2}>
                        <Text color="white" fontSize={10} fontWeight="600">{t('createPost.media.videoBadge')}</Text>
                      </YStack>
                    )}
                  </YStack>
                ))}
              </XStack>
            )}

            {/* Add media buttons */}
            {Platform.OS === 'web' ? (
              <YStack gap="$3">
                <XStack
                  backgroundColor={colors.neutral[50]}
                  borderWidth={2}
                  borderStyle="dashed"
                  borderColor={colors.neutral[300]}
                  borderRadius={borderRadius.md}
                  padding="$3"
                  gap="$2"
                  flexWrap="wrap"
                  justifyContent="center"
                >
                  <Button
                    size="$3"
                    backgroundColor={colors.primary[50]}
                    borderWidth={1}
                    borderColor={colors.primary[200]}
                    borderRadius={borderRadius.md}
                    icon={<Camera size={16} color={colors.primary[600]} />}
                    onPress={() => setCameraMode('photo')}
                    hoverStyle={{ backgroundColor: colors.primary[100] }}
                  >
                    <Text fontSize="$2" color={colors.primary[700]} fontWeight="500">{t('createPost.media.takePhoto')}</Text>
                  </Button>
                  <Button
                    size="$3"
                    backgroundColor={colors.primary[50]}
                    borderWidth={1}
                    borderColor={colors.primary[200]}
                    borderRadius={borderRadius.md}
                    icon={<Video size={16} color={colors.primary[600]} />}
                    onPress={() => setCameraMode('video')}
                    hoverStyle={{ backgroundColor: colors.primary[100] }}
                  >
                    <Text fontSize="$2" color={colors.primary[700]} fontWeight="500">{t('createPost.media.recordVideo')}</Text>
                  </Button>
                  <Button
                    size="$3"
                    backgroundColor="white"
                    borderWidth={1}
                    borderColor={colors.neutral[300]}
                    borderRadius={borderRadius.md}
                    icon={<ImageIcon size={16} color={colors.neutral[600]} />}
                    onPress={() => fileInputRef.current?.click()}
                    hoverStyle={{ backgroundColor: colors.neutral[100] }}
                  >
                    <Text fontSize="$2" color={colors.neutral[700]} fontWeight="500">{t('createPost.media.uploadPhotoVideo')}</Text>
                  </Button>
                </XStack>
                <input
                  ref={fileInputRef as any}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleWebFileChange as any}
                  style={{ display: 'none' }}
                />
                {cameraMode && WebCameraModal && (
                  <WebCameraModal
                    mode={cameraMode}
                    onCapture={handleWebCameraCapture}
                    onClose={() => setCameraMode(null)}
                  />
                )}
              </YStack>
            ) : (
              <XStack gap="$2" flexWrap="wrap" justifyContent="center">
                <Button
                  size="$3"
                  backgroundColor={colors.primary[50]}
                  borderWidth={1}
                  borderColor={colors.primary[200]}
                  borderRadius={borderRadius.md}
                  icon={<Camera size={16} color={colors.primary[600]} />}
                  onPress={takePhoto}
                  pressStyle={{ backgroundColor: colors.primary[100] }}
                >
                  <Text fontSize="$2" color={colors.primary[700]} fontWeight="500">{t('createPost.media.takePhoto')}</Text>
                </Button>
                <Button
                  size="$3"
                  backgroundColor={colors.primary[50]}
                  borderWidth={1}
                  borderColor={colors.primary[200]}
                  borderRadius={borderRadius.md}
                  icon={<Video size={16} color={colors.primary[600]} />}
                  onPress={recordVideo}
                  pressStyle={{ backgroundColor: colors.primary[100] }}
                >
                  <Text fontSize="$2" color={colors.primary[700]} fontWeight="500">{t('createPost.media.recordVideo')}</Text>
                </Button>
                <Button
                  size="$3"
                  backgroundColor="white"
                  borderWidth={1}
                  borderColor={colors.neutral[300]}
                  borderRadius={borderRadius.md}
                  icon={<ImageIcon size={16} color={colors.neutral[600]} />}
                  onPress={pickFromGallery}
                  pressStyle={{ backgroundColor: colors.neutral[100] }}
                >
                  <Text fontSize="$2" color={colors.neutral[700]} fontWeight="500">{t('createPost.media.uploadPhotoVideo')}</Text>
                </Button>
              </XStack>
            )}
          </YStack>

          {/* ════════════════════════════════════════════════════
              SUBMIT
              ════════════════════════════════════════════════════ */}
          {formError ? (
            <XStack
              backgroundColor={colors.red[50]}
              borderWidth={1}
              borderColor={colors.red[200]}
              borderRadius={borderRadius.md}
              padding="$3"
              alignItems="center"
              gap="$2"
            >
              <Text flex={1} fontSize="$3" color={colors.red[700]}>{formError}</Text>
              <Pressable onPress={() => setFormError('')}>
                <Text fontSize="$3" color={colors.red[400]}>✕</Text>
              </Pressable>
            </XStack>
          ) : null}
          <Button
            size="$5"
            backgroundColor={colors.primary[600]}
            borderRadius={borderRadius.lg}
            onPress={handleSubmit}
            disabled={submitting}
            hoverStyle={{ backgroundColor: colors.primary[700] }}
            pressStyle={{ backgroundColor: colors.primary[700], scale: 0.98 }}
          >
            {submitting ? (
              <XStack alignItems="center" gap="$2">
                <Spinner size="small" color="white" />
                <Text color="white" fontWeight="700" fontSize="$4">{t('createPost.submitting')}</Text>
              </XStack>
            ) : (
              <Text color="white" fontWeight="700" fontSize="$4">{t('createPost.submit')}</Text>
            )}
          </Button>

        </YStack>
      </ScrollView>
    </YStack>
  )
}
