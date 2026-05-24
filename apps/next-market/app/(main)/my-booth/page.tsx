'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingSpinner } from '../../components/LoadingSpinner'

/**
 * Legacy /my-booth route — redirects to the new /my-stands hub.
 * Kept for backward compatibility with bookmarks and links.
 */
export default function MyBoothRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/my-stands')
  }, [router])

  return <LoadingSpinner message="Redirecting to My Booths..." />
}
