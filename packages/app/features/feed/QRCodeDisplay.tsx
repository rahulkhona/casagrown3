/**
 * QR Code Display - Native implementation (iOS/Android)
 * Uses react-native-qrcode-svg which renders via react-native-svg
 */
import { useState } from 'react'
import { View } from 'react-native'
import { Text } from 'tamagui'
import QRCode from 'react-native-qrcode-svg'

interface QRCodeDisplayProps {
  value: string
  size?: number
}

export function QRCodeDisplay({ value, size = 150 }: QRCodeDisplayProps) {
  const [error, setError] = useState<string | null>(null)

  if (!value) {
    return (
      <View style={{ width: size, height: size, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
        <Text fontSize="$2" color="gray" textAlign="center">
          No QR value
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={{ width: size, height: size, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
        <Text fontSize="$2" color="red" textAlign="center">
          QR Error: {error}
        </Text>
      </View>
    )
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <QRCode
        value={value}
        size={size}
        backgroundColor="#FFFFFF"
        color="#000000"
        onError={(e: any) => {
          console.error('❌ QRCode render error:', e)
          setError(String(e?.message || e))
        }}
      />
    </View>
  )
}

