'use client'
import React from 'react'
import { MapPin } from 'lucide-react'
import { ActionChips } from './DynamicUICards'

export function FarmersMarketCard({ data, onActionClick }: { data: any, onActionClick?: (action: string) => void }) {
  const zipcode = data.zipcode || '';

  return (
    <div style={{ border: '1px solid #fde047', borderRadius: 12, padding: 16, background: '#fefce8', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <MapPin size={18} color="#a16207" />
        <span style={{ fontWeight: 700, color: '#854d0e', fontSize: 15 }}>Physical Farmers Markets</span>
      </div>
      
      <div style={{ background: 'white', borderRadius: 8, padding: 12, marginBottom: 10 }}>
        <div style={{ color: '#4b5563', fontSize: 13, marginBottom: 8 }}>
          Prefer to browse in person? I can show you USDA-registered Farmers Markets near you.
        </div>
        {zipcode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 12 }}>
            <MapPin size={12} />
            <span>Searching near: <strong>{zipcode}</strong></span>
          </div>
        )}
      </div>

      <a
        href={`/market${zipcode ? `?zip=${zipcode}` : ''}#physical-markets`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '12px 0', background: 'linear-gradient(135deg, #eab308, #ca8a04)', color: 'white',
          border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15,
          cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box',
          boxShadow: '0 4px 12px rgba(234,179,8,0.3)',
        }}
      >
        <MapPin size={16} />
        View Nearby Markets
      </a>
      
      {data.suggested_next_actions && (
        <ActionChips actions={data.suggested_next_actions} onActionClick={onActionClick} />
      )}
    </div>
  );
}
