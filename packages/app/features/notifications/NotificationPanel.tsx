import React from 'react'
import { YStack, XStack, Text, ScrollView, Separator, Spinner } from 'tamagui'
import { TouchableOpacity, Platform } from 'react-native'
import { Check, Trash2, X, Bell } from '@tamagui/lucide-icons'
import { colors } from '../../design-tokens'
import { useNotifications, type Notification } from './useNotifications'
import { useRouter } from 'solito/navigation'

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

interface NotificationItemProps {
  notification: Notification
  onPress: (notification: Notification) => void
}

function NotificationItem({ notification, onPress }: NotificationItemProps) {
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
        {/* Unread dot */}
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
            fontSize={13}
            lineHeight={18}
            color={colors.gray[800]}
            fontWeight={isUnread ? '600' : '400'}
          >
            {notification.content}
          </Text>
          <Text fontSize={11} color={colors.gray[400]}>
            {formatTimeAgo(notification.created_at)}
          </Text>
        </YStack>
      </XStack>
    </TouchableOpacity>
  )
}

interface NotificationPanelProps {
  visible: boolean
  onClose: () => void
  userId: string | undefined
}

export function NotificationPanel({ visible, onClose, userId }: NotificationPanelProps) {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications(userId)
  const router = useRouter()

  if (!visible) return null

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.read_at) {
      await markAsRead(notification.id)
    }
    if (notification.link_url) {
      onClose()
      router.push(notification.link_url as any)
    }
  }

  const handleMarkAllRead = async () => {
    await markAllAsRead()
  }

  const handleClearAll = async () => {
    await clearAll()
  }

  return (
    <>
      {/* Backdrop */}
      {Platform.OS === 'web' ? (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.2)',
            zIndex: 998,
          }}
        />
      ) : (
        <TouchableOpacity
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.2)',
            zIndex: 998,
          }}
          onPress={onClose}
          activeOpacity={1}
        />
      )}

      {/* Panel */}
      <YStack
        position="absolute"
        top="100%"
        right={8}
        zIndex={999}
        width={360}
        maxHeight={480}
        backgroundColor="white"
        borderRadius={16}
        shadowColor="black"
        shadowOpacity={0.15}
        shadowRadius={12}
        shadowOffset={{ width: 0, height: 4 }}
        elevation={8}
        overflow="hidden"
      >
        {/* Header */}
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$3"
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor={colors.gray[200]}
        >
          <XStack alignItems="center" gap="$2">
            <Text fontSize={16} fontWeight="700" color={colors.gray[900]}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <YStack
                backgroundColor={colors.green[500]}
                borderRadius="$full"
                minWidth={20}
                height={20}
                alignItems="center"
                justifyContent="center"
                paddingHorizontal="$1"
              >
                <Text fontSize={11} color="white" fontWeight="700">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </YStack>
            )}
          </XStack>

          <TouchableOpacity onPress={onClose}>
            <X size={18} color={colors.gray[500]} />
          </TouchableOpacity>
        </XStack>

        {/* Actions bar */}
        {notifications.length > 0 && (
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$2"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor={colors.gray[100]}
          >
            {unreadCount > 0 && (
              <TouchableOpacity onPress={handleMarkAllRead}>
                <XStack alignItems="center" gap="$1">
                  <Check size={14} color={colors.green[600]} />
                  <Text fontSize={12} color={colors.green[600]} fontWeight="500">
                    Mark all read
                  </Text>
                </XStack>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleClearAll}>
              <XStack alignItems="center" gap="$1">
                <Trash2 size={14} color={colors.red[500]} />
                <Text fontSize={12} color={colors.red[500]} fontWeight="500">
                  Clear all
                </Text>
              </XStack>
            </TouchableOpacity>
          </XStack>
        )}

        {/* Content */}
        {loading ? (
          <YStack padding="$6" alignItems="center">
            <Spinner size="small" color={colors.green[600]} />
          </YStack>
        ) : notifications.length === 0 ? (
          <YStack padding="$8" alignItems="center" gap="$3">
            <YStack
              width={48}
              height={48}
              borderRadius={24}
              backgroundColor={colors.gray[100]}
              alignItems="center"
              justifyContent="center"
            >
              <Bell size={24} color={colors.gray[400]} />
            </YStack>
            <Text fontSize={14} color={colors.gray[500]} textAlign="center">
              No notifications yet
            </Text>
            <Text fontSize={12} color={colors.gray[400]} textAlign="center">
              You'll see updates about orders, cashouts, and more here.
            </Text>
          </YStack>
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
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
    </>
  )
}
