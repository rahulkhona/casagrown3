import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { MyPostsScreen } from './my-posts-screen'

// Mock safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock lucide icons
jest.mock('@tamagui/lucide-icons', () => ({
  ArrowLeft: () => null,
  Plus: () => null,
  Eye: () => null,
  Edit3: () => null,
  Trash2: () => null,
  RefreshCw: () => null,
  Copy: () => null,
  AlertTriangle: () => null,
  FileText: () => null,
  Search: () => null,
}))

// Mock design-tokens
jest.mock('../../design-tokens', () => ({
  colors: {
    green: { 50: '#f0fdf4', 100: '#dcfce7', 600: '#16a34a', 700: '#15803d' },
    gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827' },
    blue: { 100: '#dbeafe', 600: '#2563eb', 700: '#1d4ed8' },
    purple: { 100: '#f3e8ff', 600: '#9333ea', 700: '#7e22ce' },
    amber: { 200: '#fde68a', 700: '#b45309' },
    red: { 500: '#ef4444' },
  },
  shadows: { sm: { color: '#000', offset: { width: 0, height: 1 }, radius: 2 } },
  borderRadius: { sm: 4, md: 8, lg: 12, full: 9999 },
}))

// Mock tamagui (following existing pattern from feed-screen.test.tsx)
jest.mock('tamagui', () => {
  const { View, Text: RNText, TouchableOpacity, ScrollView: RNScrollView, TextInput } = require('react-native')

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
    Spinner: () => <RNText>Loading...</RNText>,
    Separator: () => <View />,
    Input: ({ placeholder, ...props }: any) => <TextInput placeholder={placeholder} {...props} />,
    useMedia: () => ({ sm: false, md: true, lg: false }),
  }
})

// Mock auth-hook
const mockUser = { id: 'user-123', email: 'test@example.com' }
jest.mock('../auth/auth-hook', () => ({
  useAuth: () => ({ user: mockUser }),
  supabase: { from: jest.fn() },
}))

// Mock my-posts-service
const mockGetUserPosts = jest.fn()
const mockDeletePost = jest.fn()
const mockRepostPost = jest.fn()
const mockGetPostTypePolicies = jest.fn()
jest.mock('./my-posts-service', () => ({
  getUserPosts: (...args: any[]) => mockGetUserPosts(...args),
  deletePost: (...args: any[]) => mockDeletePost(...args),
  repostPost: (...args: any[]) => mockRepostPost(...args),
  getPostTypePolicies: (...args: any[]) => mockGetPostTypePolicies(...args),
}))

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const defaultPolicies: Record<string, number> = {
  want_to_sell: 14,
  want_to_buy: 7,
  offering_service: 30,
  need_service: 7,
  seeking_advice: 30,
  general_info: 30,
}

