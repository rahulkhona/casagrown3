import React, { useState } from 'react'
import { Modal, Platform, Pressable } from 'react-native'
import { YStack, XStack, Text, Button, Input } from 'tamagui'
import { colors, borderRadius } from '../../design-tokens'

interface VenmoSheetProps {
  visible: boolean
  defaultPhoneNumber?: string
  refundAmountCents: number
  onClose: () => void
  onConfirm: (phoneNumber: string) => void
}

export function VenmoSheet({
  visible,
  defaultPhoneNumber,
  refundAmountCents,
  onClose,
  onConfirm,
}: VenmoSheetProps) {
  const [phoneNumber, setPhoneNumber] = useState(defaultPhoneNumber || '')

  if (!visible) return null

  // Ensure phone number has at least 10 digits for basic validation
  const isValid = phoneNumber.replace(/[^0-9]/g, '').length >= 10
  const refundFormatted = `$${(refundAmountCents / 100).toFixed(2)}`

  const sheetContent = (
    <YStack padding="$4" gap="$4">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize="$6" fontWeight="700" color={colors.gray[800]}>
          Venmo Cashout
        </Text>
        {Platform.OS === 'web' ? (
          <button
            onClick={onClose}
            style={{
              padding: 8,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 20,
              color: colors.gray[400],
            }}
          >
            ✕
          </button>
        ) : (
          <Button unstyled onPress={onClose} padding="$2">
            <Text fontSize={20} color={colors.gray[400]}>
              ✕
            </Text>
          </Button>
        )}
      </XStack>

      {/* Description */}
      <Text fontSize="$3" color={colors.gray[600]} lineHeight={20}>
        You are requesting a {refundFormatted} small-balance cashout. Please verify the phone number associated with your Venmo account.
      </Text>

      {/* Input Field */}
      <YStack gap="$2" marginTop="$2">
        <Text fontSize="$3" fontWeight="600" color={colors.gray[800]}>
          Venmo Phone Number
        </Text>
        <Input
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="(555) 123-4567"
          keyboardType="phone-pad"
          size="$4"
          borderWidth={1}
          borderColor={colors.gray[200]}
          backgroundColor={colors.gray[50]}
          focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
        />
        <Text fontSize={13} color={colors.gray[500]}>
          We will send the funds securely to this registered Venmo number.
        </Text>
      </YStack>

      {/* Actions */}
      <YStack gap="$3" marginTop="$4">
        {Platform.OS === 'web' ? (
          <button
            disabled={!isValid}
            onClick={() => onConfirm(phoneNumber)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: 48,
              padding: '14px',
              backgroundColor: isValid ? '#3B82F6' : '#93C5FD',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: isValid ? 'pointer' : 'not-allowed',
              opacity: isValid ? 1 : 0.6,
            }}
          >
            Confirm {refundFormatted} Cashout
          </button>
        ) : (
          <Button
            backgroundColor={colors.blue[500]}
            size="$4"
            borderRadius={8}
            disabled={!isValid}
            opacity={isValid ? 1 : 0.6}
            onPress={() => onConfirm(phoneNumber)}
          >
            <Text color="white" fontWeight="600" fontSize="$4">
              Confirm {refundFormatted} Cashout
            </Text>
          </Button>
        )}
        
        {Platform.OS === 'web' ? (
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: 'transparent',
              color: colors.gray[600],
              border: `1px solid ${colors.gray[200]}`,
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        ) : (
          <Button
            variant="outlined"
            size="$4"
            borderRadius={8}
            borderColor={colors.gray[200]}
            onPress={onClose}
          >
            <Text color={colors.gray[600]} fontWeight="600">
              Cancel
            </Text>
          </Button>
        )}
      </YStack>
    </YStack>
  )

  if (Platform.OS === 'web') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 16,
            width: '90%',
            maxWidth: 400,
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}
        >
          {sheetContent}
        </div>
      </div>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <YStack flex={1} justifyContent="flex-end" backgroundColor="rgba(0,0,0,0.4)">
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <YStack backgroundColor="white" borderTopLeftRadius={24} borderTopRightRadius={24} paddingBottom="$8">
          {sheetContent}
        </YStack>
      </YStack>
    </Modal>
  )
}
