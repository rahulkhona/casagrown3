'use client'

/**
 * Unified loading spinner for all pages.
 * Use <LoadingSpinner /> or <LoadingSpinner message="Loading booth..." />
 */
export function LoadingSpinner({ message }: { message?: string }) {
  return (
    <div className="container" style={{
      padding: '80px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      minHeight: '40vh',
    }}>
      <div className="loading-spinner" />
      {message && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--gray-400)', fontWeight: 500 }}>
          {message}
        </p>
      )}
      <style>{`
        .loading-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid var(--gray-200);
          border-top-color: var(--green-500);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

/**
 * Inline shimmer skeleton for product grid slots.
 */
export function ProductSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-image" />
          <div className="skeleton-line" style={{ width: '70%' }} />
          <div className="skeleton-line" style={{ width: '40%' }} />
        </div>
      ))}
      <style>{`
        .skeleton-card {
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
          overflow: hidden;
          background: #fff;
        }
        .skeleton-image {
          aspect-ratio: 1;
          background: linear-gradient(90deg, var(--gray-100) 25%, var(--gray-50) 50%, var(--gray-100) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        .skeleton-line {
          height: 12px;
          margin: 10px 12px 0;
          border-radius: 6px;
          background: linear-gradient(90deg, var(--gray-100) 25%, var(--gray-50) 50%, var(--gray-100) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        .skeleton-line:last-child { margin-bottom: 12px; }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  )
}
// rebuild trigger
