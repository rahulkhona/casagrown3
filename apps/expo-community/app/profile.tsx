import { ProfileScreen } from '@casagrown/app/features/user/profile-screen'
import { Stack } from 'expo-router'

export default function ProfilePage() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ProfileScreen />
    </>
  )
}
