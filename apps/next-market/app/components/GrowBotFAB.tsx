'use client'

import React from 'react'
import Link from 'next/link'
import { useAuth } from '../../lib/useAuth'

export default function GrowBotFAB() {
  const destination = "/growbot"

  return (
    <Link 
      href={destination}
      style={{
        position: 'fixed',
        bottom: '144px', // Above the Sell FAB
        right: '24px',
        width: 'auto',
        padding: '0 16px 0 12px',
        height: '56px',
        borderRadius: '28px',
        backgroundColor: '#166534',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(22, 101, 52, 0.4)',
        zIndex: 40,
        textDecoration: 'none',
        fontSize: '28px',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)'
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(22, 101, 52, 0.5)'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(22, 101, 52, 0.4)'
      }}
      title="Ask GrowBot for advice"
    >
      <div style={{ position: 'relative', width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', marginRight: 8, flexShrink: 0 }}>
        <img src="/growbot-avatar-v3.png" alt="GrowBot" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.2)' }} />
      </div>
      <span style={{ fontWeight: 600, fontSize: '0.95rem', paddingRight: 4 }}>Ask GrowBot</span>
      
      {/* Optional contextual badge */}
      <span style={{
        position: 'absolute',
        top: -4,
        right: -4,
        background: '#ef4444',
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: '2px solid white'
      }} />
    </Link>
  )
}
