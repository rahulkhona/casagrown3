'use client'

/**
 * Logout Page - Signs out user and redirects to login
 * 
 * Usage: Navigate to /logout to clear session and return to login page
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@casagrown/app/provider/supabase'
import { YStack, Text, Spinner } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'

export default function LogoutPage() {
  const router = useRouter()
  const supabase = useSupabase()
  const [status, setStatus] = useState('Signing out...')

  useEffect(() => {
    async function performLogout() {
      try {
        const { error } = await supabase.auth.signOut()
        if (error) {
          console.error('Logout error:', error)
          setStatus('Error signing out. Redirecting...')
        } else {
          setStatus('Signed out successfully. Redirecting...')
        }
      } catch (err) {
        console.error('Logout exception:', err)
        setStatus('Error signing out. Redirecting...')
      }
      
      // Always redirect to login after a short delay
      setTimeout(() => {
        router.replace('/login')
      }, 1000)
    }

    performLogout()
  }, [router, supabase])

  return (
    <YStack 
      flex={1} 
      alignItems="center" 
      justifyContent="center" 
      backgroundColor={colors.gray[50]}
      minHeight="100vh"
      gap="$4"
    >
      <Spinner size="large" color={colors.green[600]} />
      <Text fontSize="$4" color={colors.gray[600]}>
        {status}
      </Text>
    </YStack>
  )
}
