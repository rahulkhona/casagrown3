/**
 * ChatInboxScreen - List of all conversations for the current user
 *
 * Shows conversation cards with participant info, post context, and last message.
 * Tapping a card navigates to the individual ChatScreen.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { FlatList, RefreshControl, Platform, Image } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { ArrowLeft, MessageCircle, Wrench, HelpCircle } from '@tamagui/lucide-icons'
import { useTranslation } from 'react-i18next'
import { getUserConversations, type ConversationSummary } from './chat-service'
import { supabase } from '../../utils/supabase'
import { colors } from '../../design-tokens'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'

// =============================================================================
// Props
// =============================================================================

export interface ChatInboxScreenProps {
    currentUserId: string
    onOpenChat: (postId: string, otherUserId: string) => void
    onClose: () => void
}

// =============================================================================
// Helpers
// =============================================================================

function getPostTypeBadge(type: string): { label: string; color: string; bg: string } {
    switch (type) {
        case 'offering_service':
            return { label: 'Service', color: '#c2410c', bg: '#fff7ed' }
        case 'need_service':
            return { label: 'Request', color: '#7e22ce', bg: '#faf5ff' }
        case 'want_to_sell':
            return { label: 'For Sale', color: '#15803d', bg: '#f0fdf4' }
        case 'want_to_buy':
            return { label: 'Wanted', color: '#2563eb', bg: '#eff6ff' }
        default:
            return { label: 'Chat', color: colors.gray[600], bg: colors.gray[100] }
    }
}

function formatTimeAgo(dateStr: string): string {
    const now = new Date()
    const date = new Date(dateStr)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// =============================================================================
// Conversation Card
// =============================================================================

function ConversationCard({
    conversation,
    onPress,
}: {
    conversation: ConversationSummary
    onPress: () => void
}) {
    const badge = getPostTypeBadge(conversation.post_type)
    const initial = (conversation.other_user_name || 'U').charAt(0).toUpperCase()
    const avatarUrl = normalizeStorageUrl(conversation.other_user_avatar)
    const hasUnread = conversation.unread_count > 0

    // Parse post content (may be JSON with title/description)
    let postDisplayText = conversation.post_content
    try {
        const parsed = JSON.parse(conversation.post_content)
        postDisplayText = parsed.title || parsed.description || conversation.post_content
    } catch {
        // Not JSON, use as-is
    }

    return (
        <Button
            unstyled
            onPress={onPress}
            paddingHorizontal="$4"
            paddingVertical="$3"
            borderBottomWidth={1}
            borderBottomColor={colors.gray[100]}
            backgroundColor="white"
            hoverStyle={{ backgroundColor: colors.gray[50] }}
            pressStyle={{ backgroundColor: colors.gray[100] }}
        >
            <XStack gap="$3" alignItems="center" width="100%">
                {/* Avatar */}
                {avatarUrl ? (
                    <Image
                        source={{ uri: avatarUrl }}
                        style={{ width: 48, height: 48, borderRadius: 24 }}
                    />
                ) : (
                    <YStack
                        width={48}
                        height={48}
                        borderRadius={24}
                        backgroundColor={badge.color as any}
                        alignItems="center"
                        justifyContent="center"
                        flexShrink={0}
                    >
                        <Text fontSize={18} fontWeight="700" color="white">
                            {initial}
                        </Text>
                    </YStack>
                )}

                {/* Content */}
                <YStack flex={1} gap="$1">
                    <XStack justifyContent="space-between" alignItems="center">
                        <Text
                            fontSize={15}
                            fontWeight="600"
                            color={colors.gray[900]}
                            numberOfLines={1}
                            flex={1}
                        >
                            {conversation.other_user_name || 'Unknown'}
                        </Text>
                        <Text fontSize={12} color={colors.gray[400]} flexShrink={0} marginLeft="$2">
                            {formatTimeAgo(conversation.last_message_at)}
                        </Text>
                        {hasUnread && (
                            <YStack
                                width={10}
                                height={10}
                                borderRadius={5}
                                backgroundColor={colors.green[500]}
                                marginLeft={6}
                                flexShrink={0}
                            />
                        )}
                    </XStack>

                    {/* Post type badge + content preview */}
                    <XStack gap="$1.5" alignItems="center">
                        <Text
                            fontSize={10}
                            fontWeight="600"
                            color={badge.color as any}
                            backgroundColor={badge.bg as any}
                            paddingHorizontal={5}
                            paddingVertical={1}
                            borderRadius={3}
                        >
                            {badge.label}
                        </Text>
                        <Text
                            fontSize={12}
                            color={colors.gray[500]}
                            numberOfLines={1}
                            flex={1}
                        >
                            {postDisplayText}
                        </Text>
                    </XStack>

                    {/* Last message */}
                    <XStack alignItems="center" justifyContent="space-between">
                        <Text
                            fontSize={13}
                            color={hasUnread ? colors.gray[900] : colors.gray[500]}
                            fontWeight={hasUnread ? '600' : '400'}
                            numberOfLines={1}
                            marginTop={2}
                            flex={1}
                        >
                            {conversation.last_message_type === 'media'
                                ? '📷 Photo'
                                : conversation.last_message_content || 'No messages yet'}
                        </Text>
                        {hasUnread && (
                            <YStack
                                backgroundColor={colors.green[600]}
                                borderRadius={10}
                                minWidth={20}
                                height={20}
                                alignItems="center"
                                justifyContent="center"
                                paddingHorizontal={6}
                                marginLeft={8}
                                flexShrink={0}
                            >
                                <Text fontSize={11} color="white" fontWeight="700">
                                    {conversation.unread_count}
                                </Text>
                            </YStack>
                        )}
                    </XStack>
                </YStack>
            </XStack>
        </Button>
    )
}

