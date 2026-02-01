import React from 'react'
import { render } from '@testing-library/react-native'
import { LoginScreen } from './login-screen'

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en',
      changeLanguage: jest.fn(),
    },
  }),
}))

// Mock Safe Area
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock Tamagui icons
jest.mock('@tamagui/lucide-icons', () => ({
  ArrowLeft: () => null,
  Mail: () => null,
  Chrome: () => null,
  Facebook: () => null, // Added missing icons if needed
}))

// Mock image asset requires
jest.mock('react-native', () => {
    const RN = jest.requireActual('react-native');
    RN.Image.resolveAssetSource = jest.fn((source) => source);
    return RN;
});

// Mock Solito Router
jest.mock('solito/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}))

// Mock useAuth HOOK
const mockSignInWithOtp = jest.fn()
const mockVerifyOtp = jest.fn()
const mockSignInWithOAuth = jest.fn()

jest.mock('./auth-hook', () => ({
  useAuth: () => ({
    signInWithOtp: mockSignInWithOtp,
    verifyOtp: mockVerifyOtp,
    signInWithOAuth: mockSignInWithOAuth,
    user: null,
    loading: false,
  }),
}))


// Mock Tamagui components (since LoginScreen imports directly from 'tamagui')
jest.mock('tamagui', () => {
  const { View, Text, TouchableOpacity, TextInput } = require('react-native')
  return {
    Button: ({ children, onPress, ...props }: any) => (
      <TouchableOpacity onPress={onPress} {...props}>{children}</TouchableOpacity>
    ),
    Input: (props: any) => <TextInput {...props} />,
    Text: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    ScrollView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Separator: () => <View />,
    useMedia: () => ({ sm: false, md: true, lg: false }), // Mock useMedia hook
  }
})

describe('LoginScreen', () => {
  it('renders correctly (initial state)', () => {
    // Snapshot of the initial render where user is asked to select login method
    const tree = render(<LoginScreen />).toJSON()
    expect(tree).toMatchSnapshot()
  })
})
