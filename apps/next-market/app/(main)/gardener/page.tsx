'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GardenerPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/pro?ref=gardener')
  }, [router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: '#166534' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div className="spinner"></div>
        <p style={{ fontWeight: 600 }}>Redirecting to CasaGrown Onboarding...</p>
      </div>
      <style jsx>{`
        .spinner { 
          width: 36px; 
          height: 36px; 
          border: 4px solid rgba(34,197,94,0.2); 
          border-left-color: #22c55e; 
          border-radius: 50%; 
          animation: spin 1s linear infinite; 
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
