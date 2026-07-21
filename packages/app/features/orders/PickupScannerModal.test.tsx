import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { PickupScannerModal } from './PickupScannerModal'

jest.mock('tamagui', () => {
  const { View, Text: RNText, TextInput, TouchableOpacity } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    Input: ({ onChangeText, value, ...props }: any) => (
      <TextInput onChangeText={onChangeText} value={value} {...props} />
    ),
    Button: ({ children, onPress, ...props }: any) => (
      <TouchableOpacity onPress={onPress} {...props}>{children}</TouchableOpacity>
    ),
    Spinner: () => <View />,
  }
})

jest.mock('@tamagui/lucide-icons', () => {
  const { View } = require('react-native')
  const MockIcon = () => <View />
  return {
    X: MockIcon,
    Camera: MockIcon,
    Search: MockIcon,
    PackageCheck: MockIcon,
    CheckCircle: MockIcon,
    AlertCircle: MockIcon,
    ShoppingBag: MockIcon,
    User: MockIcon,
    Check: MockIcon,
  }
})

describe('PickupScannerModal', () => {
  const mockOrders: any[] = [
    {
      id: 'ord-987654321',
      buyer_id: 'usr-buyer-99',
      seller_id: 'usr-seller-01',
      product_name: 'Honeycrisp Apples',
      quantity: 5,
      buyer_passcode: 'APPLES99',
      status: 'ready_for_pickup',
    },
  ]

  test('identifies order without auto-confirming status', async () => {
    const mockConfirm = jest.fn().mockResolvedValue(undefined)
    const { getByTestId, getByText, queryByText } = render(
      <PickupScannerModal
        visible={true}
        onClose={jest.fn()}
        orders={mockOrders}
        onConfirmHandOff={mockConfirm}
      />
    )

    // Input QR payload
    fireEvent.changeText(getByTestId('qr-scanner-input'), 'ord-987654321')
    fireEvent.press(getByTestId('scan-lookup-btn'))

    // Order identified card displays
    await waitFor(() => {
      expect(getByText('ORDER IDENTIFIED')).toBeTruthy()
      expect(getByText(/Honeycrisp Apples/)).toBeTruthy()
    })

    // Assert that scanning did NOT trigger confirmation yet!
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(queryByText('Pickup Hand-Off Confirmed!')).toBeNull()

    // Explicitly tap "Confirm Pickup & Hand-Off"
    fireEvent.press(getByTestId('confirm-pickup-btn'))

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith('ord-987654321')
      expect(getByText('Pickup Hand-Off Confirmed!')).toBeTruthy()
    })
  })
})
