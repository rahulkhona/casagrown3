import { useRef, useState, useCallback, useEffect } from 'react'
import { YStack, XStack, Input, Button, Text, Avatar, Label, ScrollView, Separator, Spinner } from 'tamagui'
import { useWizard } from '../wizard-context'
import { useAuth, supabase } from '../../auth/auth-hook'
import { Camera, Upload, MapPin, Check, Navigation } from '@tamagui/lucide-icons'
import { colors, shadows, borderRadius } from '../../../design-tokens'
import { Image } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import { Alert, Platform } from 'react-native'
import { CommunityMapWrapper } from '../../create-post/CommunityMapWrapper'
import type { ResolveResponse } from '../../community/use-resolve-community'

const WebCameraModal = Platform.OS === 'web'
  ? require('../../create-post/WebCameraModal').WebCameraModal
  : null

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]

export const ProfileSetupStep = () => {
  const { t } = useTranslation()
  const { data, updateData, nextStep } = useWizard()
  const { user, signOut } = useAuth()
  const [name, setName] = useState(data.name)
  const [streetAddress, setStreetAddress] = useState(data.streetAddress)
  const [city, setCity] = useState(data.city)
  const [stateCode, setStateCode] = useState(data.stateCode)
  const [zipCode, setZipCode] = useState(data.zipCode)
  const [locationLoading, setLocationLoading] = useState(false)
  const [communityLoading, setCommunityLoading] = useState(false)
  const [communityError, setCommunityError] = useState('')
  const [detectedCommunity, setDetectedCommunity] = useState(data.community || null as null | { h3Index: string; name: string })
  const [communityMapData, setCommunityMapData] = useState<ResolveResponse | null>(null)

  const isFormValid = name.trim().length > 0 
    && streetAddress.trim().length > 0
    && city.trim().length > 0
    && stateCode.length === 2
    && zipCode.trim().length === 5

  // Ref to keep updateData stable inside effects
  const updateDataRef = useRef(updateData)
  updateDataRef.current = updateData

  // Auto-detect community when address fields change
  useEffect(() => {
    if (!streetAddress.trim() || !city.trim() || stateCode.length !== 2 || zipCode.length !== 5) {
      setDetectedCommunity(null)
      setCommunityError('')
      setCommunityMapData(null)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setCommunityLoading(true)
      setCommunityError('')
      setDetectedCommunity(null)
      try {
        const query = `${streetAddress}, ${city}, ${stateCode} ${zipCode}`
        const response = await supabase.functions.invoke('resolve-community', {
          body: { address: query },
        })

        if (cancelled) return

        if (response.data?.primary) {
          const primary = response.data.primary
          const loc = response.data.resolved_location
          setDetectedCommunity({
            h3Index: primary.h3_index,
            name: primary.name,
          })
          setCommunityMapData(response.data as ResolveResponse)
          updateDataRef.current({
            location: loc ? { lat: loc.lat, lng: loc.lng } : undefined,
            community: {
              h3Index: primary.h3_index,
              name: primary.name,
            },
          })
        } else {
          setCommunityError(t('profileWizard.setup.communityNotDetected'))
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Community detection failed:', err)
          setCommunityError(t('profileWizard.setup.communityNotDetected'))
        }
      } finally {
        if (!cancelled) {
          setCommunityLoading(false)
        }
      }
    }, 800) // Debounce 800ms

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [streetAddress, city, stateCode, zipCode, t])

  // Reverse geocode from lat/lng to address
  const useCurrentLocation = useCallback(async () => {
    setLocationLoading(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      })
      const { latitude, longitude } = position.coords
      // Use Nominatim (OpenStreetMap) for reverse geocoding
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const geo = await res.json()
      if (geo?.address) {
        const addr = geo.address
        const houseNumber = addr.house_number || ''
        const road = addr.road || ''
        const street = [houseNumber, road].filter(Boolean).join(' ')
        if (street) setStreetAddress(street)
        if (addr.city || addr.town || addr.village) setCity(addr.city || addr.town || addr.village)
        if (addr.state) {
          // Convert full state name to 2-letter code
          const stateMap: Record<string, string> = {
            'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
            'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
            'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
            'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
            'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
            'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
            'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
            'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
            'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
            'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
          }
          const code = stateMap[addr.state] || addr['ISO3166-2-lvl4']?.split('-')[1] || ''
          if (code.length === 2) setStateCode(code.toUpperCase())
        }
        if (addr.postcode) setZipCode(addr.postcode.slice(0, 5))
      }
    } catch (err) {
      console.warn('Geolocation error:', err)
      Alert.alert(
        t('profileWizard.setup.locationErrorTitle'),
        t('profileWizard.setup.locationErrorMessage')
      )
    } finally {
      setLocationLoading(false)
    }
  }, [t])

  // Web photo state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCamera, setShowCamera] = useState(false)

  const handleContinue = () => {
    if (isFormValid) {
      updateData({
        name,
        streetAddress,
        city,
        stateCode,
        zipCode,
        community: detectedCommunity || undefined,
      })
      nextStep()
    }
  }

  const pickImage = async () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click()
      return
    }
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (!result.canceled) {
      updateData({ avatar: result.assets[0].uri })
    }
  }

  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      setShowCamera(true)
      return
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return

    try {
      let result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })
      if (!result.canceled && result.assets?.[0]?.uri) {
        updateData({ avatar: result.assets[0].uri })
      }
    } catch (e) {
      Alert.alert(
        t('profileWizard.setup.cameraUnavailableTitle'),
        t('profileWizard.setup.cameraUnavailableMessage')
      )
    }
  }

  function handleWebFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]!
    const url = URL.createObjectURL(file)
    updateData({ avatar: url })
    e.target.value = ''
  }

  function handleWebCameraCapture(asset: { uri: string; type: 'image' | 'video'; fileName: string }) {
    updateData({ avatar: asset.uri })
    setShowCamera(false)
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
      <YStack flex={1} paddingHorizontal="$4" paddingBottom="$8" alignItems="center">
        <YStack
          width="100%"
          maxWidth={500}
          backgroundColor="white"
          borderRadius={borderRadius['2xl']}
          padding="$6"
          gap="$6"
          shadowColor={shadows.lg.color}
          shadowOffset={shadows.lg.offset}
          shadowOpacity={0.1}
          shadowRadius={shadows.lg.radius}
        >
          {/* Title */}
          <YStack gap="$2" alignItems="center">
            <Text fontSize="$7" fontWeight="700" color={colors.gray[900]} textAlign="center">
              {user?.user_metadata?.full_name
                ? t('profileWizard.setup.welcomeName', { name: user.user_metadata.full_name.split(' ')[0] })
                : t('profileWizard.setup.title')}
            </Text>
            <Text fontSize="$4" color={colors.gray[500]} textAlign="center">
              {t('profileWizard.setup.subtitle')}
            </Text>
            {user?.email && (
              <Text fontSize="$2" color={colors.gray[400]} textAlign="center">
                ✉️ {user.email}
              </Text>
            )}
          </YStack>

          {/* Avatar Section */}
          <YStack alignItems="center" gap="$4">
            <YStack>
              <YStack
                width={100}
                height={100}
                borderRadius={50}
                backgroundColor={colors.green[100]}
                alignItems="center"
                justifyContent="center"
                borderWidth={4}
                borderColor="white"
                shadowColor={shadows.sm.color}
                shadowRadius={shadows.sm.radius}
                overflow="hidden"
              >
                {data.avatar ? (
                  <Image
                    source={{ uri: data.avatar }}
                    style={{ width: 100, height: 100 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text fontSize={36} color={colors.green[700]} fontWeight="bold">
                    {name ? name[0]!.toUpperCase() : '👤'}
                  </Text>
                )}
              </YStack>
            </YStack>
            <XStack gap="$3">
              <Button
                size="$3"
                backgroundColor="white"
                borderWidth={1}
                borderColor={colors.gray[300]}
                icon={<Upload size={16} color={colors.gray[600]} />}
                onPress={pickImage}
                hoverStyle={{ backgroundColor: colors.gray[50] }}
              >
                <Text color={colors.gray[700]} fontSize="$3">{t('profileWizard.setup.uploadPhoto')}</Text>
              </Button>
              <Button
                size="$3"
                backgroundColor="white"
                borderWidth={1}
                borderColor={colors.gray[300]}
                icon={<Camera size={16} color={colors.gray[600]} />}
                onPress={takePhoto}
                hoverStyle={{ backgroundColor: colors.gray[50] }}
              >
                <Text color={colors.gray[700]} fontSize="$3">{t('profileWizard.setup.takePhoto')}</Text>
              </Button>
            </XStack>
            {Platform.OS === 'web' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleWebFileChange}
                  style={{ display: 'none' }}
                />
                {showCamera && WebCameraModal && (
                  <WebCameraModal
                    mode="photo"
                    onCapture={handleWebCameraCapture}
                    onClose={() => setShowCamera(false)}
                  />
                )}
              </>
            )}
          </YStack>

          {/* Name */}
          <YStack gap="$2">
            <Label color={colors.gray[700]} fontWeight="600">{t('profileWizard.setup.nameLabel')}</Label>
            <Input
              value={name}
              onChangeText={setName}
              placeholder={t('profileWizard.setup.namePlaceholder')}
              size="$4"
              borderWidth={1}
              borderColor={colors.gray[300]}
              focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
              backgroundColor="white"
              fontWeight="400"
            />
          </YStack>

          <Separator />

          {/* Address Section */}
          <YStack gap="$3">
            <Label color={colors.gray[700]} fontWeight="600">
              <XStack alignItems="center" gap="$2">
                <MapPin size={16} color={colors.gray[600]} />
                <Text>{t('profileWizard.setup.addressTitle')}</Text>
              </XStack>
            </Label>
            <Text fontSize="$2" color={colors.gray[500]}>
              {t('profileWizard.setup.addressSubtitle')}
            </Text>

            {/* Street Address */}
            <YStack gap="$1">
              <Label fontSize="$2" color={colors.gray[600]}>{t('profileWizard.setup.streetLabel')}</Label>
              <Input
                value={streetAddress}
                onChangeText={setStreetAddress}
                placeholder={t('profileWizard.setup.streetPlaceholder')}
                size="$4"
                borderWidth={1}
                borderColor={colors.gray[300]}
                focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
                backgroundColor="white"
                fontWeight="400"
              />
            </YStack>

            {/* City + State + ZIP */}
            <XStack gap="$2">
              <YStack flex={2} gap="$1">
                <Label fontSize="$2" color={colors.gray[600]}>{t('profileWizard.setup.cityLabel')}</Label>
                <Input
                  value={city}
                  onChangeText={setCity}
                  placeholder={t('profileWizard.setup.cityPlaceholder')}
                  size="$4"
                  borderWidth={1}
                  borderColor={colors.gray[300]}
                  focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
                  backgroundColor="white"
                  fontWeight="400"
                />
              </YStack>

              <YStack flex={1} gap="$1">
                <Label fontSize="$2" color={colors.gray[600]}>{t('profileWizard.setup.stateLabel')}</Label>
                <Input
                  value={stateCode}
                  onChangeText={(text) => setStateCode(text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                  placeholder="CA"
                  size="$4"
                  borderWidth={1}
                  borderColor={colors.gray[300]}
                  focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
                  backgroundColor="white"
                  fontWeight="400"
                  maxLength={2}
                  autoCapitalize="characters"
                />
              </YStack>

              <YStack flex={1} gap="$1">
                <Label fontSize="$2" color={colors.gray[600]}>{t('profileWizard.setup.zipLabel')}</Label>
                <Input
                  value={zipCode}
                  onChangeText={(text) => setZipCode(text.replace(/\D/g, '').slice(0, 5))}
                  placeholder="00000"
                  size="$4"
                  borderWidth={1}
                  borderColor={colors.gray[300]}
                  focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
                  backgroundColor="white"
                  fontWeight="400"
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </YStack>
            </XStack>

            <Text fontSize="$2" color={colors.gray[400]} fontStyle="italic">
              {t('profileWizard.setup.zipAutoInfer')}
            </Text>

            {/* Use Current Location */}
            <Button
              size="$3"
              backgroundColor={colors.green[50]}
              borderWidth={1}
              borderColor={colors.green[300]}
              icon={<Navigation size={16} color={colors.green[700]} />}
              onPress={useCurrentLocation}
              disabled={locationLoading}
              hoverStyle={{ backgroundColor: colors.green[100] }}
            >
              <Text color={colors.green[700]} fontSize="$3" fontWeight="500">
                {locationLoading ? t('profileWizard.setup.detectingLocation') : t('profileWizard.setup.useCurrentLocation')}
              </Text>
            </Button>
          </YStack>

          <Separator />

          {/* Community (Auto-detected) */}
          <YStack gap="$2">
            <Label color={colors.gray[700]} fontWeight="600">
              <XStack alignItems="center" gap="$2">
                <MapPin size={16} color={colors.green[600]} />
                <Text>{t('profileWizard.setup.communityTitle')}</Text>
              </XStack>
            </Label>

            {communityLoading ? (
              <XStack
                padding="$3"
                backgroundColor={colors.green[50]}
                borderRadius={borderRadius.md}
                alignItems="center"
                gap="$2"
              >
                <Spinner size="small" color={colors.green[600]} />
                <Text fontSize="$3" color={colors.gray[500]}>
                  {t('profileWizard.setup.communityDetecting')}
                </Text>
              </XStack>
            ) : detectedCommunity ? (
              <YStack gap="$3">
                <XStack
                  padding="$3"
                  backgroundColor={colors.green[50]}
                  borderRadius={borderRadius.md}
                  borderWidth={1}
                  borderColor={colors.green[300]}
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <XStack alignItems="center" gap="$2" flex={1}>
                    <Text fontSize="$4" fontWeight="600" color={colors.gray[900]}>
                      📍 {detectedCommunity.name}
                    </Text>
                  </XStack>
                  <XStack
                    backgroundColor={colors.green[100]}
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                    borderRadius={borderRadius.md}
                    alignItems="center"
                    gap="$1"
                  >
                    <Check size={12} color={colors.green[700]} />
                    <Text fontSize="$1" color={colors.green[700]}>{t('profileWizard.setup.communityDetected')}</Text>
                  </XStack>
                </XStack>

                {/* Community Hex Map */}
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
            ) : communityError ? (
              <YStack
                padding="$3"
                backgroundColor="#fef2f2"
                borderRadius={borderRadius.md}
                borderWidth={1}
                borderColor="#fecaca"
                gap="$2"
              >
                <Text fontSize="$3" color="#dc2626">
                  {communityError}
                </Text>
                <Text fontSize="$2" color={colors.gray[500]}>
                  {t('profileWizard.setup.communityFixAddress')}
                </Text>
              </YStack>
            ) : (
              <Text fontSize="$2" color={colors.gray[400]} fontStyle="italic">
                {t('profileWizard.setup.communityWaiting')}
              </Text>
            )}
          </YStack>

          {/* Navigation */}
          <XStack gap="$3" paddingTop="$4">
            <Button
              flex={1}
              backgroundColor="white"
              borderColor={colors.gray[200]}
              borderWidth={1}
              height="$5"
              onPress={() => signOut()}
              hoverStyle={{ backgroundColor: colors.gray[50] }}
            >
              <Text color={colors.gray[700]}>{t('profileWizard.setup.back')}</Text>
            </Button>
            <Button
              flex={1}
              backgroundColor={isFormValid ? colors.green[600] : colors.gray[400]}
              height="$5"
              onPress={handleContinue}
              disabled={!isFormValid}
              opacity={isFormValid ? 1 : 0.6}
              hoverStyle={{ backgroundColor: isFormValid ? colors.green[700] : colors.gray[400] }}
            >
              <Text color="white" fontWeight="600">{t('profileWizard.setup.continue')}</Text>
            </Button>
          </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  )
}
