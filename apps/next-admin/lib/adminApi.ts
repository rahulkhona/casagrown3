/**
 * Client-side helper for admin API calls.
 * Replaces direct adminSupabase usage — all operations go through
 * the server-side /api/admin route, which holds the service_role key.
 */

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

function getAccessToken(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  // Supabase stores session in localStorage under sb-<ref>-auth-token
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const val = JSON.parse(localStorage.getItem(key) || '{}')
        return val.access_token || null
      } catch { return null }
    }
  }
  return null
}

async function adminFetch<T = any>(body: Record<string, any>): Promise<AdminResponse<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = getAccessToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch('/api/admin', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

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
