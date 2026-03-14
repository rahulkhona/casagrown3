'use client'

import { use } from 'react'
import Link from 'next/link'
import { useMarket } from '../../../../../../lib/store'

export default function BoothAboutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { state } = useMarket()
  const booth = state.booths.find(b => b.id === id)

  if (!booth) return <div className="container" style={{ padding: 80, textAlign: 'center' }}>Booth not found</div>

  return (
    <div className="container-sm" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <Link href={`/market/booth/${id}`} style={{ fontSize: 14, color: 'var(--green-600)', fontWeight: 500 }}>
        ← Back to {booth.name}
      </Link>
      <div style={{ marginTop: 24, padding: 32, background: '#fff', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>About {booth.name}</h1>
        <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 20 }}>by {booth.ownerName}</p>
        <div
          style={{ fontSize: 15, color: 'var(--gray-700)', lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: booth.aboutHtml }}
        />
      </div>
    </div>
  )
}
