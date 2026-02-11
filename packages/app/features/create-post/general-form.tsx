/**
 * General Form — service, advice, show-and-tell
 * Enhanced with community map, adjacent zones, global posting, and media selection
 */

import { useState, useEffect, useRef, lazy, Suspense } from 'react'
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
  Checkbox,
} from 'tamagui'
import {
  ArrowLeft,
  Camera,
  Video,
  Image as ImageIcon,
  X,
  MapPin,
  Globe,
  Check,
} from '@tamagui/lucide-icons'
import { Platform, Image, Pressable } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius } from '../../design-tokens'
import { useAuth } from '../auth/auth-hook'
import {
  createGeneralPost,
  updateGeneralPost,
  getUserCommunitiesWithNeighbors,
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

interface GeneralFormProps {
  postType: string
  onBack: () => void
  onSuccess: () => void
  editId?: string
  cloneData?: string
}

const FORM_TITLE_KEYS: Record<string, string> = {
  need_service: 'createPost.types.needService.formTitle',
  offering_service: 'createPost.types.offerService.formTitle',
  seeking_advice: 'createPost.types.advice.formTitle',
  general_info: 'createPost.types.showTell.formTitle',
}

// Which post types support which features
const TYPES_WITH_ADJACENT = ['offering_service']
const TYPES_WITH_GLOBAL = ['seeking_advice', 'general_info']

export function GeneralForm({ postType, onBack, onSuccess, editId, cloneData }: GeneralFormProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { user, signOut } = useAuth()

  // ── Form State ──────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [communityName, setCommunityName] = useState('')
  const [communityH3Index, setCommunityH3Index] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingCommunity, setLoadingCommunity] = useState(true)
  const [mediaAssets, setMediaAssets] = useState<(ImagePicker.ImagePickerAsset | WebMediaAsset)[]>([])
  const [formError, setFormError] = useState('')
  const [showMediaMenu, setShowMediaMenu] = useState(false)

  // Web file input ref & camera modal state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameraMode, setCameraMode] = useState<'photo' | 'video' | null>(null)

  // ── Community + Map State ───────────────────────────────────
  const [communitiesData, setCommunitiesData] = useState<UserCommunitiesResult | null>(null)
  const [communityMapData, setCommunityMapData] = useState<ResolveResponse | null>(null)
  const [selectedNeighborH3Indices, setSelectedNeighborH3Indices] = useState<string[]>([])
  const [postGlobally, setPostGlobally] = useState(TYPES_WITH_GLOBAL.includes(postType))

  // ── Load community on mount ─────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    loadCommunityData()
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
            if (content.title) setTitle(content.title)
            if (content.description) setDescription(content.description)
            // Load media from storage paths
            if (parsed.media && parsed.media.length > 0) {
              const loadedAssets = await loadMediaFromStorage(parsed.media, { isExisting: true })
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
          if (parsed.title) setTitle(parsed.title)
          if (parsed.description) setDescription(parsed.description)
        } catch {}
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

  async function loadCommunityData() {
    if (!user?.id) return
    setLoadingCommunity(true)
    try {
      const communities = await getUserCommunitiesWithNeighbors(user.id)
      setCommunitiesData(communities)

      if (communities.primary) {
        setCommunityH3Index(communities.primary.h3Index)
        setCommunityName(communities.primary.name)
        // Build map data for CommunityMap
        const mapData = buildResolveResponseFromIndex(
          communities.primary.h3Index,
          communities.primary.name,
          communities.primary.city || '',
          communities.primary.lat,
          communities.primary.lng,
        )
        // Enhance with neighbor data
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
    } catch (err) {
      console.error('Error loading community:', err)
      // Network/auth error — sign out and redirect
      await signOut()
      if (typeof window !== 'undefined') { window.location.href = '/' } else { onBack() }
    } finally {
      setLoadingCommunity(false)
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
        videoMaxDuration: 60,
        quality: 0.8,
      })
      if (!result.canceled && result.assets.length > 0) setMediaAssets([result.assets[0]!])
    } catch (e) {
      console.warn('Camera unavailable:', e)
    }
  }

  function removeMedia(index: number) {
    setMediaAssets((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Submit ──────────────────────────────────────────────────
  async function handleSubmit() {
    if (!user?.id) return
    if (!title.trim() || !description.trim()) {
      setFormError(t('createPost.validation.requiredFields'))
      return
    }

    setFormError('')
    setSubmitting(true)
    try {
      const postData = {
        authorId: user.id,
        communityH3Index: postGlobally ? undefined : (communityH3Index || undefined),
        additionalCommunityH3Indices: selectedNeighborH3Indices.length > 0 ? selectedNeighborH3Indices : undefined,
        type: postType,
        title,
        description,
        reach: (postGlobally ? 'global' : 'community') as 'global' | 'community',
        mediaAssets: mediaAssets.length > 0 ? mediaAssets.map(a => ({ uri: a.uri, type: a.type ?? undefined })) : undefined,
      }
      if (editId) {
        await updateGeneralPost(editId, postData)
      } else {
        await createGeneralPost(postData)
      }
      onSuccess()
    } catch (err) {
      console.error('Error creating post:', err)
      setFormError(t('createPost.error.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  const formTitleKey = FORM_TITLE_KEYS[postType] || 'createPost.title'
  const showAdjacent = TYPES_WITH_ADJACENT.includes(postType)
  const showGlobal = TYPES_WITH_GLOBAL.includes(postType)

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
          {t(formTitleKey)}
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
                {/* Global toggle (seek_advice, show_and_tell) — shown first */}
                {showGlobal && (
                  <XStack
                    alignItems="center"
                    gap="$3"
                    backgroundColor={postGlobally ? colors.green[50] : colors.neutral[50]}
                    padding="$3"
                    borderRadius={borderRadius.md}
                    borderWidth={1}
                    borderColor={postGlobally ? colors.green[300] : colors.neutral[200]}
                    pressStyle={{ opacity: 0.8 }}
                    onPress={() => setPostGlobally(!postGlobally)}
                    cursor="pointer"
                  >
                    <Checkbox
                      checked={postGlobally}
                      onCheckedChange={(val) => setPostGlobally(!!val)}
                      size="$4"
                    >
                      <Checkbox.Indicator>
                        <Check color={colors.green[600]} />
                      </Checkbox.Indicator>
                    </Checkbox>
                    <Globe size={20} color={postGlobally ? colors.green[600] : colors.neutral[400]} />
                    <YStack flex={1}>
                      <Text fontWeight="500" color={colors.neutral[900]}>{t('createPost.global.label')}</Text>
                      <Text fontSize="$2" color={colors.neutral[500]}>
                        {t('createPost.global.hint')}
                      </Text>
                    </YStack>
                  </XStack>
                )}

                {/* Community name, neighbors, and map — hidden when posting globally */}
                {!postGlobally && (
                  <>
                    <XStack alignItems="center" gap="$2">
                      <MapPin size={18} color={colors.primary[600]} />
                      <Text fontWeight="500" color={colors.neutral[900]}>
                        {communityName}
                      </Text>
                    </XStack>

                    {/* Adjacent communities — selectable (offering_service only) */}
                    {showAdjacent && communitiesData?.neighbors && communitiesData.neighbors.length > 0 && (
                      <YStack gap="$2">
                        <Text fontSize="$2" fontWeight="500" color={colors.neutral[600]}>
                          {t('createPost.neighbors.alsoOfferService')}
                        </Text>
                        <XStack flexWrap="wrap" gap="$2">
                          {communitiesData.neighbors.map((n) => {
                            const isSelected = selectedNeighborH3Indices.includes(n.h3Index)
                            return (
                              <Button
                                key={n.h3Index}
                                size="$2"
                                backgroundColor={isSelected ? colors.green[600] : 'white'}
                                borderWidth={1}
                                borderColor={isSelected ? colors.green[600] : colors.neutral[300]}
                                borderRadius={borderRadius.full}
                                paddingHorizontal="$3"
                                icon={<MapPin size={12} color={isSelected ? 'white' : colors.neutral[500]} />}
                                onPress={() => {
                                  setSelectedNeighborH3Indices((prev) =>
                                    isSelected
                                      ? prev.filter((h) => h !== n.h3Index)
                                      : [...prev, n.h3Index]
                                  )
                                }}
                                pressStyle={{ scale: 0.97 }}
                              >
                                <Text fontSize="$2" color={isSelected ? 'white' : colors.neutral[700]} fontWeight="500">
                                  {n.name}
                                </Text>
                              </Button>
                            )
                          })}
                        </XStack>
                        {selectedNeighborH3Indices.length > 0 && (
                          <Text fontSize="$1" color={colors.neutral[400]}>
                            {t('createPost.neighbors.selectedCount', { count: selectedNeighborH3Indices.length })}
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
                          selectedNeighborH3Indices={showAdjacent ? selectedNeighborH3Indices : undefined}
                        />
                      </YStack>
                    )}
                  </>
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
              TITLE + DESCRIPTION
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
                {t('createPost.fields.title')} *
              </Label>
              <Input
                size="$4"
                value={title}
                onChangeText={setTitle}
                placeholder={t('createPost.fields.titlePlaceholder')}
                borderColor={colors.neutral[300]}
                focusStyle={{ borderColor: colors.primary[500] }}
                backgroundColor="white"
                fontWeight="400"
              />
            </YStack>

            <YStack gap="$2">
              <Label fontWeight="600" color={colors.neutral[900]}>
                {t('createPost.fields.description')} *
              </Label>
              <TextArea
                size="$4"
                value={description}
                onChangeText={setDescription}
                placeholder={t('createPost.fields.descriptionPlaceholder')}
                borderColor={colors.neutral[300]}
                focusStyle={{ borderColor: colors.primary[500] }}
                backgroundColor="white"
                numberOfLines={5}
                style={{ fontWeight: '400', textAlignVertical: 'top' } as any}
              />
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
