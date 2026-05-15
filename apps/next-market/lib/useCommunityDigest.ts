'use client'

import { useState, useEffect } from 'react'
import { createClient } from './supabase'

/**
 * Fetches the latest community digest (AI-generated summary of recent discussions).
 * Returns null if no digest is available.
 */
export function useCommunityDigest() {
  const [digest, setDigest] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDigest() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('community_digests')
          .select('summary')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (data?.summary) {
          setDigest(data.summary)
        }
      } catch {
        // No digest available — will use generic share messages
      } finally {
        setLoading(false)
      }
    }
    fetchDigest()
  }, [])

  return { digest, loading }
}
