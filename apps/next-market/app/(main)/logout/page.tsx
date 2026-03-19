'use client'

import { useEffect } from 'react'
import { createClient } from '../../../lib/supabase'

export default function LogoutPage() {
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.signOut().then(() => {
      localStorage.clear()
      window.location.href = '/'
    })
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <p style={{ color: '#6b7280', fontSize: 16 }}>Signing out...</p>
    </div>
  )
}
