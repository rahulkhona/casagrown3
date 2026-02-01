import { createTokens } from 'tamagui'
import { tokens as defaultTokens } from '@tamagui/config/v5'

export const tokens = createTokens({
  ...defaultTokens,
  color: {
    // Green scale (primary brand color)
    green50: '#f0fdf4',
    green100: '#dcfce7',
    green200: '#bbf7d0',
    green300: '#86efac',
    green400: '#4ade80',
    green500: '#22c55e',
    green600: '#16a34a',
    green700: '#15803d',
    green800: '#166534',
    green900: '#14532d',
    
    // Gray scale
    gray50: '#f9fafb',
    gray100: '#f3f4f6',
    gray200: '#e5e7eb',
    gray300: '#d1d5db',
    gray400: '#9ca3af',
    gray500: '#6b7280',
    gray600: '#4b5563',
    gray700: '#374151',
    gray800: '#1f2937',
    gray900: '#111827',
    
    // White and black
    white: '#ffffff',
    black: '#000000',
    
    // Semantic aliases
    primary: '#16a34a',
    primaryHover: '#15803d',
    primaryLight: '#dcfce7',
    success: '#22c55e',
    danger: '#ef4444',
    info: '#3b82f6',
    warning: '#f59e0b',
    
    // Background colors
    bg: '#ffffff',
    bgSoft: '#f9fafb',
    bgMuted: '#f3f4f6',
    card: '#ffffff',
    
    // Text colors
    text: '#111827',
    textMuted: '#4b5563',
    textLight: '#9ca3af',
    
    // Border colors
    border: '#e5e7eb',
    borderMuted: '#f3f4f6',
  },
  radius: {
    ...defaultTokens.radius,
    true: 12,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
    full: 9999,
  },
  space: {
    ...defaultTokens.space,
    section: 80,
    container: 1200,
  },
})


