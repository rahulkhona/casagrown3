// Polyfill __DEV__ for React Native packages in web environment
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__DEV__ === 'undefined') {
  (globalThis as any).__DEV__ = process.env.NODE_ENV !== 'production'
}

import { useColorScheme } from 'react-native'
import { TamaguiProvider, type TamaguiProviderProps } from 'tamagui'
import { config } from '@casagrown/config'
import { SupabaseProvider } from './supabase'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'

export function Provider({
  children,
  defaultTheme = 'light',
  ...rest
}: Omit<TamaguiProviderProps, 'config' | 'defaultTheme'> & { defaultTheme?: string }) {
  const colorScheme = useColorScheme()
  const theme = defaultTheme || (colorScheme === 'dark' ? 'dark' : 'light')

  return (
    <TamaguiProvider
      config={config}
      defaultTheme={theme}
      {...rest}
    >
      <I18nextProvider i18n={i18n}>
        <SupabaseProvider>
          {children}
        </SupabaseProvider>
      </I18nextProvider>
    </TamaguiProvider>
  )
}
