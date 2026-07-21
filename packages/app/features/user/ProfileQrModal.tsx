/**
 * ProfileQrModal — Expandable Profile & Seller Follow QR Pass Modal
 * Displays the user's personal profile QR code which can be scanned by standard
 * smartphone cameras to open the app, follow the seller, or install from App Store.
 */

import React, { useState } from 'react'
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui'
import { X, QrCode, Share2, Copy, Check, UserCheck, Sparkles, Smartphone } from '@tamagui/lucide-icons'
import { Modal, Platform, TouchableOpacity, Share } from 'react-native'
import { colors, borderRadius, shadows } from '../../design-tokens'
import { getBaseAppUrl } from '../../utils/external-urls'
import { QRCodeDisplay } from '../feed/QRCodeDisplay'

interface ProfileQrModalProps {
  visible: boolean
  onClose: () => void
  user: {
    id: string
    full_name?: string | null
    username?: string | null
    avatar_url?: string | null
  }
}

export function ProfileQrModal({ visible, onClose, user }: ProfileQrModalProps) {
  const [copied, setCopied] = useState(false)

  if (!user) return null

  const baseUrl = getBaseAppUrl()
  const identifier = user.username || user.id
  const profileUrl = `${baseUrl}/u/${identifier}?ref=${user.id}&intent=follow`
  const displayName = user.full_name || `@${identifier}`
  const userHandle = user.username ? `@${user.username}` : `ID: ${user.id.substring(0, 8)}`

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShare = async () => {
    if (Platform.OS !== 'web') {
      try {
        await Share.share({
          message: `Connect with ${displayName} on CasaGrown: ${profileUrl}`,
          url: profileUrl,
        })
      } catch (e) {
        console.warn('Share error:', e)
      }
    } else {
      handleCopyLink()
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <YStack
        flex={1}
        backgroundColor="rgba(0,0,0,0.6)"
        justifyContent="center"
        alignItems="center"
        padding="$4"
      >
        <YStack
          width="100%"
          maxWidth={420}
          backgroundColor={colors.white}
          borderRadius={borderRadius['2xl']}
          overflow="hidden"
          {...shadows.xl}
        >
          {/* ── Header ── */}
          <XStack
            backgroundColor={colors.green[700]}
            paddingHorizontal="$4"
            paddingVertical="$3"
            justifyContent="space-between"
            alignItems="center"
          >
            <XStack alignItems="center" gap="$2">
              <Sparkles color={colors.white} size={20} />
              <Text color={colors.white} fontWeight="700" fontSize={16}>
                My CasaGrown Pass & QR
              </Text>
            </XStack>
            <TouchableOpacity onPress={onClose} testID="close-profile-qr">
              <X color={colors.white} size={22} />
            </TouchableOpacity>
          </XStack>

          <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
            {/* User Profile Avatar & Handle */}
            <YStack alignItems="center" marginBottom="$3">
              <YStack
                width={64}
                height={64}
                borderRadius={32}
                backgroundColor={colors.green[100]}
                borderWidth={2}
                borderColor={colors.green[300]}
                alignItems="center"
                justifyContent="center"
                marginBottom="$2"
                {...shadows.sm}
              >
                <Text fontSize={24} fontWeight="800" color={colors.green[800]}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </YStack>
              <Text fontSize={18} fontWeight="800" color={colors.gray[900]}>
                {displayName}
              </Text>
              <XStack alignItems="center" gap="$1" marginTop={2}>
                <UserCheck size={14} color={colors.green[600]} />
                <Text fontSize={13} fontWeight="600" color={colors.green[700]}>
                  {userHandle} • Verified Gardener
                </Text>
              </XStack>
            </YStack>

            {/* ── QR Container Card ── */}
            <YStack
              backgroundColor={colors.green[50]}
              borderColor={colors.green[300]}
              borderWidth={2}
              borderRadius={borderRadius.xl}
              padding="$4"
              alignItems="center"
              width="100%"
              marginBottom="$4"
            >
              <YStack
                backgroundColor={colors.white}
                padding="$3"
                borderRadius={borderRadius.lg}
                borderWidth={1}
                borderColor={colors.gray[200]}
                alignItems="center"
                justifyContent="center"
                marginBottom="$2"
                {...shadows.md}
              >
                <QRCodeDisplay value={profileUrl} size={180} />
              </YStack>
              <XStack alignItems="center" gap="$1.5" marginTop="$1">
                <Smartphone size={14} color={colors.green[800]} />
                <Text fontSize={11} fontWeight="700" color={colors.green[800]}>
                  Scan with Phone Camera to Install & Follow
                </Text>
              </XStack>
            </YStack>

            {/* Link Info Box */}
            <YStack
              width="100%"
              backgroundColor={colors.gray[50]}
              borderRadius={borderRadius.lg}
              padding="$3"
              borderWidth={1}
              borderColor={colors.gray[200]}
              gap="$1.5"
              marginBottom="$4"
            >
              <Text fontSize={11} color={colors.gray[500]} fontWeight="600">
                Shareable Universal Link
              </Text>
              <Text fontSize={12} color={colors.gray[800]} fontWeight="600" numberOfLines={1}>
                {profileUrl}
              </Text>
            </YStack>

            {/* Share / Copy Buttons */}
            <XStack gap="$2" width="100%">
              <Button
                flex={1}
                backgroundColor={colors.green[600]}
                pressStyle={{ backgroundColor: colors.green[700] }}
                onPress={handleShare}
                borderRadius={borderRadius.md}
                height={42}
                testID="share-qr-link-btn"
              >
                <XStack alignItems="center" gap="$1.5">
                  <Share2 color={colors.white} size={16} />
                  <Text color={colors.white} fontWeight="700" fontSize={13}>
                    Share Pass
                  </Text>
                </XStack>
              </Button>

              <Button
                flex={1}
                backgroundColor={copied ? colors.green[100] : colors.gray[100]}
                pressStyle={{ backgroundColor: colors.gray[200] }}
                onPress={handleCopyLink}
                borderRadius={borderRadius.md}
                height={42}
                borderColor={copied ? colors.green[300] : colors.gray[200]}
                borderWidth={1}
                testID="copy-qr-link-btn"
              >
                <XStack alignItems="center" gap="$1.5">
                  {copied ? (
                    <Check color={colors.green[700]} size={16} />
                  ) : (
                    <Copy color={colors.gray[700]} size={16} />
                  )}
                  <Text color={copied ? colors.green[800] : colors.gray[800]} fontWeight="600" fontSize={13}>
                    {copied ? 'Copied!' : 'Copy Link'}
                  </Text>
                </XStack>
              </Button>
            </XStack>
          </ScrollView>
        </YStack>
      </YStack>
    </Modal>
  )
}
