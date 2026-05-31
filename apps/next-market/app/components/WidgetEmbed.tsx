'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

/**
 * WidgetEmbed — Shows the embed code snippet for the chat widget.
 * Sellers copy this to their external website.
 */
export function WidgetEmbed() {
  const { user } = useAuth()
  const [booths, setBooths] = useState<Array<{ id: string; name: string }>>([])
  const [selectedBooth, setSelectedBooth] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase
      .from('market_booths')
      .select('id, name')
      .eq('owner_id', user.id)
      .order('is_default', { ascending: false })
      .then(({ data }: { data: any }) => {
        setBooths(data || [])
        if (data?.[0]) setSelectedBooth(data[0].id)
      })
  }, [user])

  const widgetOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com'

  const embedCode = selectedBooth
    ? `<!-- CasaGrown Chat Widget -->\n<script src="${widgetOrigin}/widget.js" data-booth-id="${selectedBooth}"></script>`
    : ''

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h4
        style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}
      >
        💬 Website Chat Widget
      </h4>
      <p
        style={{
          margin: '0 0 12px',
          fontSize: 13,
          color: '#6b7280',
        }}
      >
        Add an AI-powered chat assistant to your own website. Buyers can ask
        about your products and place orders.
      </p>

      {booths.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#6b7280',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Select booth:
          </label>
          <select
            value={selectedBooth}
            onChange={(e) => setSelectedBooth(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              fontSize: 14,
              width: '100%',
            }}
          >
            {booths.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        style={{
          background: '#f9fafb',
          borderRadius: 8,
          padding: 12,
          fontFamily: 'monospace',
          fontSize: 12,
          color: '#374151',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          border: '1px solid #e5e7eb',
        }}
      >
        {embedCode}
      </div>

      <button
        onClick={handleCopy}
        style={{
          marginTop: 8,
          padding: '6px 14px',
          borderRadius: 6,
          border: '1px solid #d1d5db',
          background: 'white',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        {copied ? '✓ Copied!' : '📋 Copy Embed Code'}
      </button>
    </div>
  )
}
