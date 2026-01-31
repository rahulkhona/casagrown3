import { createTokens } from 'tamagui'
import { tokens as defaultTokens } from '@tamagui/config/v5'

export const tokens = createTokens({
  ...defaultTokens,
  color: {
    ...defaultTokens.color,
    primary: '#16a34a',
    primaryHover: '#15803d',
    success: '#22c55e',
    danger: '#ef4444',
    info: '#3b82f6',
    warning: '#f59e0b',
    bg: '#f9fafb',
    card: '#ffffff',
    text: '#111827',
    textMuted: '#4b5563',
  },
  radius: {
    ...defaultTokens.radius,
    true: 12,
    lg: 24,
    xl: 32,
    full: 9999,
  },
})
