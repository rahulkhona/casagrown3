'use client'

import React, { useState, useEffect } from 'react'
import { fetchNearbyLandmarks, LandmarkItem } from '../../lib/landmarks'
import { geocodeAddress } from '../../lib/geocode'

interface LandmarkPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (landmark: LandmarkItem) => void
  currentLat?: number | null
  currentLng?: number | null
  fallbackZip?: string | null
  theme?: 'light' | 'dark'
}

export default function LandmarkPickerModal({
  isOpen,
  onClose,
  onSelect,
  currentLat,
  currentLng,
  fallbackZip,
  theme = 'light',
}: LandmarkPickerModalProps) {
  const [landmarks, setLandmarks] = useState<LandmarkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const isDark = theme === 'dark'

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    const loadLandmarks = async () => {
      setLoading(true)
      setError(null)
      try {
        let lat = currentLat
        let lng = currentLng

        // 1. If coordinates not provided directly, try geocoding fallback ZIP
        if ((!lat || !lng) && fallbackZip) {
          try {
            const geo = await geocodeAddress(fallbackZip)
            if (geo) {
              lat = geo.lat
              lng = geo.lng
            }
          } catch {}
        }

        // 2. If still missing, query Vercel IP geolocation endpoint (/api/location/ip)
        if (!lat || !lng) {
          try {
            const ipRes = await fetch('/api/location/ip', { signal: AbortSignal.timeout(3000) })
            if (ipRes.ok) {
              const ipData = await ipRes.json()
              if (ipData?.lat && ipData?.lng) {
                lat = ipData.lat
                lng = ipData.lng
              }
            }
          } catch {}
        }

        // 3. Fallback default coordinates (San Jose, CA center)
        const effectiveLat = lat || 37.315
        const effectiveLng = lng || -121.899

        const items = await fetchNearbyLandmarks(effectiveLat, effectiveLng, 3500)
        if (isMounted) {
          setLandmarks(items)
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Failed to load nearby landmarks:', err)
          setError('Could not load nearby landmarks. Please check your connection or search manually.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadLandmarks()
    return () => {
      isMounted = false
    }
  }, [isOpen, currentLat, currentLng, fallbackZip])

  if (!isOpen) return null

  const filteredLandmarks = landmarks.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    const matchesSearch = !searchQuery.trim() || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.address.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
      data-testid="landmark-modal-backdrop"
    >
      <div 
        style={{
          backgroundColor: isDark ? '#0c140d' : '#ffffff',
          color: isDark ? '#ffffff' : '#111827',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isDark 
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(34, 197, 94, 0.2)' 
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: isDark ? '1px solid #1c3220' : '1px solid #e5e7eb',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
        data-testid="landmark-modal"
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: isDark ? '1px solid #1c3220' : '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: isDark ? '#ffffff' : '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🛡️</span> Pick a Safe Public Spot
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: isDark ? 'rgba(255, 255, 255, 0.7)' : '#4b5563' }}>
              Keep your home address private. Meet buyers safely in open community places.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f3f4f6',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              color: isDark ? 'rgba(255, 255, 255, 0.8)' : '#4b5563',
            }}
            data-testid="close-landmark-modal"
          >
            ✕
          </button>
        </div>

        {/* Search & Category filter */}
        <div style={{ padding: '12px 20px', borderBottom: isDark ? '1px solid #1c3220' : '1px solid #f3f4f6', background: isDark ? '#111e13' : '#fafafa' }}>
          <input
            type="text"
            placeholder="🔍 Search nearby coffee shops, parks, libraries..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: '14px',
              border: isDark ? '1px solid #234329' : '1px solid #e5e7eb',
              borderRadius: '10px',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: '10px',
              backgroundColor: isDark ? '#0c140d' : '#ffffff',
              color: isDark ? '#ffffff' : '#111827',
            }}
            data-testid="landmark-search-input"
          />

          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'cafe', label: '☕ Coffee & Cafes' },
              { id: 'park', label: '🌳 Parks' },
              { id: 'library', label: '📚 Libraries' },
              { id: 'community_center', label: '🏛️ Centers' },
              { id: 'school', label: '🏫 Schools' },
              { id: 'post_office', label: '📮 Post' },
            ].map(cat => {
              const active = selectedCategory === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '20px',
                    border: active 
                      ? (isDark ? '1px solid rgba(74, 222, 128, 0.6)' : '1px solid #16a34a') 
                      : (isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e5e7eb'),
                    backgroundColor: active 
                      ? (isDark ? 'rgba(34, 197, 94, 0.22)' : '#dcfce7') 
                      : (isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff'),
                    color: active 
                      ? (isDark ? '#4ade80' : '#166534') 
                      : (isDark ? 'rgba(255, 255, 255, 0.7)' : '#4b5563'),
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {cat.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Landmark List */}
        <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1, maxHeight: '420px', backgroundColor: isDark ? '#0c140d' : '#ffffff' }}>
          {loading ? (
            <div style={{ padding: '36px 0', textAlign: 'center', color: isDark ? 'rgba(255, 255, 255, 0.6)' : '#6b7280', fontSize: '14px' }}>
              ⏳ Finding nearby community landmarks...
            </div>
          ) : error ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: isDark ? '#f87171' : '#dc2626', fontSize: '14px' }}>
              {error}
            </div>
          ) : filteredLandmarks.length === 0 ? (
            <div style={{ padding: '36px 0', textAlign: 'center', color: isDark ? 'rgba(255, 255, 255, 0.6)' : '#6b7280', fontSize: '14px' }}>
              No matching landmarks found. Try clearing your search.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredLandmarks.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item)
                    onClose()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e5e7eb',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = isDark ? 'rgba(34, 197, 94, 0.16)' : '#f0fdf4'
                    e.currentTarget.style.borderColor = isDark ? 'rgba(74, 222, 128, 0.5)' : '#86efac'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff'
                    e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e5e7eb'
                  }}
                  data-testid={`landmark-option-${item.id}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '22px', flexShrink: 0 }}>{item.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: isDark ? '#ffffff' : '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '12px', color: isDark ? 'rgba(255, 255, 255, 0.65)' : '#6b7280', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.address}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '10px' }}>
                    <span style={{ 
                      fontSize: '12px', 
                      fontWeight: 600, 
                      color: isDark ? '#4ade80' : '#16a34a', 
                      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : '#f0fdf4', 
                      padding: '2px 8px', 
                      borderRadius: '12px' 
                    }}>
                      {item.distanceMiles} mi
                    </span>
                    <span style={{ color: isDark ? 'rgba(255, 255, 255, 0.4)' : '#9ca3af', fontSize: '14px' }}>→</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: isDark ? '1px solid #1c3220' : '1px solid #f3f4f6', backgroundColor: isDark ? '#111e13' : '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: isDark ? '#4ade80' : '#166534', fontWeight: 500 }}>
            🛡️ Safe meeting spots keep your home address completely private.
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: isDark ? '#0c140d' : '#ffffff',
              border: isDark ? '1px solid #234329' : '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: 'pointer',
              color: isDark ? 'rgba(255, 255, 255, 0.85)' : '#374151',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
