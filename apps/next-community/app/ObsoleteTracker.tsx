'use client'
import { useEffect } from 'react'
import { supabase } from '@casagrown/app/features/auth/auth-hook'

/**
 * @deprecated The Community web app is deprecated. This component logs when a user hits it.
 */
export function ObsoleteTracker() {
  useEffect(() => {
    supabase.rpc('log_obsolete_ui_usage', {
      p_object_type: 'ui',
      p_object_name: 'next-community',
      p_details: { path: typeof window !== 'undefined' ? window.location.pathname : 'unknown' }
    }).then(({ error }) => {
      if (error) console.error('Failed to log obsolete usage:', error)
    })
  }, [])
  return null
}
