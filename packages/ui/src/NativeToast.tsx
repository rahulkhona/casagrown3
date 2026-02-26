import { Toast, useToastState, useToastController } from '@tamagui/toast'
import { YStack, XStack, Text } from 'tamagui'
import { Platform, TouchableOpacity } from 'react-native'
import { X } from '@tamagui/lucide-icons'

export const NativeToast = () => {
  const currentToast = useToastState()
  const toast = useToastController()

  if (!currentToast || currentToast.isHandledNatively) {
    return null
  }

  const hasAction = !!currentToast.action?.onPress

  return (
    <Toast
      key={currentToast.id}
      duration={currentToast.duration}
      viewportName={currentToast.viewportName}
      // Swipe configuration
      transition="quick"
      enterStyle={{ opacity: 0, scale: 0.9, y: -20 }}
      exitStyle={{ opacity: 0, scale: 0.9, y: -20 }}
      y={0}
      opacity={1}
      scale={1}
      // Beautiful card styling
      backgroundColor="white"
      borderRadius="$4"
      shadowColor="#000"
      shadowOpacity={0.15}
      shadowRadius={15}
      shadowOffset={{ width: 0, height: 8 }}
      elevation={12}
      borderWidth={1}
      borderColor="$color.gray200"
      overflow="hidden"
      padding={0} // We will use inner container for padding to allow the left accent stripe
      width="100%"
      maxWidth={400}
      cursor={hasAction ? 'pointer' : 'default'}
      onPress={(e) => {
        toast.hide()
        currentToast.action?.onPress?.(e as any)
      }}
      hoverStyle={{ scale: hasAction && Platform.OS === 'web' ? 1.02 : 1 }}
      pressStyle={{ scale: hasAction ? 0.97 : 1 }}
    >
      <XStack width="100%">
        {/* Left Green Accent Stripe */}
        <YStack width={6} backgroundColor="$color.green600" />
        
        {/* Main Content Area */}
        <YStack flex={1} paddingVertical="$3" paddingHorizontal="$4" gap="$1">
          <XStack alignItems="center" justifyContent="space-between" width="100%">
            <Toast.Title fontWeight="700" fontSize="$4" color="$color.gray900" numberOfLines={1} flex={1}>
              {currentToast.title}
            </Toast.Title>

            <XStack alignItems="center" gap="$3" ml="$2">
              {hasAction && (
                <Text fontSize={13} fontWeight="600" color="$color.green600" textTransform="uppercase">
                  VIEW
                </Text>
              )}
              {/* Close (X) mark */}
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation()
                  toast.hide()
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color="$color.gray400" />
              </TouchableOpacity>
            </XStack>
          </XStack>
          
          {!!currentToast.message && (
            <Toast.Description fontSize={14} color="$color.gray600" numberOfLines={2}>
              {currentToast.message}
            </Toast.Description>
          )}
        </YStack>
      </XStack>
    </Toast>
  )
}

