import React, { useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Platform, TouchableOpacity, Image, Alert, ScrollView } from 'react-native'
import {
  X,
  Camera,
  MapPin,
  Clock,
  CheckCircle,
  Image as LucideImage,
} from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'

// Conditionally load WebCameraModal on web only
const WebCameraModal = Platform.OS === 'web'
  ? require('../create-post/WebCameraModal').WebCameraModal
  : null

// =============================================================================
// Props
// =============================================================================

interface DeliveryProofSheetProps {
  visible: boolean
  orderId: string
  onClose: () => void
  onSubmit: (data: {
    photoUri: string
    location?: { latitude: number; longitude: number }
    timestamp: string
  }) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

// =============================================================================
// Component
// =============================================================================

export function DeliveryProofSheet({
  visible,
  orderId,
  onClose,
  onSubmit,
  t,
}: DeliveryProofSheetProps) {
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [location, setLocation] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [timestamp, setTimestamp] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [webCameraOpen, setWebCameraOpen] = useState(false)

  const reset = useCallback(() => {
    setPhotoUri(null)
    setLocation(null)
    setTimestamp(null)
    setWebCameraOpen(false)
  }, [])

  // Capture geolocation (used by both web and native flows)
  // Returns null if location is unavailable — this is gracefully handled
  const captureLocation = useCallback(async () => {
    try {
      const { status: locStatus } =
        await Location.requestForegroundPermissionsAsync()
      if (locStatus !== 'granted') {
        console.warn('Location permission not granted')
        return null
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })
      return {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      }
    } catch (err) {
      console.warn('Location unavailable (not critical):', err)
      return null
    }
  }, [])

