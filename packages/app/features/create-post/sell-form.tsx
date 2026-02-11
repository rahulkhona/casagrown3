/**
 * Sell Form - Enhanced with delegate picker, community map,
 * dynamic categories, and camera/gallery media selection
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
  Avatar,
  TextArea,
  Select,
  Sheet,
} from 'tamagui'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Camera,
  Video,
  Upload,
  Info,
  MapPin,
  ChevronDown,
  Image as ImageIcon,
  X,
} from '@tamagui/lucide-icons'
import { Platform, Image, Pressable } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useRef } from 'react'
import { CalendarPicker } from './CalendarPicker'
import { loadMediaFromStorage } from './load-media-helper'

// Minimal asset shape for web-picked files
interface WebMediaAsset {
  uri: string
  type: 'image' | 'video'
  width?: number
  height?: number
  fileName?: string
  isExisting?: boolean
}

// Lazy load WebCameraModal only on web
const WebCameraModal = Platform.OS === 'web'
  ? require('./WebCameraModal').WebCameraModal
  : null
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius } from '../../design-tokens'
import { useAuth } from '../auth/auth-hook'
import {
  createSellPost,
  updateSellPost,
  getActiveDelegators,
  getUserCommunitiesWithNeighbors,
  getCommunityWithNeighborsByH3,
  getAvailableCategories,
  getUserCommunity,
  getPlatformFeePercent,
  type DelegatorInfo,
  type CommunityInfo,
  type UserCommunitiesResult,
} from './post-service'
import { buildResolveResponseFromIndex } from '../community/h3-utils'
import type { ResolveResponse } from '../community/use-resolve-community'

// Platform-conditional lazy import for CommunityMap (same pattern as profile-screen)
const CommunityMapLazy = Platform.OS === 'web'
  ? lazy(() => import('../community/CommunityMap'))
  : null
const CommunityMapNative = Platform.OS !== 'web'
  ? require('../community/CommunityMap').default
  : null

function CommunityMapWrapper(props: { resolveData: ResolveResponse; height?: number; showLabels?: boolean; selectedNeighborH3Indices?: string[] }) {
  if (Platform.OS === 'web' && CommunityMapLazy) {
    return (
      <Suspense fallback={<YStack height={props.height || 180} alignItems="center" justifyContent="center" backgroundColor={colors.neutral[50]} borderRadius={12}><Spinner size="large" color={colors.primary[600]} /></YStack>}>
        <CommunityMapLazy {...props} />
      </Suspense>
    )
  }
  if (CommunityMapNative) {
    return <CommunityMapNative {...props} />
  }
  return null
}

interface SellFormProps {
  onBack: () => void
  onSuccess: () => void
  editId?: string
  cloneData?: string
}

export function SellForm({ onBack, onSuccess, editId, cloneData }: SellFormProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { user, signOut } = useAuth()

  // ── Form State ──────────────────────────────────────────────
  const [category, setCategory] = useState('')
  const [productName, setProductName] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('piece')
  const [price, setPrice] = useState('')
  const [dropoffDates, setDropoffDates] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [mediaAssets, setMediaAssets] = useState<(ImagePicker.ImagePickerAsset | WebMediaAsset)[]>([])
  const [formError, setFormError] = useState('')
  const [showMediaMenu, setShowMediaMenu] = useState(false)

  // Web file input ref
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Web camera modal state
  const [cameraMode, setCameraMode] = useState<'photo' | 'video' | null>(null)

  // Native date picker state
  const [datePickerVisible, setDatePickerVisible] = useState(false)
  const [editingDateIndex, setEditingDateIndex] = useState<number | null>(null)

  // ── Delegate State ──────────────────────────────────────────
  const [delegators, setDelegators] = useState<DelegatorInfo[]>([])
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null) // null = self
  const [loadingDelegators, setLoadingDelegators] = useState(true)

  // ── Community State ─────────────────────────────────────────
  const [communityName, setCommunityName] = useState('')
  const [communityH3Index, setCommunityH3Index] = useState<string | null>(null)
  const [communitiesData, setCommunitiesData] = useState<UserCommunitiesResult | null>(null)
  const [communityMapData, setCommunityMapData] = useState<ResolveResponse | null>(null)
  const [selectedNeighborH3Indices, setSelectedNeighborH3Indices] = useState<string[]>([])
  const [loadingCommunity, setLoadingCommunity] = useState(true)
  const [selectedCommunityH3, setSelectedCommunityH3] = useState<string | null>(null) // for delegate community picker
  const [selfCommunityH3, setSelfCommunityH3] = useState<string | null>(null)
  const [selfCommunityName, setSelfCommunityName] = useState('')

  // ── Categories State ────────────────────────────────────────
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)

  // ── Platform Fee State ──────────────────────────────────────
  const [platformFeePercent, setPlatformFeePercent] = useState<number>(10)

  // ── Units ───────────────────────────────────────────────────
  const UNITS = ['piece', 'dozen', 'box', 'bag']

  // ── Load delegators on mount ────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    loadDelegators()
  }, [user?.id])

  // ── Load community and categories when seller changes ──────
  useEffect(() => {
    if (!user?.id) return
    // If we have a delegate community picker selection, use that
    if (selectedCommunityH3) {
      loadCommunityByH3(selectedCommunityH3)
    } else {
      const targetUserId = selectedSellerId || user.id
      loadCommunityAndCategories(targetUserId)
    }
  }, [user?.id, selectedSellerId, selectedCommunityH3])

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
            if (content.produceName) setProductName(content.produceName)
            if (parsed.sell_details) {
              setCategory(parsed.sell_details.category || '')
              setProductName(parsed.sell_details.produce_name || '')
              setUnit(parsed.sell_details.unit || 'piece')
              setQuantity(String(parsed.sell_details.total_quantity_available || ''))
              setPrice(String(parsed.sell_details.price_per_unit || ''))
            }
            // Copy delivery dates
            if (Array.isArray(parsed.delivery_dates) && parsed.delivery_dates.length > 0) {
              setDropoffDates(parsed.delivery_dates)
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
        const { getPostById } = await import('../my-posts/my-posts-service')
        const { supabase } = await import('../auth/auth-hook')
        const post = await getPostById(editId!)
        if (cancelled || !post) return
        // Pre-fill from content JSON
        try {
          const parsed = JSON.parse(post.content)
          if (parsed.description) setDescription(parsed.description)
          if (parsed.produceName) setProductName(parsed.produceName)
        } catch {}
        // Pre-fill from sell_details
        if (post.sell_details) {
          setCategory(post.sell_details.category || '')
          setProductName(post.sell_details.produce_name || '')
          setUnit(post.sell_details.unit || 'piece')
          setQuantity(String(post.sell_details.total_quantity_available || ''))
          setPrice(String(post.sell_details.price_per_unit || ''))
        }
        // Pre-fill delivery dates
        if (Array.isArray(post.delivery_dates) && post.delivery_dates.length > 0) {
          setDropoffDates(post.delivery_dates)
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

  async function loadDelegators() {
    if (!user?.id) return
    setLoadingDelegators(true)
    try {
      const result = await getActiveDelegators(user.id)
      setDelegators(result)
    } catch (err) {
      console.error('Error loading delegators:', err)
    } finally {
      setLoadingDelegators(false)
    }
  }

  async function loadCommunityAndCategories(userId: string) {
    setLoadingCommunity(true)
    setLoadingCategories(true)
    try {
      // Load community + neighbors
      const communities = await getUserCommunitiesWithNeighbors(userId)
      setCommunitiesData(communities)

      if (communities.primary) {
        setCommunityH3Index(communities.primary.h3Index)
        setCommunityName(communities.primary.name)
        // Store self community on first load (no delegator selected)
        if (!selfCommunityH3) {
          setSelfCommunityH3(communities.primary.h3Index)
          setSelfCommunityName(communities.primary.name)
        }
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
      setLoadingCommunity(false)

      // Load categories filtered by community
      const cats = await getAvailableCategories(communities.primary?.h3Index)
      setAvailableCategories(cats)
      // Reset category if the currently selected one is no longer available
      if (category && !cats.includes(category)) {
        setCategory('')
      }

      // Load platform fee
      const fee = await getPlatformFeePercent()
      setPlatformFeePercent(fee)
    } catch (err) {
      console.error('Error loading community/categories:', err)
      // Network/auth error — sign out and redirect
      await signOut()
      if (typeof window !== 'undefined') { window.location.href = '/' } else { onBack() }
    } finally {
      setLoadingCommunity(false)
      setLoadingCategories(false)
    }
  }

  async function loadCommunityByH3(h3Index: string) {
    setLoadingCommunity(true)
    setLoadingCategories(true)
    try {
      const communities = await getCommunityWithNeighborsByH3(h3Index)
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
      }
      setLoadingCommunity(false)

      const cats = await getAvailableCategories(h3Index)
      setAvailableCategories(cats)
      if (category && !cats.includes(category)) {
        setCategory('')
      }

      const fee = await getPlatformFeePercent()
      setPlatformFeePercent(fee)
    } catch (err) {
      console.error('Error loading community by H3:', err)
    } finally {
      setLoadingCommunity(false)
      setLoadingCategories(false)
    }
  }

  // ── Media Picker ────────────────────────────────────────────

  // Web: handle files from <input type="file">
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
      photoInputRef.current?.click()
    } else {
      setShowMediaMenu(!showMediaMenu)
    }
  }

  async function takePhoto() {
    if (Platform.OS === 'web') {
      setCameraMode('photo')
      return
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      console.warn('Camera permission denied')
      return
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      })
      if (!result.canceled && result.assets.length > 0) {
        setMediaAssets([result.assets[0]!])
      }
    } catch (e) {
      console.warn('Camera unavailable:', e)
    }
  }

  async function pickFromGallery() {
    if (Platform.OS === 'web') {
      photoInputRef.current?.click()
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.8,
    })
    if (!result.canceled && result.assets.length > 0) {
      setMediaAssets([result.assets[0]!])
    }
  }

  async function recordVideo() {
    if (Platform.OS === 'web') {
      setCameraMode('video')
      return
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      console.warn('Camera permission denied')
      return
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 60,
        quality: 0.8,
      })
      if (!result.canceled && result.assets.length > 0) {
        setMediaAssets([result.assets[0]!])
      }
    } catch (e) {
      console.warn('Camera unavailable:', e)
    }
  }

  function removeMedia(index: number) {
    setMediaAssets((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Date Management ─────────────────────────────────────────
  function addDate() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setDropoffDates([...dropoffDates, tomorrow.toISOString().split('T')[0]!])
  }

  function removeDate(index: number) {
    setDropoffDates(dropoffDates.filter((_, i) => i !== index))
  }

  function updateDate(index: number, value: string) {
    const updated = [...dropoffDates]
    updated[index] = value
    setDropoffDates(updated)
  }

  // ── Submit ──────────────────────────────────────────────────
  async function handleSubmit() {
    if (!user?.id) return
    if (!productName.trim() || !description.trim() || !category || !price) {
      setFormError(t('createPost.validation.requiredFields'))
      return
    }
    if (dropoffDates.length === 0) {
      setFormError(t('createPost.validation.dropoffRequired'))
      return
    }

    setFormError('')
    setSubmitting(true)
    try {
      const postData = {
        authorId: user.id,
        onBehalfOfId: selectedSellerId || undefined,
        communityH3Index: communityH3Index || undefined,
        additionalCommunityH3Indices: selectedNeighborH3Indices.length > 0 ? selectedNeighborH3Indices : undefined,
        description,
        category,
        produceName: productName,
        unit,
        quantity: parseFloat(quantity) || 1,
        pricePerUnit: parseFloat(price) || 0,
        dropoffDates,
        mediaAssets: mediaAssets.length > 0 ? mediaAssets.map(a => ({ uri: a.uri, type: a.type ?? undefined })) : undefined,
      }
      if (editId) {
        await updateSellPost(editId, postData)
      } else {
        await createSellPost(postData)
      }
      onSuccess()
    } catch (err) {
      console.error('Error creating sell post:', err)
      setFormError(t('createPost.error.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  // Helper to format category name
  function formatCategory(cat: string) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  // ── Computed data ─────────────────────────────────────────────
  const selectedDelegator = delegators.find((d) => d.delegatorId === selectedSellerId)

  // Build list of all available communities (self + all delegators) for the picker
  const allCommunities: Array<{ h3Index: string; name: string; ownerLabel: string }> = []
  if (user?.id && communitiesData?.primary && !selectedSellerId && !delegators.length) {
    // No delegators, single community — no picker needed
  } else if (user?.id) {
    // Add self community
    if (selfCommunityH3) {
      allCommunities.push({
        h3Index: selfCommunityH3,
        name: selfCommunityName || 'My Community',
        ownerLabel: t('createPost.delegator.myself'),
      })
    }
    // Add each delegator's community (deduplicate by h3Index)
    const seen = new Set(allCommunities.map(c => c.h3Index))
    for (const d of delegators) {
      if (d.communityH3Index && !seen.has(d.communityH3Index)) {
        seen.add(d.communityH3Index)
        allCommunities.push({
          h3Index: d.communityH3Index,
          name: d.communityName || d.communityH3Index,
          ownerLabel: d.fullName || t('createPost.delegator.unnamed'),
        })
      }
    }
  }
  const showCommunityPicker = delegators.length > 0 && allCommunities.length > 1

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
          {t('createPost.types.sell.formTitle')}
        </Text>
      </XStack>

      <ScrollView flex={1} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        <YStack gap="$5" maxWidth={600} alignSelf="center" width="100%">

          {/* ════════════════════════════════════════════════════
              DELEGATE SELLER PICKER
              ════════════════════════════════════════════════════ */}
          {!loadingDelegators && delegators.length > 0 && (
            <YStack
              backgroundColor="white"
              borderRadius={borderRadius.lg}
              padding="$4"
              gap="$3"
              borderWidth={1}
              borderColor={colors.neutral[200]}
            >
              <Label fontWeight="600" color={colors.neutral[900]}>
                {t('createPost.delegator.sellingFor')}
              </Label>
              <Text fontSize="$2" color={colors.neutral[500]}>
                {t('createPost.delegator.delegateHint')}
              </Text>

              {/* Self option */}
              <Button
                backgroundColor={!selectedSellerId ? colors.primary[50] : 'white'}
                borderWidth={2}
                borderColor={!selectedSellerId ? colors.primary[500] : colors.neutral[200]}
                borderRadius={borderRadius.md}
                paddingVertical="$3"
                paddingHorizontal="$3"
                onPress={() => setSelectedSellerId(null)}
                justifyContent="flex-start"
              >
                <XStack alignItems="center" gap="$3" flex={1}>
                  <Avatar circular size="$3">
                    <Avatar.Fallback backgroundColor={colors.primary[600]}>
                      <Text color="white" fontWeight="700" fontSize="$1">{t('createPost.delegator.meInitial')}</Text>
                    </Avatar.Fallback>
                  </Avatar>
                  <YStack flex={1}>
                    <Text fontWeight="600" color={colors.neutral[900]}>{t('createPost.delegator.myself')}</Text>
                    <Text fontSize="$2" color={colors.neutral[500]}>
                      {t('createPost.delegator.sellOwnProduce')}
                    </Text>
                  </YStack>
                  {!selectedSellerId && (
                    <YStack
                      width={20}
                      height={20}
                      borderRadius={10}
                      backgroundColor={colors.primary[600]}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text color="white" fontSize={12} fontWeight="700">✓</Text>
                    </YStack>
                  )}
                </XStack>
              </Button>

              {/* Delegator options */}
              {delegators.map((d) => (
                <Button
                  key={d.delegationId}
                  backgroundColor={selectedSellerId === d.delegatorId ? colors.primary[50] : 'white'}
                  borderWidth={2}
                  borderColor={selectedSellerId === d.delegatorId ? colors.primary[500] : colors.neutral[200]}
                  borderRadius={borderRadius.md}
                  paddingVertical="$3"
                  paddingHorizontal="$3"
                  onPress={() => setSelectedSellerId(d.delegatorId)}
                  justifyContent="flex-start"
                >
                  <XStack alignItems="center" gap="$3" flex={1}>
                    <Avatar circular size="$3">
                      {d.avatarUrl ? (
                        <Avatar.Image src={d.avatarUrl} />
                      ) : (
                        <Avatar.Fallback backgroundColor={colors.green[600]}>
                          <Text color="white" fontWeight="700" fontSize="$1">
                            {d.fullName?.charAt(0)?.toUpperCase() || '?'}
                          </Text>
                        </Avatar.Fallback>
                      )}
                    </Avatar>
                    <YStack flex={1}>
                      <Text fontWeight="600" color={colors.neutral[900]}>
                        {d.fullName || t('createPost.delegator.unnamed')}
                      </Text>
                      {d.communityName && (
                        <Text fontSize="$2" color={colors.neutral[500]}>
                          {d.communityName}
                        </Text>
                      )}
                    </YStack>
                    {selectedSellerId === d.delegatorId && (
                      <YStack
                        width={20}
                        height={20}
                        borderRadius={10}
                        backgroundColor={colors.primary[600]}
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text color="white" fontSize={12} fontWeight="700">✓</Text>
                      </YStack>
                    )}
                  </XStack>
                </Button>
              ))}
            </YStack>
          )}

          {/* ════════════════════════════════════════════════════
              COMMUNITY PICKER (delegate mode)
              ════════════════════════════════════════════════════ */}
          {showCommunityPicker && (
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
              <Text fontSize="$2" color={colors.neutral[500]}>
                Choose which community to post this listing in
              </Text>

              {allCommunities.map((comm) => (
                <Button
                  key={comm.h3Index}
                  backgroundColor={(
                    selectedCommunityH3 === comm.h3Index ||
                    (!selectedCommunityH3 && communityH3Index === comm.h3Index)
                  ) ? colors.primary[50] : 'white'}
                  borderWidth={2}
                  borderColor={(
                    selectedCommunityH3 === comm.h3Index ||
                    (!selectedCommunityH3 && communityH3Index === comm.h3Index)
                  ) ? colors.primary[500] : colors.neutral[200]}
                  borderRadius={borderRadius.md}
                  paddingVertical="$3"
                  paddingHorizontal="$3"
                  onPress={() => {
                    setSelectedCommunityH3(comm.h3Index)
                    setSelectedNeighborH3Indices([])
                  }}
                  justifyContent="flex-start"
                >
                  <XStack alignItems="center" gap="$3" flex={1}>
                    <MapPin size={18} color={(
                      selectedCommunityH3 === comm.h3Index ||
                      (!selectedCommunityH3 && communityH3Index === comm.h3Index)
                    ) ? colors.primary[600] : colors.neutral[400]} />
                    <YStack flex={1}>
                      <Text fontWeight="600" color={colors.neutral[900]}>{comm.name}</Text>
                      <Text fontSize="$2" color={colors.neutral[500]}>{comm.ownerLabel}</Text>
                    </YStack>
                    {(
                      selectedCommunityH3 === comm.h3Index ||
                      (!selectedCommunityH3 && communityH3Index === comm.h3Index)
                    ) && (
                      <YStack
                        width={20}
                        height={20}
                        borderRadius={10}
                        backgroundColor={colors.primary[600]}
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text color="white" fontSize={12} fontWeight="700">✓</Text>
                      </YStack>
                    )}
                  </XStack>
                </Button>
              ))}
            </YStack>
          )}

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
                  {selectedDelegator && (
                    <Text fontSize="$2" color={colors.neutral[400]}>
                      {t('createPost.delegator.delegatorCommunity', { name: selectedDelegator.fullName })}
                    </Text>
                  )}
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
              <YStack gap="$2">
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
                {availableCategories.length === 0 && (
                  <Text color={colors.neutral[400]} fontStyle="italic" fontSize="$2">
                    No categories available for this community
                  </Text>
                )}
              </YStack>
            )}
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
            {/* Product Name */}
            <YStack gap="$2">
              <Label fontWeight="600" color={colors.neutral[900]}>
                {t('createPost.fields.productName')} *
              </Label>
              <Input
                size="$4"
                value={productName}
                onChangeText={setProductName}
                placeholder={t('createPost.fields.productNamePlaceholder')}
                borderColor={colors.neutral[300]}
                focusStyle={{ borderColor: colors.primary[500] }}
                backgroundColor="white"
                fontWeight="400"
              />
            </YStack>

            {/* Description */}
            <YStack gap="$2">
              <Label fontWeight="600" color={colors.neutral[900]}>
                {t('createPost.fields.description')} *
              </Label>
              <TextArea
                value={description}
                onChangeText={setDescription}
                placeholder={t('createPost.fields.descriptionPlaceholder')}
                borderColor={colors.neutral[300]}
                focusStyle={{ borderColor: colors.primary[500] }}
                backgroundColor="white"
                numberOfLines={4}
                size="$4"
                style={{ fontWeight: '400', textAlignVertical: 'top' } as any}
              />
            </YStack>

            {/* Quantity + Unit */}
            <XStack gap="$3">
              <YStack gap="$2" flex={1}>
                <Label fontWeight="600" color={colors.neutral[900]}>
                  {t('createPost.fields.quantity')}
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
              </YStack>
              <YStack gap="$2" flex={1}>
                <Label fontWeight="600" color={colors.neutral[900]}>
                  {t('createPost.fields.unit')}
                </Label>
                <XStack flexWrap="wrap" gap="$1">
                  {UNITS.map((u) => (
                    <Button
                      key={u}
                      size="$2"
                      backgroundColor={unit === u ? colors.primary[600] : 'white'}
                      borderWidth={1}
                      borderColor={unit === u ? colors.primary[600] : colors.neutral[300]}
                      borderRadius={borderRadius.md}
                      onPress={() => setUnit(u)}
                    >
                      <Text
                        color={unit === u ? 'white' : colors.neutral[700]}
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
                {t('createPost.fields.price')} *
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
              {/* Platform Fee Notice */}
              <XStack
                backgroundColor={colors.amber[50]}
                padding="$3"
                borderRadius={borderRadius.md}
                gap="$2"
                alignItems="flex-start"
              >
                <Info size={16} color={colors.amber[600]} style={{ marginTop: 2 }} />
                <Text fontSize="$2" color={colors.amber[700]} flex={1}>
                  {t('createPost.fields.platformFee', { percent: platformFeePercent })}
                </Text>
              </XStack>
            </YStack>
          </YStack>

          {/* ════════════════════════════════════════════════════
              PHOTO / VIDEO (Camera + Gallery)
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

            {/* Media thumbnails */}
            {mediaAssets.length > 0 && (
              <XStack flexWrap="wrap" gap="$2">
                {mediaAssets.map((asset, index) => (
                  <YStack
                    key={`${asset.uri}-${index}`}
                    width={80}
                    height={80}
                    borderRadius={borderRadius.md}
                    overflow="hidden"
                    position="relative"
                  >
                    {Platform.OS === 'web' && asset.type === 'video' ? (
                      <video
                        src={`${asset.uri}#t=0.1`}
                        style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }}
                        muted
                        playsInline
                        preload="metadata"
                        controls={false}
                        onMouseOver={(e) => (e.target as HTMLVideoElement).play()}
                        onMouseOut={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                      />
                    ) : Platform.OS === 'web' ? (
                      <img
                        src={asset.uri}
                        style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }}
                        alt=""
                      />
                    ) : (
                      <Image
                        source={{ uri: asset.uri }}
                        style={{ width: 80, height: 80, borderRadius: 8 }}
                      />
                    )}
                    <Button
                      unstyled
                      position="absolute"
                      top={2}
                      right={2}
                      width={22}
                      height={22}
                      borderRadius={11}
                      backgroundColor="rgba(0,0,0,0.6)"
                      alignItems="center"
                      justifyContent="center"
                      onPress={() => removeMedia(index)}
                    >
                      <X size={14} color="white" />
                    </Button>
                    {asset.type === 'video' && (
                      <YStack
                        position="absolute"
                        bottom={4}
                        left={4}
                        backgroundColor="rgba(0,0,0,0.5)"
                        borderRadius={4}
                        paddingHorizontal={4}
                        paddingVertical={2}
                      >
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
                    onPress={() => photoInputRef.current?.click()}
                    hoverStyle={{ backgroundColor: colors.neutral[100] }}
                  >
                    <Text fontSize="$2" color={colors.neutral[700]} fontWeight="500">{t('createPost.media.uploadPhotoVideo')}</Text>
                  </Button>
                </XStack>
                {/* Hidden file input for photos and videos */}
                <input
                  ref={photoInputRef as any}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleWebFileChange as any}
                  style={{ display: 'none' }}
                />
                {/* Camera Modal */}
                {cameraMode && WebCameraModal && (
                  <WebCameraModal
                    mode={cameraMode}
                    onCapture={handleWebCameraCapture}
                    onClose={() => setCameraMode(null)}
                  />
                )}
              </YStack>
            ) : (
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
              DROP-OFF DATES
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
              onPress={() => {
                addDate()
                if (Platform.OS !== 'web') {
                  // Open picker immediately for the newly added date
                  setEditingDateIndex(dropoffDates.length)
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
                initialDate={dropoffDates[editingDateIndex] || undefined}
                minimumDate={new Date()}
                onSelect={(dateStr) => {
                  if (editingDateIndex !== null) {
                    updateDate(editingDateIndex, dateStr)
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
                <Text color="white" fontWeight="700" fontSize="$4">
                  {t('createPost.submitting')}
                </Text>
              </XStack>
            ) : (
              <Text color="white" fontWeight="700" fontSize="$4">
                {t('createPost.submit')}
              </Text>
            )}
          </Button>

        </YStack>
      </ScrollView>
    </YStack>
  )
}
