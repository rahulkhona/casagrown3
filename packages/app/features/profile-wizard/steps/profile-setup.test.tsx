import React from 'react'
import { render } from '@testing-library/react-native'
import { ProfileSetupStep } from './profile-setup'

// Mock expo-modules-core (required by expo-secure-store)
jest.mock('expo-modules-core', () => ({
  EventEmitter: jest.fn(),
  requireNativeModule: jest.fn(() => ({})),
}))

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

// Mock auth-hook
jest.mock('../../auth/auth-hook', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signInWithOtp: jest.fn(),
    verifyOtp: jest.fn(),
    signInWithOAuth: jest.fn(),
    signOut: jest.fn(),
  }),
}))

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}))

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///mock/photo.jpg' }] }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///mock/image.jpg' }] }),
  MediaTypeOptions: { All: 'All', Images: 'Images', Videos: 'Videos' },
}))

// Mock Safe Area
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock Tamagui icons
jest.mock('@tamagui/lucide-icons', () => ({
  Camera: () => null,
  Upload: () => null,
  Bell: () => null,
  MessageSquare: () => null,
  Check: () => null,
}))

// Mock wizard context
const mockUpdateData = jest.fn()
const mockNextStep = jest.fn()

jest.mock('../wizard-context', () => ({
  useWizard: () => ({
    data: {
      name: 'Test User',
      avatar: '',
      notifySell: false,
      notifyBuy: false,
      notifyPush: true,
      notifySms: false,
      phone: '',
    },
    updateData: mockUpdateData,
    nextStep: mockNextStep,
  }),
}))

// Mock Tamagui components
jest.mock('tamagui', () => {
  const { View, Text, TouchableOpacity, TextInput, Switch: RNSwitch } = require('react-native')
  
  // Compound component for Checkbox with Indicator
  const CheckboxComponent = ({ children, checked, onCheckedChange, ...props }: any) => (
    <TouchableOpacity onPress={() => onCheckedChange?.(!checked)} {...props}>
      <Text>{checked ? '☑' : '☐'}</Text>
      {children}
    </TouchableOpacity>
  )
  CheckboxComponent.Indicator = ({ children }: any) => <View>{children}</View>
  
  return {
    Button: ({ children, onPress, ...props }: any) => (
      <TouchableOpacity onPress={onPress} {...props}>{children}</TouchableOpacity>
    ),
    Input: (props: any) => <TextInput {...props} />,
    Text: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    Label: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    ScrollView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Avatar: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Switch: (props: any) => <RNSwitch {...props} />,
    Checkbox: CheckboxComponent,
    Sheet: ({ children }: any) => <View>{children}</View>,
    Separator: () => <View />,
    useMedia: () => ({ sm: false, md: true, lg: false }),
  }
})

describe('ProfileSetupStep', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders correctly (snapshot)', () => {
    const tree = render(<ProfileSetupStep />).toJSON()
    expect(tree).toMatchSnapshot()
  })

  it('displays translated labels', () => {
    const { getByText } = render(<ProfileSetupStep />)
    
    expect(getByText('profileWizard.setup.title')).toBeTruthy()
  })
})