  const handleCapture = useCallback(async () => {
    setCapturing(true)
    try {
      if (Platform.OS === 'web') {
        // On web, open the webcam modal
        setWebCameraOpen(true)
        setCapturing(false)
        return
      }

      // Native: launch camera first, then try location
      const { status: camStatus } =
        await ImagePicker.requestCameraPermissionsAsync()
      if (camStatus !== 'granted') {
        Alert.alert(
          t('orders.delivery.cameraRequired'),
          t('orders.delivery.cameraRequiredMessage'),
        )
        setCapturing(false)
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        exif: true,
      })

      if (result.canceled || result.assets.length === 0) {
        setCapturing(false)
        return
      }

      setPhotoUri(result.assets[0]!.uri)

      // Get location after photo (don't block camera on location failure)
      const loc = await captureLocation()
      if (loc) {
        setLocation(loc)
      }
      setTimestamp(new Date().toISOString())
    } catch (err) {
      console.error('Delivery proof capture error:', err)
      Alert.alert(t('orders.delivery.captureError'))
    } finally {
      setCapturing(false)
    }
  }, [t, captureLocation])

  // Callback when WebCameraModal captures a photo
  const handleWebCameraCapture = useCallback(async (asset: { uri: string; type: 'image' | 'video'; fileName: string }) => {
    setWebCameraOpen(false)
    setCapturing(true)
    try {
      const loc = await captureLocation()
      if (!loc) {
        setCapturing(false)
        return
      }
      setPhotoUri(asset.uri)
      setLocation(loc)
      setTimestamp(new Date().toISOString())
    } catch (err) {
      console.error('Delivery proof capture error:', err)
    } finally {
      setCapturing(false)
    }
  }, [captureLocation])

  const handleSubmit = useCallback(() => {
    if (!photoUri || !timestamp) return
    onSubmit({ photoUri, location: location ?? undefined, timestamp })
    reset()
    onClose()
  }, [photoUri, location, timestamp, onSubmit, onClose, reset])

  if (!visible) return null

  return (
    <>
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="rgba(0,0,0,0.5)"
      justifyContent="center"
      alignItems="center"
      zIndex={100}
      padding="$4"
    >
      <ScrollView
        style={{ width: '100%', maxWidth: 480, maxHeight: '90%' }}
        contentContainerStyle={{ flexGrow: 0 }}
        bounces={false}
      >
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.lg}
          padding="$5"
          width="100%"
          gap="$4"
          shadowColor={shadows.sm.color}
          shadowOffset={shadows.sm.offset}
          shadowOpacity={0.1}
          shadowRadius={shadows.sm.radius}
        >
          {/* Header */}
          <XStack justifyContent="space-between" alignItems="center">
            <YStack gap="$1">
              <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
                {t('orders.delivery.title')}
              </Text>
              <Text fontSize={13} color={colors.gray[600]}>
                {t('orders.delivery.subtitle')}
              </Text>
            </YStack>
            <TouchableOpacity
              onPress={() => {
                reset()
                onClose()
              }}
              style={{
                padding: 8,
                borderRadius: 20,
                backgroundColor: colors.gray[100],
              }}
              activeOpacity={0.7}
            >
              <X size={18} color={colors.gray[600]} />
            </TouchableOpacity>
          </XStack>

          {/* Capture Area */}
          {!photoUri ? (
            <TouchableOpacity
              onPress={handleCapture}
              disabled={capturing}
              activeOpacity={0.7}
              style={{
                borderWidth: 2,
                borderColor: colors.green[300],
                borderStyle: 'dashed',
                borderRadius: 12,
                paddingVertical: 40,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                backgroundColor: colors.green[50],
              }}
            >
              {capturing ? (
                <Spinner size="large" color={colors.green[600]} />
              ) : (
                <>
                  <YStack
                    width={56}
                    height={56}
                    borderRadius={28}
                    backgroundColor={colors.green[100]}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Camera size={28} color={colors.green[700]} />
                  </YStack>
                  <Text
                    fontSize={14}
                    fontWeight="600"
                    color={colors.green[700]}
                  >
                    {t('orders.delivery.takePhoto')}
                  </Text>
                  <Text fontSize={12} color={colors.gray[500]}>
                    {t('orders.delivery.autoGeotag')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <YStack gap="$3">
              {/* Photo preview */}
              <YStack borderRadius={12} overflow="hidden">
                <Image
                  source={{ uri: photoUri }}
                  style={{ width: '100%', height: 200, borderRadius: 12 }}
                  resizeMode="cover"
                />
              </YStack>

              {/* Geo + Time tags */}
              <YStack
                backgroundColor={colors.gray[50]}
                borderRadius={borderRadius.md}
                padding="$3"
                gap="$2"
              >
                {location && (
                  <XStack alignItems="center" gap="$2">
                    <MapPin size={14} color={colors.green[600]} />
                    <Text fontSize={12} color={colors.gray[700]}>
                      {location.latitude.toFixed(6)},{' '}
                      {location.longitude.toFixed(6)}
                    </Text>
                  </XStack>
                )}
                {timestamp && (
                  <XStack alignItems="center" gap="$2">
                    <Clock size={14} color={colors.green[600]} />
                    <Text fontSize={12} color={colors.gray[700]}>
                      {new Date(timestamp).toLocaleString()}
                    </Text>
                  </XStack>
                )}
              </YStack>

              {/* Retake */}
              <TouchableOpacity
                onPress={() => {
                  reset()
                  handleCapture()
                }}
                activeOpacity={0.7}
                style={{
                  alignSelf: 'center',
                  paddingVertical: 8,
                }}
              >
                <Text
                  fontSize={13}
                  fontWeight="600"
                  color={colors.green[600]}
                >
                  {t('orders.delivery.retake')}
                </Text>
              </TouchableOpacity>
            </YStack>
          )}

          {/* Info Note */}
          <XStack
            backgroundColor="#eff6ff"
            borderWidth={1}
            borderColor="#bfdbfe"
            borderRadius={borderRadius.md}
            padding="$3"
            gap="$2"
            alignItems="center"
          >
            <MapPin size={16} color="#1d4ed8" />
            <Text fontSize={12} color="#1e40af" flex={1}>
              {t('orders.delivery.geotagNote')}
            </Text>
          </XStack>

          {/* Actions */}
          <XStack gap="$3">
            <Button
              flex={1}
              backgroundColor={colors.gray[100]}
              paddingVertical="$2.5"
              borderRadius={borderRadius.md}
              pressStyle={{ backgroundColor: colors.gray[200] }}
              onPress={() => {
                reset()
                onClose()
              }}
            >
              <Text color={colors.gray[700]} fontWeight="600" fontSize={15}>
                {t('common.cancel')}
              </Text>
            </Button>
            <Button
              flex={1}
              backgroundColor={
                photoUri ? colors.green[600] : colors.gray[300]
              }
              paddingVertical="$2.5"
              borderRadius={borderRadius.md}
              pressStyle={
                photoUri ? { backgroundColor: colors.green[700] } : undefined
              }
              disabled={!photoUri || loading}
              onPress={handleSubmit}
            >
              {loading ? (
                <Spinner size="small" color="white" />
              ) : (
                <Text color="white" fontWeight="600" fontSize={15}>
                  {t('orders.delivery.confirm')}
                </Text>
              )}
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </YStack>

    {/* Web camera modal — rendered via portal outside the sheet */}
    {Platform.OS === 'web' && webCameraOpen && WebCameraModal && (
      <WebCameraModal
        mode="photo"
        onCapture={handleWebCameraCapture}
        onClose={() => setWebCameraOpen(false)}
      />
    )}
    </>
  )
}
