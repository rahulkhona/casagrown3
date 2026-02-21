import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Platform, ActionSheetIOS, Alert } from 'react-native'

// Mock tamagui
jest.mock('tamagui', () => {
  const { View, Text: RNText, Pressable } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    Button: ({ children, onPress, ...props }: any) => (
      <Pressable onPress={onPress} {...props}>{children}</Pressable>
    ),
  }
})

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock lucide icons
jest.mock('@tamagui/lucide-icons', () => ({
  Coins: () => null,
  ShoppingBag: () => null,
}))

// Mock design tokens
jest.mock('../../design-tokens', () => ({
  colors: {
    green: { 50: '#f0fdf4', 100: '#dcfce3', 600: '#16a34a', 700: '#15803d' },
    gray: { 100: '#f3f4f6', 200: '#e5e7eb', 800: '#1f2937' },
  },
  borderRadius: { md: 6 },
  shadows: { lg: { radius: 10, offset: { width: 0, height: 4 }, color: 'rgba(0,0,0,0.1)' } }
}))

import { PointsMenu } from './PointsMenu'

describe('PointsMenu', () => {
  const defaultProps = {
    userPoints: 150,
    isDesktop: false,
    onNavigateToBuyPoints: jest.fn(),
    onNavigateToRedeemPoints: jest.fn(),
  }

  const originalDocument = global.document
  
  beforeEach(() => {
    jest.clearAllMocks()
    Platform.OS = 'web'
    global.document = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as any
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(jest.fn())
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn())
  })

  afterAll(() => {
    global.document = originalDocument
  })

  it('renders points value correctly', () => {
    render(<PointsMenu {...defaultProps} />)
    expect(screen.getByText('150')).toBeTruthy()
  })

  it('renders "points" text on desktop', () => {
    render(<PointsMenu {...defaultProps} isDesktop={true} />)
    expect(screen.getByText('feed.header.points')).toBeTruthy()
  })

  it('renders "pts" text on mobile', () => {
    render(<PointsMenu {...defaultProps} isDesktop={false} />)
    expect(screen.getByText('pts')).toBeTruthy()
  })

  it('handles web dropdown toggle', () => {
    Platform.OS = 'web'
    render(<PointsMenu {...defaultProps} />)
    
    // Dropdown closed
    expect(screen.queryByText('feed.nav.buyPoints')).toBeNull()
    
    // Toggle open
    fireEvent.press(screen.getByText('150'))
    expect(screen.getByText('feed.nav.buyPoints')).toBeTruthy()
    expect(screen.getByText('feed.nav.redeem')).toBeTruthy()

    // Click buy points
    fireEvent.press(screen.getByText('feed.nav.buyPoints'))
    expect(defaultProps.onNavigateToBuyPoints).toHaveBeenCalled()
    // Closes after action
    expect(screen.queryByText('feed.nav.buyPoints')).toBeNull()
  })

  it('handles ActionSheetIOS on iOS', () => {
    Platform.OS = 'ios'
    render(<PointsMenu {...defaultProps} />)
    
    fireEvent.press(screen.getByText('150'))
    expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalled()
    
    const callback = (ActionSheetIOS.showActionSheetWithOptions as jest.Mock).mock.calls[0][1]
    
    // Trigger buy points
    callback(1)
    expect(defaultProps.onNavigateToBuyPoints).toHaveBeenCalled()
    
    // Trigger redeem points
    callback(2)
    expect(defaultProps.onNavigateToRedeemPoints).toHaveBeenCalled()
  })

  it('handles Alert on Android', () => {
    Platform.OS = 'android'
    render(<PointsMenu {...defaultProps} />)
    
    fireEvent.press(screen.getByText('150'))
    expect(Alert.alert).toHaveBeenCalled()
    
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2]
    
    // Trigger buy points (index 1 is buy)
    buttons[1].onPress()
    expect(defaultProps.onNavigateToBuyPoints).toHaveBeenCalled()
    
    // Trigger redeem points (index 2 is redeem)
    buttons[2].onPress()
    expect(defaultProps.onNavigateToRedeemPoints).toHaveBeenCalled()
  })
})
