import { Input as TInput, styled } from 'tamagui'

export const Input = styled(TInput, {
  name: 'Input',
  backgroundColor: '$bg',
  borderRadius: '$true', // 12px
  borderWidth: 1,
  borderColor: '$borderColor',
  paddingHorizontal: '$4',
  height: 50,
  fontSize: 16,
  color: '$text',
  
  focusStyle: {
    borderColor: '$primary',
    borderWidth: 2,
    backgroundColor: '$card',
  },
})
