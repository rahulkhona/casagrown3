/**
 * MediaPickerSection — Shared UI for media previews and pick/camera buttons
 *
 * Extracted from SellForm / BuyForm / GeneralForm to eliminate duplication.
 * Works with the useMediaAssets hook for state management.
 */

import React from 'react'
import {
  YStack,
  XStack,
  Text,
  Button,
  Label,
} from 'tamagui'
import {
  Camera,
  Video,
  Trash2,
  Image as ImageIcon,
} from '@tamagui/lucide-icons'
import { Platform, Image } from 'react-native'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius } from '../../design-tokens'
import type { UseMediaAssetsReturn } from './useMediaAssets'
import { NativeVideoPreview } from './NativeVideoPreview'

// Platform-conditional imports
const WebCameraModal = Platform.OS === 'web'
  ? require('./WebCameraModal').WebCameraModal
  : null

export interface MediaPickerSectionProps {
  media: UseMediaAssetsReturn
  /** Optional section label override */
  label?: string
}

export function MediaPickerSection({ media, label }: MediaPickerSectionProps) {
  const { t } = useTranslation()
  const {
    mediaAssets,
    cameraMode,
    setCameraMode,
    fileInputRef,
    handleWebFileChange,
    handleWebCameraCapture,
    takePhoto,
    pickFromGallery,
    recordVideo,
    removeMedia,
  } = media

  return (
    <YStack
      backgroundColor="white"
      borderRadius={borderRadius.lg}
      padding="$4"
      gap="$3"
      borderWidth={1}
      borderColor={colors.neutral[200]}
    >
      <Label fontWeight="600" color={colors.neutral[900]}>
        {label || t('createPost.fields.media')}
      </Label>

      {/* Preview thumbnails */}
      {mediaAssets.length > 0 && (
        <XStack gap="$2" flexWrap="wrap">
          {mediaAssets.map((asset, index) => (
            <YStack
              key={`media-${index}`}
              width={140}
              height={140}
              borderRadius={borderRadius.md}
              overflow="hidden"
              position="relative"
            >
              {Platform.OS === 'web' && asset.type === 'video' ? (
                <video
                  src={asset.uri}
                  style={{ width: 140, height: 140, borderRadius: 8, objectFit: 'cover' as any }}
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : Platform.OS === 'web' ? (
                <img
                  src={asset.uri}
                  style={{ width: 140, height: 140, borderRadius: 8, objectFit: 'cover' as any }}
                  alt=""
                />
              ) : asset.type === 'video' ? (
                <NativeVideoPreview uri={asset.uri} />
              ) : (
                <Image
                  source={{ uri: asset.uri }}
                  style={{ width: 140, height: 140 }}
                  resizeMode="cover"
                />
              )}
              {/* Remove button */}
              <Button
                unstyled
                position="absolute"
                top={4}
                right={4}
                width={24}
                height={24}
                borderRadius={12}
                backgroundColor="rgba(0,0,0,0.6)"
                alignItems="center"
                justifyContent="center"
                onPress={() => removeMedia(index)}
              >
                <Trash2 size={14} color="white" />
              </Button>
              {/* Type badge */}
              {asset.type === 'video' && (
                <YStack
                  position="absolute"
                  bottom={4}
                  left={4}
                  backgroundColor="rgba(239,68,68,0.85)"
                  borderRadius={6}
                  paddingHorizontal={8}
                  paddingVertical={3}
                >
                  <Text color="white" fontSize={11} fontWeight="700">
                    {t('createPost.media.videoBadge')}
                  </Text>
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
              <Text fontSize="$2" color={colors.primary[700]} fontWeight="500">
                {t('createPost.media.takePhoto')}
              </Text>
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
              <Text fontSize="$2" color={colors.primary[700]} fontWeight="500">
                {t('createPost.media.recordVideo')}
              </Text>
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
              <Text fontSize="$2" color={colors.neutral[700]} fontWeight="500">
                {t('createPost.media.uploadPhotoVideo')}
              </Text>
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
            <Text fontSize="$2" color={colors.primary[700]} fontWeight="500">
              {t('createPost.media.takePhoto')}
            </Text>
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
            <Text fontSize="$2" color={colors.primary[700]} fontWeight="500">
              {t('createPost.media.recordVideo')}
            </Text>
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
            <Text fontSize="$2" color={colors.neutral[700]} fontWeight="500">
              {t('createPost.media.uploadPhotoVideo')}
            </Text>
          </Button>
        </XStack>
      )}
    </YStack>
  )
}
