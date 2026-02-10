import { useRef, useState } from 'react'
import { YStack, XStack, Input, Button, Text, Avatar, Label, Switch, Checkbox, ScrollView, Sheet } from 'tamagui'
import { useWizard } from '../wizard-context'
import { useAuth } from '../../auth/auth-hook'
import { Camera, Upload, Bell, MessageSquare, Check } from '@tamagui/lucide-icons'
import { colors, shadows, borderRadius } from '../../../design-tokens'
import { Image } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import { Alert, Platform } from 'react-native'

const WebCameraModal = Platform.OS === 'web'
  ? require('../../create-post/WebCameraModal').WebCameraModal
  : null

export const ProfileSetupStep = () => {
  const { t } = useTranslation()
  const { data, updateData, nextStep } = useWizard()
  const { user } = useAuth()
  const [name, setName] = useState(data.name)
  const [pushEnabled, setPushEnabled] = useState(data.notifyPush)
  const [smsEnabled, setSmsEnabled] = useState(data.notifySms)
  const [phoneNumber, setPhoneNumber] = useState(data.phone || '')

  const isFormValid = name.trim().length > 0;

  // Web photo state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCamera, setShowCamera] = useState(false)

  const handleContinue = () => {
    if (isFormValid) {
        updateData({ 
            name,
            notifyPush: pushEnabled,
            notifySms: smsEnabled,
            phone: phoneNumber
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
    });

    if (!result.canceled) {
      updateData({ avatar: result.assets[0].uri })
    }
  }

  const takePhoto = async () => {
      if (Platform.OS === 'web') {
        setShowCamera(true)
        return
      }
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
          return;
      }

      try {
        let result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled && result.assets?.[0]?.uri) {
            updateData({ avatar: result.assets[0].uri })
        }
      } catch (e) {
        Alert.alert('Camera unavailable', 'Camera is not available on this device. Use the upload button instead.')
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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
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
                  <Text fontSize="$3" color={colors.gray[400]} textAlign="center">
                    {t('profileWizard.setup.signedInAs', { email: user.email })}
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
                            {name ? name[0].toUpperCase() : 'T'}
                            </Text>
                        )}
                    </YStack>
                    {/* Visual Camera Context - Clicking opens action sheet or picker in real app */}
                    <YStack
                        position="absolute"
                        bottom={0}
                        right={0}
                        backgroundColor={colors.green[600]}
                        padding="$2"
                        borderRadius={20}
                        borderWidth={2}
                        borderColor="white"
                    >
                        <Camera size={16} color="white" />
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
                      ref={fileInputRef as any}
                      type="file"
                      accept="image/*"
                      onChange={handleWebFileChange as any}
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

            {/* Form Fields */}
            <YStack gap="$5">
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

                <YStack gap="$3">
                    <Label color={colors.gray[700]} fontWeight="600">{t('profileWizard.setup.notificationTitle')}</Label>
                    <Text fontSize="$3" color={colors.gray[500]} marginTop={-2}>{t('profileWizard.setup.notificationSubtitle')}</Text>
                    
                    {/* Notification Types */}
                    <YStack gap="$3" padding="$4" backgroundColor={colors.gray[50]} borderRadius={borderRadius.lg} borderWidth={1} borderColor={colors.gray[100]}>
                        
                        {/* Buying/Selling Toggles */}
                        <YStack gap="$3">
                            <XStack alignItems="center" gap="$3">
                                <Checkbox 
                                    checked={data.notifySell} 
                                    onCheckedChange={(val) => updateData({ notifySell: !!val })}
                                    size="$4"
                                >
                                    <Checkbox.Indicator>
                                        <Check color={colors.green[600]} />
                                    </Checkbox.Indicator>
                                </Checkbox>
                                <Text fontSize="$3" color={colors.gray[800]}>{t('profileWizard.setup.notifySell')}</Text>
                            </XStack>
                             <XStack alignItems="center" gap="$3">
                                <Checkbox 
                                    checked={data.notifyBuy} 
                                    onCheckedChange={(val) => updateData({ notifyBuy: !!val })}
                                    size="$4"
                                >
                                    <Checkbox.Indicator>
                                        <Check color={colors.green[600]} />
                                    </Checkbox.Indicator>
                                </Checkbox>
                                <Text fontSize="$3" color={colors.gray[800]}>{t('profileWizard.setup.notifyBuy')}</Text>
                            </XStack>
                        </YStack>

                        {/* Channel Selection - Only Visible if a type is selected */}
                        {(data.notifySell || data.notifyBuy) && (
                            <YStack>
                                <YStack height={1} backgroundColor={colors.gray[200]} marginVertical="$4" />
                                <Label color={colors.gray[700]} fontWeight="600" fontSize="$3" marginBottom="$2">{t('profileWizard.setup.alertChannelTitle')}</Label>
                                
                                <XStack alignItems="center" gap="$3" marginBottom="$2">
                                    <Checkbox 
                                        checked={pushEnabled} 
                                        onCheckedChange={(val) => setPushEnabled(!!val)}
                                        size="$4"
                                    >
                                        <Checkbox.Indicator>
                                            <Check color={colors.green[600]} />
                                        </Checkbox.Indicator>
                                    </Checkbox>
                                    <Text fontSize="$3" color={colors.gray[800]}>{t('profileWizard.setup.pushLabel')}</Text>
                                </XStack>

                                <XStack alignItems="center" gap="$3">
                                    <Checkbox 
                                        checked={smsEnabled} 
                                        onCheckedChange={(val) => setSmsEnabled(!!val)}
                                        size="$4"
                                    >
                                        <Checkbox.Indicator>
                                            <Check color={colors.green[600]} />
                                        </Checkbox.Indicator>
                                    </Checkbox>
                                    <Text fontSize="$3" color={colors.gray[800]}>{t('profileWizard.setup.smsLabel')}</Text>
                                </XStack>

                                {smsEnabled && (
                                    <YStack gap="$2" marginTop="$3" paddingLeft="$7">
                                        <Label color={colors.gray[600]} fontSize="$2">{t('profileWizard.setup.phoneLabel')}</Label>
                                        <Input
                                            value={phoneNumber}
                                            onChangeText={setPhoneNumber}
                                            placeholder={t('profileWizard.setup.phonePlaceholder')}
                                            size="$3"
                                            borderWidth={1}
                                            borderColor={colors.gray[300]}
                                            focusStyle={{ borderColor: colors.green[500] }}
                                            backgroundColor="white"
                                            keyboardType="phone-pad"
                                            fontWeight="400"
                                        />
                                    </YStack>
                                )}
                            </YStack>
                        )}

                    </YStack>
                </YStack>
            </YStack>

            <XStack gap="$3" paddingTop="$4">
                <Button 
                    flex={1} 
                    backgroundColor="white" 
                    borderColor={colors.gray[200]} 
                    borderWidth={1}
                    height="$5"
                    onPress={() => console.log('Back')}
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
