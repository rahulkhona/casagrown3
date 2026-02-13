import { XStack, YStack, styled, Checkbox, CheckboxProps } from 'tamagui'
import { Paragraph } from './Typography'
import { Check } from '@tamagui/lucide-icons'

export const CheckboxCardContainer = styled(XStack, {
  name: 'CheckboxCardContainer',
  padding: '$4',
  borderRadius: '$lg',
  backgroundColor: '$card',
  borderWidth: 1,
  borderColor: '$borderColor',
  gap: '$4',
  alignItems: 'center',
  pressStyle: {
    backgroundColor: '$bgSoft',
  },
  
  variants: {
    checked: {
      true: {
        borderColor: '$primary',
        backgroundColor: '$bgSoft',
      },
    },
  } as const,
})

export type CheckboxCardProps = CheckboxProps & {
  title: string
  description?: string
}

export const CheckboxCard = ({ title, description, ...props }: CheckboxCardProps) => {
  return (
    <CheckboxCardContainer checked={!!props.checked} onPress={() => props.onCheckedChange?.(!props.checked)}>
      <Checkbox size="$5" {...props}>
        <Checkbox.Indicator>
          <Check color="$primary" />
        </Checkbox.Indicator>
      </Checkbox>
      <YStack flex={1}>
        <Paragraph bold>{title}</Paragraph>
        {description && <Paragraph small>{description}</Paragraph>}
      </YStack>
    </CheckboxCardContainer>
  )
}
