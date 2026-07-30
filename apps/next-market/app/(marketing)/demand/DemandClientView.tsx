'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ProduceItem } from '../../../lib/produceCatalog'

interface DemandClientViewProps {
  displayName: string
  firstName: string
  locStr: string
  avatarUrl: string | null
  buyerId: string
  itemNames: string[]
  mode: 'buy' | 'sell'
  matchedItems: ProduceItem[]
}

export default function DemandClientView({
  displayName,
  firstName,
  locStr,
  avatarUrl,
  buyerId,
  mode,
  matchedItems,
}: DemandClientViewProps) {
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [isSaved, setIsSaved] = useState(false)

  const toggleItem = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const selectedCount = selectedItemIds.length
  const selectedNames = matchedItems
    .filter((i) => selectedItemIds.includes(i.id))
    .map((i) => i.name)
    .join(', ')

  const checkboxText = 'I want this'

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingTop: '64px', paddingBottom: '90px' }}>
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Banner Header */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '24px',
            padding: '32px 24px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px rgba(0,0,0,0.03)',
            marginBottom: '32px',
            textAlign: 'center',
            background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                objectFit: 'cover',
                margin: '0 auto 16px auto',
                border: '3px solid #16a34a',
                boxShadow: '0 4px 12px rgba(22,163,74,0.2)',
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                backgroundColor: '#dcfce7',
                color: '#15803d',
                fontSize: '28px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                border: '3px solid #86efac',
                boxShadow: '0 4px 12px rgba(22,163,74,0.15)',
              }}
            >
              {firstName ? firstName[0].toUpperCase() : '🥦'}
            </div>
          )}

          <h1 suppressHydrationWarning style={{ fontSize: '26px', fontWeight: 800, color: '#14532d', margin: '0 0 10px 0', letterSpacing: '-0.5px' }}>
            {mode === 'buy'
              ? `Would you be interested in getting these items from ${firstName}?`
              : `Would you be interested in sharing or selling any of these items to ${firstName}?`}
          </h1>
          <p style={{ fontSize: '16px', color: '#4b5563', margin: '0 auto', maxWidth: '640px', lineHeight: 1.6, fontWeight: 500 }}>
            {mode === 'buy'
              ? `Let ${firstName} know by selecting items you are interested in`
              : `Have extra in your garden? Click "List Item & Notify" below to list your harvest for ${firstName}!`}
          </p>
        </div>

        {/* Success Alert Banner if saved */}
        {isSaved && (
          <div
            style={{
              backgroundColor: '#dcfce7',
              color: '#15803d',
              border: '1px solid #86efac',
              borderRadius: '16px',
              padding: '16px 20px',
              marginBottom: '24px',
              textAlign: 'center',
              fontWeight: 700,
              fontSize: '15px',
            }}
          >
            🎉 Your selections have been saved! {firstName} will be notified of your interest.
          </div>
        )}

        {/* Requested / Offered Items Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '24px',
          }}
        >
          {matchedItems.map((item) => {
            const isSelected = selectedItemIds.includes(item.id)

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '20px',
                  border: isSelected ? '2px solid #16a34a' : '1px solid #e5e7eb',
                  overflow: 'hidden',
                  boxShadow: isSelected ? '0 8px 20px rgba(22,163,74,0.12)' : '0 4px 12px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ position: 'relative', width: '100%', height: '190px', backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                  <img
                    src={item.image || '/images/produce_placeholder.jpg'}
                    alt={item.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/images/produce_placeholder.jpg'
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1f2937', margin: '0 0 6px 0' }}>
                    {item.name}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px 0', fontWeight: 500 }}>
                    Category: {item.displayCategory || 'Fresh Produce'}
                  </p>

                  <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                    {mode === 'sell' ? (
                      <Link
                        href={`/create-listing?produce=${encodeURIComponent(item.name)}${buyerId ? `&ref=${encodeURIComponent(buyerId)}` : ''}`}
                        onClick={() => {
                          // Implicitly record selling interest in background
                          try {
                            fetch('/api/interest/submit', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                interests: [{ produce_name: item.name, interest_type: 'sell', category: item.category }],
                                zipcodes: ['95125'],
                              }),
                            })
                          } catch {}
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          padding: '12px 16px',
                          backgroundColor: '#16a34a',
                          color: '#ffffff',
                          borderRadius: '12px',
                          fontWeight: 700,
                          fontSize: '14px',
                          textDecoration: 'none',
                          boxShadow: '0 4px 12px rgba(22,163,74,0.2)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        List Item & Notify {firstName} →
                      </Link>
                    ) : (
                      <label
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          fontSize: '14px',
                          fontWeight: 700,
                          color: isSelected ? '#15803d' : '#374151',
                          cursor: 'pointer',
                          userSelect: 'none',
                          padding: '10px 14px',
                          backgroundColor: isSelected ? '#f0fdf4' : '#f8fafc',
                          borderRadius: '12px',
                          border: isSelected ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(item.id)}
                          style={{
                            width: '18px',
                            height: '18px',
                            accentColor: '#16a34a',
                            cursor: 'pointer',
                          }}
                        />
                        <span>{checkboxText}</span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* Sticky Bottom Bar Overlay matching /interest page structure */}
      <style>{`
        .bottom-sticky-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background-color: #ffffff;
          border-top: 1px solid #e5e7eb;
          padding: 14px 24px;
          box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
          z-index: 200;
        }
        @media (max-width: 768px) {
          .bottom-sticky-bar {
            bottom: 60px;
          }
        }
      `}</style>

      {selectedCount > 0 && mode === 'sell' && (
        <div className="bottom-sticky-bar">
          <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 800,
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selectedCount}
              </span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                item{selectedCount > 1 ? 's' : ''} selected
              </span>
            </div>

            <Link
              href={
                mode === 'sell'
                  ? `/interest?scope=buy&produce=${encodeURIComponent(selectedNames)}${buyerId ? `&ref=${encodeURIComponent(buyerId)}` : ''}`
                  : `/create-listing?produce=${encodeURIComponent(selectedNames)}${buyerId ? `&ref=${encodeURIComponent(buyerId)}` : ''}`
              }
              onClick={() => setIsSaved(true)}
              style={{
                backgroundColor: '#16a34a',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '15px',
                padding: '12px 24px',
                borderRadius: '12px',
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              Save & Let {firstName} Know →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
