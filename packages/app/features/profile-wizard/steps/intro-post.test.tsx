import React from 'react'
import { render } from '@testing-library/react-native'
import { IntroPostStep } from './intro-post'

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => params ? `${key}:${JSON.stringify(params)}` : key,
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
  UIImagePickerControllerQualityType: { Medium: 1 },
}))

// Mock Solito Router
jest.mock('solito/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}))

// Mock Safe Area
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock Tamagui icons
jest.mock('@tamagui/lucide-icons', () => ({
  Check: () => null,
  Camera: () => null,
  Upload: () => null,
  Plus: () => null,
  Trash: () => null,
  Video: () => null,
}))

// Mock wizard context
const mockUpdateData = jest.fn()
const mockPrevStep = jest.fn()
const mockSaveProfile = jest.fn().mockResolvedValue(true)

jest.mock('../wizard-context', () => ({
  useWizard: () => ({
    data: {
      introText: '',
      produceTags: [],
      introMedia: [],
      community: { name: 'Test Community', h3Index: 'test-h3' },
    },
    updateData: mockUpdateData,
    prevStep: mockPrevStep,
    saveProfile: mockSaveProfile,
    loading: false,
  }),
}))

// Mock use-incentive-rules hook
jest.mock('../utils/use-incentive-rules', () => ({
  useIncentiveRules: () => ({
    getPoints: jest.fn().mockReturnValue(50),
    points: { make_first_post: 50 },
    loading: false,
  }),
}))

// Mock Tamagui components
jest.mock('tamagui', () => {
  const { View, Text, TouchableOpacity, TextInput, ActivityIndicator } = require('react-native')
  
  // Compound component for Checkbox with Indicator
  const CheckboxComponent = ({ children, checked, onCheckedChange, ...props }: any) => (
    <TouchableOpacity onPress={() => onCheckedChange?.(!checked)} {...props}>
      <Text>{checked ? '☑' : '☐'}</Text>
      {children}
    </TouchableOpacity>
  )
  CheckboxComponent.Indicator = ({ children }: any) => <View>{children}</View>
  
  return {
    Button: ({ children, onPress, disabled, ...props }: any) => (
      <TouchableOpacity onPress={onPress} disabled={disabled} accessible accessibilityState={{ disabled }} {...props}>{children}</TouchableOpacity>
    ),
    Input: (props: any) => <TextInput {...props} />,
    TextArea: (props: any) => <TextInput multiline {...props} />,
    Text: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    Label: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    ScrollView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Checkbox: CheckboxComponent,
    Spinner: () => <ActivityIndicator />,
    useMedia: () => ({ sm: false, md: true, lg: false }),
  }
})

describe('IntroPostStep', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders correctly (snapshot)', () => {
    const tree = render(<IntroPostStep />).toJSON()
    expect(tree).toMatchSnapshot()
  })

  it('displays translated title', () => {
    const { getByText } = render(<IntroPostStep />)
    
    expect(getByText('profileWizard.intro.title')).toBeTruthy()
  })
})
