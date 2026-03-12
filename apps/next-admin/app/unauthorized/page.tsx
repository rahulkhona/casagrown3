'use client'

import { YStack, Text, Button } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { useRouter } from 'next/navigation'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

export default function UnauthorizedPage() {
  const router = useRouter()
  const { signOut } = useAuth()

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} padding="$4" gap="$4">
      <Text fontSize="$8" fontWeight="bold" color={colors.red[700]}>Access Denied</Text>
      <Text fontSize="$5" color={colors.gray[700]} textAlign="center" maxWidth={400}>
        You do not have the required administrator privileges to access the CasaGrown Admin Dashboard.
      </Text>
      <Button 
        marginTop="$4" 
        backgroundColor={colors.green[600]} 
        onPress={async () => {
          await signOut()
          router.replace('/login')
        }}
      >
        <Text color="white" fontWeight="600">Sign Out & Go to Login</Text>
      </Button>
    </YStack>
  )
}
