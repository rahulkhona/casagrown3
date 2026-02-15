import { useEffect } from 'react'
import { useColorScheme, Platform } from 'react-native'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { SplashScreen, Stack, useRouter, useSegments } from 'expo-router'
import { Provider } from '@casagrown/app/provider'
import { useOTAUpdates } from '@casagrown/app/hooks/useOTAUpdates'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

export const unstable_settings = {
  // Start at index.tsx which acts as auth guard and redirects appropriately
  initialRouteName: 'index',
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
// SplashScreen.preventAutoHideAsync()

export default function App() {
  // Check for OTA updates on foreground resume and periodically
  useOTAUpdates()
  const [interLoaded, interError] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  })

  useEffect(() => {
    const timeout = setTimeout(() => {
      console.log('SplashScreen safety timeout triggered')
      SplashScreen.hideAsync()
    }, 5000)

    if (interLoaded || interError) {
      if (interError) console.error('Font loading error:', interError)
      clearTimeout(timeout)
      // Hide the splash screen after the fonts have loaded (or an error was returned) and the UI is ready.
      SplashScreen.hideAsync()
    }
    return () => clearTimeout(timeout)
  }, [interLoaded, interError])

  if (!interLoaded && !interError) {
    if (Platform.OS === 'ios') {
      return <RootLayoutNav />
    }
    return null
  }

  return <RootLayoutNav />
}

/**
 * Global auth guard — the canonical Expo Router pattern.
 * Watches auth state from a single root-level useAuth instance.
 * When user signs out, onAuthStateChange fires, user becomes null,
 * and this hook redirects from any screen to the root index.
 */
function useProtectedRoute() {
  const { user, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    // Check if we're in a protected route group (tabs)
    const inProtectedGroup = segments[0] === '(tabs)'

    if (!user && inProtectedGroup) {
      // User signed out but still on a protected screen → go to root
      console.log('🔒 Auth guard: user signed out, redirecting to /')
      router.replace('/')
    }
  }, [user, loading, segments])
}

function RootLayoutNav() {
  const colorScheme = useColorScheme()

  return (
    <Provider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthGuardedStack />
      </ThemeProvider>
    </Provider>
  )
}

function AuthGuardedStack() {
  // This must be inside <Provider> to access useAuth
  useProtectedRoute()

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* Index - Auth guard entry point */}
      <Stack.Screen 
        name="index" 
        options={{ 
          headerShown: false,
          gestureEnabled: false,
        }} 
      />
      {/* Tab screens - no back gesture to prevent going back to login */}
      <Stack.Screen 
        name="(tabs)" 
        options={{ 
          headerShown: false,
          gestureEnabled: false,
        }} 
      />
      {/* Login screen */}
      <Stack.Screen 
        name="login" 
        options={{ 
          headerShown: false,
          gestureEnabled: false,
        }} 
      />
      {/* Profile wizard - can go back */}
      <Stack.Screen 
        name="profile-wizard" 
        options={{ 
          headerShown: false,
        }} 
      />
    </Stack>
  )
}
