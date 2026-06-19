/**
 * Client-side helper for admin API calls.
 * Replaces direct adminSupabase usage — all operations go through
 * the server-side /api/admin route, which holds the service_role key.
 */

import { supabase } from '@casagrown/app/features/auth/auth-hook'

interface AdminFilters {
  eq?: Record<string, any>
  neq?: Record<string, any>
  in?: Record<string, any[]>
  is?: Record<string, null>
  gt?: Record<string, any>
  gte?: Record<string, any>
  lt?: Record<string, any>
  lte?: Record<string, any>
  ilike?: Record<string, string>
}

interface AdminResponse<T = any> {
  data: T | null
  error: string | null
  count?: number
}

/**
 * Get the current access token via direct localStorage lookup (to bypass any
 * GoTrue navigator.locks deadlocks in dev mode/HMR), falling back to getSession().
 */
async function getAccessToken(): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (key && (key.startsWith('sb-') || key.startsWith('supabase.'))) {
          const val = window.localStorage.getItem(key)
          if (val) {
            try {
              const parsed = JSON.parse(val)
              const token = parsed?.currentSession?.access_token || parsed?.access_token
              if (token) {
                console.log('[getAccessToken] Extracted access token directly from localStorage:', key)
                return token
              }
            } catch {
              // ignore json parse errors for unrelated keys
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[getAccessToken] LocalStorage scan error:', e)
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  } catch {
    return null
  }
}

async function adminFetch<T = any>(body: Record<string, any>): Promise<AdminResponse<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = await getAccessToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    console.log('[adminApi] Starting adminFetch for action:', body.action, 'table:', body.table);
    console.log('[adminApi] Fetching /api/admin with body:', JSON.stringify(body));
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    console.log('[adminApi] Received response status:', res.status);

    // Auto-logout on 401 — token is truly expired/invalid
    if (res.status === 401) {
      console.warn('[Admin] 401 Unauthorized — clearing session and redirecting to login')
      try {
        await supabase.auth.signOut({ scope: 'local' })
        // Clear localStorage Supabase keys
        if (typeof window !== 'undefined' && window.localStorage) {
          Object.keys(window.localStorage)
            .filter(k => k.startsWith('sb-') || k.startsWith('supabase.'))
            .forEach(k => window.localStorage.removeItem(k))
        }
      } catch { /* ignore signout errors */ }
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
      return { data: null, error: 'Session expired — please log in again' }
    }

    const json = await res.json()

    if (!res.ok) {
      return { data: null, error: json.error || `HTTP ${res.status}` }
    }

    return { data: json.data, error: null, count: json.count }
  } catch (e: any) {
    return { data: null, error: e.message || 'Network error' }
  }
}

export const adminApi = {
  /** SELECT rows from a table */
  select: <T = any>(
    table: string,
    selectClause?: string,
    filters?: AdminFilters,
    options?: { order?: { column: string; ascending?: boolean }; limit?: number; single?: boolean }
  ) =>
    adminFetch<T>({
      action: 'select',
      table,
      select: selectClause,
      filters,
      ...options,
    }),

  /** INSERT row(s) into a table */
  insert: <T = any>(table: string, data: Record<string, any> | Record<string, any>[]) =>
    adminFetch<T>({ action: 'insert', table, data }),

  /** UPDATE rows in a table */
  update: <T = any>(table: string, data: Record<string, any>, filters: AdminFilters) =>
    adminFetch<T>({ action: 'update', table, data, filters }),

  /** DELETE rows from a table */
  delete: (table: string, filters: AdminFilters) =>
    adminFetch({ action: 'delete', table, filters }),

  /** UPSERT row(s) in a table */
  upsert: <T = any>(table: string, data: Record<string, any> | Record<string, any>[]) =>
    adminFetch<T>({ action: 'upsert', table, data }),

  /** Invoke a Supabase Edge Function */
  invokeFunction: <T = any>(functionName: string, body?: Record<string, any>) =>
    adminFetch<T>({ action: 'invoke_function', functionName, body }),

  /** Call a Postgres RPC function */
  rpc: <T = any>(functionName: string, params?: Record<string, any>) =>
    adminFetch<T>({ action: 'rpc', functionName, params }),
}
