/**
 * FeedbackSubmitScreen — Shared form for submitting bug reports and feature requests.
 *
 * Supports type selection (bug, feature, support), title, description, and image uploads.
 * Works on iOS, Android, and Web.
 */

import { useState } from 'react'
import { YStack, XStack, Text, Button, Input, TextArea, Card, Spinner, Image, useMedia } from 'tamagui'
import { useRouter } from 'solito/navigation'
import { colors } from '../../design-tokens'
import { ArrowLeft, Bug, Lightbulb, Headphones, Lock, Camera, X } from '@tamagui/lucide-icons'
import { createTicket, FeedbackType } from './feedback-service'
import { uploadFeedbackImage } from './feedback-media-upload'
import { useAuth } from '../auth/auth-hook'
import * as ImagePicker from 'expo-image-picker'
import { Platform, TouchableOpacity, Alert } from 'react-native'
import { supabase } from '../../utils/supabase'
import { useTranslation } from 'react-i18next'
import { showPermissionDeniedAlert } from '../../utils/permissions'

interface SelectedImage {
  uri: string
  fileName: string
}

export function FeedbackSubmitScreen({ initialType }: { initialType?: 'bug' | 'feature' | 'support' }) {
  const router = useRouter()
  const { t } = useTranslation()
  const media = useMedia()
  const isDesktop = !media.sm
  const { user } = useAuth()

  const [type, setType] = useState<'bug' | 'feature' | 'support'>(initialType || 'bug')
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<SelectedImage[]>([])

  const typeToEnum: Record<string, FeedbackType> = {
    bug: 'bug_report',
    feature: 'feature_request',
    support: 'support_request',
  }

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: true,
      })
      if (!result.canceled && result.assets.length > 0) {
        const newImages = result.assets.map(a => ({
          uri: a.uri,
          fileName: a.fileName || `image_${Date.now()}.jpg`,
        }))
        setImages(prev => [...prev, ...newImages])
      }
    } catch (err) {
      console.error('Image picker error:', err)
    }
  }

  const handleTakePhoto = async () => {
    if (Platform.OS === 'web') return
    try {
      const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync()
      if (!status || status !== 'granted') {
        showPermissionDeniedAlert('camera', t, canAskAgain)
        return
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      })
      if (!result.canceled && result.assets.length > 0) {
        const newImages = result.assets.map(a => ({
          uri: a.uri,
          fileName: a.fileName || `photo_${Date.now()}.jpg`,
        }))
        setImages(prev => [...prev, ...newImages])
      }
    } catch (err) {
      console.error('Camera error:', err)
    }
  }

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !user) return
    setLoading(true)
    try {
      // Create the ticket first (without files — we'll link them manually)
      const result = await createTicket({
        title: title.trim(),
        description: description.trim(),
        type: typeToEnum[type] || 'bug_report',
        authorId: user.id,
      })

      if (!result) {
        Alert.alert('Error', 'Failed to submit feedback. Please try again.')
        setLoading(false)
        return
      }

      // Upload images and link to ticket
      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          try {
            const { mediaId } = await uploadFeedbackImage(
              user.id,
              images[i].uri,
              images[i].fileName,
            )
            await supabase.from('feedback_media').insert({
              feedback_id: result.id,
              media_id: mediaId,
              display_order: i,
            })
          } catch (err) {
            console.error('Image upload failed:', err)
          }
        }
      }

      setLoading(false)
      router.replace('/feedback')
    } catch (err: any) {
      console.error('Submit error:', err)
      Alert.alert('Error', err?.message || 'Failed to submit feedback. Please try again.')
      setLoading(false)
    }
  }

  return (
    <YStack flex={1} backgroundColor={colors.green[50]} padding={isDesktop ? '$4' : '$3'}>
      <YStack maxWidth={600} width="100%" gap={isDesktop ? '$4' : '$3'} alignSelf="center">
        <Button
          icon={ArrowLeft}
          chromeless
          onPress={() => router.back()}
          alignSelf="flex-start"
          paddingLeft="$0"
        >
          <Text color={colors.gray[600]}>Cancel</Text>
        </Button>

        <Text fontSize={isDesktop ? '$8' : '$6'} fontWeight="700" color={colors.green[800]}>
          {initialType === 'bug' ? 'Report a Bug'
            : initialType === 'feature' ? 'Request a Feature'
            : initialType === 'support' ? 'Support Request'
            : 'Submit Feedback'}
        </Text>
        <Text fontSize={15} fontWeight="400" color={colors.gray[600]} lineHeight={24}>
          {initialType === 'bug' ? 'Tell us what went wrong so we can fix it.'
            : initialType === 'feature' ? 'Suggest an improvement or new feature.'
            : initialType === 'support' ? 'Get help from the CasaGrown team.'
            : 'Found a bug? Have a great idea? Need help? Let us know!'}
        </Text>

        <Card padding="$5" borderWidth={1} borderColor={colors.gray[200]} backgroundColor="white" borderRadius="$4" gap="$4">
          {/* Type Selector — hidden when type preset */}
          {!initialType && (
            <YStack gap="$2">
              <Text fontWeight="500" color={colors.gray[700]}>Feedback Type</Text>
              <XStack gap="$2" flexWrap="wrap">
                <Button
                  flex={1}
                  size="$4"
                  backgroundColor={type === 'bug' ? colors.red[100] : colors.gray[50]}
                  borderColor={type === 'bug' ? colors.red[500] : 'transparent'}
                  borderWidth={2}
                  onPress={() => setType('bug')}
                  icon={<Bug color={type === 'bug' ? colors.red[600] : colors.gray[500]} />}
                >
                  <Text color={type === 'bug' ? colors.red[800] : colors.gray[600]}>Bug Report</Text>
                </Button>
                <Button
                  flex={1}
                  size="$4"
                  backgroundColor={type === 'feature' ? colors.amber[100] : colors.gray[50]}
                  borderColor={type === 'feature' ? colors.amber[500] : 'transparent'}
                  borderWidth={2}
                  onPress={() => setType('feature')}
                  icon={<Lightbulb color={type === 'feature' ? colors.amber[600] : colors.gray[500]} />}
                >
                  <Text color={type === 'feature' ? colors.amber[700] : colors.gray[600]}>Feature Request</Text>
                </Button>
                <Button
                  flex={1}
                  size="$4"
                  backgroundColor={type === 'support' ? colors.blue[100] : colors.gray[50]}
                  borderColor={type === 'support' ? colors.blue[600] : 'transparent'}
                  borderWidth={2}
                  onPress={() => setType('support')}
                  icon={<Headphones color={type === 'support' ? colors.blue[600] : colors.gray[500]} />}
                >
                  <Text color={type === 'support' ? colors.blue[700] : colors.gray[600]}>Support</Text>
                </Button>
              </XStack>
              {type === 'support' && (
                <XStack backgroundColor={colors.blue[100]} padding="$3" borderRadius="$3" gap="$2" alignItems="center">
                  <Lock size={14} color={colors.blue[600]} />
                  <Text fontSize="$2" color={colors.blue[700]} fontWeight="500" flex={1}>This ticket is private — only you and CasaGrown staff can see it.</Text>
                </XStack>
              )}
            </YStack>
          )}

          {initialType === 'support' && (
            <XStack backgroundColor={colors.blue[100]} padding="$3" borderRadius="$3" gap="$2" alignItems="center">
              <Lock size={14} color={colors.blue[600]} />
              <Text fontSize="$2" color={colors.blue[700]} fontWeight="500" flex={1}>This ticket is private — only you and CasaGrown staff can see it.</Text>
            </XStack>
          )}

          {/* Title */}
          <YStack gap="$2">
            <Text fontWeight="500" color={colors.gray[700]}>Title</Text>
            <Input
              placeholder="Short summary..."
              size="$4"
              borderRadius="$4"
              borderWidth={1}
              borderColor={colors.gray[300]}
              fontWeight="400"
              value={title}
              onChangeText={setTitle}
            />
          </YStack>

          {/* Description */}
          <YStack gap="$2">
            <Text fontWeight="500" color={colors.gray[700]}>Description</Text>
            <TextArea
              placeholder="Describe the issue or idea in detail..."
              minHeight={150}
              fontSize={15}
              borderRadius="$4"
              borderWidth={1}
              borderColor={colors.gray[300]}
              padding="$3"
              value={description}
              onChangeText={setDescription}
            />
          </YStack>

          {/* Separator */}
          <YStack height={1} backgroundColor={colors.gray[200]} marginVertical="$1" />

          {/* Image Attachments */}
          <YStack
            gap="$3"
            padding="$3"
            backgroundColor={colors.gray[50]}
            borderRadius="$3"
            borderWidth={1}
            borderColor={colors.gray[200]}
          >
            <Text fontWeight="500" color={colors.gray[700]} fontSize={14}>
              Screenshots (optional)
            </Text>

            {images.length > 0 && (
              <XStack gap="$2" flexWrap="wrap">
                {images.map((img, i) => (
                  <YStack key={i} position="relative">
                    <Image
                      source={{ uri: img.uri }}
                      width={80}
                      height={80}
                      borderRadius={8}
                    />
                    <TouchableOpacity
                      onPress={() => setImages(images.filter((_, idx) => idx !== i))}
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: colors.red[500],
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <X size={12} color="white" />
                    </TouchableOpacity>
                  </YStack>
                ))}
              </XStack>
            )}

            <XStack gap="$2" flexWrap="wrap">
              {Platform.OS !== 'web' && (
                <Button
                  flex={1}
                  size="$4"
                  borderWidth={2}
                  borderColor={colors.green[300]}
                  borderStyle="dashed"
                  borderRadius="$3"
                  backgroundColor="white"
                  onPress={handleTakePhoto}
                  icon={<Camera size={20} color={colors.green[600]} />}
                >
                  <Text color={colors.green[700]} fontWeight="500" fontSize={13}>Take Photo</Text>
                </Button>
              )}
              <Button
                flex={1}
                size="$4"
                borderWidth={2}
                borderColor={colors.gray[300]}
                borderStyle="dashed"
                borderRadius="$3"
                backgroundColor="white"
                onPress={handlePickImage}
                icon={<Camera size={20} color={colors.gray[500]} />}
              >
                <Text color={colors.gray[600]} fontWeight="500" fontSize={13}>
                  {Platform.OS !== 'web' ? 'Gallery' : 'Add Images'}
                </Text>
              </Button>
            </XStack>
          </YStack>

          <Button
            marginTop="$4"
            size="$5"
            backgroundColor={title.trim() && description.trim() ? colors.green[600] : colors.gray[300]}
            onPress={handleSubmit}
            disabled={loading || !title.trim() || !description.trim()}
            borderRadius="$3"
          >
            {loading
              ? <Spinner color="white" />
              : <Text color="white" fontWeight="600">
                  {type === 'bug' ? 'Submit Bug Report'
                    : type === 'feature' ? 'Submit Feature Request'
                    : type === 'support' ? 'Submit Support Request'
                    : 'Submit'}
                </Text>
            }
          </Button>
        </Card>
      </YStack>
    </YStack>
  )
}
