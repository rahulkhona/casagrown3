import { ProfileWizardScreen } from '@casagrown/app/features/profile-wizard'
import { Stack } from 'expo-router'

export default function ProfileWizardPage() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ProfileWizardScreen />
    </>
  )
}
