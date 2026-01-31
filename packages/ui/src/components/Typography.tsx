import { H1 as TH1, H2 as TH2, H3 as TH3, H4 as TH4, Paragraph as TParagraph, styled } from 'tamagui'

export const Heading = styled(TH1, {
  name: 'Heading',
  color: '$text',
  fontWeight: '800',
  fontFamily: '$heading',
  
  variants: {
    size: {
      h1: { fontSize: 32, lineHeight: 40 },
      h2: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
      h3: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
      h4: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
    },
  } as const,
  
  defaultVariants: {
    size: 'h1',
  },
})

export const Paragraph = styled(TParagraph, {
  name: 'Paragraph',
  color: '$textMuted',
  fontSize: 16,
  lineHeight: 24,
  fontFamily: '$body',
  
  variants: {
    small: {
      true: {
        fontSize: 14,
        lineHeight: 20,
      },
    },
    bold: {
      true: {
        fontWeight: '700',
        color: '$text',
      },
    },
  } as const,
})
