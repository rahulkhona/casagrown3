import React from 'react'
import { render } from '@testing-library/react-native'

// Mock the PersonalizeStep component import
const mockUpdateData = jest.fn()
const mockSaveProfile = jest.fn()
const mockPrevStep = jest.fn()

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
    user: { id: 'test-user-id', email: 'test@example.com' },
    loading: false,
  }),
  supabase: {
    rpc: jest.fn((fnName: string) => {
      if (fnName === 'get_popular_produce_for_zip') {
        return Promise.resolve({
          data: [
            { produce_name: 'Tomatoes', category: 'fruits', emoji: '🍅', season: 'summer', rank: 1 },
            { produce_name: 'Basil', category: 'herbs', emoji: '🌿', season: 'summer', rank: 1 },
            { produce_name: 'Sunflowers', category: 'flowers', emoji: '🌻', season: 'summer', rank: 1 },
            { produce_name: 'Peppers', category: 'vegetables', emoji: '🫑', season: 'summer', rank: 1 },
          ],
          error: null,
        })
      }
      return Promise.resolve({ data: [], error: null })
    }),
    from: jest.fn((table: string) => {
      if (table === 'blocked_products') {
        const mockResult = Promise.resolve({ data: [], error: null })
        return {
          select: jest.fn(() => ({
            or: jest.fn(() => mockResult),
            is: jest.fn(() => mockResult),
          })),
        }
      }
      // Default fallback
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          in: jest.fn(() => Promise.resolve({ data: [], error: null })),
          order: jest.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      }
    }),
  },
}))

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}))

// Mock Safe Area
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock solito navigation
jest.mock('solito/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}))

// Mock use-campaign-rewards
jest.mock('../utils/use-campaign-rewards', () => ({
  useCampaignRewards: () => ({
    rewards: [],
    loading: false,
  }),
}))

// Mock Tamagui icons
jest.mock('@tamagui/lucide-icons', () => ({
  Leaf: () => null,
  Plus: () => null,
  X: () => null,
  MapPin: () => null,
  Phone: () => null,
  Check: () => null,

}))

// Mock wizard context
jest.mock('../wizard-context', () => ({
  useWizard: () => ({
    data: {
      name: 'Test User',
      avatar: '',
      streetAddress: '123 Main St',
      city: 'San Jose',
      stateCode: 'CA',
      zipCode: '95125',
      phone: '5551234567',
      emailVerified: true,
      phoneVerified: false,
      community: { name: 'Willow Glen', h3Index: 'abc123' },
      gardenItems: [],
      customGardenItems: [],
      smsDigest: false,
      country: 'USA',
      campaignPoints: { signup: 100, first_post: 50, per_referral: 50 },
    },
    updateData: mockUpdateData,
    saveProfile: mockSaveProfile,
    prevStep: mockPrevStep,
    loading: false,
    initializing: false,
  }),
}))

// Mock Tamagui components
jest.mock('tamagui', () => {
  const React = require('react')
  const { View, Text, TouchableOpacity, TextInput, Switch: RNSwitch } = require('react-native')
  
  const SwitchComponent = (props: any) => <RNSwitch {...props} />
  SwitchComponent.Thumb = (props: any) => <View {...props} />
  
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
    Switch: SwitchComponent,
    Separator: () => <View />,
    Spinner: () => null,
    useMedia: () => ({ sm: false, md: true, lg: false }),
  }
})

// Import after mocks
import { PersonalizeStep } from './personalize-step'

describe('PersonalizeStep (Step 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders correctly (snapshot)', () => {
    const tree = render(<PersonalizeStep />).toJSON()
    expect(tree).toMatchSnapshot()
  })

  it('displays the step title', () => {
    const { getByText } = render(<PersonalizeStep />)
    expect(getByText('profileWizard.personalize.title')).toBeTruthy()
  })

  it('displays community (read-only from Step 1)', () => {
    const { getByText } = render(<PersonalizeStep />)
    // Community name should be shown as read-only badge from Step 1
    expect(getByText(/Willow Glen/)).toBeTruthy()
  })

  it('displays phone section', () => {
    const { getByText } = render(<PersonalizeStep />)
    expect(getByText('profileWizard.personalize.phoneTitle')).toBeTruthy()
  })

  it('displays garden section', () => {
    const { getByText } = render(<PersonalizeStep />)
    expect(getByText('profileWizard.personalize.gardenTitle')).toBeTruthy()
  })

  it('displays SMS digest section', () => {
    const { getByText } = render(<PersonalizeStep />)
    expect(getByText('profileWizard.personalize.smsDigestLabel')).toBeTruthy()
  })

  it('displays finish button', () => {
    const { getByText } = render(<PersonalizeStep />)
    expect(getByText('profileWizard.personalize.finish')).toBeTruthy()
  })

  it('displays skip button', () => {
    const { getByText } = render(<PersonalizeStep />)
    expect(getByText('profileWizard.personalize.skip')).toBeTruthy()
  })

  it('displays go back link', () => {
    const { getByText } = render(<PersonalizeStep />)
    expect(getByText('profileWizard.personalize.goBack')).toBeTruthy()
  })
})
