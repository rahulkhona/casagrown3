/**
 * GiftCardDetailSheet — Shows details of a redeemed gift card
 *
 * Displays the gift card brand, amount, code, and redemption URL.
 * User can copy the code or share the link.
 * Used from transaction history when tapping a redemption row.
 */

import React, { useCallback } from 'react'
import { Modal, Pressable, Platform, Alert, Share } from 'react-native'
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui'
import { Copy, Share2, ExternalLink, X, Gift, CheckCircle, Clock, AlertTriangle } from '@tamagui/lucide-icons'
import { colors, borderRadius } from '../../design-tokens'

type DeliveryStatus = 'queued' | 'processing' | 'completed' | 'failed'

interface GiftCardDetailSheetProps {
  visible: boolean
  onClose: () => void
  brandName: string
  brandColor?: string
  brandIcon?: string
  amount: number       // face value in dollars
  pointsCost: number   // points debited
  code?: string        // gift card code (available when delivered)
  url?: string         // gift card URL
  status: DeliveryStatus
  redeemedAt: string   // ISO date
  provider?: string    // 'tremendous' | 'reloadly'
}

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; color: string; bgColor: string; icon: any }> = {
  queued:     { label: 'Queued',     color: colors.amber[700],  bgColor: colors.amber[100], icon: Clock },
  processing: { label: 'Processing', color: colors.blue[700],   bgColor: colors.blue[100],  icon: Clock },
  completed:  { label: 'Delivered',  color: colors.green[700],  bgColor: colors.green[100], icon: CheckCircle },
  failed:     { label: 'Failed',     color: colors.red[700],    bgColor: colors.red[100],   icon: AlertTriangle },
}

