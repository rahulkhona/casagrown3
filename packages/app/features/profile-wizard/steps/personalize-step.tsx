import { useState, useEffect } from 'react'
import { YStack, XStack, Input, Button, Text, Label, ScrollView, Separator, Spinner } from 'tamagui'
import { useRouter } from 'solito/navigation'
import { useWizard } from '../wizard-context'
import { useAuth, supabase } from '../../auth/auth-hook'
import { Leaf, Check, Plus, X, MapPin, Phone, Shield } from '@tamagui/lucide-icons'
import { colors, shadows, borderRadius } from '../../../design-tokens'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { getProduceEmoji } from '../utils/produce-emoji'

type GardenItem = {
  name: string
  category: string
  emoji: string
  season: string | null
}

export const PersonalizeStep = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const { data, updateData, saveProfile, loading, prevStep } = useWizard()
  const { user } = useAuth()

  const [gardenCatalog, setGardenCatalog] = useState<GardenItem[]>([])
  const [blockedProducts, setBlockedProducts] = useState<string[]>([])
  const [blockedError, setBlockedError] = useState('')
  const [customInput, setCustomInput] = useState('')
  const [smsDigest, setSmsDigest] = useState(data.smsDigest)
  const [phone, setPhone] = useState(data.phone || '')
  const [verifyOptIn, setVerifyOptIn] = useState(false)
  const [smsSending, setSmsSending] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(Boolean(data.phoneVerified && data.phone))
  const [verifyError, setVerifyError] = useState('')
  const [resendTimer, setResendTimer] = useState(0)

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendTimer])

  const DEV_OTP_CODE = '123456'

  const sendVerificationSms = async () => {
    if (!phone || phone.length < 10) return
    setSmsSending(true)
    setVerifyError('')
    try {
      if (__DEV__) {
        // Dev mode: simulate SMS send with 1s delay
        await new Promise(resolve => setTimeout(resolve, 1000))
        console.log(`[Dev SMS] Verification code for ${phone}: ${DEV_OTP_CODE}`)
        setCodeSent(true)
        setResendTimer(60)
      } else {
        const formattedPhone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`
        const { error } = await supabase.auth.signInWithOtp({
          phone: formattedPhone,
        })
        if (error) {
          setVerifyError(t('profileWizard.personalize.verifySmsFailed'))
          console.warn('SMS send error:', error)
        } else {
          setCodeSent(true)
          setResendTimer(60)
        }
      }
    } catch (err) {
      setVerifyError(t('profileWizard.personalize.verifySmsFailed'))
      console.error('SMS verification error:', err)
    } finally {
      setSmsSending(false)
    }
  }

  const verifyOtpCode = async () => {
    if (otpCode.length !== 6) return
    setVerifying(true)
    setVerifyError('')
    try {
      if (__DEV__) {
        // Dev mode: accept dummy code
        await new Promise(resolve => setTimeout(resolve, 500))
        if (otpCode === DEV_OTP_CODE) {
          setPhoneVerified(true)
          updateData({ phoneVerified: true })
        } else {
          setVerifyError(t('profileWizard.personalize.verifyCodeInvalid'))
        }
      } else {
        const formattedPhone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`
        const { error } = await supabase.auth.verifyOtp({
          phone: formattedPhone,
          token: otpCode,
          type: 'sms',
        })
        if (error) {
          setVerifyError(t('profileWizard.personalize.verifyCodeInvalid'))
        } else {
          setPhoneVerified(true)
          updateData({ phoneVerified: true })
        }
      }
    } catch (err) {
      setVerifyError(t('profileWizard.personalize.verifyCodeInvalid'))
    } finally {
      setVerifying(false)
    }
  }

  // Fetch popular produce for user's zipcode + blocked products
  useEffect(() => {
    const fetchProduceAndRestrictions = async () => {
      const userZip = data.zipCode || ''

      // Fetch popular produce for this zipcode (resolves USDA zone via RPC)
      const { data: popular, error: produceError } = await supabase
        .rpc('get_popular_produce_for_zip', { p_zip: userZip })

      if (produceError) {
        console.warn('⚠️ [Produce] RPC error:', produceError.message)
      }

      // Fetch blocked products (global + community-specific)
      const communityH3 = data.community?.h3Index || null
      let blockedQuery = supabase
        .from('blocked_products')
        .select('product_name')
      // Global blocks have null community_h3_index
      // We want both global and community-specific blocks
      const { data: blocked } = communityH3
        ? await blockedQuery.or(`community_h3_index.is.null,community_h3_index.eq.${communityH3}`)
        : await blockedQuery.is('community_h3_index', null)

      const blockedNames = (blocked || []).map(b => b.product_name.toLowerCase())
      setBlockedProducts(blockedNames)

      if (popular && popular.length > 0) {
        // Filter out blocked products
        const filtered = popular
          .filter(p => !blockedNames.includes(p.produce_name.toLowerCase()))
          .map(p => ({ name: p.produce_name, category: p.category, emoji: p.emoji || '', season: p.season }))
        setGardenCatalog(filtered)
      } else {
        // No data for this zip — show empty state
        setGardenCatalog([])
      }
    }
    fetchProduceAndRestrictions()
  }, [data.zipCode, data.community?.h3Index])

  const toggleGardenItem = (name: string) => {
    const current = data.gardenItems
    if (current.includes(name)) {
      updateData({ gardenItems: current.filter(i => i !== name) })
    } else {
      updateData({ gardenItems: [...current, name] })
    }
  }

  const addCustomItem = () => {
    const trimmed = customInput.trim()
    if (!trimmed) return
    // Check against blocked products
    if (blockedProducts.includes(trimmed.toLowerCase())) {
      setBlockedError(t('profileWizard.personalize.blockedProductError', { product: trimmed }))
      return
    }
    setBlockedError('')
    if (!data.customGardenItems.includes(trimmed)) {
      updateData({ customGardenItems: [...data.customGardenItems, trimmed] })
      setCustomInput('')
    }
  }

  const removeCustomItem = (name: string) => {
    updateData({ customGardenItems: data.customGardenItems.filter(i => i !== name) })
  }

  const handleFinish = async () => {
    updateData({ smsDigest, phone: phone || undefined })
    const success = await saveProfile({ smsDigest, phone: phone || undefined })
    if (success) {
      router.replace('/')
    }
  }

  const handleSkip = async () => {
    updateData({ phone: phone || undefined })
    const success = await saveProfile({ phone: phone || undefined })
    if (success) {
      router.replace('/')
    }
  }


  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
      <YStack flex={1} paddingHorizontal="$4" paddingBottom="$8" alignItems="center">
        <YStack
          width="100%"
          maxWidth={500}
          gap="$5"
        >
          {/* Title */}
          <YStack gap="$1" alignItems="center">
            <Text fontSize="$7" fontWeight="700" color={colors.gray[900]}>
              {t('profileWizard.personalize.title')}
            </Text>
            <Text fontSize="$4" color={colors.gray[500]}>
              {t('profileWizard.personalize.subtitle')}
            </Text>
          </YStack>

          {/* Community (read-only, set in Step 1) */}
          {data.community && (
            <XStack
              padding="$3"
              backgroundColor={colors.green[50]}
              borderRadius={borderRadius.md}
              borderWidth={1}
              borderColor={colors.green[300]}
              alignItems="center"
              gap="$2"
            >
              <MapPin size={16} color={colors.green[600]} />
              <Text fontSize="$4" fontWeight="600" color={colors.gray[900]} flex={1}>
                📍 {data.community.name}
              </Text>
              <XStack
                backgroundColor={colors.green[100]}
                paddingHorizontal="$2"
                paddingVertical="$1"
                borderRadius={borderRadius.md}
                alignItems="center"
                gap="$1"
              >
                <Check size={12} color={colors.green[700]} />
                <Text fontSize="$1" color={colors.green[700]}>
                  {t('profileWizard.personalize.communityAutoDetected')}
                </Text>
              </XStack>
            </XStack>
          )}

          {/* Phone + Verification */}
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius['2xl']}
            padding="$5"
            gap="$3"
            shadowColor={shadows.md.color}
            shadowOffset={shadows.md.offset}
            shadowOpacity={0.08}
            shadowRadius={shadows.md.radius}
          >
            <Label color={colors.gray[700]} fontWeight="600">
              <XStack alignItems="center" gap="$2">
                <Phone size={16} color={colors.gray[600]} />
                <Text>{t('profileWizard.personalize.phoneTitle')}</Text>
              </XStack>
            </Label>
            <Input
              value={phone}
              onChangeText={(text) => {
                setPhone(text)
                // Reset verification state if phone changes
                if (codeSent || phoneVerified) {
                  setCodeSent(false)
                  setPhoneVerified(false)
                  setVerifyOptIn(false)
                  setOtpCode('')
                  setVerifyError('')
                }
              }}
              placeholder={t('profileWizard.personalize.phonePlaceholder')}
              size="$4"
              borderWidth={1}
              borderColor={colors.gray[300]}
              focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
              backgroundColor="white"
              fontWeight="400"
              keyboardType="phone-pad"
              disabled={phoneVerified}
            />

            {/* Verified badge */}
            {phoneVerified ? (
              <XStack
                padding="$3"
                backgroundColor={colors.green[50]}
                borderRadius={borderRadius.md}
                borderWidth={1}
                borderColor={colors.green[300]}
                alignItems="center"
                gap="$2"
              >
                <Shield size={16} color={colors.green[600]} />
                <Text fontSize="$3" fontWeight="600" color={colors.green[700]}>
                  {t('profileWizard.personalize.phoneVerifiedSuccess')}
                </Text>
              </XStack>

            /* Checkbox to opt into verification */
            ) : !verifyOptIn && !codeSent && phone.replace(/\D/g, '').length >= 10 ? (
              <XStack
                padding="$3"
                backgroundColor={colors.blue ? colors.blue[50] : '#eff6ff'}
                borderRadius={borderRadius.md}
                alignItems="center"
                gap="$3"
                onPress={() => {
                  setVerifyOptIn(true)
                  sendVerificationSms()
                }}
                cursor="pointer"
                pressStyle={{ opacity: 0.8 }}
              >
                <YStack
                  width={22}
                  height={22}
                  borderRadius={4}
                  borderWidth={2}
                  borderColor={colors.green[500]}
                  backgroundColor="white"
                  alignItems="center"
                  justifyContent="center"
                />
                <YStack flex={1} gap="$1">
                  <Text fontSize="$3" fontWeight="600" color={colors.gray[800]}>
                    {t('profileWizard.personalize.verifyCheckboxLabel')}
                  </Text>
                  <Text fontSize="$2" color={colors.gray[500]}>
                    {t('profileWizard.personalize.verifyCheckboxHint')}
                  </Text>
                </YStack>
              </XStack>

            /* Code entry after SMS sent */
            ) : codeSent && !phoneVerified ? (
              <YStack gap="$3">
                <XStack
                  padding="$3"
                  backgroundColor={colors.green[50]}
                  borderRadius={borderRadius.md}
                  alignItems="center"
                  gap="$2"
                >
                  <Check size={14} color={colors.green[600]} />
                  <Text fontSize="$3" color={colors.green[700]}>
                    {t('profileWizard.personalize.verifyCodeSent', { phone })}
                  </Text>
                </XStack>
                {__DEV__ && (
                  <XStack
                    padding="$2"
                    backgroundColor="#fef3c7"
                    borderRadius={borderRadius.md}
                    borderWidth={1}
                    borderColor="#fbbf24"
                    alignItems="center"
                    gap="$2"
                  >
                    <Text fontSize="$2" color="#92400e">
                      🔧 Dev mode — use code: <Text fontWeight="700" fontSize="$2" color="#92400e">{DEV_OTP_CODE}</Text>
                    </Text>
                  </XStack>
                )}

                <XStack gap="$2" alignItems="center">
                  <Input
                    flex={1}
                    value={otpCode}
                    onChangeText={(text) => setOtpCode(text.replace(/\D/g, '').slice(0, 6))}
                    placeholder={t('profileWizard.personalize.verifyCodePlaceholder')}
                    size="$4"
                    borderWidth={1}
                    borderColor={colors.gray[300]}
                    focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
                    backgroundColor="white"
                    fontWeight="400"
                    keyboardType="number-pad"
                    maxLength={6}
                    textAlign="center"
                    letterSpacing={8}
                    fontSize="$5"
                  />
                  <Button
                    backgroundColor={otpCode.length === 6 ? colors.green[600] : colors.gray[300]}
                    height="$4"
                    paddingHorizontal="$4"
                    onPress={verifyOtpCode}
                    disabled={otpCode.length !== 6 || verifying}
                    hoverStyle={{ backgroundColor: otpCode.length === 6 ? colors.green[700] : colors.gray[300] }}
                  >
                    {verifying ? (
                      <Spinner size="small" color="white" />
                    ) : (
                      <Text color="white" fontWeight="600">
                        {t('profileWizard.personalize.verifyButton')}
                      </Text>
                    )}
                  </Button>
                </XStack>

                {/* Resend */}
                <XStack justifyContent="center">
                  {resendTimer > 0 ? (
                    <Text fontSize="$2" color={colors.gray[400]}>
                      {t('profileWizard.personalize.verifyResendIn', { seconds: resendTimer })}
                    </Text>
                  ) : (
                    <Text
                      fontSize="$2"
                      color={colors.green[600]}
                      fontWeight="600"
                      onPress={sendVerificationSms}
                      cursor="pointer"
                      textDecorationLine="underline"
                    >
                      {t('profileWizard.personalize.verifyResend')}
                    </Text>
                  )}
                </XStack>
              </YStack>

            /* Show sending state */
            ) : smsSending ? (
              <XStack padding="$3" alignItems="center" gap="$2">
                <Spinner size="small" color={colors.green[600]} />
                <Text fontSize="$3" color={colors.gray[500]}>
                  {t('profileWizard.personalize.verifySending')}
                </Text>
              </XStack>

            ) : null}

            {/* Error display */}
            {verifyError ? (
              <Text fontSize="$2" color="#dc2626">{verifyError}</Text>
            ) : null}
          </YStack>

          {/* Garden Produce — all categories shown with headers */}
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius['2xl']}
            padding="$5"
            gap="$4"
            shadowColor={shadows.md.color}
            shadowOffset={shadows.md.offset}
            shadowOpacity={0.08}
            shadowRadius={shadows.md.radius}
          >
            <Label color={colors.gray[700]} fontWeight="600">
              <XStack alignItems="center" gap="$2">
                <Leaf size={16} color={colors.green[600]} />
                <Text>{t('profileWizard.personalize.gardenTitle')}</Text>
              </XStack>
            </Label>
            <Text fontSize="$2" color={colors.gray[500]}>
              {t('profileWizard.personalize.gardenSubtitle')}
            </Text>

            {/* All produce items — flat mixed list */}
            <XStack gap="$2" flexWrap="wrap">
              {gardenCatalog.map(item => {
                const selected = data.gardenItems.includes(item.name)
                return (
                  <Button
                    key={item.name}
                    size="$3"
                    backgroundColor={selected ? colors.green[100] : colors.gray[50]}
                    borderWidth={1}
                    borderColor={selected ? colors.green[400] : colors.gray[200]}
                    borderRadius={borderRadius.full}
                    onPress={() => toggleGardenItem(item.name)}
                    hoverStyle={{ backgroundColor: selected ? colors.green[200] : colors.gray[100] }}
                  >
                    <Text fontSize="$2" color={selected ? colors.green[800] : colors.gray[700]}>
                      {item.emoji} {item.name}
                    </Text>
                  </Button>
                )
              })}
            </XStack>

            {/* Custom Items */}
            {data.customGardenItems.length > 0 && (
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600" color={colors.gray[700]}>
                  🏷️ {t('profileWizard.personalize.customItems')}
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  {data.customGardenItems.map(name => (
                    <XStack
                      key={name}
                      backgroundColor={colors.green[100]}
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius={borderRadius.full}
                      alignItems="center"
                      gap="$1"
                    >
                      <Text fontSize="$2" color={colors.green[800]}>{getProduceEmoji(name) ? `${getProduceEmoji(name)} ` : ''}{name}</Text>
                      <Button
                        size="$1"
                        circular
                        backgroundColor="transparent"
                        onPress={() => removeCustomItem(name)}
                      >
                        <X size={12} color={colors.green[600]} />
                      </Button>
                    </XStack>
                  ))}
                </XStack>
              </YStack>
            )}

            {/* Add Custom */}
            <XStack gap="$2">
              <Input
                flex={1}
                value={customInput}
                onChangeText={setCustomInput}
                placeholder={t('profileWizard.personalize.customPlaceholder')}
                size="$3"
                borderWidth={1}
                borderColor={colors.gray[300]}
                focusStyle={{ borderColor: colors.green[500] }}
                fontWeight="400"
                onSubmitEditing={addCustomItem}
              />
              <Button
                size="$3"
                backgroundColor={colors.green[600]}
                onPress={addCustomItem}
                disabled={!customInput.trim()}
                hoverStyle={{ backgroundColor: colors.green[700] }}
              >
                <Plus size={16} color="white" />
              </Button>
            </XStack>
            {blockedError ? (
              <Text fontSize="$2" color="#dc2626">{blockedError}</Text>
            ) : null}
          </YStack>

          {/* SMS Digest */}
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius['2xl']}
            padding="$5"
            gap="$3"
            shadowColor={shadows.md.color}
            shadowOffset={shadows.md.offset}
            shadowOpacity={0.08}
            shadowRadius={shadows.md.radius}
          >
            <XStack alignItems="center" justifyContent="space-between">
              <YStack flex={1} gap="$1">
                <Label color={colors.gray[700]} fontWeight="600">
                  {t('profileWizard.personalize.smsDigestLabel')}
                </Label>
                <Text fontSize="$2" color={colors.gray[500]}>
                  {t('profileWizard.personalize.smsDigestDescription')}
                </Text>
              </YStack>
              <XStack
                width={50}
                height={28}
                borderRadius={14}
                backgroundColor={smsDigest ? colors.green[600] : colors.gray[300]}
                padding={2}
                justifyContent={smsDigest ? 'flex-end' : 'flex-start'}
                alignItems="center"
                opacity={!phone ? 0.4 : 1}
                onPress={() => phone && setSmsDigest(!smsDigest)}
                pressStyle={{ opacity: 0.8 }}
                cursor={phone ? 'pointer' : 'not-allowed'}
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
            {!phone && (
              <XStack alignItems="center" gap="$1">
                <Phone size={12} color={colors.gray[400]} />
                <Text fontSize="$2" color={colors.gray[400]}>
                  {t('profileWizard.personalize.smsRequiresPhone')}
                </Text>
              </XStack>
            )}
          </YStack>


          {/* Navigation */}
          <XStack gap="$3" paddingTop="$2">
            <Button
              flex={1}
              backgroundColor="white"
              borderColor={colors.gray[200]}
              borderWidth={1}
              height="$5"
              onPress={handleSkip}
              disabled={loading}
              hoverStyle={{ backgroundColor: colors.gray[50] }}
            >
              <Text color={colors.gray[700]} fontWeight="600">{t('profileWizard.personalize.skip')}</Text>
            </Button>
            <Button
              flex={1}
              backgroundColor={colors.green[600]}
              height="$5"
              onPress={handleFinish}
              disabled={loading}
              hoverStyle={{ backgroundColor: colors.green[700] }}
            >
              {loading ? (
                <Spinner size="small" color="white" />
              ) : (
                <Text color="white" fontWeight="600">{t('profileWizard.personalize.finish')}</Text>
              )}
            </Button>
          </XStack>

          <Button
            backgroundColor="transparent"
            onPress={prevStep}
            height="$4"
          >
            <Text color={colors.gray[500]} fontSize="$3">{t('profileWizard.personalize.goBack')}</Text>
          </Button>
        </YStack>
      </YStack>
    </ScrollView>
  )
}
