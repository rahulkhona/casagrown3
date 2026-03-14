'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMarket, formatUsd } from '../../../../lib/store'

export default function RedeemPage() {
  const router = useRouter()
  const { state, dispatch } = useMarket()
  const [method, setMethod] = useState<'venmo' | 'giftcard' | 'charity' | null>(null)
  const [amount, setAmount] = useState('')
  const [venmoHandle, setVenmoHandle] = useState('')

  const available = state.earnings.available

  const handleRedeem = () => {
    const amt = parseFloat(amount)
    if (!amt || amt > available) return
    dispatch({ type: 'ADD_TOAST', payload: {
      message: method === 'venmo' ? `${formatUsd(amt)} sent to @${venmoHandle}! 💸` :
               method === 'giftcard' ? `${formatUsd(amt)} gift card purchased! 🎁` :
               `${formatUsd(amt)} donated to charity! ❤️`,
      type: 'success'
    }})
    router.push('/earnings')
  }

  return (
    <div className="container-sm">
      <Link href="/earnings" style={{ fontSize: 14, color: 'var(--green-600)', fontWeight: 500 }}>← Back to Earnings</Link>
      <div className="page-header"><h1 className="page-title">Redeem Earnings</h1><p className="page-subtitle">Available: <strong style={{ color: 'var(--green-700)' }}>{formatUsd(available)}</strong></p></div>

      {/* Method Selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {[
          { id: 'venmo' as const, icon: '💸', title: 'Venmo', desc: 'Transfer to your Venmo account' },
          { id: 'giftcard' as const, icon: '🎁', title: 'Gift Cards', desc: 'Purchase from popular retailers' },
          { id: 'charity' as const, icon: '❤️', title: 'Donate to Charity', desc: 'Support local charities and food banks' },
        ].map(m => (
          <button key={m.id} onClick={() => setMethod(m.id)} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: 16,
            borderRadius: 'var(--radius-lg)', border: `2px solid ${method === m.id ? 'var(--green-500)' : 'var(--border)'}`,
            background: method === m.id ? 'var(--green-50)' : '#fff', cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ fontSize: 28 }}>{m.icon}</span>
            <div><strong style={{ fontSize: 15 }}>{m.title}</strong><div style={{ fontSize: 13, color: 'var(--gray-500)' }}>{m.desc}</div></div>
          </button>
        ))}
      </div>

      {method && (
        <div className="card" style={{ padding: 20 }}>
          {method === 'venmo' && (
            <div className="form-group">
              <label className="label">Venmo Handle</label>
              <input className="input" value={venmoHandle} onChange={e => setVenmoHandle(e.target.value)} placeholder="@your-venmo" />
            </div>
          )}
          {method === 'giftcard' && (
            <div style={{ marginBottom: 16 }}>
              <label className="label">Choose a Gift Card</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                {['Amazon', 'Target', 'Walmart', 'Starbucks', 'Whole Foods', 'Costco'].map(store => (
                  <div key={store} style={{
                    padding: 12, borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                    textAlign: 'center', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>
                    {store}
                  </div>
                ))}
              </div>
            </div>
          )}
          {method === 'charity' && (
            <div style={{ marginBottom: 16 }}>
              <label className="label">Select Charity</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {['Local Food Bank', 'Community Garden Foundation', 'Meals on Wheels'].map(org => (
                  <div key={org} style={{ padding: 12, borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer' }}>
                    ❤️ {org}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="label">Amount</label>
            <input className="input" type="number" step="0.01" min="0.01" max={available} value={amount} onChange={e => setAmount(e.target.value)} placeholder={`Up to ${formatUsd(available)}`} />
          </div>
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleRedeem} disabled={!amount || parseFloat(amount) > available || (method === 'venmo' && !venmoHandle)}>
            {method === 'charity' ? 'Donate' : 'Redeem'} {amount ? formatUsd(parseFloat(amount)) : ''}
          </button>
        </div>
      )}
      <div style={{ height: 40 }} />
    </div>
  )
}
