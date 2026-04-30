import React from 'react'
import Link from 'next/link'

export const metadata = {
  title: 'Start Selling on CasaGrown',
  description: 'Join your neighborhood market and start selling fresh produce today.',
}

export default function SellLandingPage() {
  return (
    <main style={{ backgroundColor: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Marketing Header */}
      <header style={{ padding: '24px 32px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>CasaGrown</div>
        <Link href="/login" style={{ fontSize: 14, fontWeight: 600, color: '#4b5563', textDecoration: 'none' }}>Log In</Link>
      </header>

      {/* Hero Section */}
      <section style={{ padding: '80px 24px', textAlign: 'center', maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ fontSize: 48, fontWeight: 800, color: '#111827', marginBottom: 24, lineHeight: 1.1 }}>
          Turn your backyard harvest into community connection.
        </h1>
        <p style={{ fontSize: 20, color: '#4b5563', marginBottom: 40, lineHeight: 1.5 }}>
          Join thousands of neighbors sharing fresh, local produce. No hidden fees. Setup takes less than 3 minutes.
        </p>
        <Link 
          href="/create-listing" 
          style={{
            display: 'inline-block',
            padding: '16px 32px',
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            color: '#fff',
            borderRadius: 999,
            fontSize: 18,
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 8px 24px rgba(22, 163, 74, 0.3)',
            transition: 'transform 0.2s ease'
          }}
        >
          Start Selling Today →
        </Link>
      </section>

      {/* Features */}
      <section style={{ padding: '80px 24px', background: '#f9fafb', flex: 1 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32 }}>
          <div style={{ padding: 32, background: '#fff', borderRadius: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🌱</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>It's Free to Start</h3>
            <p style={{ color: '#6b7280', lineHeight: 1.5 }}>List as many items as you want. We only take a small platform fee when you make a sale.</p>
          </div>
          <div style={{ padding: 32, background: '#fff', borderRadius: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🏠</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>You're in Control</h3>
            <p style={{ color: '#6b7280', lineHeight: 1.5 }}>Set your own prices, choose your delivery radius, and pick times that work for you.</p>
          </div>
          <div style={{ padding: 32, background: '#fff', borderRadius: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🤝</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Build Community</h3>
            <p style={{ color: '#6b7280', lineHeight: 1.5 }}>Meet neighbors who share your passion for fresh, locally grown food.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
