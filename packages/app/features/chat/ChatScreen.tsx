/**
 * ChatScreen - Full chat interface with post card header
 *
 * Shows a read-only post card at the top, followed by a message list with
 * bubbles, typing indicator, online presence, and a message input bar with
 * media attachment support.
 *
 * Integrates with Supabase Realtime for live messaging and presence.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { YStack, XStack, Text, Button, Spinner, ScrollView } from 'tamagui'
import { Platform, TextInput, FlatList, KeyboardAvoidingView, TouchableOpacity, Image, Alert, Linking } from 'react-native'
import { ArrowLeft, Send, Paperclip, MapPin, Camera, Video, X, Loader, Image as LucideImage, Check, CheckCheck } from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'
import { useTranslation } from 'react-i18next'
import { ChatPostCard } from './ChatPostCard'
import { FeedVideoPlayer } from '../feed/FeedVideoPlayer'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'

const WebCameraModal = Platform.OS === 'web'
  ? require('../create-post/WebCameraModal').WebCameraModal
  : null
import {
  getOrCreateConversation,
  getConversationWithDetails,
  getConversationMessages,
  sendMessage,
  subscribeToMessages,
  createPresenceChannel,
  markMessagesAsRead,
  subscribeToMessageUpdates,
} from './chat-service'
import { uploadChatMedia } from './chat-media-upload'
import type {
  ChatMessage,
  ConversationWithDetails,
  PresenceState,
} from './chat-service'

// =============================================================================
// Props
// =============================================================================

interface ChatScreenProps {
  /** Post ID to chat about */
  postId: string
  /** The other user's ID (post author or viewer) */
  otherUserId: string
  /** Current authenticated user's ID */
  currentUserId: string
  /** Current user's display name */
  currentUserName?: string
  /** Go back handler */
  onClose: () => void
}

// =============================================================================
// Helpers
// =============================================================================

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Group messages by date for section headers */
function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

// =============================================================================
// Typing Dots Animation
// =============================================================================

function TypingIndicator() {
  const [dots, setDots] = useState('.')

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '.' : prev + '.')
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <XStack
      paddingHorizontal="$4"
      paddingVertical="$1"
      alignItems="center"
      gap="$2"
    >
      <YStack
        backgroundColor={colors.gray[100]}
        borderRadius={16}
        paddingHorizontal="$3"
        paddingVertical="$2"
        maxWidth={80}
      >
        <Text fontSize={16} color={colors.gray[500]}>
          {dots}
        </Text>
      </YStack>
    </XStack>
  )
}

// =============================================================================
// Message Bubble
// =============================================================================

