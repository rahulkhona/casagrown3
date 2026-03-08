/**
 * NotificationsScreen — Full-screen notification list for mobile.
 *
 * Reuses the shared NotificationContext for data, marking read, and clearing.
 */

import React from 'react'
import { YStack, XStack, Text, ScrollView, Separator, Spinner } from 'tamagui'
import { TouchableOpacity, Platform } from 'react-native'
import { Check, Trash2, ArrowLeft, Bell } from '@tamagui/lucide-icons'
import { colors } from '../../design-tokens'
import { type Notification } from './useNotifications'
import { useNotificationContext } from './NotificationContext'
import { useRouter } from 'solito/navigation'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

function formatTimeAgo(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateString).toLocaleDateString()
}

function NotificationItem({ notification, onPress }: { notification: Notification; onPress: (n: Notification) => void }) {
  const isUnread = !notification.read_at
  return (
    <TouchableOpacity onPress={() => onPress(notification)} activeOpacity={0.7}>
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        backgroundColor={isUnread ? colors.green[50] : 'white'}
        gap="$3"
        alignItems="flex-start"
      >
        <YStack
          width={8}
          height={8}
          borderRadius={4}
          backgroundColor={isUnread ? colors.green[500] : 'transparent'}
          marginTop={6}
          flexShrink={0}
        />
        <YStack flex={1} gap="$1">
          <Text
            fontSize={14}
            lineHeight={20}
            color={colors.gray[800]}
            fontWeight={isUnread ? '600' : '400'}
          >
            {notification.content}
          </Text>
          <Text fontSize={12} color={colors.gray[400]}>
            {formatTimeAgo(notification.created_at)}
          </Text>
        </YStack>
      </XStack>
    </TouchableOpacity>
  )
}

export function NotificationsScreen() {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotificationContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.read_at) {
      await markAsRead(notification.id)
    }
    if (notification.link_url) {
      router.push(notification.link_url as any)
    }
  }

  return (
    <YStack flex={1} backgroundColor="white" paddingTop={insets.top}>
      {/* Header */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        alignItems="center"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderBottomColor={colors.gray[200]}
        backgroundColor="white"
      >
        <XStack alignItems="center" gap="$3">
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.gray[700]} />
          </TouchableOpacity>
          <XStack alignItems="center" gap="$2">
            <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <YStack
                backgroundColor={colors.green[500]}
                borderRadius="$full"
                minWidth={22}
                height={22}
                alignItems="center"
                justifyContent="center"
                paddingHorizontal="$1"
              >
                <Text fontSize={12} color="white" fontWeight="700">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </YStack>
            )}
          </XStack>
        </XStack>
      </XStack>

      {/* Action buttons */}
      {notifications.length > 0 && (
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$2"
          gap="$4"
          borderBottomWidth={1}
          borderBottomColor={colors.gray[100]}
        >
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllAsRead}>
              <XStack alignItems="center" gap="$1">
                <Check size={14} color={colors.green[600]} />
                <Text fontSize={13} color={colors.green[600]} fontWeight="500">
                  Mark all read
                </Text>
              </XStack>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={clearAll}>
            <XStack alignItems="center" gap="$1">
              <Trash2 size={14} color={colors.red[500]} />
              <Text fontSize={13} color={colors.red[500]} fontWeight="500">
                Clear all
              </Text>
            </XStack>
          </TouchableOpacity>
        </XStack>
      )}

      {/* Content */}
      {loading ? (
        <YStack padding="$8" alignItems="center">
          <Spinner size="large" color={colors.green[600]} />
        </YStack>
      ) : notifications.length === 0 ? (
        <YStack padding="$8" alignItems="center" gap="$3">
          <YStack
            width={56}
            height={56}
            borderRadius={28}
            backgroundColor={colors.gray[100]}
            alignItems="center"
            justifyContent="center"
          >
            <Bell size={28} color={colors.gray[400]} />
          </YStack>
          <Text fontSize={15} color={colors.gray[500]} textAlign="center">
            No notifications yet
          </Text>
          <Text fontSize={13} color={colors.gray[400]} textAlign="center">
            You'll see updates about orders, cashouts, and more here.
          </Text>
        </YStack>
      ) : (
        <ScrollView flex={1} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
          {notifications.map((notif, idx) => (
            <React.Fragment key={notif.id}>
              <NotificationItem
                notification={notif}
                onPress={handleNotificationPress}
              />
              {idx < notifications.length - 1 && (
                <Separator borderColor={colors.gray[100]} />
              )}
            </React.Fragment>
          ))}
        </ScrollView>
      )}
    </YStack>
  )
}
