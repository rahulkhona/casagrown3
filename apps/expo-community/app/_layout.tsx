import { useEffect } from 'react'
import { useColorScheme, Platform } from 'react-native'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { SplashScreen, Stack } from 'expo-router'
import { Provider } from '@casagrown/app/provider'

export const unstable_settings = {
  // Start at index.tsx which acts as auth guard and redirects appropriately
  initialRouteName: 'index',
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
// SplashScreen.preventAutoHideAsync()

export default function App() {
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

function RootLayoutNav() {
  const colorScheme = useColorScheme()

  return (
    <Provider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
      </ThemeProvider>
    </Provider>
  )
}
