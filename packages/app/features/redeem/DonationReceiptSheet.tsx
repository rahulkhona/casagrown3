/**
 * DonationReceiptSheet — Shows a donation receipt after donating points
 *
 * Uses web-native HTML overlay on web for reliable click handling.
 * Displays the charity organization, amount donated, date, and
 * a shareable receipt. Used from transaction history when tapping a donation row.
 */

import React, { useCallback } from 'react'
import { Platform, Alert, Share, Modal, Pressable } from 'react-native'
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui'
import { Heart, X, Share2, ExternalLink, FileText } from '@tamagui/lucide-icons'
import { colors, borderRadius } from '../../design-tokens'
import { POINTS_PER_DOLLAR } from './mock-data'

interface DonationReceiptSheetProps {
  visible: boolean
  onClose: () => void
  organizationName: string
  projectTitle?: string
  theme?: string
  amount: number          // points donated
  donatedAt: string       // ISO date
  receiptUrl?: string     // link to receipt
  receiptId?: string      // receipt reference number
}

const THEME_ICONS: Record<string, string> = {
  Hunger: '🍽️',
  Environment: '🌍',
  Education: '📚',
  Health: '💊',
}

const THEME_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  Hunger:      { bg: colors.amber[50],  text: colors.amber[700],  accent: colors.amber[600] },
  Environment: { bg: colors.green[50],  text: colors.green[700],  accent: colors.green[600] },
  Education:   { bg: colors.blue[50],   text: colors.blue[700],   accent: colors.blue[600] },
  Health:      { bg: colors.pink[50],   text: colors.pink[700],   accent: colors.pink[600] },
}

