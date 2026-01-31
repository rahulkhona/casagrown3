import { XStack, styled } from 'tamagui'
import { Paragraph } from './Typography'

export const Pill = styled(XStack, {
  name: 'Pill',
  paddingHorizontal: '$3',
  paddingVertical: '$1.5',
  borderRadius: '$full',
  backgroundColor: '$bgSoft',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'transparent',
  
  variants: {
    active: {
      true: {
        backgroundColor: '$primary',
        borderColor: '$primary',
      },
    },
    outline: {
      true: {
        backgroundColor: 'transparent',
        borderColor: '$primary',
      },
    },
  } as const,
})

export const PillText = styled(Paragraph, {
  small: true,
  fontWeight: '500',
  color: '$textMuted',
  
  variants: {
    active: {
      true: {
        color: '$card',
      },
    },
    outline: {
      true: {
        color: '$primary',
      },
    },
  } as const,
})
