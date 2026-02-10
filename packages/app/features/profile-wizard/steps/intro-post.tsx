import { YStack, XStack, Input, Button, Text, Label, Checkbox, TextArea, ScrollView, Spinner } from 'tamagui'
import { useRouter } from 'solito/navigation'
import { useWizard } from '../wizard-context'
import { useRef, useState } from 'react'

import { colors, shadows, borderRadius } from '../../../design-tokens'
import { Check, Camera, Upload, Plus, Trash, Video } from '@tamagui/lucide-icons'
import * as ImagePicker from 'expo-image-picker'
import { Image, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon } from '@tamagui/lucide-icons'

const WebCameraModal = Platform.OS === 'web'
  ? require('../../create-post/WebCameraModal').WebCameraModal
  : null

const PRODUCE_TAGS = [
  'Tomatoes', 'Lemons', 'Oranges', 'Avocados', 'Herbs', 
  'Lettuce', 'Peppers', 'Cucumbers', 'Zucchini', 'Strawberries', 
  'Basil', 'Mint', 'Rosemary', 'Carrots', 'Radishes'
]

import { useIncentiveRules } from '../utils/use-incentive-rules'

export const IntroPostStep = () => {
  const { t } = useTranslation()
  const { data, updateData, prevStep, saveProfile, loading } = useWizard()
  const router = useRouter()
  const { getPoints } = useIncentiveRules()
  
  const postPoints = getPoints('make_first_post', 50)

  const [intro, setIntro] = useState(data.introText)
  const [tags, setTags] = useState<string[]>(data.produceTags)
  const [customTag, setCustomTag] = useState('')

  // Web media state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameraMode, setCameraMode] = useState<'photo' | 'video' | null>(null)

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter(t => t !== tag))
    } else {
      setTags([...tags, tag])
    }
  }

  const addCustomTag = () => {
    if (customTag.trim() && !tags.includes(customTag.trim())) {
      setTags([...tags, customTag.trim()])
      setCustomTag('')
    }
  }

  const handleFinish = async () => {
    // Pass overrides directly to avoid React setState race condition
    // (updateData is async, but saveProfile needs the latest values immediately)
    const overrides = { 
        introText: intro,
        produceTags: tags,
    }
    updateData(overrides)
    
    // Save to backend with overrides so data is available immediately
    const success = await saveProfile(overrides)
    
    if (success) {
         // Redirect to Feed Page after successful onboarding
         router.replace('/feed')
    } else {
        console.error('Failed to save profile')
    }
  }

  const pickMedia = async () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click()
      return
    }
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (!result.canceled) {
      const asset = result.assets[0]
      const isVideo = asset.type === 'video' || (asset.uri && asset.uri.includes('video'))
      updateData({ mediaUri: asset.uri, mediaType: isVideo ? 'video' : 'image' })
    }
  }

  const takePhoto = async () => {
      if (Platform.OS === 'web') {
        setCameraMode('photo')
        return
      }
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
          return;
      }

      let result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
      });

      if (!result.canceled) {
          updateData({ mediaUri: result.assets[0].uri, mediaType: 'image' })
      }
  }

  const recordVideo = async () => {
      if (Platform.OS === 'web') {
        setCameraMode('video')
        return
      }
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
          return;
      }

      let result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['videos'],
          allowsEditing: false,
          videoMaxDuration: 60,
          videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });

      if (!result.canceled) {
          updateData({ mediaUri: result.assets[0].uri, mediaType: 'video' })
      }
  }

  function handleWebFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]!
    const url = URL.createObjectURL(file)
    const isVideo = file.type.startsWith('video')
    updateData({ mediaUri: url, mediaType: isVideo ? 'video' : 'image' })
    e.target.value = ''
  }

  function handleWebCameraCapture(asset: { uri: string; type: 'image' | 'video'; fileName: string }) {
    updateData({ mediaUri: asset.uri, mediaType: asset.type })
    setCameraMode(null)
  }

  const removeMedia = () => {
      updateData({ mediaUri: undefined, mediaType: undefined })
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
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
                <YStack backgroundColor={colors.green[600]} paddingHorizontal="$3" paddingVertical="$1.5" borderRadius="$full" marginBottom="$2">
                    <Text fontSize="$3" color="white" fontWeight="700">{t('profileWizard.intro.stepTitle')}</Text>
                </YStack>

                <YStack 
                    backgroundColor={colors.green[600]} 
                    padding="$4" 
                    borderRadius={borderRadius.lg} 
                    alignItems="center" 
                    width="100%"
                    gap="$2"
                >
                    <Text fontSize="$4" color="white" fontWeight="700">
                        {t('profileWizard.intro.pointsBannerTitle', { count: postPoints })}
                    </Text>
                    <Text color="white" textAlign="center" fontSize="$3" opacity={0.9}>{t('profileWizard.intro.pointsBannerText')}</Text>
                </YStack>

                <Text fontSize="$7" fontWeight="700" color={colors.gray[900]} textAlign="center" marginTop="$4">
                    {t('profileWizard.intro.title')}
                </Text>
                <Text fontSize="$4" color={colors.gray[500]} textAlign="center">
                    {t('profileWizard.intro.subtitle')}
                </Text>
            </YStack>

            {/* Profile User Card */}
            <XStack backgroundColor={colors.gray[50]} padding="$4" borderRadius={borderRadius.lg} alignItems="center" gap="$3" borderWidth={1} borderColor={colors.gray[200]}>
                <YStack width={48} height={48} borderRadius={24} backgroundColor={colors.green[600]} alignItems="center" justifyContent="center" overflow="hidden">
                    {data.avatar ? (
                        <Image source={{ uri: data.avatar }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                    ) : (
                        <Text color="white" fontWeight="bold" fontSize="$5">{data.name ? data.name[0].toUpperCase() : 'T'}</Text>
                    )}
                </YStack>
                <YStack>
                    <Text fontWeight="700" fontSize="$4" color={colors.gray[900]}>{data.name}</Text>
                    <Text fontSize="$3" color={colors.gray[500]}>{t('profileWizard.intro.newMember')}</Text>
                </YStack>
            </XStack>

            {/* Intro Form */}
            <YStack gap="$5">
                <YStack gap="$2">
                    <Label color={colors.gray[700]} fontWeight="600">{t('profileWizard.intro.introLabel')}</Label>
                    <TextArea 
                        value={intro}
                        onChangeText={setIntro}
                        placeholder={t('profileWizard.intro.introPlaceholder')}
                        numberOfLines={4}
                        backgroundColor="white"
                        borderWidth={1}
                        borderColor={colors.gray[300]}
                        focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
                        size="$4"
                        style={{ fontWeight: '400', textAlignVertical: 'top' } as any}
                    />
                    <Text fontSize="$2" color={colors.gray[400]} textAlign="right">{intro.length}/500</Text>
                </YStack>

                <YStack gap="$3">
                    <YStack>
                        <Label color={colors.gray[700]} fontWeight="600">{t('profileWizard.intro.produceLabel')}</Label>
                        <Text fontSize="$3" color={colors.gray[500]}>{t('profileWizard.intro.produceSubtitle')}</Text>
                    </YStack>
                    
                    <XStack flexWrap="wrap" gap="$2">
                        {PRODUCE_TAGS.map(tag => {
                            const selected = tags.includes(tag)
                            return (
                                <Button 
                                    key={tag} 
                                    size="$3" 
                                    borderRadius="$full"
                                    backgroundColor={selected ? colors.green[200] : colors.gray[100]}
                                    borderColor={selected ? colors.green[300] : 'transparent'}
                                    borderWidth={1}
                                    onPress={() => toggleTag(tag)}
                                    hoverStyle={{ backgroundColor: selected ? colors.green[300] : colors.gray[200] }}
                                >
                                    <Text color={selected ? colors.green[800] : colors.gray[700]}>{tag}</Text>
                                </Button>
                            )
                        })}
                        {tags.filter(t => !PRODUCE_TAGS.includes(t)).map(tag => (
                             <Button 
                                key={tag} 
                                size="$3" 
                                borderRadius="$full"
                                backgroundColor={colors.green[200]}
                                borderColor={colors.green[300]}
                                borderWidth={1}
                                onPress={() => toggleTag(tag)}
                            >
                                <Text color={colors.green[800]}>{tag}</Text>
                            </Button>
                        ))}
                    </XStack>

                    <XStack gap="$2" marginTop="$2">
                        <Input 
                            flex={1} 
                            placeholder={t('profileWizard.intro.customProducePlaceholder')}
                            value={customTag}
                            onChangeText={setCustomTag}
                            backgroundColor="white"
                            borderWidth={1}
                            borderColor={colors.gray[300]}
                            focusStyle={{ borderColor: colors.green[500] }}
                            fontWeight="400"
                        />
                        <Button 
                            onPress={addCustomTag} 
                            backgroundColor={colors.gray[100]} 
                            icon={<Plus size={16} color={colors.gray[700]} />}
                        >
                            <Text color={colors.gray[700]}>{t('profileWizard.intro.add')}</Text>
                        </Button>
                    </XStack>
                </YStack>

                {/* Media Upload Section */}
                <YStack gap="$2">
                    <Label color={colors.gray[700]} fontWeight="600">{t('profileWizard.intro.mediaLabel')}</Label>
                    
                    {data.mediaUri ? (
                        <YStack position="relative" padding="$2" borderWidth={1} borderColor={colors.gray[200]} borderRadius={borderRadius.lg} backgroundColor={colors.gray[50]}>
                             <YStack width="100%" height={200} borderRadius={borderRadius.md} overflow="hidden" backgroundColor="black" alignItems="center" justifyContent="center">
                                {Platform.OS === 'web' && data.mediaType === 'video' ? (
                                  <video
                                    src={data.mediaUri}
                                    controls
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' } as any}
                                  />
                                ) : (
                                  <Image source={{ uri: data.mediaUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                                )}
                             </YStack>
                             <Button 
                                position="absolute" 
                                top={10} 
                                right={10} 
                                size="$3" 
                                circular 
                                zIndex={10}
                                backgroundColor="white" 
                                onPress={removeMedia}
                                icon={<Trash size={16} color={'#ef4444'} />}
                            />
                        </YStack>
                    ) : Platform.OS === 'web' ? (
                        <YStack gap="$3">
                            <XStack
                                backgroundColor={colors.gray[50]}
                                borderWidth={2}
                                borderStyle="dashed"
                                borderColor={colors.gray[300]}
                                borderRadius={borderRadius.md}
                                padding="$3"
                                gap="$2"
                                flexWrap="wrap"
                                justifyContent="center"
                            >
                                <Button
                                    size="$3"
                                    backgroundColor={colors.green[50]}
                                    borderWidth={1}
                                    borderColor={colors.green[200]}
                                    borderRadius={borderRadius.md}
                                    icon={<Camera size={16} color={colors.green[600]} />}
                                    onPress={() => setCameraMode('photo')}
                                    hoverStyle={{ backgroundColor: colors.green[100] }}
                                >
                                    <Text fontSize="$2" color={colors.green[700]} fontWeight="500">Take Photo</Text>
                                </Button>
                                <Button
                                    size="$3"
                                    backgroundColor={colors.green[50]}
                                    borderWidth={1}
                                    borderColor={colors.green[200]}
                                    borderRadius={borderRadius.md}
                                    icon={<Video size={16} color={colors.green[600]} />}
                                    onPress={() => setCameraMode('video')}
                                    hoverStyle={{ backgroundColor: colors.green[100] }}
                                >
                                    <Text fontSize="$2" color={colors.green[700]} fontWeight="500">Record Video</Text>
                                </Button>
                                <Button
                                    size="$3"
                                    backgroundColor="white"
                                    borderWidth={1}
                                    borderColor={colors.gray[300]}
                                    borderRadius={borderRadius.md}
                                    icon={<ImageIcon size={16} color={colors.gray[600]} />}
                                    onPress={() => fileInputRef.current?.click()}
                                    hoverStyle={{ backgroundColor: colors.gray[100] }}
                                >
                                    <Text fontSize="$2" color={colors.gray[700]} fontWeight="500">Upload Photo/Video</Text>
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
                        <XStack gap="$3">
                            <Button
                                flex={1} height={100} 
                                borderStyle="dashed" borderWidth={2} borderColor={colors.gray[300]} 
                                backgroundColor={colors.gray[50]}
                                icon={<Upload size={24} color={colors.gray[400]} />}
                                flexDirection="column"
                                gap="$2"
                                onPress={pickMedia}
                                hoverStyle={{ backgroundColor: colors.gray[100] }}
                            >
                                <Text fontSize="$2" color={colors.gray[500]}>{t('profileWizard.intro.uploadMedia')}</Text>
                            </Button>
                            <Button
                                flex={1} height={100} 
                                borderStyle="dashed" borderWidth={2} borderColor={colors.green[300]} 
                                backgroundColor={colors.green[50]}
                                icon={<Camera size={24} color={colors.green[600]} />}
                                flexDirection="column"
                                gap="$2"
                                onPress={takePhoto}
                                hoverStyle={{ backgroundColor: colors.green[100] }}
                            >
                                <Text fontSize="$2" color={colors.green[700]}>Take Photo</Text>
                            </Button>
                            <Button
                                flex={1} height={100} 
                                borderStyle="dashed" borderWidth={2} borderColor={colors.pink[300]} 
                                backgroundColor={colors.pink[50]}
                                icon={<Video size={24} color={colors.pink[600]} />}
                                flexDirection="column"
                                gap="$2"
                                onPress={recordVideo}
                                hoverStyle={{ backgroundColor: colors.pink[100] }}
                            >
                                <Text fontSize="$2" color={colors.pink[700]}>Record Video</Text>
                            </Button>
                        </XStack>
                    )}
                </YStack>

                 {/* First Post Checkbox */}
                 <XStack 
                    backgroundColor={colors.green[50]} 
                    padding="$4" 
                    borderRadius={borderRadius.lg} 
                    gap="$3" 
                    alignItems="flex-start"
                    borderWidth={1}
                    borderColor={colors.green[200]}
                >
                     <Checkbox 
                         checked={data.isFirstPost} 
                         onCheckedChange={(val) => updateData({ isFirstPost: !!val })}
                         size="$5"
                      >
                        <Checkbox.Indicator>
                            <Check color={colors.green[600]} />
                        </Checkbox.Indicator>
                      </Checkbox>
                      <YStack flex={1} gap="$1">
                          <Text fontWeight="700" color={colors.green[800]} fontSize="$3">{t('profileWizard.intro.firstPostLabel')}</Text>
                          <Text fontSize="$3" color={colors.green[700]} lineHeight={20}>{t('profileWizard.intro.firstPostText')}</Text>
                      </YStack>
                </XStack>

                 {/* Tip */}
                 <XStack backgroundColor={colors.amber[200]} padding="$3" borderRadius={borderRadius.lg} alignItems="center" gap="$2">
                     <Text fontSize="$4">💡</Text>
                     <Text fontSize="$3" color={colors.amber[700]} fontWeight="700">{t('profileWizard.intro.tip')}</Text>
                 </XStack>
            </YStack>

            <XStack gap="$3" paddingTop="$4" marginTop="auto">
               <Button 
                flex={1} 
                backgroundColor="white" 
                borderColor={colors.gray[200]} 
                borderWidth={1}
                height="$5"
                onPress={prevStep}
                hoverStyle={{ backgroundColor: colors.gray[50] }}
               >
                 <Text color={colors.gray[700]}>{t('profileWizard.intro.back')}</Text>
               </Button>
               <Button 
                 flex={1} 
                 variant="outlined" 
                 backgroundColor="transparent"
                 height="$5"
                 onPress={handleFinish}
               >
                 <Text color={colors.gray[500]}>{t('profileWizard.intro.skip')}</Text>
               </Button>
               <Button 
                 flex={2} 
                 backgroundColor={colors.green[600]} 
                 height="$5" 
                 onPress={handleFinish}
                 disabled={loading}
                 hoverStyle={{ backgroundColor: colors.green[700] }}
                 icon={loading ? <Spinner color="white" /> : undefined}
               >
                 <Text color="white" fontWeight="600">
                    {loading ? '' : t('profileWizard.intro.postContinue')}
                 </Text>
               </Button>
            </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  )
}
