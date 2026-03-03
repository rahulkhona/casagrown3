import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { ProfileSetupStep } from './profile-setup'

// Mock expo-modules-core (required by expo-secure-store)
jest.mock('expo-modules-core', () => ({
  EventEmitter: jest.fn(),
  requireNativeModule: jest.fn(() => ({})),
}))

// Mock CommunityMapWrapper
jest.mock('../../create-post/CommunityMapWrapper', () => ({
  CommunityMapWrapper: () => null,
}))

// Mock community types
jest.mock('../../community/use-resolve-community', () => ({}))

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

// Mock auth-hook
jest.mock('../../auth/auth-hook', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com', app_metadata: { provider: 'email' } },
    loading: false,
    signInWithOtp: jest.fn(),
    verifyOtp: jest.fn(),
    signInWithOAuth: jest.fn(),
    signOut: jest.fn(),
  }),
  supabase: {
    functions: {
      invoke: jest.fn().mockResolvedValue({ data: null }),
    },
  },
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
  Check: () => null,
  MapPin: () => null,
  Navigation: () => null,
}))

// Mock wizard context
const mockUpdateData = jest.fn()
const mockNextStep = jest.fn()

jest.mock('../wizard-context', () => ({
  useWizard: () => ({
    data: {
      name: 'Test User',
      avatar: '',
      streetAddress: '',
      city: '',
      stateCode: '',
      zipCode: '',
      phone: '',
      emailVerified: false,
      phoneVerified: false,
      community: null,
      notifySell: false,
      notifyBuy: false,
      notifyPush: true,
      notifySms: false,
      country: 'USA',
      gardenItems: [],
      customGardenItems: [],
      smsDailyDigest: false,
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
  
  // Compound component for Select with Trigger, Content, etc.
  const SelectComponent = ({ children, value, onValueChange, ...props }: any) => (
    <View {...props}>{children}</View>
  )
  SelectComponent.Trigger = ({ children, ...props }: any) => <TouchableOpacity {...props}>{children}</TouchableOpacity>
  SelectComponent.Value = ({ children, placeholder, ...props }: any) => (
    <Text {...props}>{children || placeholder}</Text>
  )
  SelectComponent.Content = ({ children }: any) => <View>{children}</View>
  SelectComponent.ScrollUpButton = () => null
  SelectComponent.ScrollDownButton = () => null
  SelectComponent.Viewport = ({ children }: any) => <View>{children}</View>
  SelectComponent.Group = ({ children }: any) => <View>{children}</View>
  SelectComponent.Item = ({ children, ...props }: any) => <TouchableOpacity {...props}>{children}</TouchableOpacity>
  SelectComponent.ItemText = ({ children }: any) => <Text>{children}</Text>
  SelectComponent.ItemIndicator = ({ children }: any) => <View>{children}</View>
  
  return {
    Button: ({ children, onPress, disabled, ...props }: any) => (
      <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityState={{ disabled }} {...props}>
        {typeof children === 'string' ? <Text>{children}</Text> : children}
      </TouchableOpacity>
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
    Select: SelectComponent,
    Sheet: ({ children }: any) => <View>{children}</View>,
    Separator: () => <View />,
    Spinner: () => null,
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

  it('displays the step title', () => {
    const { getByText } = render(<ProfileSetupStep />)
    expect(getByText('profileWizard.setup.title')).toBeTruthy()
  })

  it('displays address field labels', () => {
    const { getByText } = render(<ProfileSetupStep />)
    expect(getByText('profileWizard.setup.streetLabel')).toBeTruthy()
    expect(getByText('profileWizard.setup.cityLabel')).toBeTruthy()
    expect(getByText('profileWizard.setup.stateLabel')).toBeTruthy()
    expect(getByText('profileWizard.setup.zipLabel')).toBeTruthy()
  })

  it('displays community section', () => {
    const { getByText } = render(<ProfileSetupStep />)
    expect(getByText('profileWizard.setup.communityWaiting')).toBeTruthy()
  })

  it('updates local name state when name changes', () => {
    const { getAllByDisplayValue } = render(<ProfileSetupStep />)
    const nameInputs = getAllByDisplayValue('Test User')
    if (nameInputs.length > 0) {
      fireEvent.changeText(nameInputs[0], 'New Name')
      // Component uses local state, updateData is called on step transition
      expect(nameInputs[0].props.value).toBe('New Name')
    }
  })

  it('renders street address input', () => {
    const { getByText } = render(<ProfileSetupStep />)
    // Street address label should be present
    expect(getByText('profileWizard.setup.streetLabel')).toBeTruthy()
  })
})
