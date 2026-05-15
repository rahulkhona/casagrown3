'use client'

import { useState, useEffect } from 'react'
import { createClient } from './supabase-browser'

/**
 * Fetches the latest community digest (AI-generated summary of recent discussions).
 * Returns null if no digest is available.
 */
export function useCommunityDigest() {
  const [digest, setDigest] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('community_digests')
      .select('summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.summary) {
          setDigest(data.summary)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { digest, loading }
}
