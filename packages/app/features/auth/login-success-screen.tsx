import React from 'react'
import { YStack, Text, Button, H2, Paragraph, XStack } from '@casagrown/ui'
import { LogOut, CheckCircle } from '@tamagui/lucide-icons'
import { useRouter } from 'solito/navigation'
import { useAuth } from './auth-hook'
import { colors } from '../../design-tokens'
import { Platform } from 'react-native'

export function LoginSuccessScreen() {
  const { user, signOut } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await signOut()
    if (Platform.OS === 'web') {
        router.replace('/') 
    } else {
        router.back()
    }
  }

  return (
    <YStack flex={1} backgroundColor="white" alignItems="center" justifyContent="center" padding="$6" gap="$6">
      <YStack alignItems="center" gap="$4">
        <CheckCircle size={64} color={colors.green[600]} />
        <H2 color={colors.gray[900]} textAlign="center">Login Successful!</H2>
        <Paragraph textAlign="center" color={colors.gray[600]}>
          You are now authenticated.
        </Paragraph>
      </YStack>

      {user && (
        <YStack padding="$4" backgroundColor={colors.gray[50]} borderRadius="$4" width="100%" gap="$2">
            <Text fontWeight="bold" color={colors.gray[800]}>Session Details:</Text>
            <Text color={colors.gray[700]}>Email: {user.email}</Text>
            <Text color={colors.gray[700]}>ID: {user.id}</Text>
            <Text color={colors.gray[700]}>Last Sign In: {new Date(user.last_sign_in_at || '').toLocaleString()}</Text>
        </YStack>
      )}

      <Button 
        size="$5" 
        backgroundColor={colors.pink[700]} 
        icon={LogOut} 
        onPress={handleLogout}
        borderRadius="$4"
      >
        <Text color="white" fontWeight="600">Logout & Return Home</Text>
      </Button>
    </YStack>
  )
}
