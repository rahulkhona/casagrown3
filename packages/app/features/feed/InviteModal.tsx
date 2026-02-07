/**
 * InviteModal - Modal for inviting friends and neighbors
 * 
 * Based on figma_extracted/src/App.tsx lines 798-985
 * Adapted to Tamagui and our design system
 */

import { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Image } from 'tamagui'
import { useTranslation } from 'react-i18next'
import { UserPlus, Users, ShoppingCart, Gift, Leaf, X, Copy, Check, Send, Smartphone } from '@tamagui/lucide-icons'
import { Platform, Share, Clipboard, Dimensions } from 'react-native'
// Platform-specific QR code: see QRCodeDisplay.web.tsx and QRCodeDisplay.tsx
import { QRCodeDisplay } from './QRCodeDisplay'
import { colors, borderRadius } from '../../design-tokens'

// Types for invite rewards
interface InviteRewards {
  signupPoints: number
  transactionPoints: number
}

interface InviteModalProps {
  visible: boolean
  onClose: () => void
  /** The user's unique referral code from their profile */
  referralCode?: string
  /** Reward points for invites - from incentive_rules */
  inviteRewards?: InviteRewards
}

export function InviteModal({ visible, onClose, referralCode, inviteRewards }: InviteModalProps) {
  const { t } = useTranslation()
  const [linkCopied, setLinkCopied] = useState(false)
  const isWeb = Platform.OS === 'web'
  
  // Reactive screen width for responsive layout
  const getScreenWidth = () => {
    if (isWeb && typeof window !== 'undefined') {
      return window.innerWidth
    }
    return Dimensions.get('window').width
  }
  
  const [screenWidth, setScreenWidth] = useState(getScreenWidth)
  
  // Listen for window resize on web
  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return
    
    const handleResize = () => setScreenWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isWeb])
  
  // Use column layout on narrow screens (< 640px)
  const useColumnLayout = screenWidth < 640
  
  // Only include referral code in URL if it exists
  const hasReferralCode = !!referralCode
  const inviteLink = hasReferralCode 
    ? `https://casagrown.com/invite/${referralCode}`
    : 'https://casagrown.com'

  const handleCopyLink = async () => {
    try {
      if (isWeb && navigator.clipboard) {
        await navigator.clipboard.writeText(inviteLink)
      } else {
        Clipboard.setString(inviteLink)
      }
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy link:', error)
    }
  }

  const handleShare = async () => {
    const shareData = {
      title: 'Join CasaGrown!',
      message: `Join me on CasaGrown! Buy and sell fresh produce with neighbors in our community. ${inviteLink}`,
      url: inviteLink,
    }

    try {
      if (isWeb && navigator.share) {
        await navigator.share({
          title: shareData.title,
          text: shareData.message,
          url: shareData.url,
        })
      } else if (!isWeb) {
        await Share.share({
          title: shareData.title,
          message: shareData.message,
          url: shareData.url,
        })
      } else {
        // Fallback: copy link
        handleCopyLink()
      }
    } catch (error) {
      console.error('Failed to share:', error)
    }
  }

  if (!visible) return null

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="rgba(0, 0, 0, 0.5)"
      justifyContent="center"
      alignItems="center"
      zIndex={100}
      padding="$4"
    >
      {/* Modal Container - auto height to fit all content */}
      <YStack
        backgroundColor="white"
        borderRadius={borderRadius['2xl']}
        maxWidth={672}
        width="100%"
        height="98%"
        flex={1}
      >
        {/* Header - Green gradient */}
        <YStack
          backgroundColor={colors.green[600]}
          padding="$6"
          borderTopLeftRadius={borderRadius['2xl']}
          borderTopRightRadius={borderRadius['2xl']}
          flexShrink={0}
        >
          <XStack justifyContent="space-between" alignItems="center">
            <XStack gap="$3" alignItems="center" flex={1}>
              <YStack
                width={48}
                height={48}
                borderRadius={24}
                backgroundColor="rgba(255,255,255,0.2)"
                alignItems="center"
                justifyContent="center"
              >
                <UserPlus size={24} color="white" />
              </YStack>
              <YStack flex={1}>
                <Text fontSize="$7" fontWeight="700" color="white">
                  {t('feed.invite.title')}
                </Text>
                <Text fontSize="$3" color={colors.green[100]}>
                  {t('feed.invite.subtitle')}
                </Text>
              </YStack>
            </XStack>
            <Button
              unstyled
              padding="$2"
              borderRadius={100}
              hoverStyle={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
              onPress={onClose}
            >
              <X size={20} color="white" />
            </Button>
          </XStack>
        </YStack>

        {/* Content - Scrollable - take remaining space */}
        <ScrollView 
          flex={1}
          showsVerticalScrollIndicator={true}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <YStack padding="$6" gap="$6">
            {/* Share Link Section - FIRST for mobile visibility */}
            <YStack gap="$3">
              <Text fontSize="$5" fontWeight="700" color={colors.gray[900]}>
                {t('feed.invite.share.title')}
              </Text>
              
              {/* Reward Points Banner - only show when referral code and rewards exist */}
              {hasReferralCode && inviteRewards && (inviteRewards.signupPoints > 0 || inviteRewards.transactionPoints > 0) && (
                <XStack
                  backgroundColor={colors.green[50]}
                  borderWidth={1}
                  borderColor={colors.green[200]}
                  borderRadius={borderRadius.lg}
                  padding="$3"
                  gap="$2"
                  alignItems="center"
                >
                  <Gift size={20} color={colors.green[600]} />
                  <Text fontSize="$3" color={colors.green[800]} flex={1}>
                    {inviteRewards.signupPoints > 0 && inviteRewards.transactionPoints > 0
                      ? t('feed.invite.share.rewardsBannerBoth', {
                          signupPoints: inviteRewards.signupPoints,
                          transactionPoints: inviteRewards.transactionPoints
                        })
                      : inviteRewards.signupPoints > 0
                        ? t('feed.invite.share.rewardsBannerSignupOnly', {
                            signupPoints: inviteRewards.signupPoints
                          })
                        : t('feed.invite.share.rewardsBannerTransactionOnly', {
                            transactionPoints: inviteRewards.transactionPoints
                          })
                    }
                  </Text>
                </XStack>
              )}
              <YStack
                backgroundColor={colors.gray[50]}
                borderWidth={1}
                borderColor={colors.gray[200]}
                borderRadius={borderRadius.lg}
                padding="$4"
                gap="$2"
              >
                <XStack gap="$2" alignItems="center">
                  <YStack
                    flex={1}
                    backgroundColor="white"
                    borderWidth={1}
                    borderColor={colors.gray[300]}
                    borderRadius={borderRadius.default}
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                  >
                    <Text fontSize="$2" color={colors.gray[700]} numberOfLines={1}>
                      {inviteLink}
                    </Text>
                  </YStack>
                  <Button
                    backgroundColor={colors.green[600]}
                    paddingHorizontal="$4"
                    paddingVertical="$2"
                    borderRadius={borderRadius.lg}
                    hoverStyle={{ backgroundColor: colors.green[700] }}
                    onPress={handleCopyLink}
                    gap="$2"
                  >
                    {linkCopied ? (
                      <>
                        <Check size={16} color="white" />
                        <Text color="white" fontSize="$3">{t('feed.invite.share.copied')}</Text>
                      </>
                    ) : (
                      <>
                        <Copy size={16} color="white" />
                        <Text color="white" fontSize="$3">{t('feed.invite.share.copy')}</Text>
                      </>
                    )}
                  </Button>
                </XStack>
                <Text fontSize="$1" color={colors.gray[500]}>
                  {t('feed.invite.share.hint')}
                </Text>
              </YStack>

              {/* Share Button */}
              <Button
                backgroundColor={colors.green[600]}
                paddingHorizontal="$4"
                paddingVertical="$3"
                borderRadius={borderRadius.lg}
                gap="$2"
                hoverStyle={{ backgroundColor: colors.green[700] }}
                onPress={handleShare}
              >
                <Send size={20} color="white" />
                <Text color="white" fontSize="$4" fontWeight="500">{t('feed.invite.share.shareButton')}</Text>
              </Button>

              {/* QR Code Section - for in-person sharing */}
              {(
                <YStack
                  backgroundColor={colors.gray[50]}
                  borderWidth={1}
                  borderColor={colors.gray[200]}
                  borderRadius={borderRadius.lg}
                  padding="$4"
                  alignItems="center"
                  gap="$3"
                >
                  <XStack gap="$2" alignItems="center">
                    <Smartphone size={18} color={colors.gray[600]} />
                    <Text fontSize="$3" fontWeight="600" color={colors.gray[700]}>
                      {t('feed.invite.share.qrTitle', 'Scan to Join')}
                    </Text>
                  </XStack>
                  <YStack
                    backgroundColor="white"
                    padding="$3"
                    borderRadius={borderRadius.default}
                    borderWidth={1}
                    borderColor={colors.gray[200]}
                  >
                    <QRCodeDisplay
                      value={inviteLink}
                      size={150}
                    />
                  </YStack>
                  <Text fontSize="$1" color={colors.gray[500]} textAlign="center">
                    {t('feed.invite.share.qrHint', 'Show this QR code for others to scan and join')}
                  </Text>
                </YStack>
              )}
            </YStack>

            {/* Benefits Section */}
            <YStack gap="$3">
              <Text fontSize="$5" fontWeight="700" color={colors.gray[900]}>
                {t('feed.invite.whyInvite')}
              </Text>
              
              {/* 2x2 Grid Layout - Row 1 - responsive */}
              <XStack gap="$3" flexDirection={useColumnLayout ? 'column' : 'row'}>
                <YStack
                  flex={useColumnLayout ? undefined : 1}
                  backgroundColor={colors.green[50]}
                  borderWidth={1}
                  borderColor={colors.green[200]}
                  borderRadius={borderRadius.lg}
                  padding="$4"
                >
                  <XStack gap="$3">
                    <YStack
                      width={32}
                      height={32}
                      borderRadius={16}
                      backgroundColor={colors.green[100]}
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <Users size={16} color={colors.green[600]} />
                    </YStack>
                    <YStack flex={1}>
                      <Text fontSize="$3" fontWeight="600" color={colors.green[900]} marginBottom="$1">
                        {t('feed.invite.benefits.community.title')}
                      </Text>
                      <Text fontSize="$2" color={colors.green[800]}>
                        {t('feed.invite.benefits.community.description')}
                      </Text>
                    </YStack>
                  </XStack>
                </YStack>

                <YStack
                  flex={useColumnLayout ? undefined : 1}
                  backgroundColor="#eff6ff"
                  borderWidth={1}
                  borderColor="#bfdbfe"
                  borderRadius={borderRadius.lg}
                  padding="$4"
                >
                  <XStack gap="$3">
                    <YStack
                      width={32}
                      height={32}
                      borderRadius={16}
                      backgroundColor="#dbeafe"
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <ShoppingCart size={16} color="#2563eb" />
                    </YStack>
                    <YStack flex={1}>
                      <Text fontSize="$3" fontWeight="600" color="#1e3a5f" marginBottom="$1">
                        {t('feed.invite.benefits.options.title')}
                      </Text>
                      <Text fontSize="$2" color="#1e40af">
                        {t('feed.invite.benefits.options.description')}
                      </Text>
                    </YStack>
                  </XStack>
                </YStack>
              </XStack>

              {/* 2x2 Grid Layout - Row 2 - responsive */}
              <XStack gap="$3" flexDirection={useColumnLayout ? 'column' : 'row'}>
                <YStack
                  flex={useColumnLayout ? undefined : 1}
                  backgroundColor="#faf5ff"
                  borderWidth={1}
                  borderColor="#e9d5ff"
                  borderRadius={borderRadius.lg}
                  padding="$4"
                >
                  <XStack gap="$3">
                    <YStack
                      width={32}
                      height={32}
                      borderRadius={16}
                      backgroundColor="#f3e8ff"
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <Gift size={16} color="#9333ea" />
                    </YStack>
                    <YStack flex={1}>
                      <Text fontSize="$3" fontWeight="600" color="#3b0764" marginBottom="$1">
                        {t('feed.invite.benefits.grow.title')}
                      </Text>
                      <Text fontSize="$2" color="#6b21a8">
                        {t('feed.invite.benefits.grow.description')}
                      </Text>
                    </YStack>
                  </XStack>
                </YStack>

                <YStack
                  flex={useColumnLayout ? undefined : 1}
                  backgroundColor={colors.amber[50]}
                  borderWidth={1}
                  borderColor={colors.amber[200]}
                  borderRadius={borderRadius.lg}
                  padding="$4"
                >
                  <XStack gap="$3">
                    <YStack
                      width={32}
                      height={32}
                      borderRadius={16}
                      backgroundColor={colors.amber[100]}
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <Leaf size={16} color={colors.amber[600]} />
                    </YStack>
                    <YStack flex={1}>
                      <Text fontSize="$3" fontWeight="600" color="#78350f" marginBottom="$1">
                        {t('feed.invite.benefits.waste.title')}
                      </Text>
                      <Text fontSize="$2" color="#92400e">
                        {t('feed.invite.benefits.waste.description')}
                      </Text>
                    </YStack>
                  </XStack>
                </YStack>
              </XStack>
            </YStack>

            {/* Family Section - gradient background */}
            <XStack
              backgroundColor="#eff6ff"
              borderWidth={1}
              borderColor="#bfdbfe"
              borderRadius={borderRadius.lg}
              padding="$4"
              gap="$3"
            >
              <YStack
                width={40}
                height={40}
                borderRadius={20}
                backgroundColor="#dbeafe"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                <Text fontSize="$5">👨‍👩‍👧‍👦</Text>
              </YStack>
              <YStack flex={1}>
                <Text fontSize="$4" fontWeight="600" color="#1e3a5f" marginBottom="$2">
                  {t('feed.invite.family.title')}
                </Text>
                <Text fontSize="$3" color="#1e40af" marginBottom="$2">
                  {t('feed.invite.family.description')}
                </Text>
                <YStack gap="$1">
                  <Text fontSize="$2" color="#1e40af">• {t('feed.invite.family.benefits.earn')}</Text>
                  <Text fontSize="$2" color="#1e40af">• {t('feed.invite.family.benefits.learn')}</Text>
                  <Text fontSize="$2" color="#1e40af">• {t('feed.invite.family.benefits.contribute')}</Text>
                  <Text fontSize="$2" color="#1e40af">• {t('feed.invite.family.benefits.skills')}</Text>
                </YStack>
              </YStack>
            </XStack>

            {/* Tips Section */}
            <YStack
              backgroundColor={colors.green[50]}
              borderWidth={1}
              borderColor={colors.green[200]}
              borderRadius={borderRadius.lg}
              padding="$4"
              gap="$2"
            >
              <Text fontSize="$3" fontWeight="600" color={colors.green[900]}>
                💡 {t('feed.invite.tips.title')}
              </Text>
              <YStack gap="$1">
                <Text fontSize="$2" color={colors.green[800]}>• {t('feed.invite.tips.tip1')}</Text>
                <Text fontSize="$2" color={colors.green[800]}>• {t('feed.invite.tips.tip2')}</Text>
                <Text fontSize="$2" color={colors.green[800]}>• {t('feed.invite.tips.tip3')}</Text>
                <Text fontSize="$2" color={colors.green[800]}>• {t('feed.invite.tips.tip4')}</Text>
              </YStack>
            </YStack>
          </YStack>
        </ScrollView>
      </YStack>
    </YStack>
  )
}
