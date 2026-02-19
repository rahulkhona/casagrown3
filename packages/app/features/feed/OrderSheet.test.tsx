/**
 * OrderSheet Tests
 *
 * Tests rendering of the drop-off request form, validation,
 * points balance display, and insufficient points flow.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { OrderSheet } from './OrderSheet'
import type { FeedPost } from './feed-service'
// Mock supabase (must come before imports that trigger the chain)
jest.mock('../../utils/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) },
    functions: { invoke: jest.fn() },
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `http://localhost/storage/${path}` },
        }),
      }),
    },
  },
}))

// Mock payment service chain
jest.mock('../../hooks/usePaymentService', () => ({
  usePaymentService: () => ({
    processPayment: jest.fn(),
    loading: false,
    error: null,
  }),
}))

// Mock supabase
jest.mock('../auth/auth-hook', () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `http://localhost/storage/${path}` },
        }),
      }),
    },
  },
}))

// Mock normalize-storage-url
jest.mock('../../utils/normalize-storage-url', () => ({
  normalizeStorageUrl: (url: string | null | undefined) => url || undefined,
}))

// Mock lucide icons
jest.mock('@tamagui/lucide-icons', () => ({
  X: () => null,
  ShoppingCart: () => null,
  MapPin: () => null,
  Calendar: () => null,
  FileText: () => null,
  Info: () => null,
  AlertTriangle: () => null,
  MessagesSquare: () => null,
  CreditCard: () => null,
  Building2: () => null,
  Sparkles: () => null,
  Navigation2: () => null,
}))

// Mock tamagui
jest.mock('tamagui', () => {
  const { View, Text: RNText, TouchableOpacity, ScrollView: RNScrollView, ActivityIndicator } = require('react-native')
  return {
    Button: ({ children, onPress, icon, disabled, ...props }: any) => (
      <TouchableOpacity onPress={onPress} disabled={disabled} {...props}>
        {icon}
        {typeof children === 'string' ? <RNText>{children}</RNText> : children}
      </TouchableOpacity>
    ),
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    ScrollView: ({ children, ...props }: any) => <RNScrollView {...props}>{children}</RNScrollView>,
    Spinner: () => null,
  }
})

// Mock react-native Alert
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}))

// Mock expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 37.33, longitude: -121.89 } }),
  reverseGeocodeAsync: jest.fn().mockResolvedValue([{ streetNumber: '123', street: 'Main St', city: 'San Jose', region: 'CA', postalCode: '95120' }]),
  Accuracy: { Balanced: 3 },
}))

// Mock CalendarPicker
jest.mock('../create-post/CalendarPicker', () => ({
  CalendarPicker: () => null,
}))

const t = (key: string, opts?: Record<string, any>) => {
  if (opts) {
    return Object.entries(opts).reduce(
      (str, [k, v]) => str.replace(`{{${k}}}`, String(v)),
      key
    )
  }
  return key
}

const makeSellPost = (overrides?: Partial<FeedPost>): FeedPost => ({
  id: 'post-1',
  author_id: 'seller-1',
  author_name: 'Alice Smith',
  author_avatar_url: null,
  type: 'want_to_sell',
  reach: 'community',
  content: 'Fresh organic tomatoes!',
  created_at: new Date().toISOString(),
  community_h3_index: 'h3-abc',
  community_name: 'Sunset Park',
  sell_details: {
    category: 'vegetables',
    produce_name: 'Tomatoes',
    unit: 'box',
    total_quantity_available: 10,
    points_per_unit: 5,
    delivery_dates: [],
  },
  buy_details: null,
  media: [],
  like_count: 3,
  comment_count: 1,
  is_liked: false,
  is_flagged: false,
  ...overrides,
})

describe('OrderSheet', () => {
  const defaultProps = {
    visible: true,
    post: makeSellPost(),
    userPoints: 100,
    onClose: jest.fn(),
    onSubmit: jest.fn(),
    t,
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('renders nothing when not visible', () => {
    const { toJSON } = render(<OrderSheet {...defaultProps} visible={false} />)
    expect(toJSON()).toBeNull()
  })

  it('renders nothing when post is null', () => {
    const { toJSON } = render(<OrderSheet {...defaultProps} post={null} />)
    expect(toJSON()).toBeNull()
  })

  it('renders the title', () => {
    render(<OrderSheet {...defaultProps} />)
    expect(screen.getByText('feed.orderForm.title')).toBeTruthy()
  })

  it('renders subtitle with complete details key', () => {
    render(<OrderSheet {...defaultProps} />)
    // Mock t() returns the key path; actual interpolation happens in real i18n
    expect(screen.getByText(/feed\.orderForm\.completeDetails/)).toBeTruthy()
  })

  it('renders quantity input', () => {
    render(<OrderSheet {...defaultProps} />)
    expect(screen.getByPlaceholderText('feed.orderForm.quantityPlaceholder')).toBeTruthy()
  })

  it('renders unit badge from post sell_details', () => {
    render(<OrderSheet {...defaultProps} />)
    expect(screen.getByText('box')).toBeTruthy()
  })

  it('renders address input', () => {
    render(<OrderSheet {...defaultProps} />)
    expect(screen.getByPlaceholderText('feed.orderForm.addressPlaceholder')).toBeTruthy()
  })

  it('renders points balance', () => {
    render(<OrderSheet {...defaultProps} userPoints={250} />)
    expect(screen.getByText(/250/)).toBeTruthy()
  })

  it('shows total price when quantity entered', () => {
    render(<OrderSheet {...defaultProps} />)
    const qtyInput = screen.getByPlaceholderText('feed.orderForm.quantityPlaceholder')
    fireEvent.changeText(qtyInput, '3')
    // Total should be 3 × 5 = 15; use getAllByText since multiple nodes may contain "15"
    expect(screen.getAllByText(/15/).length).toBeGreaterThan(0)
  })

  it('shows Buy Points & Submit button when balance is negative', () => {
    render(<OrderSheet {...defaultProps} userPoints={10} />)
    const qtyInput = screen.getByPlaceholderText('feed.orderForm.quantityPlaceholder')
    fireEvent.changeText(qtyInput, '5')
    // Total = 25, balance = 10 → insufficient → button changes
    expect(screen.getByText('feed.orderForm.buyPointsAndSubmit')).toBeTruthy()
  })

  it('calls onClose when Cancel is pressed', () => {
    render(<OrderSheet {...defaultProps} />)
    fireEvent.press(screen.getByText('feed.orderForm.cancel'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })



  it('renders green balance when points are sufficient', () => {
    render(<OrderSheet {...defaultProps} userPoints={500} />)
    const qtyInput = screen.getByPlaceholderText('feed.orderForm.quantityPlaceholder')
    fireEvent.changeText(qtyInput, '2')
    // Total = 10, balance after = 490 (should be green - positive)
    expect(screen.getByText(/490/)).toBeTruthy()
  })

  it('renders geotag info note', () => {
    render(<OrderSheet {...defaultProps} />)
    expect(screen.getByText('feed.orderForm.geotagNote')).toBeTruthy()
  })
})
