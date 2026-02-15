import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

// Mock AsyncStorage (required by supabase.ts)
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
}))

// Mock expo-secure-store (required by auth-hook.ts → auth-storage.ts)
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
  auth: {
    getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  },
  functions: {
    invoke: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}

// Mock supabase (imported transitively by feed-screen → usePointsBalance)
jest.mock('../../utils/supabase', () => ({
  supabase: mockSupabase,
}))

// Mock auth-hook (imported directly by feed-screen for supabase client)
jest.mock('../auth/auth-hook', () => ({
  supabase: mockSupabase,
  useAuth: () => ({ user: null, session: null, loading: false }),
}))

import { FeedScreen } from './feed-screen'

// Mock feed service
const mockGetCommunityFeedPosts = jest.fn()
const mockTogglePostLike = jest.fn()
const mockFlagPost = jest.fn()
const mockGetLatestPostTimestamp = jest.fn()

jest.mock('./feed-service', () => ({
  getCommunityFeedPosts: (...args: any[]) => mockGetCommunityFeedPosts(...args),
  getLatestPostTimestamp: (...args: any[]) => mockGetLatestPostTimestamp(...args),
  togglePostLike: (...args: any[]) => mockTogglePostLike(...args),
  flagPost: (...args: any[]) => mockFlagPost(...args),
}))

// Mock chat-service (imported by feed-screen for unread badge)
jest.mock('../chat/chat-service', () => ({
  getUnreadChatCount: jest.fn().mockResolvedValue(0),
}))

// Mock feed cache — return null (no cache) by default so tests exercise full fetch path
jest.mock('./feed-cache', () => ({
  getCachedFeed: jest.fn().mockResolvedValue(null),
  setCachedFeed: jest.fn().mockResolvedValue(undefined),
  clearFeedCache: jest.fn().mockResolvedValue(undefined),
}))

// Mock expo-location (imported by OrderSheet)
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 37.3, longitude: -121.9 } }),
  reverseGeocodeAsync: jest.fn().mockResolvedValue([{ city: 'San Jose', region: 'CA', street: '123 Main St' }]),
}))

// Mock usePointsBalance hook (imported by feed-screen)
jest.mock('../../hooks/usePointsBalance', () => ({
  usePointsBalance: () => ({ balance: 50, loading: false, error: null, refetch: jest.fn() }),
}))

// Mock usePaymentService hook (imported by BuyPointsSheet via OrderSheet)
jest.mock('../../hooks/usePaymentService', () => ({
  usePaymentService: () => ({ createPaymentIntent: jest.fn(), confirmPayment: jest.fn() }),
}))

// Mock usePendingPayments hook
jest.mock('../../hooks/usePendingPayments', () => ({
  usePendingPayments: () => ({ pendingCount: 0, resolving: false }),
}))

// Mock FeedPostCard
jest.mock('./FeedPostCard', () => ({
  FeedPostCard: ({ post, t }: any) => {
    const { Text } = require('react-native')
    return <Text testID={`post-card-${post.id}`}>{post.content}</Text>
  },
}))

// Mock safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock @react-navigation/native
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: any) => {
    const { useEffect } = require('react')
    useEffect(() => { cb() }, [])
  },
}))

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}))

// Mock lucide icons
jest.mock('@tamagui/lucide-icons', () => ({
  Search: () => null,
  Bell: () => null,
  UserPlus: () => null,
  Home: () => null,
  Plus: () => null,
  Filter: () => null,
  Leaf: () => null,
  Menu: () => null,
  X: () => null,
  Heart: () => null,
  ShoppingCart: () => null,
  ThumbsUp: () => null,
  MessageCircle: () => null,
  Share2: () => null,
  Flag: () => null,
}))

// Mock tamagui (following profile-screen.test.tsx pattern)
jest.mock('tamagui', () => {
  const { View, Text: RNText, TouchableOpacity, ScrollView: RNScrollView, TextInput, ActivityIndicator } = require('react-native')
  
  return {
    Button: ({ children, onPress, icon, ...props }: any) => (
      <TouchableOpacity onPress={onPress} {...props}>
        {icon}
        {typeof children === 'string' ? <RNText>{children}</RNText> : children}
      </TouchableOpacity>
    ),
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    ScrollView: ({ children, ...props }: any) => <RNScrollView {...props}>{children}</RNScrollView>,
    Input: ({ placeholder, ...props }: any) => <TextInput placeholder={placeholder} {...props} />,
    Spinner: (props: any) => <ActivityIndicator {...props} />,
    useMedia: () => ({ sm: false, md: true, lg: false }),
  }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockGetCommunityFeedPosts.mockResolvedValue([])
  mockGetLatestPostTimestamp.mockResolvedValue(null)
})

