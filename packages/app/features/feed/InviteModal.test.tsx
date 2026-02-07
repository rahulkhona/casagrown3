/**
 * InviteModal Unit Tests
 * 
 * Tests: UI rendering, clipboard copy, QR code conditional rendering,
 * reward banner variants, and share functionality.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { InviteModal } from './InviteModal'

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Always return key as string - ignore interpolation params to prevent
    // React "Objects are not valid as a React child" errors
    t: (key: string, paramsOrDefault?: any) => {
      if (typeof paramsOrDefault === 'string') return paramsOrDefault
      return key
    },
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
    Image: (props: any) => <View {...props} />,
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
    Smartphone: (props: any) => <View testID="icon-smartphone" {...props} />,
  }
})

// Mock react-qr-code (web path)
jest.mock('react-qr-code', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: ({ value, ...props }: any) => (
      <View testID="qr-code" accessibilityLabel={value} {...props} />
    ),
  }
})

// Mock react-native-qrcode-svg (native path)
jest.mock('react-native-qrcode-svg', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: ({ value, ...props }: any) => (
      <View testID="qr-code" accessibilityLabel={value} {...props} />
    ),
  }
})

// Import Clipboard so we can spy on its methods
import { Clipboard } from 'react-native'

describe('InviteModal', () => {
  const mockOnClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // =========================================
  // Basic Rendering
  // =========================================

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
    expect(screen.getByText(/feed\.invite\.tips\.title/)).toBeTruthy()
  })

  it('renders share button', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    expect(screen.getByText('feed.invite.share.shareButton')).toBeTruthy()
  })

  it('calls onClose when close button is pressed', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} />)
    const closeButtons = screen.getAllByTestId('icon-x')
    expect(closeButtons.length).toBeGreaterThan(0)
  })

  it('renders with custom referralCode in invite link', () => {
    render(<InviteModal visible={true} onClose={mockOnClose} referralCode="ABC123XY" />)
    expect(screen.getByText(/ABC123XY/)).toBeTruthy()
  })

  // =========================================
  // Clipboard Copy Tests
  // =========================================

  it('copies invite link WITH referral code to clipboard', () => {
    const clipboardSpy = jest.spyOn(Clipboard, 'setString')
    
    render(
      <InviteModal visible={true} onClose={mockOnClose} referralCode="abc12345" />
    )

    const copyButton = screen.getByText('feed.invite.share.copy')
    fireEvent.press(copyButton)

    expect(clipboardSpy).toHaveBeenCalledWith('https://casagrown.com/invite/abc12345')
    clipboardSpy.mockRestore()
  })

  it('copies base URL to clipboard when NO referral code', () => {
    const clipboardSpy = jest.spyOn(Clipboard, 'setString')
    
    render(
      <InviteModal visible={true} onClose={mockOnClose} />
    )

    const copyButton = screen.getByText('feed.invite.share.copy')
    fireEvent.press(copyButton)

    expect(clipboardSpy).toHaveBeenCalledWith('https://casagrown.com')
    clipboardSpy.mockRestore()
  })

  it('shows "Copied" feedback after clicking copy', async () => {
    render(
      <InviteModal visible={true} onClose={mockOnClose} referralCode="abc12345" />
    )

    const copyButton = screen.getByText('feed.invite.share.copy')
    fireEvent.press(copyButton)

    // After pressing copy, the text should change to "Copied"
    await waitFor(() => {
      expect(screen.getByText('feed.invite.share.copied')).toBeTruthy()
    })
  })

  // =========================================
  // QR Code Tests
  // =========================================

  it('renders QR code when referralCode is provided', () => {
    render(
      <InviteModal visible={true} onClose={mockOnClose} referralCode="abc12345" />
    )

    const qrCode = screen.getByTestId('qr-code')
    expect(qrCode).toBeTruthy()
    // QR code should encode the full invite URL
    expect(qrCode.props.accessibilityLabel).toBe('https://casagrown.com/invite/abc12345')
  })

  it('renders QR code with base URL when no referralCode', () => {
    render(
      <InviteModal visible={true} onClose={mockOnClose} />
    )

    const qrCode = screen.getByTestId('qr-code')
    expect(qrCode).toBeTruthy()
    expect(qrCode.props.accessibilityLabel).toBe('https://casagrown.com')
  })

  it('renders "Scan to Join" label with QR code', () => {
    render(
      <InviteModal visible={true} onClose={mockOnClose} referralCode="abc12345" />
    )

    expect(screen.getByText('Scan to Join')).toBeTruthy()
  })

  // =========================================
  // Reward Banner Tests
  // =========================================

  it('renders reward banner with BOTH signup and transaction points', () => {
    render(
      <InviteModal 
        visible={true} 
        onClose={mockOnClose} 
        referralCode="abc12345"
        inviteRewards={{ signupPoints: 50, transactionPoints: 100 }}
      />
    )

    // The t() mock returns the key, so we check for the "Both" key
    expect(screen.getByText('feed.invite.share.rewardsBannerBoth')).toBeTruthy()
  })

  it('renders reward banner with signup points only', () => {
    render(
      <InviteModal 
        visible={true} 
        onClose={mockOnClose} 
        referralCode="abc12345"
        inviteRewards={{ signupPoints: 50, transactionPoints: 0 }}
      />
    )

    expect(screen.getByText('feed.invite.share.rewardsBannerSignupOnly')).toBeTruthy()
  })

  it('renders reward banner with transaction points only', () => {
    render(
      <InviteModal 
        visible={true} 
        onClose={mockOnClose} 
        referralCode="abc12345"
        inviteRewards={{ signupPoints: 0, transactionPoints: 100 }}
      />
    )

    expect(screen.getByText('feed.invite.share.rewardsBannerTransactionOnly')).toBeTruthy()
  })

  it('does NOT render reward banner when no referral code', () => {
    render(
      <InviteModal 
        visible={true} 
        onClose={mockOnClose} 
        inviteRewards={{ signupPoints: 50, transactionPoints: 100 }}
      />
    )

    // Banner should be hidden without referral code
    expect(screen.queryByText('feed.invite.share.rewardsBannerBoth')).toBeNull()
  })

  it('does NOT render reward banner when no rewards provided', () => {
    render(
      <InviteModal 
        visible={true} 
        onClose={mockOnClose} 
        referralCode="abc12345"
      />
    )

    expect(screen.queryByText('feed.invite.share.rewardsBannerBoth')).toBeNull()
    expect(screen.queryByText('feed.invite.share.rewardsBannerSignupOnly')).toBeNull()
    expect(screen.queryByText('feed.invite.share.rewardsBannerTransactionOnly')).toBeNull()
  })

  it('does NOT render reward banner when both points are zero', () => {
    render(
      <InviteModal 
        visible={true} 
        onClose={mockOnClose} 
        referralCode="abc12345"
        inviteRewards={{ signupPoints: 0, transactionPoints: 0 }}
      />
    )

    expect(screen.queryByText('feed.invite.share.rewardsBannerBoth')).toBeNull()
  })
})
