import { Progress, View, styled } from 'tamagui'

export const ProgressBar = styled(Progress, {
  name: 'ProgressBar',
  size: '$2',
  backgroundColor: '$bgSoft',
  borderRadius: '$full',
  
  variants: {
    primary: {
      true: {
        backgroundColor: '$primary',
      },
    },
  } as const,
})

// Note: Tamagui Progress component usually has a Progress.Indicator sub-component.
// We'll export a pre-styled version or just the base.
