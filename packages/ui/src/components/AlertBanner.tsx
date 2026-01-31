import { XStack, styled, Theme } from 'tamagui'
import { Paragraph } from './Typography'

export const AlertBanner = styled(XStack, {
  name: 'AlertBanner',
  padding: '$4',
  borderRadius: '$lg',
  alignItems: 'center',
  gap: '$3',
  
  variants: {
    type: {
      success: {
        backgroundColor: '$success',
        // We might want to use a specific theme here if we define them
      },
      info: {
        backgroundColor: '$info',
      },
      warning: {
        backgroundColor: '$warning',
      },
      danger: {
        backgroundColor: '$danger',
      },
      primary: {
        backgroundColor: '$primary',
      },
    },
  } as const,
  
  defaultVariants: {
    type: 'info',
  },
})