// =============================================================================
// Main Component
// =============================================================================

export function ChatInboxScreen({
    currentUserId,
    onOpenChat,
    onClose,
}: ChatInboxScreenProps) {
    const { t } = useTranslation()
    const [conversations, setConversations] = useState<ConversationSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchConversations = useCallback(async () => {
        try {
            setError(null)
            const data = await getUserConversations(currentUserId)
            setConversations(data)
        } catch (err) {
            console.error('Error loading conversations:', err)
            setError(t('chat.inboxError'))
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [currentUserId, t])

    useEffect(() => {
        fetchConversations()
    }, [fetchConversations])

    // Realtime: re-fetch when a new message arrives in any conversation
    useEffect(() => {
        const channel = supabase
            .channel('inbox-live')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                },
                (payload) => {
                    // Only refetch if the message is from someone else
                    if (payload.new && (payload.new as any).sender_id !== currentUserId) {
                        fetchConversations()
                    }
                },
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [currentUserId, fetchConversations])

    const handleRefresh = useCallback(() => {
        setRefreshing(true)
        fetchConversations()
    }, [fetchConversations])

    const renderItem = useCallback(
        ({ item }: { item: ConversationSummary }) => (
            <ConversationCard
                conversation={item}
                onPress={() => onOpenChat(item.post_id, item.other_user_id)}
            />
        ),
        [onOpenChat],
    )

    return (
        <YStack flex={1} backgroundColor="white" alignItems="center">
            <YStack flex={1} width="100%" maxWidth={896}>
            {/* Header */}
            <XStack
                paddingHorizontal="$4"
                paddingVertical="$3"
                alignItems="center"
                gap="$3"
                borderBottomWidth={1}
                borderBottomColor={colors.gray[200]}
                backgroundColor="white"
            >
                <Button
                    unstyled
                    onPress={onClose}
                    padding="$2"
                    borderRadius="$full"
                    hoverStyle={{ backgroundColor: colors.gray[100] }}
                >
                    <ArrowLeft size={22} color={colors.gray[700]} />
                </Button>
                <XStack alignItems="center" gap="$2" flex={1}>
                    <MessageCircle size={20} color={colors.green[600]} />
                    <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
                        {t('chat.inboxTitle')}
                    </Text>
                </XStack>
            </XStack>

            {/* Content */}
            {loading ? (
                <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
                    <Spinner size="large" color={colors.green[600]} />
                    <Text color={colors.gray[500]}>{t('chat.loading')}</Text>
                </YStack>
            ) : error ? (
                <YStack flex={1} alignItems="center" justifyContent="center" gap="$3" padding="$6">
                    <Text color={colors.red[500]} textAlign="center">{error}</Text>
                    <Button
                        size="$3"
                        backgroundColor={colors.green[600]}
                        borderRadius={8}
                        onPress={handleRefresh}
                    >
                        <Text color="white" fontWeight="600">{t('chat.inboxRetry')}</Text>
                    </Button>
                </YStack>
            ) : conversations.length === 0 ? (
                <YStack flex={1} alignItems="center" justifyContent="center" gap="$4" padding="$6">
                    <YStack
                        width={72}
                        height={72}
                        borderRadius={36}
                        backgroundColor={colors.gray[100]}
                        alignItems="center"
                        justifyContent="center"
                    >
                        <MessageCircle size={32} color={colors.gray[400]} />
                    </YStack>
                    <Text fontSize={16} fontWeight="600" color={colors.gray[600]} textAlign="center">
                        {t('chat.inboxEmpty')}
                    </Text>
                    <Text fontSize={14} color={colors.gray[400]} textAlign="center">
                        {t('chat.inboxEmptyHint')}
                    </Text>
                </YStack>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={colors.green[600]}
                        />
                    }
                    contentContainerStyle={{ flexGrow: 1 }}
                />
            )}
            </YStack>
        </YStack>
    )
}
