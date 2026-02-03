import React from 'react'
import { render } from '@testing-library/react-native'
import { JoinCommunityStep } from './join-community'

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}))

// Mock expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 37.785834, longitude: -122.406417 } }),
  reverseGeocodeAsync: jest.fn().mockResolvedValue([{ streetNumber: '123', street: 'Main St', city: 'San Jose', postalCode: '95120' }]),
  Accuracy: { Balanced: 3 },
}))

// Mock Safe Area
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock Tamagui icons
jest.mock('@tamagui/lucide-icons', () => ({
  Navigation: () => null,
  MapPin: () => null,
  ChevronDown: () => null,
  Check: () => null,
  Calendar: () => null,
}))

// Mock wizard context
const mockUpdateData = jest.fn()
const mockNextStep = jest.fn()
const mockPrevStep = jest.fn()

jest.mock('../wizard-context', () => ({
  useWizard: () => ({
    data: {
      address: '',
      zipCode: '',
      country: 'USA',
      community: null,
      nearbyCommunities: [],
    },
    updateData: mockUpdateData,
    nextStep: mockNextStep,
    prevStep: mockPrevStep,
  }),
}))

// Mock use-resolve-community hook
jest.mock('../../community/use-resolve-community', () => ({
  useResolveCommunity: () => ({
    resolveAddress: jest.fn().mockResolvedValue({
      primary: { h3_index: 'test-h3', name: 'Test Community' },
      neighbors: [],
    }),
    resolveLocation: jest.fn(),
    loading: false,
  }),
}))

// Mock use-incentive-rules hook
jest.mock('../utils/use-incentive-rules', () => ({
  useIncentiveRules: () => ({
    getPoints: jest.fn().mockReturnValue(50),
    points: { join_a_community: 50 },
    loading: false,
  }),
}))

// Mock Tamagui components
jest.mock('tamagui', () => {
  const { View, Text, TouchableOpacity, TextInput, ActivityIndicator } = require('react-native')
  return {
    Button: ({ children, onPress, disabled, ...props }: any) => (
      <TouchableOpacity onPress={onPress} disabled={disabled} accessible accessibilityState={{ disabled }} {...props}>{children}</TouchableOpacity>
    ),
    Input: (props: any) => <TextInput {...props} />,
    Text: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    Label: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    ScrollView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Separator: () => <View />,
    Spinner: () => <ActivityIndicator />,
    useMedia: () => ({ sm: false, md: true, lg: false }),
  }
})

describe('JoinCommunityStep', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders correctly (snapshot)', () => {
    const tree = render(<JoinCommunityStep />).toJSON()
    expect(tree).toMatchSnapshot()
  })

  it('displays translated title', () => {
    const { getByText } = render(<JoinCommunityStep />)
    
    expect(getByText('profileWizard.community.title')).toBeTruthy()
  })
})
