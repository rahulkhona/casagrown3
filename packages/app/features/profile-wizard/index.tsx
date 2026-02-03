import { YStack, XStack, Progress, Text } from 'tamagui'
import { WizardProvider, useWizard } from './wizard-context'
import { ProfileSetupStep } from './steps/profile-setup'
import { JoinCommunityStep } from './steps/join-community'
import { IntroPostStep } from './steps/intro-post'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../../design-tokens'

const WizardSteps = () => {
  const { step } = useWizard()
  
  const steps = [
    <ProfileSetupStep key="profile" />,
    <JoinCommunityStep key="community" />,
    <IntroPostStep key="intro" />,
  ]

  return (
    <YStack flex={1} backgroundColor={colors.green[50]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Progress Header */}
        <YStack paddingHorizontal="$4" paddingVertical="$4" gap="$2" maxWidth={600} width="100%" alignSelf="center">
          <XStack justifyContent="space-between">
            <Text color={colors.gray[500]} fontSize="$3">Step {step + 1} of 3</Text>
          </XStack>
          <Progress value={((step + 1) / 3) * 100} size="$1" backgroundColor={colors.gray[200]}>
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
