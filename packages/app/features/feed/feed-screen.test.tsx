import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { FeedScreen } from './feed-screen'

// Mock safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
}))

// Mock tamagui (following profile-screen.test.tsx pattern)
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
    Input: ({ placeholder, ...props }: any) => <TextInput placeholder={placeholder} {...props} />,
    useMedia: () => ({ sm: false, md: true, lg: false }),
  }
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
    expect(screen.getByText('Feed')).toBeTruthy()
    expect(screen.getByText('Chats')).toBeTruthy()
    expect(screen.getByText('Orders')).toBeTruthy()
  })

  it('renders empty state title', () => {
    render(<FeedScreen />)
    expect(screen.getByText('No posts found')).toBeTruthy()
  })

  it('renders empty state description', () => {
    render(<FeedScreen />)
    expect(screen.getByText('Try adjusting your search or filters')).toBeTruthy()
  })

  it('renders search bar placeholder', () => {
    render(<FeedScreen />)
    expect(screen.getByPlaceholderText('Search posts, categories, or keywords...')).toBeTruthy()
  })

  it('renders Create Post button', () => {
    const mockOnCreatePost = jest.fn()
    render(<FeedScreen onCreatePost={mockOnCreatePost} />)
    expect(screen.getAllByText('Create Post').length).toBeGreaterThan(0)
  })

  it('renders Create First Post button in empty state', () => {
    const mockOnCreatePost = jest.fn()
    render(<FeedScreen onCreatePost={mockOnCreatePost} />)
    expect(screen.getByText('Create First Post')).toBeTruthy()
  })

  it('calls onCreatePost when Create First Post is pressed', () => {
    const mockOnCreatePost = jest.fn()
    render(<FeedScreen onCreatePost={mockOnCreatePost} />)
    
    fireEvent.press(screen.getByText('Create First Post'))
    expect(mockOnCreatePost).toHaveBeenCalled()
  })

  it('renders footer with branding', () => {
    render(<FeedScreen />)
    expect(screen.getByText('Connecting neighborhoods to eliminate food waste and expand access to fresh produce.')).toBeTruthy()
  })

  it('renders footer Learn More section', () => {
    render(<FeedScreen />)
    expect(screen.getByText('Learn More')).toBeTruthy()
    expect(screen.getByText('Why Points System?')).toBeTruthy()
  })

  it('renders footer Legal section', () => {
    render(<FeedScreen />)
    expect(screen.getByText('Legal')).toBeTruthy()
    expect(screen.getByText('Privacy Policy')).toBeTruthy()
  })

  it('renders copyright notice', () => {
    render(<FeedScreen />)
    expect(screen.getByText('© 2026 CasaGrown. All rights reserved.')).toBeTruthy()
  })

  it('renders Invite button', () => {
    render(<FeedScreen />)
    expect(screen.getByText('Invite')).toBeTruthy()
  })

  it('renders points display', () => {
    render(<FeedScreen />)
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('points')).toBeTruthy()
  })

  it('calls onNavigateToProfile when profile avatar is pressed', () => {
    const mockOnNavigateToProfile = jest.fn()
    render(<FeedScreen onNavigateToProfile={mockOnNavigateToProfile} />)
    
    // Profile avatar displays first letter "A"
    fireEvent.press(screen.getByText('A'))
    expect(mockOnNavigateToProfile).toHaveBeenCalled()
  })

  it('matches snapshot', () => {
    const tree = render(<FeedScreen />)
    expect(tree.toJSON()).toMatchSnapshot()
  })
})
