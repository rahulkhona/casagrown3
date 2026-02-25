/**
 * NotificationPromptModal — Push notification permission prompt
 *
 * Renders one of 4 modal variants matching the approved mockups:
 *   1. First-time prompt ("Stay in the Loop!")
 *   2. Permission denied ("Notifications Blocked")
 *   3. iOS Safari PWA guide
 *   4. iOS Chrome PWA guide
 *
 * Uses Tamagui primitives + design-tokens for cross-platform rendering.
 */

import { YStack, XStack, Text, Button, ScrollView } from 'tamagui'
import { Modal, Linking, Platform } from 'react-native'
import { colors, borderRadius, shadows } from '../../design-tokens'
import { X } from '@tamagui/lucide-icons'
import { useTranslation } from 'react-i18next'

// =============================================================================
// Types
// =============================================================================

export type PromptVariant = 'first-time' | 'denied' | 'ios-safari' | 'ios-chrome'

interface NotificationPromptModalProps {
  visible: boolean
  variant: PromptVariant
  onEnable: () => void
  onDismiss: () => void
  onPermanentDismiss: () => void
}

// =============================================================================
// Benefit items (shared across variants)
// =============================================================================

const BENEFIT_KEYS = [
  { icon: '📦', key: 'notifications.benefits.orders', bg: colors.green[100] },
  { icon: '💬', key: 'notifications.benefits.chats', bg: '#dbeafe' },
  { icon: '📋', key: 'notifications.benefits.status', bg: '#fef3c7' },
]

// =============================================================================
// Component
// =============================================================================

export function NotificationPromptModal({
  visible,
  variant,
  onEnable,
  onDismiss,
  onPermanentDismiss,
}: NotificationPromptModalProps) {
  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <YStack
        flex={1}
        backgroundColor="rgba(0,0,0,0.5)"
        justifyContent="center"
        alignItems="center"
        padding="$4"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
          }}
          showsVerticalScrollIndicator={false}
        >
          {variant === 'first-time' && <FirstTimePrompt onEnable={onEnable} onDismiss={onDismiss} onPermanentDismiss={onPermanentDismiss} />}
          {variant === 'denied' && <DeniedPrompt onEnable={onEnable} onDismiss={onDismiss} onPermanentDismiss={onPermanentDismiss} />}
          {variant === 'ios-safari' && <PWAGuide browser="safari" onDismiss={onDismiss} onPermanentDismiss={onPermanentDismiss} />}
          {variant === 'ios-chrome' && <PWAGuide browser="chrome" onDismiss={onDismiss} onPermanentDismiss={onPermanentDismiss} />}
        </ScrollView>
      </YStack>
    </Modal>
  )
}

// =============================================================================
// Variant 1: First-Time Prompt
// =============================================================================

function FirstTimePrompt({ onEnable, onDismiss, onPermanentDismiss }: {
  onEnable: () => void
  onDismiss: () => void
  onPermanentDismiss: () => void
}) {
  const { t } = useTranslation()
  return (
    <ModalCard>
      <IconCircle bg={colors.green[100]} icon="🔔" />
      <Text fontSize={20} fontWeight="700" color={colors.gray[900]} textAlign="center" marginBottom="$2">
        {t('notifications.stayInTheLoop')}
      </Text>
      <Text fontSize={14} color={colors.gray[500]} textAlign="center" lineHeight={21} marginBottom="$4">
        {t('notifications.firstTimeBody')}
      </Text>
      <BenefitsList />
      <Button
        backgroundColor={colors.green[600]}
        paddingVertical={14}
        borderRadius={9999}
        pressStyle={{ backgroundColor: colors.green[700] }}
        onPress={onEnable}
      >
        <Text color="white" fontSize={15} fontWeight="600">{t('notifications.enableButton')}</Text>
      </Button>
      <DismissLink label={t('notifications.notNow')} onPress={onDismiss} />
    </ModalCard>
  )
}

// =============================================================================
// Variant 2: Permission Denied
// =============================================================================