function MessageBubble({
  message,
  isOwn,
  showAvatar,
}: {
  message: ChatMessage
  isOwn: boolean
  showAvatar: boolean
}) {
  const avatarUrl = normalizeStorageUrl(message.sender_avatar_url)
  const senderInitial = (message.sender_name || '?').charAt(0).toUpperCase()

  return (
    <XStack
      paddingHorizontal="$4"
      paddingVertical="$1"
      justifyContent={isOwn ? 'flex-end' : 'flex-start'}
      alignItems="flex-end"
      gap="$2"
    >
      {/* Avatar (left side for others) */}
      {!isOwn && (
        <YStack width={28} height={28}>
          {showAvatar ? (
            avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: 28, height: 28, borderRadius: 14 }}
              />
            ) : (
              <YStack
                width={28}
                height={28}
                borderRadius={14}
                backgroundColor={colors.green[600]}
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize={12} color="white" fontWeight="600">
                  {senderInitial}
                </Text>
              </YStack>
            )
          ) : null}
        </YStack>
      )}

      {/* Bubble */}
      <YStack
        maxWidth="75%"
        backgroundColor={isOwn ? colors.green[600] : colors.gray[100]}
        borderRadius={16}
        borderBottomRightRadius={isOwn ? 4 : 16}
        borderBottomLeftRadius={isOwn ? 16 : 4}
        paddingHorizontal="$3"
        paddingVertical="$2"
      >
        {/* Media content */}
        {message.media_url && (() => {
          const mediaUrl = normalizeStorageUrl(message.media_url) || message.media_url
          const isVideo = message.media_type === 'video' ||
            /\.(webm|mp4|mov|avi|mkv)(\?|#|$)/i.test(message.media_url)
          return (
            <YStack
              borderRadius={12}
              overflow="hidden"
              marginBottom={message.content ? '$2' : undefined}
              width={240}
            >
              {isVideo ? (
                <YStack width={240} aspectRatio={16/9} borderRadius={12} overflow="hidden">
                  <FeedVideoPlayer uri={mediaUrl} />
                </YStack>
              ) : (
                <Image
                  source={{ uri: mediaUrl }}
                  style={{ width: 240, height: 180, borderRadius: 12 }}
                  resizeMode="cover"
                />
              )}
            </YStack>
          )
        })()}

        {/* Location message */}
        {message.metadata?.location && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              const { latitude, longitude } = message.metadata.location
              const url = Platform.select({
                ios: `maps:0,0?q=${latitude},${longitude}`,
                android: `geo:${latitude},${longitude}?q=${latitude},${longitude}`,
                default: `https://www.google.com/maps?q=${latitude},${longitude}`,
              })
              Linking.openURL(url!)
            }}
          >
            <XStack alignItems="center" gap="$1.5" paddingVertical="$1">
              <MapPin size={16} color={isOwn ? 'white' : colors.green[600]} />
              <YStack>
                <Text
                  fontSize={13}
                  color={isOwn ? 'rgba(255,255,255,0.95)' : colors.green[600]}
                  fontWeight="600"
                >
                  📍 Location
                </Text>
                <Text
                  fontSize={11}
                  color={isOwn ? 'rgba(255,255,255,0.7)' : colors.gray[500]}
                >
                  {message.metadata.location.latitude.toFixed(5)}, {message.metadata.location.longitude.toFixed(5)}
                </Text>
                <Text
                  fontSize={11}
                  color={isOwn ? 'rgba(255,255,255,0.6)' : colors.green[500]}
                  textDecorationLine="underline"
                >
                  Open in Maps
                </Text>
              </YStack>
            </XStack>
          </TouchableOpacity>
        )}

        {/* Text content (skip if location message — content is redundant) */}
        {message.content && !message.metadata?.location && (
          <Text
            fontSize={15}
            color={isOwn ? 'white' : colors.gray[800]}
            lineHeight={20}
          >
            {message.content}
          </Text>
        )}

        {/* Timestamp + delivery status */}
        <XStack
          alignItems="center"
          justifyContent={isOwn ? 'flex-end' : 'flex-start'}
          gap={Platform.OS === 'web' ? '$1.5' : '$2'}
          marginTop="$1"
          {...(isOwn ? {
            backgroundColor: Platform.OS === 'web' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.35)',
            borderRadius: 8,
            paddingHorizontal: '$2',
            paddingVertical: Platform.OS === 'web' ? '$0.5' : '$1',
            alignSelf: 'flex-end',
          } : {})}
        >
          <Text
            fontSize={Platform.OS === 'web' ? 11 : 12}
            color={isOwn ? 'white' : colors.gray[400]}
            textAlign={isOwn ? 'right' : 'left'}
            fontWeight={isOwn ? '500' : undefined}
          >
            {formatTimestamp(message.created_at)}
          </Text>
          {isOwn && (
            message.read_at ? (
              <CheckCheck size={Platform.OS === 'web' ? 18 : 22} color="#7dd3fc" strokeWidth={Platform.OS === 'web' ? 3 : 3.5} />
            ) : message.delivered_at ? (
              <CheckCheck size={Platform.OS === 'web' ? 18 : 22} color="white" strokeWidth={Platform.OS === 'web' ? 3 : 3.5} />
            ) : (
              <Check size={Platform.OS === 'web' ? 18 : 22} color="white" strokeWidth={Platform.OS === 'web' ? 3 : 3.5} />
            )
          )}
        </XStack>
      </YStack>
    </XStack>
  )
}

// =============================================================================
// System Message
// =============================================================================

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <XStack justifyContent="center" paddingHorizontal="$6" paddingVertical="$2">
      <YStack
        backgroundColor={colors.gray[100]}
        paddingHorizontal="$3"
        paddingVertical="$1.5"
        borderRadius={12}
      >
        <Text fontSize={12} color={colors.gray[500]} textAlign="center">
          {message.content}
        </Text>
      </YStack>
    </XStack>
  )
}

// =============================================================================
// Date Separator
// =============================================================================

