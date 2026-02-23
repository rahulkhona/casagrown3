/**
 * GiftCardSheet — Bottom sheet for purchasing a gift card
 *
 * Shows denomination pills AND custom input, transparent cost breakdown
 * with provider info, discount, and processing fee always visible.
 */

import React, { useState, useMemo } from 'react'
import { Modal, Platform, Pressable } from 'react-native'
import { YStack, XStack, Text, Button, Input, ScrollView } from 'tamagui'
import { colors, borderRadius } from '../../design-tokens'
import { type GiftCardProduct, POINTS_PER_DOLLAR } from './mock-data'

interface GiftCardSheetProps {
  visible: boolean
  card: GiftCardProduct
  balance: number
  onClose: () => void
  onConfirm: (card: GiftCardProduct, amount: number, totalPoints: number) => void
  t: any
}

const PROVIDER_LABELS: Record<string, string> = {
  tremendous: 'Tremendous',
  reloadly: 'Reloadly',
}

export function GiftCardSheet({ visible, card, balance, onClose, onConfirm, t }: GiftCardSheetProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(
    card.denominationType === 'fixed' && card.fixedDenominations?.[0]
      ? card.fixedDenominations[0]
      : null,
  )
  const [customAmount, setCustomAmount] = useState('')
  const [useCustom, setUseCustom] = useState(false)

  const activeAmount = useMemo(() => {
    if (useCustom) {
      const parsed = parseFloat(customAmount)
      return isNaN(parsed) ? 0 : parsed
    }
    return selectedAmount || 0
  }, [useCustom, customAmount, selectedAmount])

  const isValidAmount = useMemo(() => {
    if (activeAmount <= 0) return false
    if (useCustom && card.denominationType === 'fixed') {
      return card.fixedDenominations?.includes(activeAmount) || false
    }
    if (card.denominationType === 'range') {
      return activeAmount >= (card.minDenomination || 0) && activeAmount <= (card.maxDenomination || 9999)
    }
    return card.fixedDenominations?.includes(activeAmount) || false
  }, [activeAmount, card, useCustom])

  // Cost breakdown — picks cheapest provider (already sorted in availableProviders):
  // • Tremendous (free) preferred
  // • Reloadly: fee only charged if discount doesn't cover it
  const provider = card.availableProviders?.[0]
  const faceValuePoints = Math.round(activeAmount * POINTS_PER_DOLLAR)
  const netFeeUsd = useMemo(() => {
    if (!provider || activeAmount <= 0) return 0
    const discountSavings = activeAmount * (provider.discountPercentage / 100)
    const totalFee = provider.feePerTransaction + activeAmount * (provider.feePercentage / 100)
    return Math.max(0, totalFee - discountSavings)
  }, [activeAmount, provider])
  const feePoints = Math.round(netFeeUsd * POINTS_PER_DOLLAR)
  const totalPoints = faceValuePoints + feePoints
  const canAfford = totalPoints > 0 && totalPoints <= balance
  const providerName = provider?.provider === 'tremendous' ? 'Tremendous' : provider?.provider === 'reloadly' ? 'Reloadly' : 'Provider'

  if (!visible) return null

  const sheetContent = (
    <YStack padding="$4" gap="$4">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="flex-start">
        <YStack flex={1} gap="$1">
          <Text fontSize="$6" fontWeight="700" color={colors.gray[800]}>
            {card.brandName} Gift Card
          </Text>
          <Text fontSize="$2" color={colors.gray[400]}>
            {card.denominationType === 'range'
              ? `$${card.minDenomination} – $${card.maxDenomination} range`
              : `Available in ${card.fixedDenominations?.map((d) => `$${d}`).join(', ')}`}
          </Text>
        </YStack>
        {Platform.OS === 'web' ? (
          <button onClick={onClose} style={{
            padding: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: colors.gray[400],
          }}>✕</button>
        ) : (
          <Button unstyled onPress={onClose} padding="$2">
            <Text fontSize={20} color={colors.gray[400]}>✕</Text>
          </Button>
        )}
      </XStack>

      {/* Choose Amount */}
      <YStack gap="$2">
        <Text fontSize="$4" fontWeight="600" color={colors.gray[800]}>Choose Amount</Text>

        {/* Denomination pills */}
        {card.fixedDenominations && card.fixedDenominations.length > 0 && (
          Platform.OS === 'web' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {card.fixedDenominations.map((d) => (
                <button key={d} onClick={() => { setSelectedAmount(d); setUseCustom(false); setCustomAmount('') }}
                  style={{
                    padding: '10px 16px', borderRadius: 20, cursor: 'pointer',
                    border: `2px solid ${!useCustom && selectedAmount === d ? colors.green[600] : colors.gray[200]}`,
                    backgroundColor: !useCustom && selectedAmount === d ? colors.green[50] : 'white',
                    color: !useCustom && selectedAmount === d ? colors.green[700] : colors.gray[700],
                    fontSize: 14, fontWeight: 600,
                  }}
                >${d}</button>
              ))}
            </div>
          ) : (
            <XStack gap="$2" flexWrap="wrap">
              {card.fixedDenominations.map((d) => (
                <Button key={d} unstyled paddingHorizontal="$4" paddingVertical="$2.5" borderRadius={20}
                  borderWidth={2} borderColor={!useCustom && selectedAmount === d ? colors.green[600] : colors.gray[200]}
                  backgroundColor={!useCustom && selectedAmount === d ? colors.green[50] : 'white'}
                  onPress={() => { setSelectedAmount(d); setUseCustom(false); setCustomAmount('') }}
                >
                  <Text fontSize="$3" fontWeight="600"
                    color={!useCustom && selectedAmount === d ? colors.green[700] : colors.gray[700]}
                  >${d}</Text>
                </Button>
              ))}
            </XStack>
          )
        )}

        {/* Custom amount input — always shown */}
        <YStack gap="$1">
          <XStack borderWidth={2} borderColor={useCustom ? colors.green[600] : colors.gray[200]}
            borderRadius={borderRadius.lg} paddingHorizontal="$3" alignItems="center" height={48}
          >
            <Text fontSize="$4" color={colors.gray[500]} marginRight="$1">$</Text>
            <Input flex={1} unstyled
              placeholder={card.denominationType === 'fixed' ? 'Or enter custom amount' : 'Enter amount'}
              placeholderTextColor={colors.gray[400] as any}
              value={customAmount}
              onChangeText={(v) => { setCustomAmount(v); setUseCustom(true); setSelectedAmount(null) }}
              keyboardType="decimal-pad" fontSize={18} fontWeight="600" color={colors.gray[800]}
            />
          </XStack>
          <Text fontSize="$2" color={colors.gray[400]}>
            {card.denominationType === 'range'
              ? `$${card.minDenomination} – $${card.maxDenomination} range`
              : `Accepted: ${card.fixedDenominations?.map((d) => `$${d}`).join(', ')}`}
          </Text>
        </YStack>
      </YStack>

      {/* Cost Breakdown */}
      {activeAmount > 0 && (
        <YStack backgroundColor={colors.gray[50]} borderRadius={borderRadius.lg} padding="$3" gap="$2"
          borderWidth={1} borderColor={colors.gray[200]}
        >
          <Text fontSize="$3" fontWeight="700" color={colors.gray[800]}>Cost Breakdown</Text>
          <CostRow label={`${card.brandName} gift card`} value={`$${activeAmount.toFixed(2)}`} />
          <CostRow label="Points cost" value={`${faceValuePoints.toLocaleString()} pts`}
            sublabel={`$1 = ${POINTS_PER_DOLLAR} pts`} />
          {feePoints > 0 && (
            <CostRow label={`Processing fee (${providerName})`}
              value={`+${feePoints.toLocaleString()} pts`}
              valueColor={colors.amber[700]}
              sublabel={`$${netFeeUsd.toFixed(2)} fee after discount`} />
          )}

          <YStack borderTopWidth={1} borderTopColor={colors.gray[200]} paddingTop="$2" marginTop="$1">
            <CostRow label="You pay" value={`${totalPoints.toLocaleString()} pts`} bold />
          </YStack>

          <YStack backgroundColor={colors.sky[50] as any} padding="$2" borderRadius={8}>
            <Text fontSize={11} color={colors.sky[700] as any} lineHeight={15}>
              {feePoints > 0
                ? `ℹ️ This brand is provided by ${providerName}. A small fee applies because the provider discount doesn't fully cover costs.`
                : `ℹ️ This card is provided at no extra fee. We compare multiple providers to find the best rate.`}
            </Text>
          </YStack>
        </YStack>
      )}

      {/* Balance check */}
      <XStack alignItems="center" gap="$2">
        <Text fontSize="$3" color={colors.gray[500]}>
          Your balance: {balance.toLocaleString()} pts
        </Text>
        {isValidAmount && <Text fontSize={16}>{canAfford ? '✅' : '❌'}</Text>}
      </XStack>

      {/* Confirm */}
      {Platform.OS === 'web' ? (
        <button
          onClick={() => { if (isValidAmount && canAfford) onConfirm(card, activeAmount, totalPoints) }}
          disabled={!isValidAmount || !canAfford}
          style={{
            padding: '14px 0', borderRadius: 24, border: 'none', cursor: isValidAmount && canAfford ? 'pointer' : 'default',
            backgroundColor: isValidAmount && canAfford ? colors.green[600] : colors.gray[300],
            color: 'white', fontSize: 16, fontWeight: 600, width: '100%', textAlign: 'center' as const,
          }}
        >
          {!isValidAmount ? 'Select an amount' : !canAfford ? 'Insufficient points' : 'Confirm Redemption'}
        </button>
      ) : (
        <Button unstyled paddingVertical="$3.5" borderRadius={24}
          backgroundColor={isValidAmount && canAfford ? colors.green[600] : colors.gray[300]}
          alignItems="center" justifyContent="center"
          onPress={() => { if (isValidAmount && canAfford) onConfirm(card, activeAmount, totalPoints) }}
          disabled={!isValidAmount || !canAfford}
        >
          <Text fontSize="$4" fontWeight="600" color="white">
            {!isValidAmount ? 'Select an amount' : !canAfford ? 'Insufficient points' : 'Confirm Redemption'}
          </Text>
        </Button>
      )}
    </YStack>
  )

  // Web: native HTML overlay (React Native Modal has first-render issues on web)
  if (Platform.OS === 'web') {
    return (
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 9999,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            maxHeight: '85%', width: '100%', maxWidth: 600, overflow: 'auto',
          }}
        >
          {sheetContent}
        </div>
      </div>
    )
  }

  // Native: React Native Modal
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' }}
        >
          <ScrollView>
            {sheetContent}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function Badge({ bg, text, color }: { bg: string; text: string; color: string }) {
  return (
    <YStack backgroundColor={bg as any} paddingHorizontal="$2" paddingVertical={2} borderRadius={8}>
      <Text fontSize={11} fontWeight="600" color={color as any}>{text}</Text>
    </YStack>
  )
}

function CostRow({ label, value, bold, labelColor, valueColor, sublabel }: {
  label: string; value: string; bold?: boolean; labelColor?: string; valueColor?: string; sublabel?: string
}) {
  return (
    <YStack>
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize="$3" color={(labelColor || colors.gray[600]) as any} fontWeight={bold ? '700' : '400'}>{label}</Text>
        <Text fontSize="$3" color={(valueColor || colors.gray[800]) as any} fontWeight={bold ? '700' : '500'}>{value}</Text>
      </XStack>
      {sublabel && <Text fontSize={11} color={colors.gray[400]}>{sublabel}</Text>}
    </YStack>
  )
}
