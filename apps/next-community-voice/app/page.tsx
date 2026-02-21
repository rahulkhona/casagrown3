'use client'

import { YStack, Text, Button, Paragraph, XStack, Image, useMedia } from 'tamagui'
import { useRouter } from 'next/navigation'
import { colors } from '@casagrown/app/design-tokens'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

export default function Page() {
  const router = useRouter()
  const media = useMedia()
  const isDesktop = !media.sm
  const { user } = useAuth()

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" padding="$3" backgroundColor={colors.green[50]}>
      <YStack maxWidth={600} width="100%" gap="$4" alignItems="center" paddingHorizontal="$2">
        <YStack marginBottom={isDesktop ? '$4' : '$2'}>
          <Image src="/logo.png" width={80} height={80} />
        </YStack>
        <Text textAlign="center" color={colors.green[800]} fontSize={isDesktop ? 32 : 24} fontWeight="700" fontFamily="$body">
          CasaGrown Community Voice
        </Text>
        <Paragraph textAlign="center" fontSize={isDesktop ? 15 : 14} fontWeight="400" color={colors.gray[700]} lineHeight={isDesktop ? 24 : 22} maxWidth={480}>
          Help us build a better CasaGrown. Report bugs or suggest new features.
        </Paragraph>
        
        <YStack gap={isDesktop ? '$4' : '$3'} width="100%" alignItems="center" marginTop="$4" {...(isDesktop && { flexDirection: 'row', justifyContent: 'center' } as any)}>
          <Button 
            backgroundColor={colors.green[600]} 
            borderRadius={28}
            paddingHorizontal="$6"
            onPress={() => router.push(user ? '/submit' : '/login?returnTo=/submit')}
            size="$4"
            width="100%"
            maxWidth={280}
            hoverStyle={{ backgroundColor: colors.green[700] }}
            pressStyle={{ backgroundColor: colors.green[700] }}
          >
            <Text color="white" fontWeight="600" fontSize={16}>Submit Feedback</Text>
          </Button>
          <Button 
            variant="outlined" 
            borderColor={colors.green[600]}
            borderRadius={28}
            paddingHorizontal="$6"
            onPress={() => router.push('/board')}
            size="$4"
            width="100%"
            maxWidth={280}
          >
            <Text color={colors.green[600]} fontWeight="600" fontSize={16}>Browse Board</Text>
          </Button>
        </YStack>

        <YStack marginTop="$8" alignItems="center">
            <Text color={colors.gray[500]} fontSize={13} fontWeight="400">
                Staff Member? <Text color={colors.green[600]} fontWeight="600" onPress={() => router.push('/login')}>Log in here</Text>
            </Text>
        </YStack>
      </YStack>
    </YStack>
  )
}
