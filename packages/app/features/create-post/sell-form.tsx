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
import { Alert, Platform, Image, Pressable } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useRef } from 'react'
import { CalendarPicker } from './CalendarPicker'

// Cross-platform alert that works on web
function crossAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n${message}` : title)
  } else {
    Alert.alert(title, message)
  }
}

// Minimal asset shape for web-picked files
interface WebMediaAsset {
  uri: string
  type: 'image' | 'video'
  width?: number
  height?: number
  fileName?: string
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
  getActiveDelegators,
  getUserCommunitiesWithNeighbors,
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
}

export function SellForm({ onBack, onSuccess }: SellFormProps) {
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
    const targetUserId = selectedSellerId || user.id
    loadCommunityAndCategories(targetUserId)
  }, [user?.id, selectedSellerId])

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
      Alert.alert(
        t('createPost.fields.media'),
        '',
        [
          { text: '📷 ' + t('createPost.fields.photo'), onPress: () => takePhoto() },
          { text: '🎥 ' + t('createPost.fields.video'), onPress: () => recordVideo() },
          { text: '🖼️ Gallery', onPress: () => pickFromGallery() },
          { text: 'Cancel', style: 'cancel' },
        ]
      )
    }
  }

  async function takePhoto() {
    if (Platform.OS === 'web') {
      setCameraMode('photo')
      return
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      crossAlert('Permission needed', 'Camera access is required to take photos.')
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
      crossAlert('Camera unavailable', 'Camera is not available on this device. Use Gallery instead.')
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
      crossAlert('Permission needed', 'Camera access is required to record video.')
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
      crossAlert('Camera unavailable', 'Camera is not available on this device. Use Gallery instead.')
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
      crossAlert(t('createPost.validation.requiredFields'))
      return
    }
    if (dropoffDates.length === 0) {
      crossAlert(t('createPost.validation.dropoffRequired'))
      return
    }

    setSubmitting(true)
    try {
      await createSellPost({
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
      })
      crossAlert(t('createPost.success.title'), t('createPost.success.message'))
      onSuccess()
    } catch (err) {
      console.error('Error creating sell post:', err)
      crossAlert(t('createPost.error.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  // Helper to format category name
  function formatCategory(cat: string) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  // ── Selected seller display info ────────────────────────────
  const selectedDelegator = delegators.find((d) => d.delegatorId === selectedSellerId)

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

      <ScrollView flex={1} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
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
                        src={asset.uri}
                        style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }}
                        muted
                        playsInline
                        controls={false}
                        onMouseOver={(e) => (e.target as HTMLVideoElement).play()}
                        onMouseOut={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
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

            {/* Calendar Picker modal */}
            {datePickerVisible && editingDateIndex !== null && (
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
