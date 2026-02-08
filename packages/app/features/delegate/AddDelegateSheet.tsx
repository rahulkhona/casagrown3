/**
 * AddDelegateSheet — Single-screen modal for generating & sharing delegation links
 *
 * Auto-generates a delegation link on open. Shows QR code, shareable link,
 * passcode, and optional personal message — all on a single screen.
 * Modeled after InviteModal for consistency.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  YStack,
  XStack,
  Text,
  Button,
  Spinner,
  ScrollView,
  TextArea,
} from 'tamagui'
import {
  X,
  Link2,
  Copy,
  Check,
  Share2,
  Clock,
  AlertTriangle,
  UserPlus,
  Smartphone,
  RefreshCw,
} from '@tamagui/lucide-icons'
import { Platform, Share } from 'react-native'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius } from '../../design-tokens'
import { QRCodeDisplay } from '../feed/QRCodeDisplay'
import type { GeneratedLink } from './useDelegations'

const isWeb = Platform.OS === 'web'

// Base URL for delegation links
const BASE_URL = isWeb
  ? (typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com')
  : 'https://casagrown.com'

interface AddDelegateSheetProps {
  visible: boolean
  onClose: () => void
  onGenerateLink: (message?: string) => Promise<GeneratedLink | { error: string }>
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) return `${hrs}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

export default function AddDelegateSheet({
  visible,
  onClose,
  onGenerateLink,
}: AddDelegateSheetProps) {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<GeneratedLink | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasGenerated = useRef(false)

  // Auto-generate link when sheet becomes visible
  useEffect(() => {
    if (visible && !hasGenerated.current) {
      hasGenerated.current = true
      const autoGenerate = async () => {
        setGenerating(true)
        setError(null)
        try {
          const result = await onGenerateLink()
          if ('error' in result) {
            setError(result.error)
          } else {
            setGeneratedLink(result)
          }
        } catch (err: any) {
          setError(err.message || 'Failed to generate link')
        } finally {
          setGenerating(false)
        }
      }
      autoGenerate()
    }
  }, [visible, onGenerateLink])

  // Countdown timer
  useEffect(() => {
    if (generatedLink?.expiresAt) {
      const updateTimer = () => {
        const remaining = Math.max(
          0,
          Math.floor(
            (new Date(generatedLink.expiresAt).getTime() - Date.now()) / 1000,
          ),
        )
        setTimeLeft(remaining)
        if (remaining <= 0 && timerRef.current) {
          clearInterval(timerRef.current)
        }
      }
      updateTimer()
      timerRef.current = setInterval(updateTimer, 1000)
      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }
  }, [generatedLink?.expiresAt])

  // Reset state when sheet closes
  useEffect(() => {
    if (!visible) {
      setMessage('')
      setGeneratedLink(null)
      setCopied(false)
      setError(null)
      setGenerating(false)
      hasGenerated.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [visible])

  const delegationUrl = generatedLink
    ? `${BASE_URL}/delegate-invite/${generatedLink.delegationCode}`
    : ''

  const handleRetry = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const result = await onGenerateLink()
      if ('error' in result) {
        setError(result.error)
      } else {
        setGeneratedLink(result)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate link')
    } finally {
      setGenerating(false)
    }
  }, [onGenerateLink])

  const handleCopy = useCallback(async () => {
    try {
      if (isWeb && navigator.clipboard) {
        await navigator.clipboard.writeText(delegationUrl)
      } else {
        const { Clipboard } = require('react-native')
        Clipboard.setString(delegationUrl)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn('Failed to copy:', err)
    }
  }, [delegationUrl])

  const handleShare = useCallback(async () => {
    const shareMessage = message.trim()
      ? `${message.trim()}\n\n${delegationUrl}`
      : t('delegate.addDelegate.shareMessage', { url: delegationUrl })

    try {
      if (isWeb && navigator.share) {
        await navigator.share({
          title: t('delegate.addDelegate.shareTitle'),
          text: shareMessage,
          url: delegationUrl,
        })
      } else {
        await Share.share({
          message: shareMessage,
          url: delegationUrl,
        })
      }
    } catch (err) {
      // User cancelled share
    }
  }, [delegationUrl, message, t])

  if (!visible) return null

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="rgba(0,0,0,0.5)"
      justifyContent="center"
      alignItems="center"
      zIndex={100}
      padding="$4"
    >
      <YStack
        backgroundColor="white"
        borderRadius={borderRadius['2xl']}
        maxWidth={560}
        width="100%"
        height="90%"
        flex={1}
      >
        {/* Green Header — matches InviteModal */}
        <YStack
          backgroundColor={colors.green[600]}
          padding="$5"
          borderTopLeftRadius={borderRadius['2xl']}
          borderTopRightRadius={borderRadius['2xl']}
          flexShrink={0}
        >
          <XStack justifyContent="space-between" alignItems="center">
            <XStack gap="$3" alignItems="center" flex={1}>
              <YStack
                width={44}
                height={44}
                borderRadius={22}
                backgroundColor="rgba(255,255,255,0.2)"
                alignItems="center"
                justifyContent="center"
              >
                <UserPlus size={22} color="white" />
              </YStack>
              <YStack flex={1}>
                <Text fontSize={18} fontWeight="700" color="white">
                  {t('delegate.addDelegate.title')}
                </Text>
                <Text fontSize={12} color={colors.green[100]}>
                  {t('delegate.addDelegate.headerSubtitle')}
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

        <ScrollView flex={1} showsVerticalScrollIndicator={false}>
          <YStack padding="$5" gap="$4">

            {/* Loading state */}
            {generating && (
              <YStack
                padding="$8"
                alignItems="center"
                gap="$3"
              >
                <Spinner size="large" color={colors.green[600]} />
                <Text color={colors.gray[600]} fontSize={14}>
                  {t('delegate.addDelegate.generatingLink')}
                </Text>
              </YStack>
            )}

            {/* Error state */}
            {error && !generating && (
              <YStack alignItems="center" gap="$4" padding="$6">
                <AlertTriangle size={40} color={colors.red[500]} />
                <Text fontSize={14} color={colors.red[600]} textAlign="center">
                  {error}
                </Text>
                <Button
                  backgroundColor={colors.green[600]}
                  borderRadius={borderRadius.lg}
                  paddingVertical="$3"
                  paddingHorizontal="$6"
                  gap="$2"
                  hoverStyle={{ backgroundColor: colors.green[700] }}
                  onPress={handleRetry}
                >
                  <RefreshCw size={16} color="white" />
                  <Text fontWeight="600" color="white">
                    {t('delegate.addDelegate.retry')}
                  </Text>
                </Button>
              </YStack>
            )}

            {/* Generated content — all visible once link is ready */}
            {generatedLink && !generating && (
              <>
                {/* Share-once warning */}
                <XStack
                  backgroundColor="#fffbeb"
                  borderWidth={1}
                  borderColor={colors.amber[300]}
                  borderRadius={borderRadius.lg}
                  padding="$3"
                  gap="$2"
                  alignItems="center"
                >
                  <AlertTriangle size={16} color={colors.amber[700]} />
                  <Text flex={1} fontSize={12} color={colors.amber[700]}>
                    {t('delegate.addDelegate.shareOnceWarning')}
                  </Text>
                </XStack>

                {/* Shareable link with copy */}
                <YStack gap="$2">
                  <Text fontWeight="600" color={colors.gray[700]} fontSize={13}>
                    {t('delegate.addDelegate.linkLabel')}
                  </Text>
                  <XStack
                    backgroundColor={colors.gray[50]}
                    borderWidth={1}
                    borderColor={colors.gray[300]}
                    borderRadius={borderRadius.lg}
                    padding="$3"
                    gap="$2"
                    alignItems="center"
                  >
                    <Link2 size={16} color={colors.gray[500]} />
                    <Text
                      flex={1}
                      fontSize={13}
                      color={colors.gray[700]}
                      numberOfLines={1}
                    >
                      {delegationUrl}
                    </Text>
                    <Button
                      unstyled
                      onPress={handleCopy}
                      padding="$2"
                      backgroundColor={copied ? colors.green[100] : colors.gray[100]}
                      borderRadius={borderRadius.default}
                    >
                      {copied ? (
                        <Check size={16} color={colors.green[600]} />
                      ) : (
                        <Copy size={16} color={colors.gray[600]} />
                      )}
                    </Button>
                  </XStack>
                </YStack>

                {/* QR Code */}
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
                    <Smartphone size={16} color={colors.gray[600]} />
                    <Text fontWeight="600" color={colors.gray[700]} fontSize={13}>
                      {t('delegate.addDelegate.qrTitle')}
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
                      value={delegationUrl}
                      size={150}
                    />
                  </YStack>
                  <Text fontSize={11} color={colors.gray[500]} textAlign="center">
                    {t('delegate.addDelegate.qrHint')}
                  </Text>
                </YStack>

                {/* 6-digit passcode */}
                <YStack gap="$2">
                  <Text fontWeight="600" color={colors.gray[700]} fontSize={13}>
                    {t('delegate.addDelegate.passcodeLabel')}
                  </Text>
                  <XStack gap="$2" justifyContent="center">
                    {generatedLink.pairingCode.split('').map((digit, i) => (
                      <YStack
                        key={i}
                        width={44}
                        height={54}
                        borderRadius={borderRadius.lg}
                        backgroundColor={colors.green[50]}
                        borderWidth={2}
                        borderColor={colors.green[200]}
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text fontSize={24} fontWeight="700" color={colors.green[700]}>
                          {digit}
                        </Text>
                      </YStack>
                    ))}
                  </XStack>
                  <Text fontSize={11} color={colors.gray[500]} textAlign="center">
                    {t('delegate.addDelegate.passcodeHint')}
                  </Text>
                </YStack>

                {/* Expiry countdown */}
                <XStack
                  backgroundColor={timeLeft < 3600 ? '#fef2f2' : '#eff6ff'}
                  borderRadius={borderRadius.lg}
                  padding="$3"
                  gap="$2"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Clock
                    size={16}
                    color={timeLeft < 3600 ? colors.red[600] : '#2563eb'}
                  />
                  <Text
                    fontSize={13}
                    fontWeight="500"
                    color={timeLeft < 3600 ? colors.red[600] : '#1e40af'}
                  >
                    {timeLeft > 0
                      ? t('delegate.addDelegate.expiresIn', {
                          time: formatTime(timeLeft),
                        })
                      : t('delegate.addDelegate.expired')}
                  </Text>
                </XStack>

                {/* Optional personal message */}
                <YStack gap="$2">
                  <Text fontWeight="600" color={colors.gray[700]} fontSize={13}>
                    {t('delegate.addDelegate.messageLabel')}
                  </Text>
                  <TextArea
                    placeholder={t('delegate.addDelegate.messagePlaceholder')}
                    placeholderTextColor={colors.gray[400]}
                    value={message}
                    onChangeText={setMessage}
                    backgroundColor={colors.gray[50]}
                    borderWidth={1}
                    borderColor={colors.gray[300]}
                    borderRadius={borderRadius.lg}
                    padding="$3"
                    fontSize={14}
                    numberOfLines={2}
                    maxLength={200}
                    color={colors.gray[900]}
                  />
                  <Text fontSize={11} color={colors.gray[400]} textAlign="right">
                    {message.length}/200
                  </Text>
                </YStack>

                {/* Share button */}
                <Button
                  backgroundColor={colors.green[600]}
                  borderRadius={borderRadius.lg}
                  paddingVertical="$3"
                  gap="$2"
                  hoverStyle={{ backgroundColor: colors.green[700] }}
                  onPress={handleShare}
                >
                  <Share2 size={18} color="white" />
                  <Text fontWeight="600" color="white" fontSize={15}>
                    {t('delegate.addDelegate.shareLink')}
                  </Text>
                </Button>

                {/* Done */}
                <Button
                  borderWidth={2}
                  borderColor={colors.gray[300]}
                  backgroundColor="white"
                  borderRadius={borderRadius.lg}
                  paddingVertical="$3"
                  onPress={onClose}
                >
                  <Text fontWeight="500" color={colors.gray[700]}>
                    {t('common.done')}
                  </Text>
                </Button>
              </>
            )}
          </YStack>
        </ScrollView>
      </YStack>
    </YStack>
  )
}
