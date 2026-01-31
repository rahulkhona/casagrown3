import { Button as TButton, styled } from 'tamagui'

export const Button = styled(TButton, {
  name: 'Button',
  backgroundColor: '$primary',
  color: '$card',
  borderRadius: '$full',
  fontWeight: '700',
  paddingHorizontal: '$5',
  paddingVertical: '$3',
  height: 'auto',
  borderWidth: 0,
  
  hoverStyle: {
    backgroundColor: '$primaryHover',
    scale: 1.02,
  },
  
  pressStyle: {
    backgroundColor: '$primaryHover',
    scale: 0.98,
  },

  variants: {
    outline: {
      true: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '$primary',
        color: '$primary',
        
        hoverStyle: {
          backgroundColor: '$bgSoft',
          borderColor: '$primaryHover',
        },
      },
    },
    ghost: {
      true: {
        backgroundColor: 'transparent',
        color: '$primary',
        
        hoverStyle: {
          backgroundColor: '$bgSoft',
        },
      },
    },
    danger: {
      true: {
        backgroundColor: '$danger',
        
        hoverStyle: {
          backgroundColor: '$danger',
          opacity: 0.9,
        },
      },
    },
  } as const,
})
