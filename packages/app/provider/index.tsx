import { useColorScheme } from 'react-native'
import { TamaguiProvider, type TamaguiProviderProps } from 'tamagui'
import { config } from '@casagrown/config'
import { SupabaseProvider } from './supabase'

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
      <SupabaseProvider>
        {children}
      </SupabaseProvider>
    </TamaguiProvider>
  )
}
