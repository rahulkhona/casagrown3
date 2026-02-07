import { YStack, XStack, Input, Button, Text, Label, ScrollView, Separator, Spinner } from 'tamagui'
import { useWizard } from '../wizard-context'
import { useState, useEffect } from 'react'
import { colors, shadows, borderRadius } from '../../../design-tokens'
import { Navigation, MapPin, ChevronDown, Check, Calendar } from '@tamagui/lucide-icons'
import { useResolveCommunity } from '../../community/use-resolve-community'
import { useIncentiveRules } from '../utils/use-incentive-rules'
import { useTranslation } from 'react-i18next'
import * as Location from 'expo-location'


export const JoinCommunityStep = () => {
  const { t } = useTranslation()
  const { data, updateData, nextStep, prevStep } = useWizard()
  const { resolveAddress, resolveLocation, loading: resolving } = useResolveCommunity()
  const { getPoints } = useIncentiveRules()
  
  const [address, setAddress] = useState(data.address)
  const [unit, setUnit] = useState('')
  const [zip, setZip] = useState(data.zipCode)
  const [isMatched, setIsMatched] = useState(false)
  const [matchData, setMatchData] = useState<{name: string, points: number} | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [gettingLocation, setGettingLocation] = useState(false)

  const joinPoints = getPoints('join_a_community', 50)

  const handleSearch = async () => {
     // Prevent double-click by checking if already resolving
     if (resolving) return
     
     if (address && zip) {
         const fullAddress = `${address}, ${zip}, USA` // Append country for better resolution
         console.log('🔍 Searching for community:', fullAddress)
         const result = await resolveAddress(fullAddress)
         
         if (result) {
             console.log('✅ Community Resolved:', result.primary.name)
             setMatchData({
                 name: result.primary.name,
                 points: joinPoints
             })
             setIsMatched(true)
             
             updateData({
                 address,
                 zipCode: zip,
                 community: {
                     h3Index: result.primary.h3_index,
                     name: result.primary.name,
                     points: joinPoints
                 },
                 nearbyCommunities: result.neighbors.map(n => n.h3_index)
             })
          } else {
              setErrorMessage(t('profileWizard.community.notFound') || 'Could not find a community. Please check your address.')
          }
     }
  }

  // If user edits address after matching, reset match
  const handleAddressChange = (text: string) => {
      setAddress(text)
      setErrorMessage('')
      if (isMatched) {
        setIsMatched(false)
        setMatchData(null)
      }
  }
  
  const handleZipChange = (text: string) => {
      setZip(text)
      setErrorMessage('')
      if (isMatched) {
        setIsMatched(false)
        setMatchData(null)
      }
  }
  
  const handleUseCurrentLocation = async () => {
    setGettingLocation(true)
    setErrorMessage('')
    try {
      let latitude = 0
      let longitude = 0
      let gotLocation = false

      // expo-location's web wrapper is unreliable, so use native browser API on web
      const isWeb = typeof window !== 'undefined' && typeof navigator !== 'undefined'

      if (isWeb) {
        // Web: use native browser Geolocation API (confirmed working via testing)
        if ('geolocation' in navigator) {
          try {
            console.log('📍 Using browser Geolocation API...')
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 60000,
              })
            })
            latitude = position.coords.latitude
            longitude = position.coords.longitude
            gotLocation = true
            console.log('📍 Browser geolocation succeeded:', latitude, longitude)
          } catch (geoErr: any) {
            console.warn('📍 Browser geolocation failed (code:', geoErr?.code, '):', geoErr?.message)
          }
        }

        // Fallback: IP-based geolocation (works without browser permissions)
        if (!gotLocation) {
          console.log('📍 Falling back to IP-based geolocation...')
          try {
            const ipResponse = await fetch('https://ipapi.co/json/')
            if (!ipResponse.ok) throw new Error('IP geolocation service unavailable')
            const ipData = await ipResponse.json()
            if (ipData.latitude && ipData.longitude) {
              latitude = ipData.latitude
              longitude = ipData.longitude
              gotLocation = true
              console.log('📍 IP geolocation succeeded:', latitude, longitude, '(city:', ipData.city, ')')
            } else {
              throw new Error('No location data from IP geolocation')
            }
          } catch (ipErr) {
            console.error('📍 IP geolocation also failed:', ipErr)
          }
        }
      } else {
        // Native (iOS/Android): use expo-location
        try {
          const { status } = await Location.requestForegroundPermissionsAsync()
          if (status === 'granted') {
            console.log('📍 Requesting location via expo-location...')
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            })
            latitude = location.coords.latitude
            longitude = location.coords.longitude
            gotLocation = true
            console.log('📍 expo-location succeeded:', latitude, longitude)
          } else {
            console.warn('📍 Location permission denied')
          }
        } catch (expoErr) {
          console.warn('📍 expo-location failed:', expoErr)
        }
      }

      if (!gotLocation) {
        setErrorMessage(t('profileWizard.community.locationPermissionDenied') || 'Location permission was denied. Please enable location access in your settings.')
        setGettingLocation(false)
        return
      }
      console.log('📍 Got location:', latitude, longitude)
      
      // Reverse geocode to get street address
      let streetAddress = ''
      let postalCode = ''
      
      // Try expo-location's reverseGeocodeAsync first
      try {
        const [reverseGeocode] = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        })
        if (reverseGeocode) {
          const { streetNumber, street, city, postalCode: zip } = reverseGeocode
          streetAddress = [streetNumber, street].filter(Boolean).join(' ') || ''
          postalCode = zip || ''
          console.log('Expo reverse geocode result:', streetAddress, postalCode)
        }
      } catch (expoGeoErr) {
        console.warn('Expo reverse geocoding failed, trying Nominatim fallback:', expoGeoErr)
      }
      
      // Fallback to Nominatim for web when expo-location fails or returns empty
      if (!streetAddress) {
        try {
          const nominatimRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
            { headers: { 'User-Agent': 'CasaGrown/1.0' } }
          )
          const nominatimData = await nominatimRes.json()
          if (nominatimData && nominatimData.address) {
            const addr = nominatimData.address
            const houseNumber = addr.house_number || ''
            const road = addr.road || addr.street || ''
            streetAddress = [houseNumber, road].filter(Boolean).join(' ') || addr.suburb || addr.neighbourhood || 'Your Location'
            postalCode = addr.postcode || ''
            console.log('Nominatim reverse geocode result:', streetAddress, postalCode)
          }
        } catch (nominatimErr) {
          console.warn('Nominatim reverse geocoding also failed:', nominatimErr)
          streetAddress = 'Your Location'
        }
      }
      
      // Fallback if still empty
      if (!streetAddress) {
        streetAddress = 'Your Location'
      }
      
      // Update address fields with geocoded values
      setAddress(streetAddress)
      setZip(postalCode)
      
      // Resolve community from location
      const result = await resolveLocation(latitude, longitude)
      if (result) {
        console.log('Community Resolved from Location:', result.primary.name)
        setMatchData({
          name: result.primary.name,
          points: joinPoints
        })
        setIsMatched(true)
        updateData({
          address: streetAddress,
          zipCode: postalCode,
          community: {
            h3Index: result.primary.h3_index,
            name: result.primary.name,
            points: joinPoints
          },
          nearbyCommunities: result.neighbors.map(n => n.h3_index)
        })
      } else {
        setErrorMessage('Could not find a community at your location.')
      }
    } catch (err: any) {
      console.error('Geolocation error:', err)
      setErrorMessage(err.message || 'Could not get your location. Please enter your address manually.')
    } finally {
      setGettingLocation(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <YStack flex={1} paddingHorizontal="$4" paddingBottom="$8" alignItems="center">
        <YStack 
            width="100%" 
            maxWidth={600} 
            backgroundColor="white" 
            borderRadius={borderRadius['2xl']} 
            padding="$6" 
            gap="$6"
            shadowColor={shadows.lg.color}
            shadowOffset={shadows.lg.offset}
            shadowOpacity={0.1}
            shadowRadius={shadows.lg.radius}
        >
            <YStack gap="$2" alignItems="center">
                <Text fontSize="$7" fontWeight="700" color={colors.gray[900]} textAlign="center">
                    {t('profileWizard.community.title')}
                </Text>
                <Text fontSize="$4" color={colors.gray[500]} textAlign="center">
                    {t('profileWizard.community.subtitle')}
                </Text>
            </YStack>

            <YStack gap="$5">
                {/* How it works banner */}
                {!isMatched ? (
                    <YStack 
                        backgroundColor="white" 
                        padding="$4" 
                        borderRadius={borderRadius.lg} 
                        borderWidth={1} 
                        borderColor={colors.gray[200]}
                        gap="$2"
                    >
                        <XStack gap="$2" alignItems="center">
                            <MapPin size={16} color={colors.green[600]} />
                            <Text fontSize="$3" color={colors.gray[800]} fontWeight="700">
                                {t('profileWizard.community.howItWorksTitle')}
                            </Text>
                        </XStack>
                        <Text fontSize="$3" color={colors.gray[600]} lineHeight={20}>
                            {t('profileWizard.community.howItWorksText')}
                        </Text>
                    </YStack>
                ) : null}

                {/* Form Section */}
                <YStack gap="$4" opacity={isMatched ? 0.6 : 1} pointerEvents={isMatched ? 'none' : 'auto'}>
                    <Button 
                        backgroundColor="white"
                        borderColor={colors.green[600]}
                        borderWidth={1}
                        height="$5"
                        icon={gettingLocation ? <Spinner size="small" color={colors.green[600]} /> : <Navigation size={18} color={colors.green[600]} />}
                        onPress={handleUseCurrentLocation}
                        disabled={gettingLocation || resolving}
                        hoverStyle={{ backgroundColor: colors.green[50] }}
                    >
                        <Text color={colors.green[700]} fontWeight="600">
                            {gettingLocation ? t('profileWizard.community.gettingLocation') || 'Getting Location...' : t('profileWizard.community.useCurrentLocation')}
                        </Text>
                    </Button>

                    <XStack alignItems="center" gap="$4">
                        <Separator borderColor={colors.gray[200]} />
                        <Text color={colors.gray[400]} fontSize="$3" fontWeight="500">{t('profileWizard.community.or')}</Text>
                        <Separator borderColor={colors.gray[200]} />
                    </XStack>
                    
                    <YStack gap="$4">
                        {/* Street Address - Full Width */}
                        <YStack gap="$2">
                             <Label color={colors.gray[700]} fontWeight="600">{t('profileWizard.community.streetLabel')}</Label>
                             <Input 
                                value={address} 
                                onChangeText={handleAddressChange}
                                placeholder="123 Main St, Apt 4B"
                                size="$4"
                                borderWidth={1}
                                borderColor={colors.gray[300]}
                                focusStyle={{ borderColor: colors.green[500] }}
                                backgroundColor={colors.gray[50]}
                                fontWeight="400"
                            />
                        </YStack>

                        {/* Zip Code + Country Row */}
                        <XStack gap="$3">
                            <YStack gap="$2" width={140}>
                                <Label color={colors.gray[700]} fontWeight="600">{t('profileWizard.community.zipLabel')}</Label>
                                <Input 
                                    value={zip} 
                                    onChangeText={handleZipChange}
                                    placeholder="Zip Code" 
                                    keyboardType="numeric"
                                    size="$4"
                                    borderWidth={1}
                                    borderColor={colors.gray[300]}
                                    focusStyle={{ borderColor: colors.green[500] }}
                                    backgroundColor={colors.gray[50]}
                                    fontWeight="400"
                                />
                            </YStack>
                            <YStack gap="$2" flex={1}>
                                 <Label color={colors.gray[700]} fontWeight="600">{t('profileWizard.community.countryLabel')}</Label>
                                 <Button
                                    backgroundColor={colors.gray[100]}
                                    borderWidth={1}
                                    borderColor={colors.gray[300]}
                                    justifyContent="space-between"
                                    iconAfter={<ChevronDown size={20} color={colors.gray[400]} />}
                                    size="$4"
                                    disabled={true}
                                    opacity={0.7}
                                    cursor="not-allowed"
                                 >
                                    <Text color={colors.gray[700]} fontSize="$3" fontWeight="400">United States</Text>
                                 </Button>
                            </YStack>
                        </XStack>
                    </YStack>
                </YStack>

                {/* Match Result - Appears below form */}
                {isMatched && matchData ? (
                    <YStack 
                        gap="$4" 
                        borderTopWidth={1}
                        borderTopColor={colors.gray[200]}
                        paddingTop="$6"
                        width="100%"
                    >
                        <YStack 
                            backgroundColor={colors.green[50]} 
                            padding="$4" 
                            borderRadius={borderRadius.lg} 
                            borderWidth={1} 
                            borderColor={colors.green[200]}
                            gap="$3"
                        >
                            <XStack gap="$3" alignItems="flex-start">
                                    <YStack backgroundColor={colors.green[100]} padding="$2" borderRadius="$full">
                                    <Check size={20} color={colors.green[600]} />
                                    </YStack>
                                    <YStack gap="$1" flex={1}>
                                    <Text fontSize="$3" color={colors.gray[600]} fontWeight="600">{t('profileWizard.community.foundTitle')}</Text>
                                    <Text fontSize="$6" fontWeight="800" color={colors.green[700]}>{matchData.name}</Text>
                                    <Text fontSize="$3" color={colors.gray[600]} lineHeight={20}>
                                        {t('profileWizard.community.foundSubtitle', { name: matchData.name })}
                                    </Text>
                                    </YStack>
                            </XStack>
                            
                            {/* Change Address Button */}
                            <Button
                                backgroundColor="transparent"
                                borderColor={colors.gray[300]}
                                borderWidth={1}
                                size="$3"
                                onPress={() => {
                                    setIsMatched(false);
                                    setMatchData(null);
                                    // Clear community from wizard data so user can re-search
                                    updateData({
                                      community: undefined,
                                      nearbyCommunities: undefined
                                    });
                                }}
                                hoverStyle={{ backgroundColor: colors.gray[100] }}
                            >
                                <Text color={colors.gray[600]} fontSize="$3">Change Address</Text>
                            </Button>
                        </YStack>

                        <YStack 
                            backgroundColor={colors.green[600]} 
                            padding="$4" 
                            borderRadius={borderRadius.lg} 
                            alignItems="center" 
                            gap="$2"
                            shadowColor={shadows.md.color}
                            shadowRadius={shadows.md.radius}
                        >
                            <XStack gap="$2" alignItems="center">
                                <Calendar size={20} color="white" />
                                <Text fontSize="$4" color="white" fontWeight="700">
                                    {t('profileWizard.community.earnPoints', { count: matchData.points })}
                                </Text>
                            </XStack>
                            <Text color="white" textAlign="center" opacity={0.9} fontSize="$3">
                                {t('profileWizard.community.completeProfile')}
                            </Text>
                        </YStack>
                    </YStack>
                ) : null}
            </YStack>

            {/* Error Message */}
            {errorMessage ? (
                <YStack 
                    backgroundColor="#FEE2E2"
                    padding="$3" 
                    borderRadius={borderRadius.lg}
                    borderWidth={1}
                    borderColor="#FECACA"
                >
                    <Text color="#DC2626" fontSize="$3" textAlign="center">
                        {errorMessage}
                    </Text>
                </YStack>
            ) : null}

            <XStack gap="$3" paddingTop="$4">
               <Button 
                flex={1} 
                backgroundColor="white" 
                borderColor={colors.gray[200]} 
                borderWidth={1}
                height="$5"
                onPress={prevStep}
                hoverStyle={{ backgroundColor: colors.gray[50] }}
               >
                 <Text color={colors.gray[700]}>{t('profileWizard.common.back')}</Text>
               </Button>
               <Button 
                 flex={1} 
                 backgroundColor={(isMatched || (address && zip)) ? colors.green[600] : colors.gray[800]} 
                 height="$5"
                 // If matched, go next. If not matched, search.
                 onPress={isMatched ? nextStep : handleSearch}
                 disabled={(!address || !zip) || resolving}
                 opacity={(!address || !zip || resolving) ? 0.5 : 1}
                 hoverStyle={{ backgroundColor: colors.green[700] }}
                 icon={resolving ? <Spinner color="white" /> : undefined}
               >
                 {!resolving ? (
                   <Text color="white" fontWeight="600">
                     {isMatched ? t('profileWizard.common.continue') : t('profileWizard.community.findCommunity')}
                   </Text>
                 ) : null}
               </Button>
            </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  )
}
