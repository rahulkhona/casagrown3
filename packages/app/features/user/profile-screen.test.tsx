import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { ProfileScreen } from './profile-screen'

// Mock auth-hook to avoid supabase/expo-secure-store initialization
jest.mock('../auth/auth-hook', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-id',
      email: 'test@casagrown.com',
    },
    loading: false,
    signOut: jest.fn(),
  }),
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({
            data: {
              full_name: 'John Doe',
              avatar_url: null,
              phone_number: '5551234567',
              push_enabled: true,
              sms_enabled: false,
              notify_on_wanted: false,
              notify_on_available: false,
              home_community_h3_index: 'abc123',
              communities: { name: 'Willow Glen', city: 'San Jose, CA', location: { type: 'Point', coordinates: [-121.8863, 37.3382] } },
            },
            error: null,
          })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null })),
      })),
    })),
    functions: {
      invoke: jest.fn(() => Promise.resolve({
        data: {
          primary: { h3_index: 'abc123', name: 'Willow Glen', city: 'San Jose, CA', location: 'POINT(-121.8863 37.3382)' },
          neighbors: [],
          resolved_location: { lat: 37.3382, lng: -121.8863 },
        },
        error: null,
      })),
    },
  },
}))

// Mock CommunityMap (require'd at module level via platform-conditional import)
jest.mock('../community/CommunityMap', () => {
  const React = require('react')
  const { View, Text: RNText } = require('react-native')
  return {
    __esModule: true,
    default: ({ resolveData, height }: any) => (
      <View testID="community-map" style={{ height }}>
        <RNText>CommunityMap Mock</RNText>
      </View>
    ),
  }
})

// Mock h3-utils
jest.mock('../community/h3-utils', () => ({
  buildResolveResponseFromIndex: jest.fn((
    h3Index: string, name: string, city: string, lat?: number, lng?: number
  ) => ({
    primary: { h3_index: h3Index, name, city, location: `POINT(${lng || 0} ${lat || 0})` },
    neighbors: [],
    resolved_location: { lat: lat || 0, lng: lng || 0 },
  })),
}))

// Mock community resolution hook
jest.mock('../community/use-resolve-community', () => ({
  useResolveCommunity: () => ({
    resolveAddress: jest.fn(() => Promise.resolve({
      primary: { h3_index: 'abc123', name: 'Willow Glen' },
      neighbors: [],
    })),
    resolveLocation: jest.fn(),
    loading: false,
  }),
}))

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))

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

// Mock solito navigation
jest.mock('solito/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}))

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({
    canceled: false,
    assets: [{ uri: 'file://test-image.jpg' }],
  })),
  launchCameraAsync: jest.fn(() => Promise.resolve({
    canceled: false,
    assets: [{ uri: 'file://camera-image.jpg' }],
  })),
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  MediaTypeOptions: { Images: 'Images' },
}))

// Mock media upload utility
jest.mock('../profile-wizard/utils/media-upload', () => ({
  uploadMedia: jest.fn(() => Promise.resolve('https://storage.supabase.io/avatar.jpg')),
}))

// Mock design tokens
jest.mock('../../design-tokens', () => ({
  colors: {
    primary: { 50: '#f0f9ff', 100: '#e0f2fe', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1' },
    neutral: { 50: '#fafafa', 300: '#d4d4d4', 400: '#a3a3a3', 500: '#737373', 600: '#525252', 900: '#171717' },
    error: { 200: '#fecaca', 600: '#dc2626' },
  },
  shadows: {
    sm: { color: '#000', offset: { width: 0, height: 1 } },
  },
  borderRadius: { md: 8, lg: 12, xl: 16 },
}))

// Mock Tamagui components
jest.mock('tamagui', () => {
  const React = require('react')
  const { View, Text, TouchableOpacity, TextInput, ActivityIndicator, ScrollView: RNScrollView } = require('react-native')
  
  const CheckboxComponent = ({ children, checked, onCheckedChange, disabled, ...props }: any) => (
    <TouchableOpacity 
      onPress={() => !disabled && onCheckedChange?.(!checked)} 
      disabled={disabled}
      accessibilityState={{ checked }}
      {...props}
    >
      <Text>{checked ? '☑' : '☐'}</Text>
      {children}
    </TouchableOpacity>
  )
  CheckboxComponent.Indicator = ({ children }: any) => <View>{children}</View>
  
  const AvatarComponent = ({ children, ...props }: any) => <View {...props}>{children}</View>
  AvatarComponent.Image = ({ src }: any) => <View testID="avatar-image" accessibilityLabel={src} />
  AvatarComponent.Fallback = ({ children, ...props }: any) => <View {...props}>{children}</View>
  
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View style={{ flexDirection: 'row' }} {...props}>{children}</View>,
    Button: ({ children, onPress, disabled, icon, ...props }: any) => (
      <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityState={{ disabled }} {...props}>
        {icon && (typeof icon === 'function' ? React.createElement(icon) : icon)}
        <Text>{typeof children === 'string' ? children : children}</Text>
      </TouchableOpacity>
    ),
    Input: (props: any) => <TextInput {...props} />,
    Text: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    Label: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    Avatar: AvatarComponent,
    Checkbox: CheckboxComponent,
    Separator: () => <View />,
    Spinner: () => <ActivityIndicator />,
    ScrollView: ({ children, ...props }: any) => <RNScrollView {...props}>{children}</RNScrollView>,
  }
})

