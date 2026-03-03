import { YStack, XStack, Progress, Text, Spinner } from 'tamagui'
import { WizardProvider, useWizard } from './wizard-context'
import { ProfileSetupStep } from './steps/profile-setup'
import { PersonalizeStep } from './steps/personalize-step'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../../design-tokens'
import { useTranslation } from 'react-i18next'

const WizardSteps = () => {
  const { step, initializing } = useWizard()
  const { t } = useTranslation()
  
  // Show loading spinner while we determine the correct starting step
  if (initializing) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]}>
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>{t('profileWizard.loading')}</Text>
      </YStack>
    )
  }

  const steps = [
    <ProfileSetupStep key="account" />,
    <PersonalizeStep key="personalize" />,
  ]

  return (
    <YStack flex={1} backgroundColor={colors.green[50]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Progress Header */}
        <YStack paddingHorizontal="$4" paddingVertical="$4" gap="$2" maxWidth={600} width="100%" alignSelf="center">
          <XStack justifyContent="space-between">
            <Text color={colors.gray[500]} fontSize="$3">
              {t('profileWizard.stepOf', { current: step + 1, total: 2 })}
            </Text>
          </XStack>
          <Progress value={((step + 1) / 2) * 100} size="$1" backgroundColor={colors.gray[200]}>
            <Progress.Indicator backgroundColor={colors.green[600]} />
          </Progress>
        </YStack>

        {/* Step Content */}
        <YStack flex={1}>
          {steps[step]}
        </YStack>
      </SafeAreaView>
    </YStack>
  )
}

export const ProfileWizardScreen = () => {
  return (
    <WizardProvider>
      <WizardSteps />
    </WizardProvider>
  )
}
