'use client'
import React from 'react'
import { ShoppingBag } from 'lucide-react'
import { ActionChips } from './DynamicUICards'

export function MultiSearchCard({ data, onActionClick }: { data: any, onActionClick?: (action: string) => void }) {
  const queryArray = Array.isArray(data.items) ? data.items : data.items ? [data.items] : [];
  const queryString = queryArray.join(',');

  return (
    <div style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, background: '#f0fdf4', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ShoppingBag size={18} color="#16a34a" />
        <span style={{ fontWeight: 700, color: '#14532d', fontSize: 15 }}>Shopping Assistant</span>
      </div>
      
      <div style={{ background: 'white', borderRadius: 8, padding: 12, marginBottom: 10 }}>
        <div style={{ color: '#4b5563', fontSize: 13, marginBottom: 12 }}>
          I can help you find those items! I'll search across local neighbors, commercial farms, and physical farmers markets.
        </div>
        
        {queryArray.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {queryArray.map((item: string, i: number) => (
              <span key={i} style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      <a
        href={`/market?q=${encodeURIComponent(queryArray[0] || '')}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '12px 0', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: 'white',
          border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15,
          cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box',
          boxShadow: '0 4px 12px rgba(22,163,74,0.3)',
        }}
      >
        <ShoppingBag size={16} />
        View All Results
      </a>
      
      {data.suggested_next_actions && (
        <ActionChips actions={data.suggested_next_actions} onActionClick={onActionClick} />
      )}
    </div>
  );
}
