'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * ClientOnly — Suppresses server-side rendering for its children.
 *
 * Tamagui components generate different HTML on the server vs the client,
 * causing fatal hydration mismatches in Next.js 16 / Turbopack.
 * Wrapping the app in this component ensures all Tamagui rendering
 * happens client-side only.
 */
export default function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f0fdf4' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTop: '3px solid #16a34a', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <p style={{ marginTop: 12, color: '#64748b', fontSize: 14 }}>Loading Community Voice…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return <>{children}</>
}