export function DonationReceiptSheet({
  visible, onClose, organizationName, projectTitle, theme,
  amount, donatedAt, receiptUrl, receiptId,
}: DonationReceiptSheetProps) {

  const dollarAmount = amount / POINTS_PER_DOLLAR
  const themeIcon = theme ? (THEME_ICONS[theme] || '❤️') : '❤️'
  const themeColor = theme ? (THEME_COLORS[theme] || null) : null
  const accentColor = themeColor?.accent || colors.pink[600]

  const formattedDate = new Date(donatedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

  // In sandbox mode, receiptUrl is fake — show a receipt summary instead
  const isRealReceipt = receiptUrl && !receiptUrl.includes('casagrown.com/receipts')

  const handleViewReceipt = useCallback(() => {
    if (isRealReceipt) {
      if (Platform.OS === 'web') {
        window.open(receiptUrl, '_blank')
      } else {
        Alert.alert('Donation Receipt', `View your receipt at:\n${receiptUrl}`)
      }
    } else {
      // Sandbox mode — show receipt info inline
      Alert.alert(
        'Donation Receipt',
        `Receipt ID: ${receiptId || 'N/A'}\n` +
        `Organization: ${organizationName}\n` +
        `${projectTitle ? `Project: ${projectTitle}\n` : ''}` +
        `Amount: ${amount.toLocaleString()} pts ($${dollarAmount.toFixed(2)} USD)\n` +
        `Date: ${formattedDate}\n\n` +
        `🧪 Sandbox mode — in production, GlobalGiving will email you an official tax-deductible receipt.`
      )
    }
  }, [receiptUrl, isRealReceipt, receiptId, organizationName, projectTitle, amount, dollarAmount, formattedDate])

  const handleShare = useCallback(async () => {
    const shareText = isRealReceipt && receiptUrl
      ? receiptUrl
      : `I donated ${amount.toLocaleString()} points ($${dollarAmount.toFixed(2)}) to ${organizationName} via CasaGrown! 💚`
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard?.writeText(shareText)
        Alert.alert('Copied', 'Donation details copied to clipboard')
      } else {
        await Share.share({
          message: shareText,
          title: 'CasaGrown Donation Receipt',
        })
      }
    } catch {
      // user cancelled
    }
  }, [receiptUrl, isRealReceipt, amount, dollarAmount, organizationName])

  if (!visible) return null

  const sheetContent = (
    <YStack padding="$4" gap="$4">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize="$5" fontWeight="700" color={colors.gray[800]}>Donation Receipt</Text>
        {Platform.OS === 'web' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            style={{
              width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gray[100],
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} color={colors.gray[600]} />
          </button>
        ) : (
          <Pressable onPress={onClose}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gray[100],
              alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} color={colors.gray[600]} />
          </Pressable>
        )}
      </XStack>

      {/* Donation Hero */}
      <YStack
        backgroundColor={accentColor as any}
        borderRadius={borderRadius.lg} padding="$5" gap="$2" alignItems="center"
      >
        <Text fontSize={48}>{themeIcon}</Text>
        <Text fontSize="$4" fontWeight="500" color="rgba(255,255,255,0.8)">You donated</Text>
        <Text fontSize="$8" fontWeight="800" color="white">
          {amount.toLocaleString()} pts
        </Text>
        <Text fontSize="$4" fontWeight="500" color="rgba(255,255,255,0.8)">
          (${dollarAmount.toFixed(2)} USD)
        </Text>
        <XStack
          backgroundColor="rgba(255,255,255,0.2)" paddingHorizontal="$3" paddingVertical="$1.5"
          borderRadius={20} marginTop="$1"
        >
          <Text fontSize={12} fontWeight="600" color="white">✅ Donation Complete</Text>
        </XStack>
      </YStack>

      {/* Organization Info */}
      <YStack gap="$2" backgroundColor={colors.gray[50]} borderRadius={borderRadius.lg} padding="$3">
        <DetailRow label="Organization" value={organizationName} />
        {projectTitle && <DetailRow label="Project" value={projectTitle} />}
        {theme && (
          <DetailRow label="Category" value={`${themeIcon} ${theme}`} />
        )}
        <DetailRow label="Date" value={formattedDate} />
        {receiptId && <DetailRow label="Receipt #" value={receiptId} />}
      </YStack>

      {/* Tax Info */}
      <YStack backgroundColor={colors.green[50]} borderRadius={borderRadius.lg} padding="$3">
        <XStack gap="$2" alignItems="flex-start">
          <FileText size={16} color={colors.green[600]} />
          <YStack flex={1} gap={2}>
            <Text fontSize={13} fontWeight="600" color={colors.green[700]}>Tax Information</Text>
            <Text fontSize={12} color={colors.green[700]} lineHeight={18}>
              {isRealReceipt
                ? 'This donation is tax-deductible. GlobalGiving has emailed you an official 501(c)(3) tax receipt.'
                : '🧪 Sandbox — In production, GlobalGiving will email your tax-deductible 501(c)(3) receipt directly to your registered email address.'}
            </Text>
          </YStack>
        </XStack>
      </YStack>

      {/* Action Buttons */}
      <XStack gap="$3">
        {Platform.OS === 'web' ? (
          <>
            <button
              onClick={handleViewReceipt}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 24, border: 'none',
                backgroundColor: accentColor, color: 'white', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <ExternalLink size={16} color="white" />
              {isRealReceipt ? 'View Receipt' : 'Receipt Details'}
            </button>
            <button
              onClick={handleShare}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 24,
                border: `1px solid ${accentColor}`,
                backgroundColor: 'white', color: accentColor, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Share2 size={16} color={accentColor as any} />
              Share
            </button>
          </>
        ) : (
          <>
            <Button unstyled flex={1} paddingVertical="$3" borderRadius={24}
              backgroundColor={accentColor as any} alignItems="center" justifyContent="center"
              flexDirection="row" gap="$2"
              onPress={handleViewReceipt}
            >
              <ExternalLink size={16} color="white" />
              <Text fontSize="$3" fontWeight="600" color="white">
                {isRealReceipt ? 'View Receipt' : 'Receipt Details'}
              </Text>
            </Button>
            <Button unstyled flex={1} paddingVertical="$3" borderRadius={24}
              borderWidth={1} borderColor={accentColor as any}
              backgroundColor="white" alignItems="center" justifyContent="center"
              flexDirection="row" gap="$2"
              onPress={handleShare}
            >
              <Share2 size={16} color={accentColor as any} />
              <Text fontSize="$3" fontWeight="600" color={accentColor as any}>Share</Text>
            </Button>
          </>
        )}
      </XStack>

      {/* Thank you note */}
      <YStack alignItems="center" paddingVertical="$2">
        <Text fontSize={13} color={colors.gray[400]} textAlign="center">
          Thank you for making a difference! 💚
        </Text>
      </YStack>
    </YStack>
  )

  // ── Web: use native HTML overlay ──
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
            maxHeight: '90%', width: '100%', maxWidth: 500, overflow: 'auto',
          }}
        >
          {sheetContent}
        </div>
      </div>
    )
  }

  // ── Native: use Modal ──
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}
        >
          <ScrollView>
            {sheetContent}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <XStack justifyContent="space-between" alignItems="center" paddingVertical={2}>
      <Text fontSize={13} color={colors.gray[500]}>{label}</Text>
      <Text fontSize={13} fontWeight="500" color={colors.gray[700]} textAlign="right" maxWidth="60%">{value}</Text>
    </XStack>
  )
}