function DeniedPrompt({ onEnable, onDismiss, onPermanentDismiss }: {
  onEnable: () => void
  onDismiss: () => void
  onPermanentDismiss: () => void
}) {
  const { t } = useTranslation()
  const handleOpenSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:')
    } else if (Platform.OS === 'android') {
      Linking.openSettings()
    }
    // On web, we can't programmatically open browser settings
    // The steps in the modal guide the user manually
    onDismiss()
  }

  return (
    <ModalCard>
      <IconCircle bg="#fef3c7" icon="⚠️" />
      <Text fontSize={20} fontWeight="700" color={colors.gray[900]} textAlign="center" marginBottom="$2">
        {t('notifications.denied.title')}
      </Text>
      <Text fontSize={14} color={colors.gray[500]} textAlign="center" lineHeight={21} marginBottom="$4">
        {t('notifications.denied.body')}
      </Text>
      <YStack gap="$3" marginBottom="$5" alignSelf="stretch">
        <StepItem num={1} title={t('notifications.denied.step1Title')} desc={t('notifications.denied.step1Desc')} color="#f59e0b" />
        <StepItem num={2} title={t('notifications.denied.step2Title')} desc={t('notifications.denied.step2Desc')} color="#f59e0b" />
        <StepItem num={3} title={t('notifications.denied.step3Title')} desc={t('notifications.denied.step3Desc')} color="#f59e0b" />
      </YStack>
      <Button
        backgroundColor="#f59e0b"
        paddingVertical={14}
        borderRadius={9999}
        pressStyle={{ backgroundColor: '#d97706' }}
        onPress={handleOpenSettings}
      >
        <Text color="white" fontSize={15} fontWeight="600">{t('notifications.denied.openSettings')}</Text>
      </Button>
      <DismissLink label={t('notifications.maybeLater')} onPress={onDismiss} />
      <PermanentDismissLink onPress={onPermanentDismiss} />
    </ModalCard>
  )
}

// =============================================================================
// Variant 3/4: iOS PWA Guide (Safari or Chrome)
// =============================================================================

function PWAGuide({ browser, onDismiss, onPermanentDismiss }: {
  browser: 'safari' | 'chrome'
  onDismiss: () => void
  onPermanentDismiss: () => void
}) {
  const { t } = useTranslation()
  const isSafari = browser === 'safari'
  const shareIcon = isSafari ? '⬆️' : '📤'
  const browserKey = isSafari ? 'safari' : 'chrome'

  return (
    <ModalCard wide>
      <IconCircle bg={colors.green[100]} icon="🔔" />
      <Text fontSize={20} fontWeight="700" color={colors.gray[900]} textAlign="center" marginBottom="$2">
        {t('notifications.stayInTheLoop')}
      </Text>
      <Text fontSize={13} color={colors.gray[500]} textAlign="center" lineHeight={20} marginBottom="$3">
        {t('notifications.firstTimeBody')}
      </Text>
      <BenefitsList compact />

      {/* Info box */}
      <YStack
        backgroundColor="#dbeafe"
        borderRadius={10}
        padding="$3"
        marginBottom="$3"
        alignSelf="stretch"
      >
        <Text fontSize={12} color={colors.gray[700]} lineHeight={17}>
          📱 <Text fontWeight="700">{t('notifications.pwa.infoBox').replace(/<\/?bold>/g, '')}</Text>
        </Text>
      </YStack>

      {/* Steps */}
      <YStack
        backgroundColor={colors.green[50]}
        borderWidth={2}
        borderStyle="dashed"
        borderColor={colors.green[300]}
        borderRadius={16}
        padding="$3"
        marginBottom="$4"
        alignSelf="stretch"
        gap="$2"
      >
        <PWAStep icon={shareIcon} step={1} text={t(`notifications.pwa.${browserKey}.step1`)} />
        <PWAStep icon="➕" step={2} text={t(`notifications.pwa.${browserKey}.step2`)} />
        <PWAStep icon="✅" step={3} text={t(`notifications.pwa.${browserKey}.step3`)} />
        <PWAStep icon="🏠" step={4} text={t('notifications.pwa.step4')} />
        <PWAStep icon="🔔" step={5} text={t('notifications.pwa.step5')} />
      </YStack>

      <Button
        backgroundColor={colors.green[600]}
        paddingVertical={14}
        borderRadius={9999}
        pressStyle={{ backgroundColor: colors.green[700] }}
        onPress={onDismiss}
      >
        <Text color="white" fontSize={15} fontWeight="600">{t('notifications.gotIt')}</Text>
      </Button>
      <DismissLink label={t('notifications.remindLater')} onPress={onDismiss} />
      <PermanentDismissLink onPress={onPermanentDismiss} />
    </ModalCard>
  )
}