export function GiftCardDetailSheet({
  visible, onClose, brandName, brandColor, brandIcon, amount, pointsCost,
  code, url, status, redeemedAt, provider,
}: GiftCardDetailSheetProps) {

  const statusConfig = STATUS_CONFIG[status]
  const StatusIcon = statusConfig.icon

  const handleCopy = useCallback(() => {
    if (!code) return
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(code)
    } else {
      Alert.alert('Copied!', 'Gift card code copied to clipboard')
    }
  }, [code])

  const handleShare = useCallback(async () => {
    const shareText = url || code || `${brandName} $${amount.toFixed(2)} Gift Card`
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ title: `${brandName} Gift Card`, text: shareText })
        } else {
          await navigator.clipboard?.writeText(shareText)
        }
      } else {
        await Share.share({
          message: `${brandName} $${amount} Gift Card`,
          url: url || shareText, // Explicitly pass url to enable iOS native URL sharing options
          title: `${brandName} Gift Card`,
        })
      }
    } catch {
      // user cancelled
    }
  }, [url, code, brandName, amount])

  const handleOpenUrl = useCallback(() => {
    if (!url) return
    if (Platform.OS === 'web') {
      window.open(url, '_blank')
    }
  }, [url])

  const formattedDate = new Date(redeemedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

  if (!visible) return null

  const sheetContent = (
    <YStack padding="$4" gap="$4">
      {/* Header: Close button */}
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize="$5" fontWeight="700" color={colors.gray[800]}>Gift Card Details</Text>
        {Platform.OS === 'web' ? (
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gray[100],
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
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

      {/* Brand Card Visual */}
      <YStack
        backgroundColor={brandColor as any || colors.purple[600]}
        borderRadius={borderRadius.lg} padding="$5" gap="$3" alignItems="center"
      >
        <Text fontSize={40}>{brandIcon || '🎁'}</Text>
        <Text fontSize="$6" fontWeight="700" color="white">{brandName}</Text>
        <Text fontSize="$8" fontWeight="800" color="white">${amount.toFixed(2)}</Text>

        {/* Status badge */}
        <XStack
          backgroundColor="rgba(255,255,255,0.25)" paddingHorizontal="$3" paddingVertical="$1.5"
          borderRadius={20} gap="$1.5" alignItems="center"
        >
          <StatusIcon size={14} color="white" />
          <Text fontSize={12} fontWeight="600" color="white">{statusConfig.label}</Text>
        </XStack>
      </YStack>

      {/* Gift Card Code */}
      {code && status === 'completed' && (
        <YStack gap="$2">
          <Text fontSize={12} fontWeight="600" color={colors.gray[500]} textTransform="uppercase">
            Gift Card Code
          </Text>
          <XStack
            backgroundColor={colors.gray[50]} borderRadius={borderRadius.lg} borderWidth={1}
            borderColor={colors.gray[200]} padding="$3" alignItems="center" justifyContent="space-between"
          >
            <Text fontSize="$4" fontWeight="700" color={colors.gray[800]} letterSpacing={1.5} selectable>
              {code}
            </Text>
            {Platform.OS === 'web' ? (
              <button onClick={handleCopy} style={{
                padding: '6px 8px', borderRadius: 8, border: 'none',
                backgroundColor: colors.purple[50], cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Copy size={14} color={colors.purple[600]} />
                <span style={{ fontSize: 12, fontWeight: 500, color: colors.purple[600] }}>Copy</span>
              </button>
            ) : (
              <Button unstyled paddingHorizontal="$2" paddingVertical="$1.5" borderRadius={8}
                backgroundColor={colors.purple[50]} onPress={handleCopy}
              >
                <XStack gap="$1" alignItems="center">
                  <Copy size={14} color={colors.purple[600]} />
                  <Text fontSize={12} fontWeight="500" color={colors.purple[600]}>Copy</Text>
                </XStack>
              </Button>
            )}
          </XStack>
        </YStack>
      )}

      {/* Status Messages */}
      {status === 'queued' && (
        <YStack backgroundColor={colors.amber[50]} borderRadius={borderRadius.lg} padding="$3">
          <XStack gap="$2" alignItems="flex-start">
            <Clock size={16} color={colors.amber[600]} />
            <Text fontSize="$2" color={colors.amber[700]} flex={1} lineHeight={18}>
              Your gift card order is queued and will be processed shortly. You'll see the code here once it's delivered.
            </Text>
          </XStack>
        </YStack>
      )}

      {status === 'processing' && (
        <YStack backgroundColor={colors.blue[50]} borderRadius={borderRadius.lg} padding="$3">
          <XStack gap="$2" alignItems="flex-start">
            <Clock size={16} color={colors.blue[600]} />
            <Text fontSize="$2" color={colors.blue[700] as any} flex={1} lineHeight={18}>
              Your gift card is being generated. This usually takes less than a minute.
            </Text>
          </XStack>
        </YStack>
      )}

      {status === 'failed' && (
        <YStack backgroundColor={colors.red[50]} borderRadius={borderRadius.lg} padding="$3">
          <XStack gap="$2" alignItems="flex-start">
            <AlertTriangle size={16} color={colors.red[600]} />
            <Text fontSize="$2" color={colors.red[700]} flex={1} lineHeight={18}>
              There was an issue processing your gift card. Your points have been refunded. Please try again or contact support.
            </Text>
          </XStack>
        </YStack>
      )}

      {/* Details */}
      <YStack gap="$2" backgroundColor={colors.gray[50]} borderRadius={borderRadius.lg} padding="$3">
        <DetailRow label="Points Cost" value={`${pointsCost.toLocaleString()} pts`} />
        <DetailRow label="Face Value" value={`$${amount.toFixed(2)}`} />
        <DetailRow label="Redeemed" value={formattedDate} />
        {provider && <DetailRow label="Provider" value={provider === 'tremendous' ? 'Tremendous' : 'Reloadly'} />}
      </YStack>

      {/* Action Buttons */}
      {status === 'completed' && (
        Platform.OS === 'web' ? (
          <div style={{ display: 'flex', gap: 12 }}>
            {url && (
              <button onClick={handleOpenUrl} style={{
                flex: 1, padding: '12px 0', borderRadius: 24, border: 'none',
                backgroundColor: colors.purple[600], color: 'white',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <ExternalLink size={16} color="white" />
                Open Card
              </button>
            )}
            <button onClick={handleShare} style={{
              flex: 1, padding: '12px 0', borderRadius: 24,
              border: `1px solid ${colors.purple[600]}`, backgroundColor: 'white',
              color: colors.purple[600], fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <Share2 size={16} color={colors.purple[600]} />
              Share
            </button>
          </div>
        ) : (
          <XStack gap="$3">
            {url && (
              <Button unstyled flex={1} paddingVertical="$3" borderRadius={24}
                backgroundColor={colors.purple[600]} alignItems="center" justifyContent="center"
                flexDirection="row" gap="$2" onPress={handleOpenUrl}
              >
                <ExternalLink size={16} color="white" />
                <Text fontSize="$3" fontWeight="600" color="white">Open Card</Text>
              </Button>
            )}
            <Button unstyled flex={1} paddingVertical="$3" borderRadius={24}
              borderWidth={1} borderColor={colors.purple[600]}
              backgroundColor="white" alignItems="center" justifyContent="center"
              flexDirection="row" gap="$2" onPress={handleShare}
            >
              <Share2 size={16} color={colors.purple[600]} />
              <Text fontSize="$3" fontWeight="600" color={colors.purple[600]}>Share</Text>
            </Button>
          </XStack>
        )
      )}
    </YStack>
  )

  // Web: use native HTML overlay (React Native Modal has click issues on web)
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
            maxHeight: '90%', width: '100%', maxWidth: 600, overflow: 'auto',
          }}
        >
          {sheetContent}
        </div>
      </div>
    )
  }

  // Native: use React Native Modal
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
      <Text fontSize={13} fontWeight="500" color={colors.gray[700]}>{value}</Text>
    </XStack>
  )
}
