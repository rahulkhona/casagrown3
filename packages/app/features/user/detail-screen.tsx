'use client'

import { Button, Paragraph, YStack } from '@casagrown/ui'
import { ChevronLeft } from '@tamagui/lucide-icons'
import { useRouter } from 'solito/navigation'

export function UserDetailScreen({ id }: { id: string }) {
  const router = useRouter()
  if (!id) {
    return null
  }
  return (
    // @ts-expect-error React type version mismatch
    <YStack
      flex={1}
      justify="center"
      items="center"
      gap="$4"
      bg="$background"
    >
      {/* @ts-expect-error React type version mismatch */}
      <Paragraph
        text="center"
        fontWeight="700"
        color="$blue10"
      >{`User ID: ${id}`}</Paragraph>
      {/* @ts-expect-error React type version mismatch */}
      <Button
        icon={ChevronLeft}
        onPress={() => router.back()}
      >
        Go Home
      </Button>
    </YStack>
  )
}
