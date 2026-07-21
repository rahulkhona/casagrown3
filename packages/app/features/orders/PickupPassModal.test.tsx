import React from 'react'
import { render } from '@testing-library/react-native'
import { PickupPassModal } from './PickupPassModal'

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
    ShieldCheck: MockIcon,
    Sun: MockIcon,
    CheckCircle2: MockIcon,
  }
})

jest.mock('../feed/QRCodeDisplay', () => ({
  QRCodeDisplay: () => null,
}))

describe('PickupPassModal', () => {
  const mockOrder: any = {
    id: 'ord-123456789',
    buyer_id: 'usr-buyer',
    seller_id: 'usr-seller',
    product_name: 'Organic Avocados',
    quantity: 3,
    buyer_passcode: 'PASS123',
    status: 'ready_for_pickup',
  }

  test('renders buyer pickup pass details accurately', () => {
    const { getByText } = render(
      <PickupPassModal
        visible={true}
        onClose={jest.fn()}
        order={mockOrder}
        buyerName="Michael Scott"
      />
    )

    expect(getByText('Pickup Pass')).toBeTruthy()
    expect(getByText('#ORD-ORD-12')).toBeTruthy()
    expect(getByText('Michael Scott')).toBeTruthy()
    expect(getByText('Organic Avocados (x3)')).toBeTruthy()
  })

  test('returns null when order is null', () => {
    const { queryByText } = render(
      <PickupPassModal
        visible={true}
        onClose={jest.fn()}
        order={null}
        buyerName="Michael Scott"
      />
    )

    expect(queryByText('Pickup Pass')).toBeNull()
  })
})