function DateSeparator({ label }: { label: string }) {
  return (
    <XStack
      alignItems="center"
      paddingHorizontal="$6"
      paddingVertical="$3"
      gap="$3"
    >
      <YStack flex={1} height={1} backgroundColor={colors.gray[200]} />
      <Text fontSize={11} fontWeight="500" color={colors.gray[400]}>
        {label}
      </Text>
      <YStack flex={1} height={1} backgroundColor={colors.gray[200]} />
    </XStack>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function ChatScreen({
  postId,
  otherUserId,
  currentUserId,
  currentUserName,
  onClose,
}: ChatScreenProps) {
  const { t } = useTranslation()

  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<ConversationWithDetails | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [otherPresence, setOtherPresence] = useState<PresenceState>({ online: false, typing: false })
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [cameraMode, setCameraMode] = useState<'photo' | 'video' | null>(null)

  const flatListRef = useRef<FlatList>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const presenceRef = useRef<ReturnType<typeof createPresenceChannel> | null>(null)
  const msgChannelRef = useRef<{ unsubscribe: () => void } | null>(null)
  const statusChannelRef = useRef<{ unsubscribe: () => void } | null>(null)
  const inputRef = useRef<TextInput>(null)
  const isAtBottomRef = useRef(true)

  // Determine who is who
  const otherUser = useMemo(() => {
    if (!conversation) return null
    if (conversation.buyer_id === currentUserId) {
      return conversation.seller
    }
    return conversation.buyer
  }, [conversation, currentUserId])

  const otherUserName = otherUser?.full_name || t('chat.unknownUser')
  const otherUserAvatar = normalizeStorageUrl(otherUser?.avatar_url)

  // ── Initialize conversation and load messages ──
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        setLoading(true)
        setError(null)

        // Determine buyer/seller — the post author is the "seller",
        // the current user initiating chat is the "buyer"
        const sellerId = otherUserId
        const buyerId = currentUserId

        // Get or create conversation
        const conversationId = await getOrCreateConversation(postId, buyerId, sellerId)

        if (cancelled) return

        // Fetch full details
        const details = await getConversationWithDetails(conversationId)
        if (cancelled) return
        setConversation(details)

        // Fetch messages
        const msgs = await getConversationMessages(conversationId)
        if (cancelled) return
        setMessages(msgs)

        // Subscribe to new messages
        const msgChannel = subscribeToMessages(conversationId, (newMsg) => {
          // Avoid duplicating own messages (already added optimistically)
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          // Mark incoming messages as read immediately (chat is open)
          if (newMsg.sender_id !== currentUserId) {
            markMessagesAsRead(conversationId, currentUserId)
          }
        })
        msgChannelRef.current = msgChannel

        // Subscribe to delivery/read status updates (for checkmarks)
        const statusChannel = subscribeToMessageUpdates(conversationId, (msgId, deliveredAt, readAt) => {
          setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m, delivered_at: deliveredAt, read_at: readAt } : m
          ))
        })
        statusChannelRef.current = statusChannel

        // Mark existing messages as read
        markMessagesAsRead(conversationId, currentUserId)

        // Subscribe to presence (typing indicator only)
        const presence = createPresenceChannel(conversationId, currentUserId, (state) => {
          setOtherPresence(state)
        })
        presenceRef.current = presence

        setLoading(false)
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load chat')
          setLoading(false)
        }
      }
    }

    init()
    return () => {
      cancelled = true
      // Clean up all realtime subscriptions
      msgChannelRef.current?.unsubscribe()
      statusChannelRef.current?.unsubscribe()
      presenceRef.current?.destroy()
    }
  }, [postId, otherUserId, currentUserId])

  // ── Scroll to bottom when typing indicator appears (only if already at bottom) ──
  useEffect(() => {
    if (otherPresence.typing && isAtBottomRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [otherPresence.typing])

  // ── Poll for new messages on web (no push notifications available) ──
  useEffect(() => {
    if (Platform.OS !== 'web' || !conversation) return

    const pollInterval = setInterval(async () => {
      try {
        const freshMessages = await getConversationMessages(conversation.id)
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const newMsgs = freshMessages.filter(m => !existingIds.has(m.id))
          if (newMsgs.length === 0) {
            // Still update delivered_at/read_at on existing messages
            return prev.map(existing => {
              const fresh = freshMessages.find(f => f.id === existing.id)
              return fresh ? { ...existing, delivered_at: fresh.delivered_at, read_at: fresh.read_at } : existing
            })
          }
          // Merge new messages and update statuses
          const updated = prev.map(existing => {
            const fresh = freshMessages.find(f => f.id === existing.id)
            return fresh ? { ...existing, delivered_at: fresh.delivered_at, read_at: fresh.read_at } : existing
          })
          return [...updated, ...newMsgs]
        })
        // Mark incoming messages as read
        markMessagesAsRead(conversation.id, currentUserId)
      } catch (err) {
        console.warn('Poll for messages failed:', err)
      }
    }, 10_000)

    return () => clearInterval(pollInterval)
  }, [conversation, currentUserId])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [messages.length])

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || sending || !conversation) return

    setSending(true)
    setInputText('')

    // Optimistic add
    const optimisticMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversation.id,
      sender_id: currentUserId,
      sender_name: currentUserName || null,
      sender_avatar_url: null,
      content: text,
      media_url: null,
      media_type: null,
      type: 'text',
      metadata: {},
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
    }
    setMessages(prev => [...prev, optimisticMsg])

    try {
      const sent = await sendMessage(conversation.id, currentUserId, text)
      // Replace optimistic message with real one
      setMessages(prev =>
        prev.map(m => m.id === optimisticMsg.id ? { ...sent, sender_name: currentUserName || null } : m)
      )
    } catch {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
    } finally {
      setSending(false)
    }

    // Clear typing indicator
    presenceRef.current?.setTyping(false)
  }, [inputText, sending, conversation, currentUserId, currentUserName])

  // ── Send media attachment ──
  const handleSendMedia = useCallback(async (
    uri: string,
    fileName: string,
    mimeType: string,
    mediaType: 'image' | 'video',
  ) => {
    if (!conversation || uploading) return
    setUploading(true)

    try {
      const { mediaId, publicUrl } = await uploadChatMedia(
        currentUserId, uri, fileName, mimeType, mediaType,
      )
      const sent = await sendMessage(
        conversation.id, currentUserId, null, 'media', mediaId,
      )
      // Add to local messages immediately
      setMessages(prev => {
        if (prev.some(m => m.id === sent.id)) return prev
        return [...prev, {
          ...sent,
          sender_name: currentUserName || null,
          media_url: publicUrl,
          media_type: mediaType,
        }]
      })
    } catch (err) {
      console.error('Error sending media:', err)
    } finally {
      setUploading(false)
    }
  }, [conversation, uploading, currentUserId, currentUserName])

  // ── Take photo with camera ──
  const handleTakePhoto = useCallback(async () => {
    setAttachMenuOpen(false)
    if (!conversation) return

    try {
      // On web, use WebCameraModal for real webcam access
      if (Platform.OS === 'web') {
        setCameraMode('photo')
        return
      }

      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Camera Permission', 'Please enable camera access in your device settings.')
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        exif: false,
      })

      if (result.canceled || result.assets.length === 0) return

      const asset = result.assets[0]!
      const fileName = asset.fileName || `photo_${Date.now()}.jpg`
      const mimeType = asset.mimeType || 'image/jpeg'
      handleSendMedia(asset.uri, fileName, mimeType, 'image')
    } catch (err) {
      console.error('Error taking photo:', err)
      if (Platform.OS !== 'web') {
        Alert.alert('Camera Error', 'Could not open camera. Please try the Gallery option instead.')
      }
    }
  }, [conversation, handleSendMedia])

  // ── Pick photo from gallery ──
  const handlePickPhoto = useCallback(async () => {
    setAttachMenuOpen(false)
    if (!conversation) return

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        exif: false,
      })

      if (result.canceled || result.assets.length === 0) return

      const asset = result.assets[0]!
      const fileName = asset.fileName || `photo_${Date.now()}.jpg`
      const mimeType = asset.mimeType || 'image/jpeg'
      handleSendMedia(asset.uri, fileName, mimeType, 'image')
    } catch (err) {
      console.error('Error picking photo:', err)
      if (Platform.OS !== 'web') {
        Alert.alert('Gallery Error', 'Could not open photo library. Please try again.')
      }
    }
  }, [conversation, handleSendMedia])

  // ── Record video with camera ──
  const handleRecordVideo = useCallback(async () => {
    setAttachMenuOpen(false)
    if (!conversation) return

    try {
      // On web, use WebCameraModal for real webcam access
      if (Platform.OS === 'web') {
        setCameraMode('video')
        return
      }

      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Camera Permission', 'Please enable camera access in your device settings.')
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        quality: 0.8,
        exif: false,
        videoMaxDuration: 60,
        videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
      })

      if (result.canceled || result.assets.length === 0) return

      const asset = result.assets[0]!
      const fileName = asset.fileName || `video_${Date.now()}.mp4`
      const mimeType = asset.mimeType || 'video/mp4'
      handleSendMedia(asset.uri, fileName, mimeType, 'video')
    } catch (err) {
      console.error('Error recording video:', err)
      if (Platform.OS !== 'web') {
        Alert.alert('Camera Error', 'Could not open camera for video. Please try again.')
      }
    }
  }, [conversation, handleSendMedia])

  // ── Location sharing ──
  const handleShareLocation = useCallback(async () => {
    setAttachMenuOpen(false)
    if (!conversation || sending) return

    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        if (Platform.OS !== 'web') {
          Alert.alert(
            t('chat.locationDeniedTitle'),
            t('chat.locationDeniedMessage'),
          )
        }
        return
      }

      setSending(true)
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })

      const { latitude, longitude } = location.coords
      const content = `📍 Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
      const metadata = { location: { latitude, longitude } }

      const sent = await sendMessage(
        conversation.id, currentUserId, content, 'text', undefined, metadata,
      )
      setMessages(prev => {
        if (prev.some(m => m.id === sent.id)) return prev
        return [...prev, { ...sent, sender_name: currentUserName || null }]
      })
    } catch (err) {
      console.error('Error sharing location:', err)
    } finally {
      setSending(false)
    }
  }, [conversation, sending, currentUserId, currentUserName, t])

  // ── Handle text change with typing indicator ──
  const handleTextChange = useCallback((text: string) => {
    setInputText(text)

    // Broadcast typing
    if (text.length > 0) {
      presenceRef.current?.setTyping(true)
    }

    // Clear typing after 2s of inactivity
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    typingTimeoutRef.current = setTimeout(() => {
      presenceRef.current?.setTyping(false)
    }, 2000)
  }, [])

  // ── Build flat list data with date separators ──
  const listData = useMemo(() => {
    const items: Array<{ type: 'date'; label: string } | { type: 'message'; message: ChatMessage; showAvatar: boolean }> = []
    let lastDate = ''

    messages.forEach((msg, i) => {
      const dateLabel = getDateLabel(msg.created_at)
      if (dateLabel !== lastDate) {
        items.push({ type: 'date', label: dateLabel })
        lastDate = dateLabel
      }

      // Show avatar only for the last consecutive message from the same sender
      const nextMsg = messages[i + 1]
      const showAvatar = !nextMsg || nextMsg.sender_id !== msg.sender_id

      items.push({ type: 'message', message: msg, showAvatar })
    })

    return items
  }, [messages])

  // ── Render ──

  if (loading) {
    return (
      <YStack flex={1} backgroundColor={colors.gray[50]} alignItems="center" justifyContent="center">
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$3" color={colors.gray[500]}>{t('chat.loading')}</Text>
      </YStack>
    )
  }

  if (error) {
    return (
      <YStack flex={1} backgroundColor={colors.gray[50]} alignItems="center" justifyContent="center" padding="$6">
        <Text fontSize={16} color={colors.gray[600]} textAlign="center">{error}</Text>
        <Button
          marginTop="$4"
          backgroundColor={colors.green[600]}
          borderRadius="$3"
          paddingHorizontal="$5"
          paddingVertical="$2"
          pressStyle={{ backgroundColor: colors.green[700] }}
          onPress={onClose}
        >
          <Text color="white" fontWeight="500">{t('chat.goBack')}</Text>
        </Button>
      </YStack>
    )
  }

  const isWeb = Platform.OS === 'web'

  return (
    <YStack flex={1} backgroundColor={colors.gray[100]} alignItems="center">
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.gray[50], width: '100%', maxWidth: isWeb ? 700 : undefined, alignSelf: 'center' } as any}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* ============ HEADER ============ */}
      <YStack
        backgroundColor="white"
        borderBottomWidth={1}
        borderBottomColor={colors.gray[200]}
        paddingTop={Platform.OS === 'web' ? 0 : undefined}
        zIndex={10}
      >
        <XStack
          paddingHorizontal="$4"
          height={56}
          alignItems="center"
          gap="$3"
        >
          {/* Back button */}
          <TouchableOpacity
            onPress={onClose}
            style={{
              padding: 8,
              borderRadius: 20,
              minWidth: 40,
              minHeight: 40,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            activeOpacity={0.6}
          >
            <ArrowLeft size={22} color={colors.gray[700]} />
          </TouchableOpacity>

          {/* Other user avatar + name + presence + typing */}
          <XStack flex={1} alignItems="center" gap="$2.5">
            {/* Avatar with presence dot overlay */}
            <YStack position="relative" width={36} height={36}>
              {otherUserAvatar ? (
                <Image
                  source={{ uri: otherUserAvatar }}
                  style={{ width: 36, height: 36, borderRadius: 18 }}
                />
              ) : (
                <YStack
                  width={36}
                  height={36}
                  borderRadius={18}
                  backgroundColor={colors.green[600]}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize={14} color="white" fontWeight="600">
                    {otherUserName.charAt(0).toUpperCase()}
                  </Text>
                </YStack>
              )}
              {/* Presence dot */}
              <YStack
                position="absolute"
                bottom={0}
                right={0}
                width={12}
                height={12}
                borderRadius={6}
                backgroundColor={otherPresence.online ? '#22c55e' : colors.gray[400]}
                borderWidth={2}
                borderColor="white"
              />
            </YStack>

            <YStack>
              <Text fontSize={15} fontWeight="600" color={colors.gray[900]}>
                {otherUserName}
              </Text>
              {otherPresence.typing ? (
                <Text fontSize={11} color={colors.green[600]}>
                  {t('chat.typing')}
                </Text>
              ) : (
                <Text fontSize={11} color={otherPresence.online ? colors.green[600] : colors.gray[400]}>
                  {otherPresence.online ? t('chat.online', 'Online') : t('chat.offline', 'Offline')}
                </Text>
              )}
            </YStack>
          </XStack>
        </XStack>
      </YStack>

      {/* ============ POST CARD ============ */}
      {conversation && (
        <YStack paddingHorizontal="$3" paddingTop="$2" paddingBottom="$1">
          <ChatPostCard post={conversation.post} t={t} />
        </YStack>
      )}

      {/* ============ MESSAGES ============ */}
      <FlatList
        ref={flatListRef}
        data={listData}
        keyExtractor={(item, index) =>
          item.type === 'date' ? `date-${index}` : `msg-${(item as any).message.id}`
        }
        renderItem={({ item }) => {
          if (item.type === 'date') {
            return <DateSeparator label={item.label} />
          }
          const msgItem = item as { type: 'message'; message: ChatMessage; showAvatar: boolean }
          if (msgItem.message.type === 'system') {
            return <SystemMessage message={msgItem.message} />
          }
          return (
            <MessageBubble
              message={msgItem.message}
              isOwn={msgItem.message.sender_id === currentUserId}
              showAvatar={msgItem.showAvatar}
            />
          )
        }}
        contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
        style={{ flex: 1 }}
        onContentSizeChange={() => {
          if (isAtBottomRef.current) {
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
          const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height
          isAtBottomRef.current = distanceFromBottom < 100
        }}
        scrollEventThrottle={100}
        ListEmptyComponent={
          <YStack flex={1} alignItems="center" justifyContent="center" padding="$8">
            <Text fontSize={15} color={colors.gray[400]} textAlign="center">
              {t('chat.emptyMessages')}
            </Text>
          </YStack>
        }
        ListFooterComponent={otherPresence.typing ? <TypingIndicator /> : null}
      />

      {/* ============ ATTACHMENT MENU ============ */}
      {attachMenuOpen && (
        <XStack
          backgroundColor="white"
          borderTopWidth={1}
          borderTopColor={colors.gray[200]}
          paddingHorizontal="$4"
          paddingVertical="$2"
          gap="$4"
        >
          {/* Camera - take photo */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 }}
            activeOpacity={0.6}
            onPress={handleTakePhoto}
          >
            <YStack width={44} height={44} borderRadius={22} backgroundColor={colors.green[100]} alignItems="center" justifyContent="center">
              <Camera size={22} color={colors.green[700]} />
            </YStack>
            <Text fontSize={11} color={colors.gray[600]}>{t('chat.camera')}</Text>
          </TouchableOpacity>

          {/* Gallery - pick photo from library */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 }}
            activeOpacity={0.6}
            onPress={handlePickPhoto}
          >
            <YStack width={44} height={44} borderRadius={22} backgroundColor="#ede9fe" alignItems="center" justifyContent="center">
              <LucideImage size={22} color="#7c3aed" />
            </YStack>
            <Text fontSize={11} color={colors.gray[600]}>{t('chat.gallery')}</Text>
          </TouchableOpacity>

          {/* Record - video with camera */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 }}
            activeOpacity={0.6}
            onPress={handleRecordVideo}
          >
            <YStack width={44} height={44} borderRadius={22} backgroundColor="#dbeafe" alignItems="center" justifyContent="center">
              <Video size={22} color="#1d4ed8" />
            </YStack>
            <Text fontSize={11} color={colors.gray[600]}>{t('chat.record')}</Text>
          </TouchableOpacity>

          {/* Location */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 }}
            activeOpacity={0.6}
            onPress={handleShareLocation}
          >
            <YStack width={44} height={44} borderRadius={22} backgroundColor="#ffedd5" alignItems="center" justifyContent="center">
              <MapPin size={22} color="#c2410c" />
            </YStack>
            <Text fontSize={11} color={colors.gray[600]}>{t('chat.location')}</Text>
          </TouchableOpacity>

          {/* Close */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 'auto' }}
            activeOpacity={0.6}
            onPress={() => setAttachMenuOpen(false)}
          >
            <YStack width={44} height={44} borderRadius={22} backgroundColor={colors.gray[100]} alignItems="center" justifyContent="center">
              <X size={22} color={colors.gray[600]} />
            </YStack>
            <Text fontSize={11} color={colors.gray[600]}>{t('chat.close')}</Text>
          </TouchableOpacity>
        </XStack>
      )}

      {/* ============ WEB CAMERA MODAL ============ */}
      {Platform.OS === 'web' && cameraMode && WebCameraModal && (
        <WebCameraModal
          mode={cameraMode}
          onCapture={(asset: { uri: string; type: 'image' | 'video'; fileName: string }) => {
            setCameraMode(null)
            if (conversation) {
              const mimeType = asset.type === 'video' ? 'video/mp4' : 'image/jpeg'
              handleSendMedia(asset.uri, asset.fileName, mimeType, asset.type)
            }
          }}
          onClose={() => setCameraMode(null)}
        />
      )}

      {/* ============ INPUT BAR ============ */}
      <XStack
        backgroundColor="white"
        borderTopWidth={1}
        borderTopColor={colors.gray[200]}
        paddingHorizontal="$3"
        paddingVertical="$2"
        alignItems="flex-end"
        gap="$2"
      >
        {/* Attachment button */}
        <TouchableOpacity
          onPress={() => setAttachMenuOpen(!attachMenuOpen)}
          style={{
            padding: 8,
            borderRadius: 20,
            minWidth: 40,
            minHeight: 40,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          activeOpacity={0.6}
        >
          <Paperclip size={20} color={attachMenuOpen ? colors.green[600] : colors.gray[500]} />
        </TouchableOpacity>

        {/* Text input */}
        <YStack
          flex={1}
          backgroundColor={colors.gray[100]}
          borderRadius={20}
          paddingHorizontal="$3"
          paddingVertical={Platform.OS === 'ios' ? '$2' : '$1'}
          minHeight={40}
          justifyContent="center"
        >
          <TextInput
            ref={inputRef}
            style={{
              fontSize: 15,
              color: colors.gray[800],
              maxHeight: 100,
              paddingVertical: Platform.OS === 'ios' ? 0 : 4,
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
            }}
            placeholder={t('chat.inputPlaceholder')}
            placeholderTextColor={colors.gray[400]}
            value={inputText}
            onChangeText={handleTextChange}
            multiline
            returnKeyType="default"
            blurOnSubmit={false}
          />
        </YStack>

        {/* Send button */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: inputText.trim() ? colors.green[600] : colors.gray[200],
            alignItems: 'center',
            justifyContent: 'center',
          }}
          activeOpacity={0.7}
        >
          <Send size={18} color={inputText.trim() ? 'white' : colors.gray[400]} />
        </TouchableOpacity>
      </XStack>
    </KeyboardAvoidingView>
    </YStack>
  )
}
