import { XStack, YStack, styled, Circle, Text } from 'tamagui'
import { Search, MessageSquare, ShoppingBag, User } from '@tamagui/lucide-icons'
import { Input } from './Input'
import { Paragraph } from './Typography'

export const HeaderContainer = styled(XStack, {
  name: 'HeaderContainer',
  backgroundColor: '$card',
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  gap: '$4',
})

export const NavIcon = ({ icon: Icon, badgeCount, label }: { icon: any, badgeCount?: number, label?: string }) => (
  <YStack alignItems="center" gap="$1" pressStyle={{ opacity: 0.7 }}>
    <XStack>
      <Icon size={24} color="$text" />
      {badgeCount !== undefined && badgeCount > 0 && (
        <Circle
          size={18}
          backgroundColor="$danger"
          position="absolute"
          top={-5}
          right={-5}
          alignItems="center"
          justifyContent="center"
        >
          <Text color="white" fontSize={10} fontWeight="800">
            {badgeCount}
          </Text>
        </Circle>
      )}
    </XStack>
    {label && <Paragraph small style={{ fontSize: 10 }}>{label}</Paragraph>}
  </YStack>
)
