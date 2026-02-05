'use client'

import { useState, useEffect } from 'react'
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
  Bell, 
  MessageSquare, 
  Phone, 
  Mail, 
  MapPin, 
  LogOut, 
  Pencil, 
  Save, 
  X, 
  Settings,
  Check,
  ShoppingBag,
  Tag,
  ChevronDown,
  ChevronLeft
} from '@tamagui/lucide-icons'
import { Image, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'solito/navigation'
import { colors, shadows, borderRadius } from '../../design-tokens'
import { useAuth, supabase } from '../auth/auth-hook'
import { useResolveCommunity, ResolveResponse } from '../community/use-resolve-community'
import { uploadProfileAvatar } from '../profile-wizard/utils/media-upload'

interface ProfileData {
  full_name: string
  avatar_url: string | null
  phone_number: string | null
  push_enabled: boolean
  sms_enabled: boolean
  notify_on_wanted: boolean
  notify_on_available: boolean
  home_community_h3_index: string | null
  community_name?: string
  community_city?: string
}

interface ActivityStats {
  transactions: number
  rating: number
  posts: number
  following: number
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
  
  // Profile data
  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    avatar_url: null,
    phone_number: null,
    push_enabled: true,
    sms_enabled: false,
    notify_on_wanted: false,
    notify_on_available: false,
    home_community_h3_index: null,
  })
  
  // Edit state (separate from saved profile)
  const [editData, setEditData] = useState<ProfileData>({ ...profile })
  
  // Community change state  
  const [addressInput, setAddressInput] = useState('')
  const [zipCodeInput, setZipCodeInput] = useState('')
  const [resolvedCommunity, setResolvedCommunity] = useState<ResolveResponse | null>(null)
  
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
      router.replace('/login')
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
          push_enabled,
          sms_enabled,
          notify_on_wanted,
          notify_on_available,
          home_community_h3_index,
          communities:home_community_h3_index (
            name,
            city
          )
        `)
        .eq('id', user.id)
        .single()
      
      if (error) throw error
      
      const profileData: ProfileData = {
        full_name: data.full_name || '',
        avatar_url: data.avatar_url,
        phone_number: data.phone_number,
        push_enabled: data.push_enabled ?? true,
        sms_enabled: data.sms_enabled ?? false,
        notify_on_wanted: data.notify_on_wanted ?? false,
        notify_on_available: data.notify_on_available ?? false,
        home_community_h3_index: data.home_community_h3_index,
        community_name: (data.communities as any)?.name,
        community_city: (data.communities as any)?.city,
      }
      
      setProfile(profileData)
      setEditData(profileData)
    } catch (err) {
      console.error('Error loading profile:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!user?.id) return
    
    try {
      setSaving(true)
      
      // Upload avatar if changed and is a local URI
      let avatarUrl = editData.avatar_url
      if (avatarUrl && avatarUrl.startsWith('file://')) {
        avatarUrl = await uploadProfileAvatar(user.id, avatarUrl)
      }
      
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editData.full_name,
          avatar_url: avatarUrl,
          phone_number: editData.phone_number,
          push_enabled: editData.push_enabled,
          sms_enabled: editData.sms_enabled,
          notify_on_wanted: editData.notify_on_wanted,
          notify_on_available: editData.notify_on_available,
        })
        .eq('id', user.id)
      
      if (error) throw error
      
      setProfile({ ...editData, avatar_url: avatarUrl })
      setIsEditing(false)
    } catch (err) {
      console.error('Error saving profile:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditData({ ...profile })
    setIsEditing(false)
  }

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled) {
      setEditData({ ...editData, avatar_url: result.assets[0].uri })
    }
  }

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled) {
      setEditData({ ...editData, avatar_url: result.assets[0].uri })
    }
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
    } catch (err) {
      console.error('Error joining community:', err)
    } finally {
      setSaving(false)
    }
  }


  const handleLogout = async () => {
    await signOut()
    router.replace('/')
  }

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="$background">
        <Spinner size="large" color="$green10" />
      </YStack>
    )
  }

  return (
    <ScrollView 
      flex={1} 
      backgroundColor={colors.neutral[50]}
      contentContainerStyle={{ paddingBottom: 40 }}
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
              icon={Pencil}
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
              <Avatar circular size="$10">
                {editData.avatar_url ? (
                  <Avatar.Image src={editData.avatar_url} />
                ) : (
                  <Avatar.Fallback backgroundColor={colors.primary[600]}>
                    <Text color="white" fontSize="$8" fontWeight="700">
                      {editData.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                  </Avatar.Fallback>
                )}
              </Avatar>
              
              {isEditing && (
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
                <Text fontSize="$6" fontWeight="700" color={colors.neutral[900]}>
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

          {/* Community Section */}
          <YStack gap="$3">
            <Text fontWeight="600" color={colors.neutral[900]}>
              {t('profile.myCommunity')}
            </Text>
            
            {profile.home_community_h3_index ? (
              <YStack
                backgroundColor={colors.neutral[50]}
                padding="$3"
                borderRadius={borderRadius.lg}
                gap="$2"
              >
                <XStack justifyContent="space-between" alignItems="center">
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
                </YStack>
                
                {/* Zip Code + Country Row */}
                <XStack gap="$3">
                  <YStack gap="$2" width={140}>
                    <Label color={colors.neutral[700]} fontWeight="600">{t('profile.zipCode') || 'Zip Code'}</Label>
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
                
                {resolvedCommunity && (
                  <YStack
                    backgroundColor="white"
                    padding="$3"
                    borderRadius={borderRadius.md}
                    gap="$2"
                    borderWidth={2}
                    borderColor={colors.primary[200]}
                  >
                    <XStack alignItems="center" gap="$2">
                      <Check size={20} color={colors.primary[600]} />
                      <Text fontWeight="600">{resolvedCommunity.primary.name}</Text>
                    </XStack>
                    <Text color={colors.neutral[500]}>{resolvedCommunity.primary.city}</Text>
                    {resolvedCommunity.resolved_location && (
                      <Text color={colors.neutral[400]} fontSize="$1">
                        📍 {resolvedCommunity.resolved_location.lat.toFixed(4)}, {resolvedCommunity.resolved_location.lng.toFixed(4)}
                      </Text>
                    )}
                    <Button
                      backgroundColor={colors.primary[600]}
                      onPress={handleJoinCommunity}
                      disabled={saving}
                    >
                      <Text color="white" fontWeight="600">
                        {saving ? t('profile.joining') : t('profile.joinCommunity')}
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
          <YStack gap="$3">
            <Text fontWeight="600" color={colors.neutral[900]}>
              {t('profile.notifications')}
            </Text>
            
            {/* Notify Type Container - matches wizard step 1 pattern */}
            <YStack gap="$3" padding="$4" backgroundColor={colors.neutral[50]} borderRadius={borderRadius.lg} borderWidth={1} borderColor={colors.neutral[100]}>
              <XStack alignItems="center" gap="$3">
                <Checkbox
                  checked={editData.notify_on_wanted}
                  onCheckedChange={(checked) => 
                    setEditData({ ...editData, notify_on_wanted: !!checked })
                  }
                  disabled={!isEditing}
                  size="$4"
                >
                  <Checkbox.Indicator>
                    <Check color={colors.primary[600]} />
                  </Checkbox.Indicator>
                </Checkbox>
                <Text fontSize="$3" color={colors.neutral[800]}>{t('profile.notifyWanted')}</Text>
              </XStack>
              
              <XStack alignItems="center" gap="$3">
                <Checkbox
                  checked={editData.notify_on_available}
                  onCheckedChange={(checked) => 
                    setEditData({ ...editData, notify_on_available: !!checked })
                  }
                  disabled={!isEditing}
                  size="$4"
                >
                  <Checkbox.Indicator>
                    <Check color={colors.primary[600]} />
                  </Checkbox.Indicator>
                </Checkbox>
                <Text fontSize="$3" color={colors.neutral[800]}>{t('profile.notifyAvailable')}</Text>
              </XStack>
              
              {/* Channel Selection - Only visible when a notification type is selected */}
              {(editData.notify_on_wanted || editData.notify_on_available) && (
                <YStack>
                  <YStack height={1} backgroundColor={colors.neutral[200]} marginVertical="$4" />
                  <Text color={colors.neutral[700]} fontWeight="600" fontSize="$3" marginBottom="$2">
                    {t('profile.alertChannels') || 'Alert Channels'}
                  </Text>
                  
                  <XStack alignItems="center" gap="$3" marginBottom="$2">
                    <Checkbox
                      checked={editData.push_enabled}
                      onCheckedChange={(checked) => 
                        setEditData({ ...editData, push_enabled: !!checked })
                      }
                      disabled={!isEditing}
                      size="$4"
                    >
                      <Checkbox.Indicator>
                        <Check color={colors.primary[600]} />
                      </Checkbox.Indicator>
                    </Checkbox>
                    <Text fontSize="$3" color={colors.neutral[800]}>{t('profile.pushNotifications')}</Text>
                  </XStack>
                  
                  <XStack alignItems="center" gap="$3">
                    <Checkbox
                      checked={editData.sms_enabled}
                      onCheckedChange={(checked) => 
                        setEditData({ ...editData, sms_enabled: !!checked })
                      }
                      disabled={!isEditing}
                      size="$4"
                    >
                      <Checkbox.Indicator>
                        <Check color={colors.primary[600]} />
                      </Checkbox.Indicator>
                    </Checkbox>
                    <Text fontSize="$3" color={colors.neutral[800]}>{t('profile.smsNotifications')}</Text>
                  </XStack>
                  
                  {/* Phone Number Input - appears below SMS checkbox when SMS is enabled */}
                  {editData.sms_enabled && (
                    <YStack gap="$2" marginTop="$3" paddingLeft="$7">
                      <Label color={colors.neutral[600]} fontSize="$2">{t('profile.phoneLabel') || 'Phone Number'}</Label>
                      <Input
                        value={editData.phone_number || ''}
                        onChangeText={(text) => setEditData({ ...editData, phone_number: text })}
                        placeholder={t('profile.phonePlaceholder')}
                        size="$3"
                        borderWidth={1}
                        borderColor={colors.neutral[300]}
                        focusStyle={{ borderColor: colors.primary[500] }}
                        backgroundColor="white"
                        keyboardType="phone-pad"
                        fontWeight="400"
                        disabled={!isEditing}
                      />
                    </YStack>
                  )}
                </YStack>
              )}
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

        {/* Account Actions */}
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.xl}
          borderWidth={2}
          borderColor={colors.error[200]}
          padding="$5"
        >
          <Text fontWeight="600" color={colors.error[600]} marginBottom="$3">
            {t('profile.accountActions')}
          </Text>
          <YStack gap="$3">
            <Button
              size="$4"
              backgroundColor={colors.error[600]}
              icon={<LogOut size={18} color="white" />}
              onPress={handleLogout}
            >
              <Text color="white">{t('profile.logout')}</Text>
            </Button>
            <Button
              size="$4"
              variant="outlined"
              borderColor={colors.error[600]}
              onPress={() => {
                // TODO: Implement account deactivation
                console.log('Deactivate account')
              }}
            >
              <Text color={colors.error[600]}>{t('profile.deactivateAccount')}</Text>
            </Button>
          </YStack>
        </YStack>
      </YStack>
    </ScrollView>
  )
}
