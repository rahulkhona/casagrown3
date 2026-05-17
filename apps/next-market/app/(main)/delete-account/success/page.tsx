'use client'

export default function DeleteAccountSuccessPage() {
  return (
    <div className="container-sm" style={{ padding: '60px 16px', maxWidth: 480, textAlign: 'center' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px', fontSize: 28,
      }}>
        ✅
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 8 }}>
        Account Successfully Closed
      </h1>

      <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 24 }}>
        Your account has been closed and your profile has been anonymized. Any remaining
        balance will be paid out according to your configured payout method.
      </p>

      <div style={{
        padding: 16, borderRadius: 12,
        background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
        fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.7,
      }}>
        <p style={{ marginBottom: 8 }}>
          <strong>Need help?</strong> Contact us at:
        </p>
        <a href="mailto:support@casagrown.com" style={{ color: 'var(--green-600)', fontWeight: 600 }}>
          support@casagrown.com
        </a>
      </div>
    </div>
  )
}
