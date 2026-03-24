'use client'

import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { trackError } from '../../lib/analytics'
import { createBrowserClient } from '@supabase/ssr'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Global error boundary that catches unhandled React rendering errors,
 * tracks them via analytics, and logs to Supabase client_errors table.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    trackError('uncaught_render_error', {
      error: error.message,
      stackTrace: error.stack || '',
      componentStack: info.componentStack || '',
    })

    // Log to Supabase client_errors table (fire-and-forget)
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      )
      ;(async () => {
        try {
          const { data } = await supabase.auth.getUser()
          await supabase.from('client_errors').insert({
            user_id: data?.user?.id || null,
            page_url: typeof window !== 'undefined' ? window.location.href : '',
            error_message: error.message,
            stack_trace: (error.stack || '').slice(0, 4000),
            component_stack: (info.componentStack || '').slice(0, 4000),
            browser_info: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          })
        } catch { /* best-effort */ }
      })()
    } catch {
      // Supabase client creation failed — silently ignore
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '60px 24px', textAlign: 'center',
          maxWidth: 480, margin: '0 auto',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😵</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#111827' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            style={{
              padding: '10px 24px', borderRadius: 8,
              background: '#16a34a', color: '#fff', border: 'none',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
