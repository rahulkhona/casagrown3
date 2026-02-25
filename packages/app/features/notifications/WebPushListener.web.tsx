import { useEffect } from 'react'
import { useToastController } from '@casagrown/ui'

export function WebPushListener() {
  const toast = useToastController()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NOTIFICATION') {
        const { title, body, url } = event.data.data || {}
        toast.show(title || 'Notification', {
          message: body || '',
          native: false, // Ensures we use Tamagui toast, not native
          // If we want it strictly in-app we keep this.
        })
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage)
    }
  }, [toast])

  return null
}
