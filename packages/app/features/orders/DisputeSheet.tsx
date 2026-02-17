/**
 * DisputeSheet — File a dispute against an order delivery
 *
 * Buyer enters a reason and optionally takes a proof photo (geotagged).
 */

import React, { useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Platform, TextInput, TouchableOpacity, Image, Alert, ScrollView } from 'react-native'
import {
  X,
  AlertTriangle,
  Camera,
  MapPin,
  Clock,
} from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'

// =============================================================================
// Props
// =============================================================================

interface DisputeSheetProps {
  visible: boolean
  orderId: string
  onClose: () => void
  onSubmit: (data: {
    reason: string
    photoUri?: string
    location?: { latitude: number; longitude: number }
    timestamp?: string
  }) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

// =============================================================================
// Component
// =============================================================================

export function DisputeSheet({
  visible,
  orderId,
  onClose,
  onSubmit,
  t,
}: DisputeSheetProps) {
  const [reason, setReason] = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [location, setLocation] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [timestamp, setTimestamp] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const reset = useCallback(() => {
    setReason('')
    setPhotoUri(null)
    setLocation(null)
    setTimestamp(null)
  }, [])

  const handleCaptureProof = useCallback(async () => {
    setCapturing(true)
    try {
      // 1. Capture photo first — don't let location failure block this
      let capturedUri: string | null = null
      if (Platform.OS === 'web') {
        capturedUri = 'https://via.placeholder.com/400x300?text=Dispute+Proof'
      } else {
        const { status: camStatus } =
          await ImagePicker.requestCameraPermissionsAsync()
        if (camStatus !== 'granted') {
          Alert.alert(t('orders.dispute.cameraRequired'))
          setCapturing(false)
          return
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        })

        if (result.canceled || result.assets.length === 0) {
          setCapturing(false)
          return
        }
        capturedUri = result.assets[0]!.uri
      }

      setPhotoUri(capturedUri)

      // 2. Try to get location (optional — don't fail if unavailable)
      try {
        const { status: locStatus } =
          await Location.requestForegroundPermissionsAsync()
        if (locStatus === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          })
        }
      } catch (locErr) {
        console.warn('Location unavailable (not critical):', locErr)
        // Location is optional for dispute proof — proceed without it
      }

      setTimestamp(new Date().toISOString())
    } catch (err) {
      console.error('Dispute proof error:', err)
      Alert.alert('Error', 'Failed to capture proof photo. Please try again.')
    } finally {
      setCapturing(false)
    }
  }, [t])

  const handleSubmit = useCallback(() => {
    if (!reason.trim()) {
      Alert.alert(t('orders.dispute.reasonRequired'))
      return
    }
    setLoading(true)
    onSubmit({
      reason: reason.trim(),
      photoUri: photoUri ?? undefined,
      location: location ?? undefined,
      timestamp: timestamp ?? undefined,
    })
    reset()
    onClose()
    setLoading(false)
  }, [reason, photoUri, location, timestamp, onSubmit, onClose, reset, t])

  if (!visible) return null

  return (
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
            <XStack alignItems="center" gap="$2">
              <AlertTriangle size={20} color={colors.red[600]} />
              <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
                {t('orders.dispute.title')}
              </Text>
            </XStack>
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

          {/* Warning */}
          <XStack
            backgroundColor={colors.red[50]}
            borderWidth={1}
            borderColor={colors.red[200]}
            borderRadius={borderRadius.md}
            padding="$3"
            gap="$2"
            alignItems="center"
          >
            <AlertTriangle size={16} color={colors.red[600]} />
            <Text fontSize={12} color={colors.red[700]} flex={1}>
              {t('orders.dispute.warning')}
            </Text>
          </XStack>

          {/* Reason */}
          <YStack gap="$2">
            <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
              {t('orders.dispute.reason')} <Text color="#ef4444">*</Text>
            </Text>
            <XStack
              borderWidth={1}
              borderColor={colors.gray[300]}
              borderRadius={borderRadius.md}
              padding="$3"
            >
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: colors.gray[900],
                  minHeight: 80,
                  textAlignVertical: 'top',
                  fontFamily:
                    Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter',
                }}
                placeholder={t('orders.dispute.reasonPlaceholder')}
                placeholderTextColor={colors.gray[400]}
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={4}
              />
            </XStack>
          </YStack>

          {/* Proof Photo (Optional) */}
          <YStack gap="$2">
            <Text fontSize={14} fontWeight="600" color={colors.gray[700]}>
              {t('orders.dispute.proofPhoto')}
            </Text>
            {!photoUri ? (
              <TouchableOpacity
                onPress={handleCaptureProof}
                disabled={capturing}
                activeOpacity={0.7}
                style={{
                  borderWidth: 2,
                  borderColor: colors.gray[300],
                  borderStyle: 'dashed',
                  borderRadius: 12,
                  paddingVertical: 24,
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: colors.gray[50],
                }}
              >
                {capturing ? (
                  <Spinner size="small" color={colors.gray[500]} />
                ) : (
                  <>
                    <Camera size={24} color={colors.gray[500]} />
                    <Text fontSize={13} color={colors.gray[500]}>
                      {t('orders.dispute.addPhoto')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <YStack gap="$2">
                <Image
                  source={{ uri: photoUri }}
                  style={{
                    width: '100%',
                    height: 160,
                    borderRadius: 12,
                  }}
                  resizeMode="cover"
                />
                {location && (
                  <XStack alignItems="center" gap="$1.5">
                    <MapPin size={12} color={colors.gray[500]} />
                    <Text fontSize={11} color={colors.gray[500]}>
                      {location.latitude.toFixed(5)},{' '}
                      {location.longitude.toFixed(5)}
                    </Text>
                  </XStack>
                )}
                <TouchableOpacity
                  onPress={() => {
                    setPhotoUri(null)
                    setLocation(null)
                    setTimestamp(null)
                  }}
                  style={{ alignSelf: 'center', paddingVertical: 4 }}
                >
                  <Text
                    fontSize={12}
                    fontWeight="600"
                    color={colors.red[600]}
                  >
                    {t('orders.dispute.removePhoto')}
                  </Text>
                </TouchableOpacity>
              </YStack>
            )}
          </YStack>

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
                reason.trim() ? colors.red[600] : colors.gray[300]
              }
              paddingVertical="$2.5"
              borderRadius={borderRadius.md}
              pressStyle={
                reason.trim()
                  ? { backgroundColor: colors.red[700] }
                  : undefined
              }
              disabled={!reason.trim() || loading}
              onPress={handleSubmit}
            >
              {loading ? (
                <Spinner size="small" color="white" />
              ) : (
                <Text color="white" fontWeight="600" fontSize={15}>
                  {t('orders.dispute.submit')}
                </Text>
              )}
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
