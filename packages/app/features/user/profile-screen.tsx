'use client'

import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import { 
  YStack, 
  XStack, 
  Input, 
  Button, 
  Text, 
  Avatar, 
  Label, 
  Checkbox,
  ScrollView,
  Separator,
  Spinner
} from 'tamagui'
import { 
  Camera, 
  Upload, 
  LogOut, 
  Settings, 
  ChevronDown, 
  ChevronLeft, 
  Check, 
  X, 
  Phone, 
  MapPin, 
  ShoppingBag, 
  Tag, 
  Mail, 
  Bell, 

} from '@tamagui/lucide-icons'
import { Alert, Image, Platform, TextInput, Keyboard, KeyboardAvoidingView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'solito/navigation'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { useAuth, supabase } from '../auth/auth-hook'
import { useResolveCommunity, ResolveResponse } from '../community/use-resolve-community'
import { buildResolveResponseFromIndex } from '../community/h3-utils'
import { uploadProfileAvatar } from '../profile-wizard/utils/media-upload'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'
import { getProduceEmoji } from '../profile-wizard/utils/produce-emoji'

// Platform-conditional import: React.lazy for web (avoids SSR crash from
// Leaflet accessing `window` during module evaluation), require() for native
// (Metro doesn't support React.lazy / code splitting).
const CommunityMapLazy = Platform.OS === 'web'
  ? lazy(() => import('../community/CommunityMap'))
  : null
const CommunityMapNative = Platform.OS !== 'web'
  ? require('../community/CommunityMap').default
  : null

const WebCameraModal = Platform.OS === 'web'
  ? require('../create-post/WebCameraModal').WebCameraModal
  : null

function CommunityMapWrapper(props: { resolveData: ResolveResponse; height?: number; showLabels?: boolean }) {
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

interface ProfileData {
  full_name: string
  avatar_url: string | null
  phone_number: string | null
  street_address: string | null
  city: string | null
  state_code: string | null
  zip_code: string | null
  email_verified: boolean
  phone_verified: boolean
  push_enabled: boolean
  sms_enabled: boolean
  notify_on_wanted: boolean
  notify_on_available: boolean
  home_community_h3_index: string | null
  community_name?: string
  community_city?: string
  community_lat?: number
  community_lng?: number
  garden_items: string[]
  custom_garden_items: string[]
}

interface ActivityStats {
  transactions: number
  rating: number
  posts: number
  following: number
}

/** Shape of the Supabase join on `communities` from the profiles query */
interface CommunityJoinData {
  name?: string
  city?: string
  location?: { type: string; coordinates: [number, number] } | string
}

export function ProfileScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user, loading: authLoading, signOut } = useAuth()
  const { resolveAddress, resolveLocation, loading: resolvingCommunity } = useResolveCommunity()
  
  // State
  const [isEditing, setIsEditing] = useState(false)
  const [isChangingCommunity, setIsChangingCommunity] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Web photo state
  const avatarFileInputRef = useRef<HTMLInputElement>(null)
  const [showAvatarCamera, setShowAvatarCamera] = useState(false)
  
  // Garden management
  const [customItemInput, setCustomItemInput] = useState('')
  const [blockedProducts, setBlockedProducts] = useState<string[]>([])
  const [blockedError, setBlockedError] = useState('')

  // Phone re-verification
  const [originalPhone, setOriginalPhone] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [resendTimer, setResendTimer] = useState(0)
  const [verifyError, setVerifyError] = useState('')

  const DEV_OTP_CODE = '123456'

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendTimer])



  // Profile data
  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    avatar_url: null,
    phone_number: null,
    street_address: null,
    city: null,
    state_code: null,
    zip_code: null,
    email_verified: false,
    phone_verified: false,
    push_enabled: true,
    sms_enabled: false,
    notify_on_wanted: false,
    notify_on_available: false,
    home_community_h3_index: null,
    garden_items: [],
    custom_garden_items: [],
  })
  
  // Edit state (separate from saved profile)
  const [editData, setEditData] = useState<ProfileData>({ ...profile })
  
  // Community change state  
  const [addressInput, setAddressInput] = useState('')
  const [zipCodeInput, setZipCodeInput] = useState('')
  const [resolvedCommunity, setResolvedCommunity] = useState<ResolveResponse | null>(null)
  
  // Map data for CommunityMap component
  const [communityMapData, setCommunityMapData] = useState<ResolveResponse | null>(null)
  
  // Activity stats (mock for now)
  const [stats] = useState<ActivityStats>({
    transactions: 0,
    rating: 0,
    posts: 0,
    following: 0,
  })

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/')
    }
  }, [authLoading, user, router])

  // Load profile on mount
  useEffect(() => {
    if (user?.id) {
      loadProfile()
    } else if (!authLoading) {
      // Auth finished loading but no user - stop profile loading spinner
      setLoading(false)
    }
  }, [user?.id, authLoading])

  const loadProfile = async () => {
    if (!user?.id) return
    
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          full_name,
          avatar_url,
          phone_number,
          street_address,
          city,
          state_code,
          zip_code,
          email_verified,
          phone_verified,
          push_enabled,
          sms_enabled,
          notify_on_wanted,
          notify_on_available,
          home_community_h3_index,
          communities:home_community_h3_index (
            name,
            city,
            location
          )
        `)
        .eq('id', user.id)
        .single()
      
      if (error) throw error
      
      const profileData: ProfileData = {
        full_name: data.full_name || '',
        avatar_url: normalizeStorageUrl(data.avatar_url) ?? null,
        phone_number: data.phone_number,
        street_address: data.street_address || null,
        city: data.city || null,
        state_code: data.state_code || null,
        zip_code: data.zip_code || null,
        email_verified: data.email_verified ?? false,
        phone_verified: data.phone_verified ?? false,
        push_enabled: data.push_enabled ?? true,
        sms_enabled: data.sms_enabled ?? false,
        notify_on_wanted: data.notify_on_wanted ?? false,
        notify_on_available: data.notify_on_available ?? false,
        home_community_h3_index: data.home_community_h3_index,
        community_name: (data.communities as CommunityJoinData | null)?.name,
        community_city: (data.communities as CommunityJoinData | null)?.city,
        garden_items: [],
        custom_garden_items: [],
      }

      // Fetch garden items from user_garden
      const { data: gardenRows } = await supabase
        .from('user_garden')
        .select('produce_name, is_custom')
        .eq('user_id', user.id)
      if (gardenRows) {
        console.log('🌱 [Profile] Loaded garden items:', gardenRows)
        profileData.garden_items = gardenRows.filter(r => !r.is_custom).map(r => r.produce_name)
        profileData.custom_garden_items = gardenRows.filter(r => r.is_custom).map(r => r.produce_name)
      } else {
        console.log('🌱 [Profile] No garden items found')
      }

      // Fetch blocked products
      const communityH3 = data.home_community_h3_index || null
      let blockedQuery = supabase.from('blocked_products').select('product_name')
      const { data: blocked } = communityH3
        ? await blockedQuery.or(`community_h3_index.is.null,community_h3_index.eq.${communityH3}`)
        : await blockedQuery.is('community_h3_index', null)
      setBlockedProducts((blocked || []).map(b => b.product_name.toLowerCase()))
      
      // Fetch map data for CommunityMap
      if (data.home_community_h3_index) {
        // Parse lat/lng from community location (Supabase returns PostGIS geometry as GeoJSON)
        let communityLat: number | undefined
        let communityLng: number | undefined
        const communityData = data.communities as CommunityJoinData | null
        const locationData = communityData?.location
        if (locationData && typeof locationData === 'object' && locationData.coordinates) {
          // GeoJSON Point: { type: "Point", coordinates: [lng, lat] }
          communityLng = locationData.coordinates[0]
          communityLat = locationData.coordinates[1]
        } else if (typeof locationData === 'string') {
          // Fallback: WKT format POINT(lng lat)
          const match = locationData.match(/POINT\(([\-\d.]+)\s+([\-\d.]+)\)/)
          if (match) {
            communityLng = parseFloat(match[1])
            communityLat = parseFloat(match[2])
          }
        }
        fetchMapData(
          data.home_community_h3_index,
          (data.communities as CommunityJoinData | null)?.name || data.home_community_h3_index,
          (data.communities as CommunityJoinData | null)?.city || '',
          communityLat,
          communityLng,
        )
      }
      
      setProfile(profileData)
      setEditData(profileData)
      setOriginalPhone(profileData.phone_number)
    } catch (err: unknown) {
      const e = err instanceof Error ? err : { message: String(err), code: undefined, details: undefined }
      console.error('Error loading profile:', JSON.stringify(err), e.message, (e as Record<string, unknown>).code, (e as Record<string, unknown>).details)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Fetch map data for CommunityMap.
   * Web: use buildResolveResponseFromIndex (h3-js works client-side)
   * Native: call resolve-community edge function (h3-js WASM fails on Hermes)
   */
  const fetchMapData = async (h3Index: string, name: string, city: string, lat?: number, lng?: number) => {
    if (Platform.OS === 'web') {
      // h3-js works on web — compute boundaries client-side
      const data = buildResolveResponseFromIndex(h3Index, name, city)
      setCommunityMapData(data as ResolveResponse)
    } else {
      // Native: call edge function to get hex_boundaries
      try {
        const { data, error } = await supabase.functions.invoke('resolve-community', {
          body: { h3_index: h3Index },
        })
        if (!error && data) {
          // Validate response has expected structure before setting state
          if (data.primary?.name) {
            setCommunityMapData(data as ResolveResponse)
          } else {
            // Edge function returned incomplete data — use fallback
            const fallback = buildResolveResponseFromIndex(h3Index, name, city, lat, lng)
            setCommunityMapData(fallback as ResolveResponse)
          }
        } else {
          // Fallback with real lat/lng from DB (h3-js stubs return 0,0 on Hermes)
          const fallback = buildResolveResponseFromIndex(h3Index, name, city, lat, lng)
          setCommunityMapData(fallback as ResolveResponse)
        }
      } catch (err) {
        console.error('Error fetching map data:', err)
        const fallback = buildResolveResponseFromIndex(h3Index, name, city, lat, lng)
        setCommunityMapData(fallback as ResolveResponse)
      }
    }
  }

  const handleSave = async () => {
    if (!user?.id) return
    
    try {
      setSaving(true)
      
      // Upload avatar if changed and is a local URI (file://, content://, blob:, data:, etc.)
      let avatarUrl = editData.avatar_url
      if (avatarUrl && !avatarUrl.startsWith('http')) {
        const uploaded = await uploadProfileAvatar(user.id, avatarUrl)
        if (uploaded) {
          avatarUrl = uploaded
        } else {
          console.warn('Avatar upload failed, keeping original URL')
        }
      }

      // Detect phone change → mark unverified
      const phoneChanged = (editData.phone_number || '') !== (originalPhone || '')
      
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editData.full_name,
          avatar_url: avatarUrl,
          phone_number: editData.phone_number,
          phone_verified: editData.phone_verified,
          street_address: editData.street_address,
          city: editData.city,
          state_code: editData.state_code,
          zip_code: editData.zip_code,
          push_enabled: editData.push_enabled,
          sms_enabled: editData.sms_enabled,
          notify_on_wanted: editData.notify_on_wanted,
          notify_on_available: editData.notify_on_available,
        })
        .eq('id', user.id)
      
      if (error) throw error

      // Persist garden items: delete all then re-insert
      const { error: delError } = await supabase.from('user_garden').delete().eq('user_id', user.id)
      if (delError) console.error('🌱 [Profile] Garden delete error:', delError)
      const gardenInserts = [
        ...editData.garden_items.map(name => ({ user_id: user.id, produce_name: name, is_custom: false })),
        ...editData.custom_garden_items.map(name => ({ user_id: user.id, produce_name: name, is_custom: true })),
      ]
      console.log('🌱 [Profile] Saving garden items:', gardenInserts)
      if (gardenInserts.length > 0) {
        const { error: insertError } = await supabase.from('user_garden').insert(gardenInserts)
        if (insertError) console.error('🌱 [Profile] Garden insert error:', insertError)
      }
      
      const updatedProfile = {
        ...editData,
        avatar_url: avatarUrl,
        phone_verified: editData.phone_verified,
      }
      setProfile(updatedProfile)
      setEditData(updatedProfile)
      setOriginalPhone(editData.phone_number)
      setIsEditing(false)
      setOtpSent(false)
      setOtpCode('')
    } catch (err) {
      console.error('Error saving profile:', err)
    } finally {
      setSaving(false)
    }
  }

  // ─── Garden management ───
  const addGardenItem = (name: string) => {
    if (!name.trim()) return
    const normalized = name.trim()
    setBlockedError('')
    if (blockedProducts.includes(normalized.toLowerCase())) {
      setBlockedError(t('profile.blockedProductError', `"${normalized}" is a restricted product and cannot be added.`))
      return
    }
    // Check if already exists
    const allItems = [...editData.garden_items, ...editData.custom_garden_items]
    if (allItems.some(i => i.toLowerCase() === normalized.toLowerCase())) return
    setEditData({
      ...editData,
      custom_garden_items: [...editData.custom_garden_items, normalized],
    })
    setCustomItemInput('')
  }

  const removeGardenItem = (name: string, isCustom: boolean) => {
    if (isCustom) {
      setEditData({
        ...editData,
        custom_garden_items: editData.custom_garden_items.filter(i => i !== name),
      })
    } else {
      setEditData({
        ...editData,
        garden_items: editData.garden_items.filter(i => i !== name),
      })
    }
  }

  // ─── Simple community switch (direct update) ───
  const handleSwitchCommunity = async () => {
    if (!user?.id || !resolvedCommunity) return
    try {
      setSaving(true)
      // Ensure community record exists
      await supabase.from('communities').upsert({
        h3_index: resolvedCommunity.primary.h3_index,
        name: resolvedCommunity.primary.name,
      }, { onConflict: 'h3_index' })

      // Update user profile
      const { error } = await supabase
        .from('profiles')
        .update({ home_community_h3_index: resolvedCommunity.primary.h3_index })
        .eq('id', user.id)
      if (error) throw error

      // Update local state
      const updatedCommunityData = {
        home_community_h3_index: resolvedCommunity.primary.h3_index,
        community_name: resolvedCommunity.primary.name,
        community_city: resolvedCommunity.primary.city,
      }
      setProfile({ ...profile, ...updatedCommunityData })
      setEditData({ ...editData, ...updatedCommunityData })
      setCommunityMapData(resolvedCommunity)
      setIsChangingCommunity(false)
      setResolvedCommunity(null)
      setAddressInput('')
      setZipCodeInput('')
    } catch (err) {
      console.error('Error switching community:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditData({ ...profile })
    setIsEditing(false)
  }

  const pickImage = async () => {
    if (Platform.OS === 'web') {
      avatarFileInputRef.current?.click()
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled) {
      setEditData({ ...editData, avatar_url: result.assets[0].uri })
    }
  }

  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      setShowAvatarCamera(true)
      return
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (!result.canceled) {
        setEditData({ ...editData, avatar_url: result.assets[0].uri })
      }
    } catch (e) {
      Alert.alert(
        'Camera unavailable',
        'Camera is not available on this device. Would you like to pick from gallery instead?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Gallery', onPress: () => pickImage() },
        ]
      )
    }
  }

  function handleAvatarWebFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]!
    const url = URL.createObjectURL(file)
    setEditData({ ...editData, avatar_url: url })
    e.target.value = ''
  }

  function handleAvatarWebCameraCapture(asset: { uri: string; type: 'image' | 'video'; fileName: string }) {
    setEditData({ ...editData, avatar_url: asset.uri })
    setShowAvatarCamera(false)
  }

  const handleFindCommunity = async () => {
    if (!addressInput.trim() || !zipCodeInput.trim()) return
    // Construct full address with zip code and country
    const fullAddress = `${addressInput}, ${zipCodeInput}, USA`
    console.log('🔍 Searching for community:', fullAddress)
    const result = await resolveAddress(fullAddress)
    setResolvedCommunity(result)
  }

  const handleJoinCommunity = async () => {
    if (!user?.id || !resolvedCommunity) return
    
    try {
      setSaving(true)
      const { error } = await supabase
        .from('profiles')
        .update({
          home_community_h3_index: resolvedCommunity.primary.h3_index,
        })
        .eq('id', user.id)
      
      if (error) throw error
      
      // Update both profile and editData to keep them in sync
      const updatedCommunityData = {
        home_community_h3_index: resolvedCommunity.primary.h3_index,
        community_name: resolvedCommunity.primary.name,
        community_city: resolvedCommunity.primary.city,
      }
      
      setProfile({
        ...profile,
        ...updatedCommunityData,
      })
      setEditData({
        ...editData,
        ...updatedCommunityData,
      })
      setIsChangingCommunity(false)
      setResolvedCommunity(null)
      setAddressInput('')
      setZipCodeInput('')
      // Update map with newly joined community
      setCommunityMapData(resolvedCommunity)
    } catch (err) {
      console.error('Error joining community:', err)
    } finally {
      setSaving(false)
    }
  }


  const handleLogout = async () => {
    console.log('🔴 LOGOUT: Starting signOut...')
    await signOut()
    console.log('🔴 LOGOUT: signOut complete, navigating to /')
    router.replace('/')
    console.log('🔴 LOGOUT: router.replace("/") called')
  }

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="$background">
        <Spinner size="large" color="$green10" />
      </YStack>
    )
  }

  const scrollContent = (
    <ScrollView 
      flex={1} 
      backgroundColor={colors.neutral[50]}
      contentContainerStyle={{ paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >

      <YStack padding="$4" gap="$4" maxWidth={600} alignSelf="center" width="100%" paddingTop={Platform.OS === 'ios' ? insets.top + 16 : '$4'}>
        {/* Header */}
        <XStack justifyContent="space-between" alignItems="center">
          {/* Back Button */}
          <Button
            unstyled
            padding="$2"
            borderRadius="$full"
            onPress={() => router.back()}
            hoverStyle={{ backgroundColor: colors.neutral[100] }}
            aria-label="Back"
          >
            <ChevronLeft size={24} color={colors.neutral[700]} />
          </Button>
          
          <Text fontSize="$8" fontWeight="700" color={colors.neutral[900]}>
            {t('profile.title')}
          </Text>
          
          {!isEditing ? (
            <Button
              size="$3"
              backgroundColor={colors.primary[600]}
              icon={Settings}
              onPress={() => setIsEditing(true)}
            >
              <Text color="white">{t('profile.editProfile')}</Text>
            </Button>
          ) : (
            // Placeholder to maintain layout when editing
            <XStack width={100} />
          )}
        </XStack>

        {/* Profile Card */}
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.xl}
          padding="$5"
          shadowColor={shadows.sm.color}
          shadowOffset={shadows.sm.offset}
          shadowOpacity={0.1}
        >
          {/* Avatar & Basic Info */}
          <XStack gap="$4" alignItems="flex-start" marginBottom="$4">
            {/* Avatar */}
            <YStack alignItems="center" gap="$2">
              <YStack
                width={80}
                height={80}
                borderRadius={40}
                overflow="hidden"
                backgroundColor={colors.primary[600]}
                alignItems="center"
                justifyContent="center"
              >
                {editData.avatar_url ? (
                  <Image
                    source={{ uri: editData.avatar_url }}
                    style={{ width: 80, height: 80, borderRadius: 40 }}
                  />
                ) : (
                  <Text color="white" fontSize="$8" fontWeight="700">
                    {editData.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                )}
              </YStack>
              
              {isEditing && (
                <>
                <XStack gap="$3">
                  <Button 
                    size="$3" 
                    backgroundColor="white" 
                    borderWidth={1} 
                    borderColor={colors.neutral[300]}
                    icon={<Upload size={16} color={colors.neutral[600]} />}
                    onPress={pickImage}
                    hoverStyle={{ backgroundColor: colors.neutral[50] }}
                  >
                    <Text color={colors.neutral[700]} fontSize="$3">{t('profile.upload')}</Text>
                  </Button>
                  <Button 
                    size="$3" 
                    backgroundColor="white" 
                    borderWidth={1} 
                    borderColor={colors.neutral[300]}
                    icon={<Camera size={16} color={colors.neutral[600]} />}
                    onPress={takePhoto}
                    hoverStyle={{ backgroundColor: colors.neutral[50] }}
                  >
                    <Text color={colors.neutral[700]} fontSize="$3">{t('profile.takePhoto')}</Text>
                  </Button>
                </XStack>
                {Platform.OS === 'web' && (
                  <>
                    <input
                      ref={avatarFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarWebFileChange}
                      style={{ display: 'none' }}
                    />
                    {showAvatarCamera && WebCameraModal && (
                      <WebCameraModal
                        mode="photo"
                        onCapture={handleAvatarWebCameraCapture}
                        onClose={() => setShowAvatarCamera(false)}
                      />
                    )}
                  </>
                )}
                </>
              )}
            </YStack>
            
            {/* Name & Email */}
            <YStack flex={1} gap="$2">
              {isEditing ? (
                <Input
                  size="$4"
                  value={editData.full_name}
                  onChangeText={(text) => setEditData({ ...editData, full_name: text })}
                  placeholder={t('profile.namePlaceholder')}
                  borderColor={colors.primary[500]}
                  borderWidth={2}
                  fontWeight="400"
                />
              ) : (
                <Text testID="profile-name" fontSize="$6" fontWeight="700" color={colors.neutral[900]}>
                  {profile.full_name || t('profile.noName')}
                </Text>
              )}
              <XStack alignItems="center" gap="$2">
                <Mail size={16} color={colors.neutral[400]} />
                <Text color={colors.neutral[600]}>{user?.email}</Text>
                <Text 
                  backgroundColor={colors.primary[100]} 
                  color={colors.primary[700]} 
                  paddingHorizontal="$2" 
                  paddingVertical="$1"
                  borderRadius={4}
                  fontSize="$1"
                >
                  {t('profile.verified')}
                </Text>
              </XStack>
            </YStack>
            

          </XStack>
          
          <Separator marginVertical="$3" />

          {/* Address Section */}
          <YStack gap="$3">
            <XStack alignItems="center" gap="$2">
              <MapPin size={16} color={colors.primary[600]} />
              <Text fontWeight="600" color={colors.neutral[900]}>{t('profile.addressTitle')}</Text>
            </XStack>
            
            {isEditing ? (
              <YStack gap="$2" padding="$3" backgroundColor={colors.neutral[50]} borderRadius={borderRadius.lg}>
                <YStack gap="$1">
                  <Label fontSize="$2" color={colors.neutral[600]}>{t('profile.streetAddress')}</Label>
                  <Input
                    value={editData.street_address || ''}
                    onChangeText={(text) => setEditData({ ...editData, street_address: text })}
                    placeholder={t('profile.streetPlaceholder')}
                    size="$4"
                    borderWidth={1}
                    borderColor={colors.neutral[300]}
                    focusStyle={{ borderColor: colors.primary[500] }}
                    backgroundColor="white"
                    fontWeight="400"
                  />
                </YStack>
                <XStack gap="$2">
                  <YStack flex={2} gap="$1">
                    <Label fontSize="$2" color={colors.neutral[600]}>{t('profile.cityLabel')}</Label>
                    <Input
                      value={editData.city || ''}
                      onChangeText={(text) => setEditData({ ...editData, city: text })}
                      placeholder={t('profile.cityPlaceholder')}
                      size="$4"
                      borderWidth={1}
                      borderColor={colors.neutral[300]}
                      focusStyle={{ borderColor: colors.primary[500] }}
                      backgroundColor="white"
                      fontWeight="400"
                    />
                  </YStack>
                  <YStack flex={1} gap="$1">
                    <Label fontSize="$2" color={colors.neutral[600]}>{t('profile.stateLabel')}</Label>
                    <Input
                      value={editData.state_code || ''}
                      onChangeText={(text) => setEditData({ ...editData, state_code: text.toUpperCase().slice(0, 2) })}
                      placeholder="CA"
                      size="$4"
                      borderWidth={1}
                      borderColor={colors.neutral[300]}
                      focusStyle={{ borderColor: colors.primary[500] }}
                      backgroundColor="white"
                      fontWeight="400"
                      maxLength={2}
                    />
                  </YStack>
                  <YStack flex={1} gap="$1">
                    <Label fontSize="$2" color={colors.neutral[600]}>{t('profile.zipLabel')}</Label>
                    <Input
                      value={editData.zip_code || ''}
                      onChangeText={(text) => setEditData({ ...editData, zip_code: text.replace(/\D/g, '').slice(0, 5) })}
                      placeholder="00000"
                      size="$4"
                      borderWidth={1}
                      borderColor={colors.neutral[300]}
                      focusStyle={{ borderColor: colors.primary[500] }}
                      backgroundColor="white"
                      keyboardType="number-pad"
                      fontWeight="400"
                      maxLength={5}
                    />
                  </YStack>
                </XStack>
              </YStack>
            ) : profile.street_address ? (
              <YStack padding="$3" backgroundColor={colors.neutral[50]} borderRadius={borderRadius.lg}>
                <Text color={colors.neutral[800]}>{profile.street_address}</Text>
                <Text color={colors.neutral[600]}>
                  {[profile.city, profile.state_code, profile.zip_code].filter(Boolean).join(', ')}
                </Text>
              </YStack>
            ) : (
              <Text color={colors.neutral[500]} fontStyle="italic">{t('profile.noAddress')}</Text>
            )}
          </YStack>

          <Separator marginVertical="$3" />

          {/* Phone & Verification */}
          <YStack gap="$3">
            <XStack alignItems="center" gap="$2">
              <Phone size={16} color={colors.primary[600]} />
              <Text fontWeight="600" color={colors.neutral[900]}>{t('profile.phoneTitle')}</Text>
            </XStack>
            
            {isEditing ? (
              <YStack gap="$2">
                <Input
                  value={editData.phone_number || ''}
                  onChangeText={(text) => {
                    setEditData({ ...editData, phone_number: text })
                    // Reset verification state if phone changes
                    if (otpSent) {
                      setOtpSent(false)
                      setOtpCode('')
                      setVerifyError('')
                    }
                  }}
                  placeholder={t('profile.phonePlaceholder')}
                  size="$4"
                  borderWidth={1}
                  borderColor={(editData.phone_number || '') !== (originalPhone || '') ? '#f59e0b' : colors.neutral[300]}
                  focusStyle={{ borderColor: colors.primary[500] }}
                  backgroundColor="white"
                  keyboardType="phone-pad"
                  fontWeight="400"
                />

                {/* Show verification flow if phone is unverified */}
                {!editData.phone_verified && editData.phone_number && editData.phone_number.replace(/\D/g, '').length >= 10 && (
                  <YStack gap="$3">
                    {/* Verified badge */}
                    {editData.phone_verified ? (
                      <XStack
                        padding="$3"
                        backgroundColor={colors.primary[50]}
                        borderRadius={borderRadius.lg}
                        borderWidth={1}
                        borderColor={colors.primary[200]}
                        alignItems="center"
                        gap="$2"
                      >
                        <Text fontSize={16} color={colors.primary[600]} fontWeight="800">✓</Text>
                        <Text fontSize="$3" fontWeight="600" color={colors.primary[700]}>
                          {t('profile.phoneVerifiedSuccess', 'Phone number verified!')}
                        </Text>
                      </XStack>

                    /* Send code prompt */
                    ) : !otpSent ? (
                      <XStack
                        padding="$3"
                        backgroundColor="#eff6ff"
                        borderRadius={borderRadius.lg}
                        alignItems="center"
                        gap="$3"
                        onPress={async () => {
                          console.log(`[Dev SMS] Verification code for ${editData.phone_number}: ${DEV_OTP_CODE}`)
                          setOtpSent(true)
                          setResendTimer(60)
                        }}
                        cursor="pointer"
                        pressStyle={{ opacity: 0.8 }}
                      >
                        <YStack
                          width={22}
                          height={22}
                          borderRadius={4}
                          borderWidth={2}
                          borderColor={colors.primary[500]}
                          backgroundColor="white"
                          alignItems="center"
                          justifyContent="center"
                        />
                        <YStack flex={1} gap="$1">
                          <Text fontSize="$3" fontWeight="600" color={colors.neutral[800]}>
                            {t('profile.verifyCheckboxLabel', 'Verify this number')}
                          </Text>
                          <Text fontSize="$2" color={colors.neutral[500]}>
                            {t('profile.verifyCheckboxHint', 'We\'ll send a 6-digit code to confirm')}
                          </Text>
                        </YStack>
                      </XStack>

                    /* Code entry after SMS sent */
                    ) : (
                      <YStack gap="$3">
                        <XStack
                          padding="$3"
                          backgroundColor={colors.primary[50]}
                          borderRadius={borderRadius.lg}
                          alignItems="center"
                          gap="$2"
                        >
                          <Check size={14} color={colors.primary[600]} />
                          <Text fontSize="$3" color={colors.primary[700]}>
                            {t('profile.verifyCodeSent', `Code sent to ${editData.phone_number}`)}
                          </Text>
                        </XStack>

                        {/* Dev mode hint */}
                        <XStack
                          padding="$2"
                          backgroundColor="#fef3c7"
                          borderRadius={borderRadius.lg}
                          borderWidth={1}
                          borderColor="#fbbf24"
                          alignItems="center"
                          gap="$2"
                        >
                          <Text fontSize="$2" color="#92400e">
                            🔧 Dev mode — use code: <Text fontWeight="700" fontSize="$2" color="#92400e">{DEV_OTP_CODE}</Text>
                          </Text>
                        </XStack>

                        {/* OTP Input + Verify button */}
                        <XStack gap="$2" alignItems="center">
                          <Input
                            flex={1}
                            value={otpCode}
                            onChangeText={(text) => setOtpCode(text.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            size="$4"
                            borderWidth={1}
                            borderColor={colors.neutral[300]}
                            focusStyle={{ borderColor: colors.primary[500], borderWidth: 2 }}
                            backgroundColor="white"
                            fontWeight="400"
                            keyboardType="number-pad"
                            maxLength={6}
                            textAlign="center"
                            letterSpacing={8}
                            fontSize="$5"
                          />
                          <Button
                            backgroundColor={otpCode.length === 6 ? colors.primary[600] : colors.neutral[300]}
                            height="$4"
                            paddingHorizontal="$4"
                            onPress={async () => {
                              if (otpCode === DEV_OTP_CODE) {
                                // Immediately persist to DB
                                if (user?.id) {
                                  const { error: verifyErr } = await supabase
                                    .from('profiles')
                                    .update({ phone_verified: true })
                                    .eq('id', user.id)
                                  if (verifyErr) {
                                    console.error('Phone verify persist error:', verifyErr)
                                  } else {
                                    console.log('✅ Phone verified and saved to DB')
                                  }
                                }
                                setEditData({ ...editData, phone_verified: true } as ProfileData)
                                setProfile({ ...profile, phone_verified: true })
                                setOtpSent(false)
                                setOtpCode('')
                                setVerifyError('')
                              } else {
                                setVerifyError(t('profile.verifyCodeInvalid', 'Invalid code. Please try again.'))
                              }
                            }}
                            disabled={otpCode.length !== 6}
                          >
                            <Text color="white" fontWeight="600">
                              {t('profile.verifyButton', 'Verify')}
                            </Text>
                          </Button>
                        </XStack>

                        {/* Resend link */}
                        <XStack justifyContent="center">
                          {resendTimer > 0 ? (
                            <Text fontSize="$2" color={colors.neutral[400]}>
                              {t('profile.verifyResendIn', `Resend in ${resendTimer}s`)}
                            </Text>
                          ) : (
                            <Text
                              fontSize="$2"
                              color={colors.primary[600]}
                              fontWeight="600"
                              onPress={() => {
                                console.log(`[Dev SMS] Resending code to ${editData.phone_number}: ${DEV_OTP_CODE}`)
                                setResendTimer(60)
                              }}
                              cursor="pointer"
                              textDecorationLine="underline"
                            >
                              {t('profile.verifyResend', 'Resend code')}
                            </Text>
                          )}
                        </XStack>

                        {/* Error display */}
                        {verifyError ? (
                          <Text fontSize="$2" color="#dc2626">{verifyError}</Text>
                        ) : null}
                      </YStack>
                    )}
                  </YStack>
                )}
              </YStack>
            ) : (
              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                <Text color={profile.phone_number ? colors.neutral[800] : colors.neutral[500]}>
                  {profile.phone_number || t('profile.noPhone')}
                </Text>
                {profile.phone_number && (
                  profile.phone_verified ? (
                    <XStack
                      backgroundColor={colors.primary[100]}
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius={4}
                      alignItems="center"
                      gap="$1"
                    >
                      <Text fontSize={12} color={colors.primary[700]} fontWeight="800">✓</Text>
                      <Text fontSize="$1" color={colors.primary[700]} fontWeight="600">
                        {t('profile.phoneVerifiedBadge')}
                      </Text>
                    </XStack>
                  ) : (
                    <XStack
                      backgroundColor="#fef3c7"
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius={4}
                      alignItems="center"
                      gap="$1"
                    >
                      <Text fontSize="$1" color="#92400e" fontWeight="600">
                        {t('profile.phoneUnverified', 'Unverified')}
                      </Text>
                    </XStack>
                  )
                )}
              </XStack>
            )}
          </YStack>

          <Separator marginVertical="$3" />

          {/* Community Section */}
          <YStack gap="$3">
            <Text fontWeight="600" color={colors.neutral[900]}>
              {t('profile.myCommunity')}
            </Text>
            
            {profile.home_community_h3_index && !isChangingCommunity ? (
              <YStack
                backgroundColor={colors.neutral[50]}
                padding="$3"
                borderRadius={borderRadius.lg}
                gap="$2"
              >
                {/* Community Map */}
                {communityMapData && (
                  <CommunityMapWrapper
                    resolveData={communityMapData}
                    height={220}
                    showLabels={true}
                  />
                )}
                <XStack justifyContent="space-between" alignItems="center" marginTop="$2">
                  <XStack alignItems="center" gap="$2">
                    <MapPin size={20} color={colors.primary[600]} />
                    <Text fontWeight="500" color={colors.neutral[900]}>
                      {profile.community_name || profile.home_community_h3_index}
                    </Text>
                  </XStack>

                </XStack>
                {profile.community_city && (
                  <Text marginLeft="$7" color={colors.neutral[500]} fontSize="$2">
                    {profile.community_city}
                  </Text>
                )}
              </YStack>
            ) : (
              <YStack
                borderWidth={2}
                borderStyle="dashed"
                borderColor={colors.neutral[300]}
                padding="$4"
                borderRadius={borderRadius.lg}
                alignItems="center"
              >
                <Text color={colors.neutral[600]} marginBottom="$2">
                  {t('profile.noCommunity')}
                </Text>
                {isEditing && (
                  <Button
                    size="$3"
                    variant="outlined"
                    icon={MapPin}
                    onPress={() => setIsChangingCommunity(true)}
                  >
                    {t('profile.joinCommunity')}
                  </Button>
                )}
              </YStack>
            )}
            
            {/* Switch Community Button */}
            {isEditing && profile.home_community_h3_index && !isChangingCommunity && (
              <Button
                size="$3"
                chromeless
                icon={<Settings size={16} color={colors.primary[600]} />}
                onPress={() => setIsChangingCommunity(true)}
              >
                <Text color={colors.primary[600]}>{t('profile.switchCommunity')}</Text>
              </Button>
            )}
            {/* Community Change UI */}
            {isChangingCommunity && (
              <YStack
                backgroundColor={colors.primary[50]}
                borderColor={colors.primary[300]}
                borderWidth={2}
                padding="$4"
                borderRadius={borderRadius.lg}
                gap="$4"
              >
                {/* Street Address */}
                <YStack gap="$2">
                  <Label color={colors.neutral[700]} fontWeight="600">{t('profile.streetAddress') || 'Street Address'}</Label>
                  {Platform.OS === 'web' ? (
                    <Input
                      value={addressInput}
                      onChangeText={setAddressInput}
                      placeholder={t('profile.addressPlaceholder')}
                      size="$4"
                      borderWidth={1}
                      borderColor={colors.neutral[300]}
                      focusStyle={{ borderColor: colors.primary[500] }}
                      backgroundColor="white"
                      fontWeight="400"
                    />
                  ) : (
                    <TextInput
                      value={addressInput}
                      onChangeText={setAddressInput}
                      placeholder={t('profile.addressPlaceholder')}
                      placeholderTextColor={colors.neutral[400]}
                      style={{
                        height: 44,
                        borderWidth: 1,
                        borderColor: colors.neutral[300],
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        backgroundColor: 'white',
                        fontSize: 16,
                        color: colors.neutral[900],
                      }}
                    />
                  )}
                </YStack>
                
                {/* Zip Code + Country Row */}
                <XStack gap="$3">
                  <YStack gap="$2" width={140}>
                    <Label color={colors.neutral[700]} fontWeight="600">{t('profile.zipCode') || 'Zip Code'}</Label>
                    {Platform.OS === 'web' ? (
                    <Input
                      value={zipCodeInput}
                      onChangeText={setZipCodeInput}
                      placeholder="Zip Code"
                      keyboardType="numeric"
                      size="$4"
                      borderWidth={1}
                      borderColor={colors.neutral[300]}
                      focusStyle={{ borderColor: colors.primary[500] }}
                      backgroundColor="white"
                      fontWeight="400"
                    />
                    ) : (
                    <TextInput
                      value={zipCodeInput}
                      onChangeText={setZipCodeInput}
                      placeholder="Zip Code"
                      placeholderTextColor={colors.neutral[400]}
                      keyboardType="numeric"
                      style={{
                        height: 44,
                        borderWidth: 1,
                        borderColor: colors.neutral[300],
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        backgroundColor: 'white',
                        fontSize: 16,
                        color: colors.neutral[900],
                      }}
                    />
                    )}
                  </YStack>
                  <YStack gap="$2" flex={1}>
                    <Label color={colors.neutral[700]} fontWeight="600">{t('profile.country') || 'Country'}</Label>
                    <Button
                      backgroundColor={colors.neutral[100]}
                      borderWidth={1}
                      borderColor={colors.neutral[300]}
                      justifyContent="space-between"
                      iconAfter={<ChevronDown size={20} color={colors.neutral[400]} />}
                      size="$4"
                      disabled={true}
                      opacity={0.7}
                    >
                      <Text color={colors.neutral[700]} fontSize="$3" fontWeight="400">United States</Text>
                    </Button>
                  </YStack>
                </XStack>
                
                {/* Use Current Location Button */}
                <Button
                  backgroundColor="white"
                  borderWidth={1}
                  borderColor={colors.neutral[300]}
                  icon={resolvingCommunity ? undefined : <MapPin size={18} color={colors.primary[600]} />}
                  onPress={async () => {
                    if (Platform.OS === 'web' && navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        async (position) => {
                          const { latitude, longitude } = position.coords
                          console.log('📍 Got location:', latitude, longitude)
                          
                          // Reverse geocode to get address
                          try {
                            const response = await fetch(
                              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
                              { headers: { 'User-Agent': 'CasaGrownApp/1.0' } }
                            )
                            if (response.ok) {
                              const data = await response.json()
                              const addr = data.address || {}
                              const streetAddress = [
                                addr.house_number,
                                addr.road || addr.street
                              ].filter(Boolean).join(' ') || data.display_name?.split(',')[0] || ''
                              const zipCode = addr.postcode || ''
                              
                              setAddressInput(streetAddress)
                              setZipCodeInput(zipCode)
                            }
                          } catch (e) {
                            console.error('Reverse geocoding failed:', e)
                          }
                          
                          // Resolve community using lat/lng
                          const result = await resolveLocation(latitude, longitude)
                          if (result) {
                            setResolvedCommunity(result)
                          }
                        },
                        (error) => {
                          console.error('Geolocation error:', error)
                        }
                      )
                    } else {
                      console.error('Location services not available')
                    }
                  }}
                  disabled={resolvingCommunity}
                  hoverStyle={{ backgroundColor: colors.neutral[50] }}
                >
                  {resolvingCommunity ? (
                    <XStack alignItems="center" gap="$2">
                      <Spinner size="small" color={colors.primary[600]} />
                      <Text color={colors.primary[600]} fontWeight="600">{t('profile.searching')}</Text>
                    </XStack>
                  ) : (
                    <Text color={colors.primary[600]} fontWeight="600">{t('profile.useCurrentLocation')}</Text>
                  )}
                </Button>

                <Button
                  backgroundColor={colors.primary[600]}
                  onPress={handleFindCommunity}
                  disabled={resolvingCommunity || !addressInput.trim() || !zipCodeInput.trim()}
                >
                  <Text color="white" fontWeight="600">
                    {resolvingCommunity ? t('profile.searching') : t('profile.findCommunity')}
                  </Text>
                </Button>
                
                {resolvedCommunity?.primary && (
                  <YStack
                    backgroundColor="white"
                    padding="$3"
                    borderRadius={borderRadius.md}
                    gap="$2"
                    borderWidth={2}
                    borderColor={colors.primary[200]}
                  >
                    {/* Map preview of resolved community */}
                    <CommunityMapWrapper
                      resolveData={resolvedCommunity}
                      height={180}
                      showLabels={true}
                    />
                    <XStack alignItems="center" gap="$2" marginTop="$2">
                      <Check size={20} color={colors.primary[600]} />
                      <Text fontWeight="600">{resolvedCommunity.primary?.name}</Text>
                    </XStack>
                    <Text color={colors.neutral[500]}>{resolvedCommunity.primary?.city}</Text>
                    {resolvedCommunity.resolved_location && (
                      <Text color={colors.neutral[400]} fontSize="$1">
                        📍 {resolvedCommunity.resolved_location.lat.toFixed(4)}, {resolvedCommunity.resolved_location.lng.toFixed(4)}
                      </Text>
                    )}
                    <Button
                      backgroundColor={colors.primary[600]}
                      onPress={handleSwitchCommunity}
                      disabled={saving}
                    >
                      <Text color="white" fontWeight="600">
                        {saving ? t('profile.joining') : t('profile.switchToThisCommunity', 'Switch to this Community')}
                      </Text>
                    </Button>
                  </YStack>
                )}
                
                <Button
                  variant="outlined"
                  onPress={() => {
                    setIsChangingCommunity(false)
                    setResolvedCommunity(null)
                    setAddressInput('')
                    setZipCodeInput('')
                  }}
                >
                  <Text>{t('profile.cancel')}</Text>
                </Button>
              </YStack>
            )}
          </YStack>

          {/* Notification Preferences */}

          {/* ─── What I Grow ─── */}
          <Separator marginVertical="$3" />
          <YStack gap="$3">
            <Text fontWeight="600" color={colors.neutral[900]}>
              🌱 {t('profile.whatIGrow', 'What I Grow')}
            </Text>
            
            {/* Produce chips */}
            <XStack flexWrap="wrap" gap="$2">
              {(isEditing ? editData : profile).garden_items.map(name => {
                const emoji = getProduceEmoji(name)
                return (
                  <XStack
                    key={name}
                    backgroundColor={colors.primary[50]}
                    borderWidth={1}
                    borderColor={colors.primary[200]}
                    borderRadius={20}
                    paddingHorizontal="$3"
                    paddingVertical="$1.5"
                    alignItems="center"
                    gap="$1"
                  >
                    <Text fontSize="$3" color={colors.primary[800]}>
                      {emoji ? `${emoji} ` : ''}{name}
                    </Text>
                    {isEditing && (
                      <Button
                        size="$1"
                        circular
                        chromeless
                        onPress={() => removeGardenItem(name, false)}
                        padding="$0"
                      >
                        <X size={14} color={colors.error[500]} />
                      </Button>
                    )}
                  </XStack>
                )
              })}
              {(isEditing ? editData : profile).custom_garden_items.map(name => {
                const emoji = getProduceEmoji(name)
                return (
                  <XStack
                    key={`custom-${name}`}
                    backgroundColor={colors.primary[50]}
                    borderWidth={1}
                    borderColor={colors.primary[300]}
                    borderRadius={20}
                    paddingHorizontal="$3"
                    paddingVertical="$1.5"
                    alignItems="center"
                    gap="$1"
                    borderStyle="dashed"
                  >
                    <Text fontSize="$3" color={colors.primary[800]}>
                      {emoji ? `${emoji} ` : '🌿 '}{name}
                    </Text>
                    {isEditing && (
                      <Button
                        size="$1"
                        circular
                        chromeless
                        onPress={() => removeGardenItem(name, true)}
                        padding="$0"
                      >
                        <X size={14} color={colors.error[500]} />
                      </Button>
                    )}
                  </XStack>
                )
              })}
            </XStack>

            {/* No items message */}
            {(isEditing ? editData : profile).garden_items.length === 0 && (isEditing ? editData : profile).custom_garden_items.length === 0 && (
              <Text color={colors.neutral[400]} fontStyle="italic" fontSize="$3">
                {t('profile.noGardenItems', 'No produce added yet')}
              </Text>
            )}

            {/* Add custom item */}
            {isEditing && (
              <>
              <XStack gap="$2" alignItems="center">
                <Input
                  flex={1}
                  value={customItemInput}
                  onChangeText={setCustomItemInput}
                  placeholder={t('profile.addCustomItem', 'Add custom item…')}
                  size="$3"
                  borderWidth={1}
                  borderColor={colors.neutral[300]}
                  focusStyle={{ borderColor: colors.primary[500] }}
                  backgroundColor="white"
                  fontWeight="400"
                  onSubmitEditing={() => addGardenItem(customItemInput)}
                />
                <Button
                  size="$3"
                  backgroundColor={colors.primary[600]}
                  onPress={() => addGardenItem(customItemInput)}
                  disabled={!customItemInput.trim()}
                >
                  <Text color="white" fontWeight="600" fontSize="$4">+</Text>
                </Button>
              </XStack>
              {blockedError ? (
                <Text fontSize="$2" color="#dc2626" fontWeight="500">
                  ⛔ {blockedError}
                </Text>
              ) : null}
              </>
            )}
          </YStack>
          {/* SMS Notifications */}
          <Separator marginVertical="$3" />
          <YStack gap="$3">
            <Text fontWeight="600" color={colors.neutral[900]}>
              💬 {t('profile.smsTitle', 'SMS Daily Digest')}
            </Text>
            <YStack gap="$3" padding="$4" backgroundColor={colors.neutral[50]} borderRadius={borderRadius.lg} borderWidth={1} borderColor={colors.neutral[100]}>
              <XStack alignItems="center" justifyContent="space-between">
                <YStack flex={1} gap="$1">
                  <Text fontSize="$3" color={colors.neutral[800]} fontWeight="500">
                    {t('profile.smsOptIn', 'Receive a daily SMS digest of community activity')}
                  </Text>
                  <Text fontSize="$2" color={colors.neutral[500]}>
                    {t('profile.smsDescription', 'New listings, wanted posts, and offers in your community \u2014 delivered once daily')}
                  </Text>
                </YStack>
                <XStack
                  width={50}
                  height={28}
                  borderRadius={14}
                  backgroundColor={editData.sms_enabled ? colors.primary[600] : colors.neutral[300]}
                  padding={2}
                  justifyContent={editData.sms_enabled ? 'flex-end' : 'flex-start'}
                  alignItems="center"
                  opacity={!isEditing ? 0.6 : 1}
                  onPress={() => isEditing && setEditData({ ...editData, sms_enabled: !editData.sms_enabled })}
                  pressStyle={{ opacity: 0.8 }}
                  cursor={isEditing ? 'pointer' : 'default'}
                >
                  <YStack
                    width={24}
                    height={24}
                    borderRadius={12}
                    backgroundColor="white"
                    shadowColor="rgba(0,0,0,0.2)"
                    shadowOffset={{ width: 0, height: 1 }}
                    shadowRadius={2}
                  />
                </XStack>
              </XStack>
            </YStack>
          </YStack>
        </YStack>

        {/* Activity Stats */}
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.xl}
          padding="$5"
          shadowColor={shadows.sm.color}
          shadowOffset={shadows.sm.offset}
          shadowOpacity={0.1}
        >
          <Text fontWeight="600" color={colors.neutral[900]} marginBottom="$3">
            {t('profile.activityStats')}
          </Text>
          <XStack justifyContent="space-around">
            <YStack alignItems="center" padding="$3" backgroundColor={colors.neutral[50]} borderRadius={borderRadius.lg} minWidth={70}>
              <Text fontSize="$6" fontWeight="700" color={colors.neutral[900]}>
                {stats.transactions}
              </Text>
              <Text fontSize="$2" color={colors.neutral[600]}>
                {t('profile.transactions')}
              </Text>
            </YStack>
            <YStack alignItems="center" padding="$3" backgroundColor={colors.neutral[50]} borderRadius={borderRadius.lg} minWidth={70}>
              <Text fontSize="$6" fontWeight="700" color={colors.neutral[900]}>
                {stats.rating > 0 ? stats.rating.toFixed(1) : '-'}
              </Text>
              <Text fontSize="$2" color={colors.neutral[600]}>
                {t('profile.rating')}
              </Text>
            </YStack>
            <YStack alignItems="center" padding="$3" backgroundColor={colors.neutral[50]} borderRadius={borderRadius.lg} minWidth={70}>
              <Text fontSize="$6" fontWeight="700" color={colors.neutral[900]}>
                {stats.posts}
              </Text>
              <Text fontSize="$2" color={colors.neutral[600]}>
                {t('profile.posts')}
              </Text>
            </YStack>
            <YStack 
              alignItems="center" 
              padding="$3" 
              backgroundColor={colors.primary[50]} 
              borderRadius={borderRadius.lg} 
              minWidth={70}
              pressStyle={{ opacity: 0.8 }}
              onPress={() => router.push('/following')}
            >
              <Text fontSize="$6" fontWeight="700" color={colors.primary[700]}>
                {stats.following}
              </Text>
              <Text fontSize="$2" color={colors.primary[700]} fontWeight="500">
                {t('profile.following')}
              </Text>
            </YStack>
          </XStack>
        </YStack>

        {/* Save/Cancel Actions - At bottom of form */}
        {isEditing && (
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius.xl}
            padding="$5"
            shadowColor={shadows.sm.color}
            shadowOffset={shadows.sm.offset}
            shadowOpacity={0.1}
          >
            <XStack gap="$3" justifyContent="flex-end">
              <Button
                size="$4"
                variant="outlined"
                onPress={handleCancel}
              >
                {t('profile.cancel')}
              </Button>
              <Button
                size="$4"
                backgroundColor={colors.primary[600]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text color="white" fontWeight="600">
                  {saving ? <Spinner size="small" color="white" /> : t('profile.save')}
                </Text>
              </Button>
            </XStack>
          </YStack>
        )}



        {/* Legal & Support Section — mobile only */}
        {Platform.OS !== 'web' && (
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.xl}
          padding="$5"
          shadowColor={shadows.sm.color}
          shadowOffset={shadows.sm.offset}
          shadowOpacity={0.1}
        >
          <Text fontWeight="600" color={colors.neutral[900]} marginBottom="$3">
            {t('profile.legal.title', 'Legal & Support')}
          </Text>
          <YStack gap="$2">
            <Button
              unstyled
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
              paddingVertical="$2"
              onPress={() => {/* TODO: Navigate to privacy policy */}}
            >
              <Text color={colors.neutral[700]}>{t('profile.legal.privacyPolicy', 'Privacy Policy')}</Text>
              <ChevronLeft size={20} color={colors.neutral[400]} style={{ transform: [{ rotate: '180deg' }] }} />
            </Button>
            <Separator />
            <Button
              unstyled
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
              paddingVertical="$2"
              onPress={() => {/* TODO: Navigate to terms */}}
            >
              <Text color={colors.neutral[700]}>{t('profile.legal.termsOfService', 'Terms of Service')}</Text>
              <ChevronLeft size={20} color={colors.neutral[400]} style={{ transform: [{ rotate: '180deg' }] }} />
            </Button>
            <Separator />
            <Button
              unstyled
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
              paddingVertical="$2"
              onPress={() => {/* TODO: Navigate to user agreement */}}
            >
              <Text color={colors.neutral[700]}>{t('profile.legal.userAgreement', 'User Agreement')}</Text>
              <ChevronLeft size={20} color={colors.neutral[400]} style={{ transform: [{ rotate: '180deg' }] }} />
            </Button>
            <Separator />
            <Button
              unstyled
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
              paddingVertical="$2"
              onPress={() => {/* TODO: Open support email */}}
            >
              <Text color={colors.primary[600]} fontWeight="500">{t('profile.legal.contactSupport', 'Contact Support')}</Text>
              <ChevronLeft size={20} color={colors.primary[400]} style={{ transform: [{ rotate: '180deg' }] }} />
            </Button>
          </YStack>
        </YStack>
        )}


        {/* Logout Button */}
        <YStack paddingTop="$4">
          <Button
            backgroundColor="$red3"
            borderColor="$red7"
            borderWidth={1}
            borderRadius="$4"
            height="$5"
            pressStyle={{ backgroundColor: '$red4' }}
            icon={<LogOut size={18} color={colors.red[600]} />}
            onPress={handleLogout}
          >
            <Text color={colors.red[600]} fontWeight="600" fontSize="$4">{t('profile.logout', 'Logout')}</Text>
          </Button>
        </YStack>

      </YStack>
    </ScrollView>
  )

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {scrollContent}
      </KeyboardAvoidingView>
    )
  }

  return scrollContent
}
