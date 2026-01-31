import { createInterFont } from '@tamagui/font-inter'

export const headingFont = createInterFont({
  size: {
    6: 15,
  },
  transform: {
    6: 'uppercase',
    7: 'none',
  },
  weight: {
    1: '400',
    2: '700',
    3: '800', // Heading weight
  },
  color: {
    6: '$colorFocus',
    7: '$color',
  },
  face: {
    700: { normal: 'InterBold' },
    800: { normal: 'InterExtraBold' },
  },
})

export const bodyFont = createInterFont(
  {
    face: {
      400: { normal: 'Inter' },
      500: { normal: 'InterMedium' },
      700: { normal: 'InterBold' },
    },
    weight: {
      1: '400',
      2: '500',
      3: '700',
    },
  },
  {
    sizeSize: (size) => Math.round(size * 1.1),
    sizeLineHeight: (size) => Math.round(size * 1.1 + (size > 20 ? 10 : 10)),
  }
)