const mockPosts = [
  {
    id: 'post-1',
    author_id: 'user-123',
    type: 'want_to_sell',
    reach: 'community',
    content: JSON.stringify({ description: 'Fresh tomatoes from my garden' }),
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago — active (14d policy)
    updated_at: new Date().toISOString(),
    community_h3_index: '872834461ffffff',
    community_name: 'Oak Street',
    sell_details: {
      category: 'vegetables',
      produce_name: 'Tomatoes',
      unit: 'lbs',
      total_quantity_available: 10,
      points_per_unit: 3.5,
    },
    buy_details: null,
    media: [],
    delivery_dates: [],
  },
  {
    id: 'post-2',
    author_id: 'user-123',
    type: 'want_to_buy',
    reach: 'community',
    content: JSON.stringify({ description: 'Looking for lemons' }),
    created_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 35 days ago — expired (7d policy)
    updated_at: new Date().toISOString(),
    community_h3_index: '872834461ffffff',
    community_name: 'Oak Street',
    sell_details: null,
    buy_details: {
      category: 'fruits',
      produce_names: ['Lemons', 'Limes'],
      need_by_date: '2026-02-20',
    },
    media: [],
    delivery_dates: [],
  },
  {
    id: 'post-3',
    author_id: 'user-123',
    type: 'seeking_advice',
    reach: 'community',
    content: JSON.stringify({ description: 'How to grow tomatoes?' }),
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago — active (30d policy)
    updated_at: new Date().toISOString(),
    community_h3_index: '872834461ffffff',
    community_name: 'Oak Street',
    sell_details: null,
    buy_details: null,
    media: [],
    delivery_dates: [],
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MyPostsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetUserPosts.mockResolvedValue(mockPosts)
    mockDeletePost.mockResolvedValue(undefined)
    mockRepostPost.mockResolvedValue(undefined)
    mockGetPostTypePolicies.mockResolvedValue(defaultPolicies)
  })

  it('renders without crashing', () => {
    render(<MyPostsScreen />)
  })

  it('renders the title', () => {
    render(<MyPostsScreen />)
    expect(screen.getByText('myPosts.title')).toBeTruthy()
  })

  it('shows loading spinner initially', () => {
    mockGetUserPosts.mockImplementation(() => new Promise(() => {})) // never resolves
    mockGetPostTypePolicies.mockImplementation(() => new Promise(() => {}))
    render(<MyPostsScreen />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('renders empty state when no posts exist', async () => {
    mockGetUserPosts.mockResolvedValue([])
    render(<MyPostsScreen onCreatePost={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('myPosts.emptyTitle')).toBeTruthy()
    })
    expect(screen.getByText('myPosts.emptyDescription')).toBeTruthy()
    expect(screen.getByText('myPosts.createFirst')).toBeTruthy()
  })

  it('calls onCreatePost from empty state CTA', async () => {
    mockGetUserPosts.mockResolvedValue([])
    const mockOnCreatePost = jest.fn()
    render(<MyPostsScreen onCreatePost={mockOnCreatePost} />)
    await waitFor(() => {
      expect(screen.getByText('myPosts.createFirst')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('myPosts.createFirst'))
    expect(mockOnCreatePost).toHaveBeenCalled()
  })

  it('renders post cards after loading', async () => {
    render(<MyPostsScreen />)
    await waitFor(() => {
      expect(screen.getByText('Fresh tomatoes from my garden')).toBeTruthy()
    })
    expect(screen.getByText('Looking for lemons')).toBeTruthy()
    expect(screen.getByText('How to grow tomatoes?')).toBeTruthy()
  })

  it('displays post count badge', async () => {
    render(<MyPostsScreen />)
    await waitFor(() => {
      // Total count displayed in header badge
      expect(screen.getByText('3')).toBeTruthy()
    })
  })

  it('renders Type and Status filter dropdowns', async () => {
    render(<MyPostsScreen />)
    await waitFor(() => {
      expect(screen.getByText('Fresh tomatoes from my garden')).toBeTruthy()
    })
    // Dropdowns show default "Any" selection text
    expect(screen.getAllByText('myPosts.filterAny').length).toBeGreaterThanOrEqual(2)
  })

  it('renders search bar placeholder', async () => {
    render(<MyPostsScreen />)
    await waitFor(() => {
      expect(screen.getByText('Fresh tomatoes from my garden')).toBeTruthy()
    })
    expect(screen.getByPlaceholderText('myPosts.searchPlaceholder')).toBeTruthy()
  })

  it('shows sell details (produce name, price, category)', async () => {
    render(<MyPostsScreen />)
    await waitFor(() => {
      expect(screen.getByText(/Tomatoes · vegetables/)).toBeTruthy()
    })
    expect(screen.getByText('$3.50/lbs')).toBeTruthy()
  })

  it('shows buy details (produce names, category)', async () => {
    render(<MyPostsScreen />)
    await waitFor(() => {
      expect(screen.getByText(/Lemons, Limes/)).toBeTruthy()
    })
  })

  it('shows community name', async () => {
    render(<MyPostsScreen />)
    await waitFor(() => {
      expect(screen.getAllByText(/Oak Street/).length).toBeGreaterThan(0)
    })
  })

  it('computes active/expired status using per-type policies', async () => {
    render(<MyPostsScreen />)
    await waitFor(() => {
      // Post-1 (sell, 5d old, 14d policy) = Active
      // Post-2 (buy, 35d old, 7d policy) = Expired
      // Post-3 (advice, 2d old, 30d policy) = Active
      const activeTexts = screen.getAllByText('myPosts.statusActive')
      const expiredTexts = screen.getAllByText('myPosts.statusExpired')
      expect(activeTexts.length).toBe(2) // post-1 and post-3 are active
      expect(expiredTexts.length).toBe(1) // post-2 is expired
    })
  })

  it('renders action buttons: view, edit, clone, delete on every card', async () => {
    render(<MyPostsScreen />)
    await waitFor(() => {
      expect(screen.getAllByText('myPosts.view').length).toBe(3)
    })
    expect(screen.getAllByText('myPosts.edit').length).toBe(3)
    expect(screen.getAllByText('myPosts.clone').length).toBe(3)
    expect(screen.getAllByText('myPosts.delete').length).toBe(3)
  })

  it('shows repost button only on expired posts', async () => {
    render(<MyPostsScreen />)
    await waitFor(() => {
      // Only post-2 (expired) should have a repost button
      const repostButtons = screen.getAllByText('myPosts.repost')
      expect(repostButtons.length).toBe(1)
    })
  })

  it('calls onCreatePost from header New Post button', async () => {
    const mockOnCreatePost = jest.fn()
    render(<MyPostsScreen onCreatePost={mockOnCreatePost} />)
    await waitFor(() => {
      expect(screen.getByText('myPosts.newPost')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('myPosts.newPost'))
    expect(mockOnCreatePost).toHaveBeenCalled()
  })

  it('matches snapshot', async () => {
    const tree = render(<MyPostsScreen />)
    await waitFor(() => {
      expect(screen.getByText('Fresh tomatoes from my garden')).toBeTruthy()
    })
    expect(tree.toJSON()).toMatchSnapshot()
  })
})
