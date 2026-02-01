
import { LoginSuccessScreen } from '@casagrown/app/features/auth/login-success-screen'
import { Stack } from 'expo-router'

export default function Page() {
  return (
    <>
      <Stack.Screen 
        options={{
          headerTitle: 'Success',
          headerShown: false, // Let the screen handle UI
        }} 
      />
      <LoginSuccessScreen />
    </>
  )
}