// Mock Tamagui icons
jest.mock('@tamagui/lucide-icons', () => ({
  Camera: () => null,
  Upload: () => null,
  Bell: () => null,
  MessageSquare: () => null,
  Phone: () => null,
  Mail: () => null,
  MapPin: () => null,
  LogOut: () => null,
  Edit2: () => null,
  Pencil: () => null,
  Save: () => null,
  X: () => null,
  Settings: () => null,
  Check: () => null,
  ShoppingBag: () => null,
  Tag: () => null,
  ChevronDown: () => null,
  ChevronLeft: () => null,
}))

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders profile title', async () => {
    const { getByText } = render(<ProfileScreen />)
    
    await waitFor(() => {
      expect(getByText('profile.title')).toBeTruthy()
    })
  })

  it('matches snapshot', async () => {
    const tree = render(<ProfileScreen />)
    
    await waitFor(() => {
      expect(tree.getByText('profile.title')).toBeTruthy()
    })
    
    expect(tree.toJSON()).toMatchSnapshot()
  })

  it('renders edit profile button', async () => {
    const { getByText } = render(<ProfileScreen />)
    
    await waitFor(() => {
      expect(getByText('profile.editProfile')).toBeTruthy()
    })
  })

  it('renders user email', async () => {
    const { getByText } = render(<ProfileScreen />)
    
    await waitFor(() => {
      expect(getByText('test@casagrown.com')).toBeTruthy()
    })
  })

  it('renders notification preferences section', async () => {
    const { getByText } = render(<ProfileScreen />)
    
    await waitFor(() => {
      expect(getByText('profile.notifications')).toBeTruthy()
      // Note: pushNotifications/smsNotifications only render when notify type is selected
      expect(getByText('profile.notifyWanted')).toBeTruthy()
      expect(getByText('profile.notifyAvailable')).toBeTruthy()
    })
  })

  it('renders activity stats section', async () => {
    const { getByText } = render(<ProfileScreen />)
    
    await waitFor(() => {
      expect(getByText('profile.activityStats')).toBeTruthy()
      expect(getByText('profile.transactions')).toBeTruthy()
      expect(getByText('profile.rating')).toBeTruthy()
      expect(getByText('profile.posts')).toBeTruthy()
      expect(getByText('profile.following')).toBeTruthy()
    })
  })

  it('renders account actions section', async () => {
    const { getByText } = render(<ProfileScreen />)
    
    await waitFor(() => {
      expect(getByText('profile.accountActions')).toBeTruthy()
      expect(getByText('profile.logout')).toBeTruthy()
      expect(getByText('profile.deactivateAccount')).toBeTruthy()
    })
  })

  it('enters edit mode when edit button is pressed', async () => {
    const { getByText } = render(<ProfileScreen />)
    
    await waitFor(() => {
      expect(getByText('profile.editProfile')).toBeTruthy()
    })
    
    fireEvent.press(getByText('profile.editProfile'))
    
    await waitFor(() => {
      expect(getByText('profile.save')).toBeTruthy()
      expect(getByText('profile.cancel')).toBeTruthy()
    })
  })

  it('exits edit mode when cancel is pressed', async () => {
    const { getByText } = render(<ProfileScreen />)
    
    await waitFor(() => {
      expect(getByText('profile.editProfile')).toBeTruthy()
    })
    
    fireEvent.press(getByText('profile.editProfile'))
    
    await waitFor(() => {
      expect(getByText('profile.cancel')).toBeTruthy()
    })
    
    fireEvent.press(getByText('profile.cancel'))
    
    await waitFor(() => {
      expect(getByText('profile.editProfile')).toBeTruthy()
    })
  })

  it('renders community section with community name', async () => {
    const { getByText } = render(<ProfileScreen />)
    
    await waitFor(() => {
      expect(getByText('Willow Glen')).toBeTruthy()
    })
  })
})
