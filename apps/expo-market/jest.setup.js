// Mock expo modules that require native binaries
jest.mock('expo-linking', () => ({
  parse: jest.fn((url) => {
    try {
      const parsed = new URL(url)
      return {
        hostname: parsed.hostname,
        path: parsed.pathname.replace(/^\//, ''),
        queryParams: Object.fromEntries(parsed.searchParams),
      }
    } catch {
      return { hostname: null, path: null, queryParams: null }
    }
  }),
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  openSettings: jest.fn(),
}))

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[mock-token]' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}))

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}))

jest.mock('react-native-webview', () => {
  const { forwardRef } = require('react')
  const { View } = require('react-native')
  return {
    WebView: forwardRef((props, ref) =>
      require('react').createElement(View, { ...props, ref, testID: 'webview' })
    ),
  }
})

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return {
    SafeAreaView: (props) => require('react').createElement(View, props),
    SafeAreaProvider: (props) => require('react').createElement(View, props),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})
