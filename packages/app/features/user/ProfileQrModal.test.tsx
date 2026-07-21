import React from 'react'
import { render } from '@testing-library/react-native'
import { ProfileQrModal } from './ProfileQrModal'

jest.mock('tamagui', () => {
  const { View, Text: RNText, TouchableOpacity } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    Button: ({ children, onPress, ...props }: any) => (
      <TouchableOpacity onPress={onPress} {...props}>{children}</TouchableOpacity>
    ),
    ScrollView: ({ children }: any) => <View>{children}</View>,
  }
})

jest.mock('@tamagui/lucide-icons', () => {
  const { View } = require('react-native')
  const MockIcon = () => <View />
  return {
    X: MockIcon,
    QrCode: MockIcon,
    Share2: MockIcon,
    Copy: MockIcon,
    Check: MockIcon,
    UserCheck: MockIcon,
    Sparkles: MockIcon,
    Smartphone: MockIcon,
  }
})

jest.mock('../feed/QRCodeDisplay', () => ({
  QRCodeDisplay: () => null,
}))

describe('ProfileQrModal', () => {
  const mockUser = {
    id: 'usr-sarah-100',
    full_name: 'Sarah Jenkins',
    username: 'sarah_gardens',
    avatar_url: null,
  }

  test('renders user profile details and handle accurately', () => {
    const { getByText } = render(
      <ProfileQrModal
        visible={true}
        onClose={jest.fn()}
        user={mockUser}
      />
    )

    expect(getByText('My CasaGrown Pass & QR')).toBeTruthy()
    expect(getByText('Sarah Jenkins')).toBeTruthy()
    expect(getByText('@sarah_gardens • Verified Gardener')).toBeTruthy()
    expect(getByText('Scan with Phone Camera to Install & Follow')).toBeTruthy()
  })

  test('handles copy link action', () => {
    const { getByTestId } = render(
      <ProfileQrModal
        visible={true}
        onClose={jest.fn()}
        user={mockUser}
      />
    )

    const copyBtn = getByTestId('copy-qr-link-btn')
    expect(copyBtn).toBeTruthy()
  })
})