describe('FeedScreen', () => {
  it('renders without crashing', () => {
    render(<FeedScreen />)
  })

  it('renders CasaGrown branding in header', () => {
    render(<FeedScreen />)
    expect(screen.getAllByText('CasaGrown').length).toBeGreaterThan(0)
  })

  it('renders navigation items on desktop', () => {
    render(<FeedScreen />)
    expect(screen.getByText('feed.nav.feed')).toBeTruthy()
    expect(screen.getByText('feed.nav.chats')).toBeTruthy()
    expect(screen.getByText('feed.nav.orders')).toBeTruthy()
  })

  it('renders empty state when no posts', async () => {
    render(<FeedScreen communityH3Index="h3-abc" userId="user-1" />)
    await waitFor(() => {
      expect(screen.getByText('feed.emptyTitle')).toBeTruthy()
    })
  })

  it('renders search bar placeholder', () => {
    render(<FeedScreen />)
    expect(screen.getByPlaceholderText('feed.searchPlaceholder')).toBeTruthy()
  })

  it('renders Create Post button', () => {
    const mockOnCreatePost = jest.fn()
    render(<FeedScreen onCreatePost={mockOnCreatePost} />)
    expect(screen.getAllByText('feed.createPost').length).toBeGreaterThan(0)
  })

  it('renders filter pills', () => {
    render(<FeedScreen />)
    expect(screen.getByText('feed.filterAll')).toBeTruthy()
    expect(screen.getByText('feed.filterForSale')).toBeTruthy()
    expect(screen.getByText('feed.filterWanted')).toBeTruthy()
    expect(screen.getByText('feed.filterServices')).toBeTruthy()
  })

  it('renders posts when feed data is available', async () => {
    const mockPosts = [
      {
        id: 'post-1',
        author_id: 'author-1',
        author_name: 'Alice',
        author_avatar_url: null,
        type: 'want_to_sell',
        reach: 'community',
        content: 'Fresh tomatoes!',
        created_at: new Date().toISOString(),
        community_h3_index: 'h3-abc',
        community_name: 'Sunset Park',
        sell_details: null,
        buy_details: null,
        media: [],
        like_count: 0,
        comment_count: 0,
        is_liked: false,
      },
    ]
    mockGetCommunityFeedPosts.mockResolvedValue(mockPosts)

    render(<FeedScreen communityH3Index="h3-abc" userId="user-1" />)
    await waitFor(() => {
      expect(screen.getByTestId('post-card-post-1')).toBeTruthy()
    })
  })

  it('renders Create First Post button in empty state', async () => {
    const mockOnCreatePost = jest.fn()
    render(<FeedScreen onCreatePost={mockOnCreatePost} communityH3Index="h3-abc" userId="user-1" />)
    await waitFor(() => {
      expect(screen.getByText('feed.createFirstPost')).toBeTruthy()
    })
  })

  it('calls onCreatePost when Create First Post is pressed', async () => {
    const mockOnCreatePost = jest.fn()
    render(<FeedScreen onCreatePost={mockOnCreatePost} communityH3Index="h3-abc" userId="user-1" />)
    
    await waitFor(() => {
      fireEvent.press(screen.getByText('feed.createFirstPost'))
    })
    expect(mockOnCreatePost).toHaveBeenCalled()
  })

  it('renders Invite button', () => {
    render(<FeedScreen />)
    expect(screen.getByText('feed.header.invite')).toBeTruthy()
  })

  it('renders points display', () => {
    render(<FeedScreen />)
    expect(screen.getByText('50')).toBeTruthy()
    expect(screen.getByText('feed.header.points')).toBeTruthy()
  })

  it('calls onNavigateToProfile when profile avatar is pressed', () => {
    const mockOnNavigateToProfile = jest.fn()
    render(<FeedScreen onNavigateToProfile={mockOnNavigateToProfile} />)
    
    // Profile avatar displays first letter "A"
    fireEvent.press(screen.getByText('A'))
    expect(mockOnNavigateToProfile).toHaveBeenCalled()
  })

  it('fetches community posts on mount', async () => {
    render(<FeedScreen communityH3Index="h3-abc" userId="user-1" />)
    await waitFor(() => {
      expect(mockGetCommunityFeedPosts).toHaveBeenCalledWith('h3-abc', 'user-1')
    })
  })

  it('does not fetch when no communityH3Index', () => {
    render(<FeedScreen userId="user-1" />)
    expect(mockGetCommunityFeedPosts).not.toHaveBeenCalled()
  })

  it('shows error state with retry button on failure', async () => {
    mockGetCommunityFeedPosts.mockRejectedValue(new Error('Network error'))
    render(<FeedScreen communityH3Index="h3-abc" userId="user-1" />)
    await waitFor(() => {
      expect(screen.getByText('feed.retry')).toBeTruthy()
    })
  })

  it('matches snapshot', () => {
    const tree = render(<FeedScreen />)
    expect(tree.toJSON()).toMatchSnapshot()
  })
})
