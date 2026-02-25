// Polyfill __DEV__ for React Native packages in web environment
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__DEV__ === 'undefined') {
  (globalThis as any).__DEV__ = process.env.NODE_ENV !== 'production'
}

import { useColorScheme, Platform } from 'react-native'
import { TamaguiProvider, type TamaguiProviderProps } from 'tamagui'
import { config } from '@casagrown/config'
import { SupabaseProvider } from './supabase'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { ToastProvider, ToastViewport } from '@casagrown/ui'
import { CustomToast } from '@casagrown/ui'
import { WebPushListener } from '../features/notifications/WebPushListener'
import { RealtimeNotificationListener } from '../features/notifications/RealtimeNotificationListener'

// Only import Stripe on native — the package contains RN-only code that breaks Next.js
let StripeProvider: any = null
if (Platform.OS !== 'web') {
  try {
    StripeProvider = require('@stripe/stripe-react-native').StripeProvider
  } catch { /* Stripe native not available */ }
}

export function Provider({
  children,
  defaultTheme = 'light',
  ...rest
}: Omit<TamaguiProviderProps, 'config' | 'defaultTheme'> & { defaultTheme?: string }) {
  const colorScheme = useColorScheme()
  const theme = defaultTheme || (colorScheme === 'dark' ? 'dark' : 'light')

  const stripePublishableKey = 
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 
    ''

  const wrappedChildren = (
    <ToastProvider swipeDirection="horizontal" duration={4000} burstLimit={2}>
      <SupabaseProvider>
        {children}
        <CustomToast />
        <ToastViewport left={0} right={0} top={10} />
        {Platform.OS === 'web' && <WebPushListener />}
        <RealtimeNotificationListener />
      </SupabaseProvider>
    </ToastProvider>
  )

  return (
    <TamaguiProvider
      config={config}
      defaultTheme={theme}
      {...rest}
    >
      <I18nextProvider i18n={i18n}>
        {StripeProvider ? (
          <StripeProvider publishableKey={stripePublishableKey}>
            {wrappedChildren}
          </StripeProvider>
        ) : wrappedChildren}
      </I18nextProvider>
    </TamaguiProvider>
  )
}
