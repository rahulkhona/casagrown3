import { YStack, styled } from 'tamagui'

export const Card = styled(YStack, {
  name: 'Card',
  backgroundColor: '$card',
  borderRadius: '$lg',
  padding: '$4',
  shadowColor: 'rgba(0,0,0,0.05)',
  shadowOffset: { width: 0, height: 4 },
  shadowRadius: 10,
  elevation: 5,
  
  variants: {
    elevated: {
      true: {
        shadowColor: 'rgba(0,0,0,0.1)',
        elevation: 10,
      },
    },
    onboarding: {
      true: {
        borderRadius: '$xl',
        padding: '$6',
        maxWidth: 500,
        width: '100%',
        alignSelf: 'center',
      },
    },
  } as const,
})
