/**
 * Server-side admin API route.
 * All admin write operations (insert/update/delete) go through this endpoint.
 * The secret key is ONLY accessible here — never exposed to the browser.
 *
 * Auth: Validates the caller's JWT (passed via Authorization header),
 * checks admin role via staff_members table.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — server-side only
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

// Resolve the best available key (filter out empty/whitespace-only values)
function resolveServiceKey(): string {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,   // JWT format (preferred for auth.getUser)
    process.env.SUPABASE_SECRET_KEY,          // sb_secret_ format
  ]
  for (const key of candidates) {
    if (key && key.trim().length > 1) return key.trim()
  }
  throw new Error('No valid Supabase service key found (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY)')
}

const supabaseServiceKey = resolveServiceKey()

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Allowed tables for admin operations (whitelist to prevent arbitrary table access)
const ALLOWED_TABLES = new Set([
  // Market operations
  'market_state_blocks',
  'market_settings',
  'market_schedule_policies',
  // Sales & categories
  'sales_categories',
  'category_restrictions',
  'blocked_products',
  // Receipts
  'receipt_footers',
  // Users & moderation
  'profiles',
  'posts',
  'post_flags',
  // Platform config
  'platform_settings',
  'platform_fees',
  // Post policies
  'post_type_policies',
  // Redemption methods
  'available_redemption_methods',
  'available_redemption_method_instruments',
  'instrument_queuing_status',
  // Tax
  'category_tax_rules',
  'tax_reporting_thresholds',
  // Campaigns
  'incentive_campaigns',
  'campaign_rewards',
  'campaign_zones',
  // Staff
  'staff_members',
  // Beta testers
  'beta_testers',
  // Geography (read-only lookups for jurisdiction dropdowns)
  'countries',
  'states',
  'counties',
  'cities',
  // Financial (admin read for cash flow / settlements pages)
  'platform_bank_ledger',
  'market_settlements',
  'settlement_captures',
  'buyer_debts',
  'user_settlements',
  'user_balances',
  'redemptions',
  // Quarantine zones (agricultural pest quarantines)
  'quarantine_zones',
])

interface AdminRequestBody {
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'invoke_function' | 'rpc'
  table: string
  functionName?: string
  params?: Record<string, any>
  data?: Record<string, any> | Record<string, any>[]
  select?: string
  filters?: {
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
  order?: { column: string; ascending?: boolean }
  limit?: number
  single?: boolean
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate: read access token from Authorization header
    //    (the shared auth-hook stores sessions in localStorage, not cookies,
    //     so we pass the token via header from adminApi)
    const authHeader = request.headers.get('Authorization')
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the token via Supabase Auth REST API directly.
    // The apikey header must be the publishable/anon key (not the service key).
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': anonKey,
      },
    })

    if (!authResponse.ok) {
      console.error('Admin API: auth validation failed:', authResponse.status)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await authResponse.json()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create service client for data operations
    const serviceClient = getServiceClient()

    // 2. Verify admin role
    const { data: staffRow } = await serviceClient
      .from('staff_members')
      .select('id, roles')
      .eq('email', user.email.toLowerCase())
      .maybeSingle()

    if (!staffRow || !staffRow.roles?.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 })
    }

    // 3. Parse and validate request
    const body: AdminRequestBody = await request.json()
    const { action, table, data, select: selectClause, filters, order, limit, single } = body

    // Handle function invocation separately — no table needed
    if (action === 'invoke_function') {
      const { functionName, body: fnBody } = body as any
      if (!functionName) {
        return NextResponse.json({ error: 'functionName is required' }, { status: 400 })
      }
      const { data: fnResult, error: fnError } = await serviceClient.functions.invoke(functionName, {
        body: fnBody || {},
      })
      if (fnError) {
        return NextResponse.json({ error: fnError.message }, { status: 400 })
      }
      return NextResponse.json({ data: fnResult })
    }

    // Handle RPC calls separately — no table needed
    if (action === 'rpc') {
      const { functionName, params } = body as any
      if (!functionName) {
        return NextResponse.json({ error: 'functionName is required for rpc' }, { status: 400 })
      }
      const { data: rpcResult, error: rpcError } = await serviceClient.rpc(functionName, params || {})
      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 400 })
      }
      return NextResponse.json({ data: rpcResult })
    }

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: `Table '${table}' is not allowed` }, { status: 400 })
    }

    if (!['select', 'insert', 'update', 'delete', 'upsert'].includes(action)) {
      return NextResponse.json({ error: `Invalid action '${action}'` }, { status: 400 })
    }

    // 4. Execute operation with service_role client
    let query: any

    switch (action) {
      case 'select': {
        query = serviceClient.from(table).select(selectClause || '*', { count: 'exact' })
        break
      }
      case 'insert': {
        if (!data) return NextResponse.json({ error: 'data is required for insert' }, { status: 400 })
        query = serviceClient.from(table).insert(data).select()
        break
      }
      case 'update': {
        if (!data) return NextResponse.json({ error: 'data is required for update' }, { status: 400 })
        query = serviceClient.from(table).update(data)
        break
      }
      case 'delete': {
        query = serviceClient.from(table).delete()
        break
      }
      case 'upsert': {
        if (!data) return NextResponse.json({ error: 'data is required for upsert' }, { status: 400 })
        query = serviceClient.from(table).upsert(data).select()
        break
      }
    }

    // Apply filters
    if (filters) {
      if (filters.eq) {
        for (const [col, val] of Object.entries(filters.eq)) {
          query = query.eq(col, val)
        }
      }
      if (filters.neq) {
        for (const [col, val] of Object.entries(filters.neq)) {
          query = query.neq(col, val)
        }
      }
      if (filters.in) {
        for (const [col, vals] of Object.entries(filters.in)) {
          query = query.in(col, vals)
        }
      }
      if (filters.is) {
        for (const [col, val] of Object.entries(filters.is)) {
          query = query.is(col, val)
        }
      }
      if (filters.gt) {
        for (const [col, val] of Object.entries(filters.gt)) {
          query = query.gt(col, val)
        }
      }
      if (filters.gte) {
        for (const [col, val] of Object.entries(filters.gte)) {
          query = query.gte(col, val)
        }
      }
      if (filters.lt) {
        for (const [col, val] of Object.entries(filters.lt)) {
          query = query.lt(col, val)
        }
      }
      if (filters.lte) {
        for (const [col, val] of Object.entries(filters.lte)) {
          query = query.lte(col, val)
        }
      }
      if (filters.ilike) {
        for (const [col, val] of Object.entries(filters.ilike)) {
          query = query.ilike(col, val)
        }
      }
    }

    // Apply ordering
    if (order) {
      query = query.order(order.column, { ascending: order.ascending ?? true })
    }

    // Apply limit
    if (limit) {
      query = query.limit(limit)
    }

    // Apply single
    if (single) {
      query = query.single()
    }

    const { data: result, error: queryError, count } = await query

    if (queryError) {
      return NextResponse.json(
        { error: queryError.message, code: queryError.code, details: queryError.details },
        { status: 400 }
      )
    }

    return NextResponse.json({ data: result, count })

  } catch (e: any) {
    console.error('Admin API error:', e)
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 })
  }
}
