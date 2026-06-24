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
  'tutorial_sections',
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
  'subscription_tiers',
  'subscription_tier_price_history',
  // Post policies
  'post_type_policies',
  // Redemption methods
  'available_redemption_methods',
  'available_redemption_method_instruments',
  'instrument_queuing_status',
  // Tax
  'category_tax_rules',
  'tax_reporting_thresholds',
  // Campaigns & CRM
  'incentive_campaigns',
  'campaign_rewards',
  'campaign_zones',
  'crm_sequences',
  'crm_sequence_enrollments',
  'crm_audiences',
  'crm_data_sources',
  'crm_promotions',
  'crm_landing_pages',
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
  'quarantine_bot_health',
  // Facebook post queue (admin moderation)
  'fb_post_queue',
  'fb_auto_post_log',
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
  console.log('[Admin API] POST request received');
  try {
    // 1. Authenticate: read access token from Authorization header
    //    (the shared auth-hook stores sessions in localStorage, not cookies,
    //     so we pass the token via header from adminApi)
    const authHeader = request.headers.get('Authorization')
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    console.log('[Admin API] Access token present:', !!accessToken);
    if (!accessToken) {
      console.log('[Admin API] Unauthorized: No access token provided');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // --- MCO Phase 2: In-Memory Token Caching ---
    // Instead of sequentially querying GoTrue then Postgres for every single dashboard request,
    // we cache the verified admin state tightly against the JWT signature to collapse latency.
    
    // Static module-level cache (persists across Next.js API hot-requests)
    const CACHE_TTL_MS = 60 * 1000; // 1 minute
    let cachedUser = (global as any).__adminAuthCache?.get(accessToken);
    let userRoles: string[] | null = null;

    if (cachedUser && cachedUser.expiresAt > Date.now()) {
      console.log('[Admin API] Auth Cache HIT');
      userRoles = cachedUser.roles;
    } else {
      console.log('[Admin API] Auth Cache MISS - executing verification waterfall');
      // Not cached or expired: execute verification waterfall
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
      
      console.log('[Admin API] Fetching user info from Supabase Auth URL:', `${supabaseUrl}/auth/v1/user`);
      const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': anonKey,
        },
      })
      console.log('[Admin API] Fetching user response status:', authResponse.status);

      if (!authResponse.ok) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const user = await authResponse.json()
      console.log('[Admin API] User email fetched:', user?.email);
      if (!user?.email) {
        console.log('[Admin API] User has no email associated');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      console.log('[Admin API] Querying staff_members for:', user.email.toLowerCase());
      const serviceClient = getServiceClient()
      const { data: staffRow, error: staffError } = await serviceClient
        .from('staff_members')
        .select('id, roles')
        .eq('email', user.email.toLowerCase())
        .maybeSingle()

      console.log('[Admin API] Staff query finished. Row:', staffRow, 'Error:', staffError);

      const hasAdmin = staffRow?.roles?.includes('admin')
      const hasMarketing = staffRow?.roles?.includes('marketing')

      if (!staffRow || (!hasAdmin && !hasMarketing)) {
        console.log('[Admin API] Access forbidden: user is not authorized. Roles:', staffRow?.roles);
        return NextResponse.json({ error: 'Forbidden: admin or marketing role required' }, { status: 403 })
      }
      
      userRoles = staffRow.roles;
      
      // Update the cache safely globally
      if (!(global as any).__adminAuthCache) {
          (global as any).__adminAuthCache = new Map<string, any>();
      }
      // Keep map small to avoid silent OOMs 
      if ((global as any).__adminAuthCache.size > 200) (global as any).__adminAuthCache.clear();
      
      (global as any).__adminAuthCache.set(accessToken, { 
        roles: staffRow.roles,
        expiresAt: Date.now() + CACHE_TTL_MS 
      });
    }

    if (!userRoles || (!userRoles.includes('admin') && !userRoles.includes('marketing'))) {
       return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Create service client for data operations
    const serviceClient = getServiceClient()

    // 3. Parse and validate request
    const body: AdminRequestBody = await request.json()
    console.log('[Admin API] Parsed body:', JSON.stringify(body));
    const { action, table, data, select: selectClause, filters, order, limit, single } = body

    // 4. Role-based API permission boundary check for non-admins (marketing role)
    const isAdmin = userRoles.includes('admin')
    const isMarketing = userRoles.includes('marketing')

    if (!isAdmin) {
      if (!isMarketing) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Check if it is a write/mutate operation
      const isWrite = ['insert', 'update', 'delete', 'upsert'].includes(action)

      // Whitelisted CRM tables for write/mutate operations
      const CRM_WRITE_WHITELIST = new Set([
        'crm_sequences',
        'crm_sequence_enrollments',
        'crm_audiences',
        'crm_data_sources',
        'crm_promotions',
        'crm_landing_pages',
        'crm_leads',
        'crm_assets',
        'tutorial_sections',
      ])

      // Blacklisted sensitive tables for read operations
      const SENSITIVE_READ_BLACKLIST = new Set([
        'staff_members',
        'platform_bank_ledger',
        'market_settlements',
        'settlement_captures',
        'user_settlements',
      ])

      if (isWrite) {
        if (!table || !CRM_WRITE_WHITELIST.has(table)) {
          console.log('[Admin API] Write blocked for marketing user on table:', table);
          return NextResponse.json({ error: 'Forbidden: Write access not allowed on this table' }, { status: 403 })
        }
      } else {
        // Read operations (select, rpc, invoke_function)
        if (table && SENSITIVE_READ_BLACKLIST.has(table)) {
          console.log('[Admin API] Read blocked for marketing user on sensitive table:', table);
          return NextResponse.json({ error: 'Forbidden: Access to this table is restricted' }, { status: 403 })
        }
      }
    }

    // Handle function invocation separately — no table needed
    if (action === 'invoke_function') {
      const { functionName, body: fnBody } = body as any
      if (!functionName) {
        return NextResponse.json({ error: 'functionName is required' }, { status: 400 })
      }

      // Wrap invocation in a 55-second timeout so the admin UI never hangs indefinitely.
      // Supabase Edge Functions have a 60s default timeout; we cut slightly short
      // so the admin always gets a clean error instead of a browser timeout.
      const invokePromise = serviceClient.functions.invoke(functionName, {
        body: fnBody || {},
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Edge Function '${functionName}' did not respond within 55 seconds. It may still be running — check the Supabase Dashboard logs.`)), 55_000)
      )

      let fnResult: any
      let fnError: any
      try {
        const result = await Promise.race([invokePromise, timeoutPromise])
        fnResult = result.data
        fnError = result.error
      } catch (timeoutErr: any) {
        return NextResponse.json({ error: timeoutErr.message }, { status: 504 })
      }

      if (fnError) {
        // Surface as much detail as possible for debugging
        const errMsg = typeof fnError === 'object' && fnError.context
          ? `${fnError.message} — ${JSON.stringify(fnError.context)}`
          : fnError.message || String(fnError)
        console.error(`[Admin] Edge Function '${functionName}' error:`, fnError)
        return NextResponse.json({ error: errMsg }, { status: 400 })
      }
      return NextResponse.json({ data: fnResult })
    }

    // Handle RPC calls separately — no table needed
    // Use the caller's access token so auth.uid() resolves inside SECURITY DEFINER functions.
    // Admin role was already validated above, so this is safe.
    if (action === 'rpc') {
      const { functionName, params } = body as any
      if (!functionName) {
        return NextResponse.json({ error: 'functionName is required for rpc' }, { status: 400 })
      }
      // Create a user-scoped client using their JWT so auth.uid() works in RPCs
      const anonKeyForRpc = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
      const userScopedClient = createClient(supabaseUrl, anonKeyForRpc, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      })
      const { data: rpcResult, error: rpcError } = await userScopedClient.rpc(functionName, params || {})
      if (rpcError) {
        console.error('RPC Error details:', rpcError)
        return NextResponse.json({ error: rpcError.message || rpcError }, { status: 400 })
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

    console.log('[Admin API] Executing query on table:', table, 'action:', action);
    const { data: result, error: queryError, count } = await query
    console.log('[Admin API] Query execution finished. Error:', queryError, 'Result:', result);

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