// =============================================================================
// Shared Sub-Components
// =============================================================================

function ModalCard({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <YStack
      backgroundColor="white"
      borderRadius={24}
      padding="$5"
      paddingHorizontal="$4"
      maxWidth={wide ? 380 : 340}
      width="100%"
      alignItems="center"
      shadowColor="black"
      shadowOffset={{ width: 0, height: 25 }}
      shadowOpacity={0.25}
      shadowRadius={50}
      elevation={10}
    >
      {children}
    </YStack>
  )
}

function IconCircle({ bg, icon }: { bg: string; icon: string }) {
  return (
    <YStack
      width={72}
      height={72}
      borderRadius={36}
      backgroundColor={bg as any}
      alignItems="center"
      justifyContent="center"
      marginBottom="$4"
    >
      <Text fontSize={32}>{icon}</Text>
    </YStack>
  )
}

function BenefitsList({ compact }: { compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <YStack gap={compact ? '$2' : '$3'} marginBottom={compact ? '$3' : '$5'} alignSelf="stretch">
      {BENEFIT_KEYS.map((b, i) => (
        <XStack key={i} alignItems="center" gap="$3">
          <YStack
            width={compact ? 36 : 44}
            height={compact ? 36 : 44}
            borderRadius={compact ? 10 : 12}
            backgroundColor={b.bg as any}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={compact ? 16 : 20}>{b.icon}</Text>
          </YStack>
          <Text
            flex={1}
            fontSize={compact ? 12 : 14}
            color={colors.gray[700]}
            lineHeight={compact ? 16 : 20}
          >
            {t(b.key)}
          </Text>
        </XStack>
      ))}
    </YStack>
  )
}

function StepItem({ num, title, desc, color }: { num: number; title: string; desc: string; color: string }) {
  return (
    <XStack gap="$3" alignItems="flex-start">
      <YStack
        width={28}
        height={28}
        borderRadius={14}
        backgroundColor={color as any}
        alignItems="center"
        justifyContent="center"
      >
        <Text color="white" fontSize={13} fontWeight="700">{num}</Text>
      </YStack>
      <YStack flex={1}>
        <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>{title}</Text>
        <Text fontSize={12} color={colors.gray[500]}>{desc}</Text>
      </YStack>
    </XStack>
  )
}

function PWAStep({ icon, step, text }: { icon: string; step: number; text: string }) {
  return (
    <XStack gap="$2" alignItems="center">
      <YStack
        width={36}
        height={36}
        borderRadius={8}
        backgroundColor="white"
        borderWidth={1}
        borderColor="#d1fae5"
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize={16}>{icon}</Text>
      </YStack>
      <Text fontSize={12} color={colors.gray[700]} flex={1}>
        <Text fontWeight="700">Step {step}:</Text> {text}
      </Text>
    </XStack>
  )
}

function DismissLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button
      unstyled
      onPress={onPress}
      marginTop="$3"
      paddingVertical={8}
    >
      <Text color={colors.gray[400]} fontSize={13} fontWeight="500">{label}</Text>
    </Button>
  )
}

function PermanentDismissLink({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation()
  return (
    <Button
      unstyled
      onPress={onPress}
      marginTop="$2"
      paddingVertical={4}
    >
      <Text color={colors.gray[300]} fontSize={11} fontWeight="500">
        {t('notifications.noThanks')}
      </Text>
    </Button>
  )
}
