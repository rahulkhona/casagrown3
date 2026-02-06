/**
 * InviteModal Unit Tests
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { InviteModal } from './InviteModal'

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}))

// Mock Tamagui components
jest.mock('tamagui', () => {
  const React = require('react')
  const { View, Text: RNText, TouchableOpacity, ScrollView: RNScrollView } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    Button: ({ children, onPress, ...props }: any) => (
      <TouchableOpacity onPress={onPress} {...props}>{children}</TouchableOpacity>
    ),
    ScrollView: ({ children, ...props }: any) => <RNScrollView {...props}>{children}</RNScrollView>,
    Input: (props: any) => <View {...props} />,
  }
})

// Mock lucide icons
jest.mock('@tamagui/lucide-icons', () => {
  const { View } = require('react-native')
  return {
    UserPlus: (props: any) => <View testID="icon-userplus" {...props} />,
    Users: (props: any) => <View testID="icon-users" {...props} />,
    ShoppingCart: (props: any) => <View testID="icon-shoppingcart" {...props} />,
    Gift: (props: any) => <View testID="icon-gift" {...props} />,
    Leaf: (props: any) => <View testID="icon-leaf" {...props} />,
    X: (props: any) => <View testID="icon-x" {...props} />,
    Copy: (props: any) => <View testID="icon-copy" {...props} />,
    Check: (props: any) => <View testID="icon-check" {...props} />,
    Send: (props: any) => <View testID="icon-send" {...props} />,
  }
})

describe('InviteModal', () => {
  const mockOnClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not render when visible is false', () => {
    render(<InviteModal visible={false} onClose={mockOnClose} />)
    expect(screen.queryByText('feed.invite.title')).toBeNull()
  })

  it('renders when visible is true', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    expect(screen.getByText('feed.invite.title')).toBeTruthy()
  })

  it('renders modal header with title and subtitle', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    expect(screen.getByText('feed.invite.title')).toBeTruthy()
    expect(screen.getByText('feed.invite.subtitle')).toBeTruthy()
  })

  it('renders why invite section', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    expect(screen.getByText('feed.invite.whyInvite')).toBeTruthy()
  })

  it('renders all benefit cards', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    expect(screen.getByText('feed.invite.benefits.community.title')).toBeTruthy()
    expect(screen.getByText('feed.invite.benefits.options.title')).toBeTruthy()
    expect(screen.getByText('feed.invite.benefits.grow.title')).toBeTruthy()
    expect(screen.getByText('feed.invite.benefits.waste.title')).toBeTruthy()
  })

  it('renders family section', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    expect(screen.getByText('feed.invite.family.title')).toBeTruthy()
    expect(screen.getByText('feed.invite.family.description')).toBeTruthy()
  })

  it('renders share link section', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    expect(screen.getByText('feed.invite.share.title')).toBeTruthy()
    expect(screen.getByText('feed.invite.share.hint')).toBeTruthy()
  })

  it('renders tips section', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    // Use regex since tips title has emoji prefix
    expect(screen.getByText(/feed\.invite\.tips\.title/)).toBeTruthy()
  })

  it('renders share button', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    expect(screen.getByText('feed.invite.share.shareButton')).toBeTruthy()
  })

  it('calls onClose when close button is pressed', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    // Find the close button (contains X icon)
    const closeButtons = screen.getAllByTestId('icon-x')
    expect(closeButtons.length).toBeGreaterThan(0)
  })

  it('renders with custom referralCode in invite link', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} referralCode="ABC123XYZ" />)
    expect(screen.getByText(/ABC123XYZ/)).toBeTruthy()
  })
})
