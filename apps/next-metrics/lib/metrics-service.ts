'use client'

/**
 * Metrics Service — data-fetching functions for the metrics dashboard.
 *
 * Each function attempts to call a SECURITY DEFINER RPC first, and falls back
 * to locally-generated demo data if the RPC doesn't exist yet. This allows the
 * app to work standalone before the DB migration is applied.
 */

import { supabase } from './supabase'

// ─── Demo Mode Tracking ─────────────────────────────────────────────────────
// Set to true when any RPC fails and we fall back to demo data.
// Dashboard reads this to show a "Demo Data" banner.
let _isDemoMode = false
export function getIsDemoMode(): boolean { return _isDemoMode }
export function resetDemoMode(): void { _isDemoMode = false }

const isLocal = !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes('localhost') ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes('127.0.0.1');

function markDemo() {
  _isDemoMode = true;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GeoFilter {
  country_code?: string
  state_code?: string
  city?: string
  zip_code?: string
}

export interface DateRange {
  start: string  // ISO date
  end: string    // ISO date
}

export type Granularity = 'daily' | 'weekly' | 'monthly'

export interface TimeSeriesPoint {
  date: string
  value: number
}

export interface UserGrowthData {
  timeSeries: TimeSeriesPoint[]
  cumulative: TimeSeriesPoint[]
  byGeo: { region: string; count: number }[]
  total: number
  newInPeriod: number
}

export interface SalesSummaryData {
  gmvTimeSeries: TimeSeriesPoint[]
  orderCountTimeSeries: TimeSeriesPoint[]
  avgOrderValue: number
  totalGMV: number
  totalOrders: number
  totalTax: number
  totalFees: number
  fulfillmentSplit: { type: string; count: number }[]
  topProducts: { name: string; revenue: number; orders: number }[]
  topSellers: { name: string; revenue: number; orders: number }[]
}

export interface PayoutData {
  methodTrends: { date: string; giftcards: number; charity: number; cashout: number }[]
  methodTotals: { method: string; amount: number; count: number }[]
  /** Instrument-level breakdown (e.g. Gift Cards → Reloadly vs Tremendous) */
  instrumentTotals: { method: string; instrument: string; amount: number; count: number }[]
  successRates: { method: string; success: number; failure: number }[]
}

export interface PageAnalyticsRow {
  route: string
  pageLoads: number
  uniqueUsers: number
  avgDwellTime: number
  /** % of visits with no interaction (no click/scroll/input) before leaving */
  bounceRate: number
  /** % of users who started a multi-step flow on this page but abandoned before completing */
  dropOffRate: number
  errors: number
}

export interface PageAnalyticsData {
  routes: PageAnalyticsRow[]
  dropOffDistribution: { route: string; count: number }[]
  errorHotspots: { route: string; errorName: string; count: number }[]
  sessionDurations: { bucket: string; count: number }[]
}

export interface MarketplaceHealthData {
  activeSellers: TimeSeriesPoint[]
  activeBuyers: TimeSeriesPoint[]
  newBooths: TimeSeriesPoint[]
  productListings: { active: number; inactive: number }
  flagActivity: TimeSeriesPoint[]
  avgSellerRating: number
}

export interface CommunityChatData {
  dailyActiveUsers: TimeSeriesPoint[]
  userGrowth: TimeSeriesPoint[]
  totalMessages: number
  avgDailyActiveUsers: number
}

export interface SettlementData {
  dailySummary: { date: string; captured: number; released: number; refunded: number }[]
  payoutTotals: number
  recentSettlements: { date: string; status: string; orders: number; captured: number; payouts: number }[]
}

export interface PlatformUsageRow {
  os: string
  pwa_users: number
  browser_users: number
  pwa_sessions: number
  browser_sessions: number
}

export interface PlatformUsageData {
  platformUsage: PlatformUsageRow[]
}

export interface LogEntry {
  id: string
  timestamp: string
  /** Full user UUID — only shown on explicit reveal */
  userId: string
  /** Pseudonymized display: short hash like 'usr_a7f3' */
  userIdShort: string
  /** Full display name / email — only populated on explicit reveal */
  userName: string | null
  eventType: string
  eventName: string
  pagePath: string
  sessionId: string
  txnId: string | null
  /** For button_click / form_submit: which element triggered the event */
  elementId: string | null
  elementLabel: string | null
  /** For error events: stack trace string */
  stackTrace: string | null
  metadata: Record<string, any>
}

/** Pseudonymize a user ID for display (deterministic short hash) */
export function pseudonymize(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return 'usr_' + Math.abs(hash).toString(36).slice(0, 5)
}

/** Reveal full user info on demand (would hit a separate RPC in production) */
export async function revealUser(userId: string): Promise<{ email: string; displayName: string }> {
  try {
    const { data, error } = await supabase.rpc('metrics_reveal_user', { target_user_id: userId })
    if (!error && data && !data?.error) return data as { email: string; displayName: string }
  } catch {}

  // Demo fallback
  const num = parseInt(userId.replace(/\D/g, '')) || 1
  const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com']
  const names = ['Alex', 'Jordan', 'Casey', 'Morgan', 'Riley', 'Sam', 'Taylor', 'Quinn']
  const name = names[num % names.length]!
  const initial = name[0]!.toLowerCase()
  return {
    displayName: `${name} ${String.fromCharCode(65 + (num % 26))}.`,
    email: `${initial}${'*'.repeat(4)}@${domains[num % domains.length]}`,
  }
}

export interface LogSearchResult {
  entries: LogEntry[]
  totalCount: number
}

// ─── Demo Data Generators ───────────────────────────────────────────────────

function generateTimeSeries(days: number, baseValue: number, variance: number, trend = 0.02): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const trendFactor = 1 + (trend * (days - i) / days)
    const noise = (Math.random() - 0.5) * 2 * variance
    // Add weekend dip for realism
    const dayOfWeek = d.getDay()
    const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.6 : 1
    const value = Math.max(0, Math.round((baseValue * trendFactor + noise) * weekendFactor))
    points.push({ date: d.toISOString().split('T')[0]!, value })
  }
  return points
}

function generateCumulative(series: TimeSeriesPoint[], startValue: number): TimeSeriesPoint[] {
  let total = startValue
  return series.map(p => {
    total += p.value
    return { date: p.date, value: total }
  })
}

// ─── Service Functions ──────────────────────────────────────────────────────

export interface WeeklyTrendPoint {
  weekLabel: string;
  signups: number;
  listings: number;
  leads: number;
  shares: number;
}

export async function fetchWeeklyTrends(weeksCount = 8): Promise<WeeklyTrendPoint[]> {
  const now = new Date();
  
  // Find the start of the current week (Monday)
  const currentDay = now.getDay();
  const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
  const startOfCurrentWeek = new Date(now);
  startOfCurrentWeek.setDate(now.getDate() - distanceToMonday);
  startOfCurrentWeek.setHours(0, 0, 0, 0);

  // Go back weeksCount weeks from the start of the current week
  const startOfPeriod = new Date(startOfCurrentWeek);
  startOfPeriod.setDate(startOfPeriod.getDate() - (weeksCount - 1) * 7);

  const startDateStr = startOfPeriod.toISOString();

  // Query database tables directly
  const [profilesRes, productsRes, leadsRes, sharesRes] = await Promise.all([
    supabase.from('profiles').select('created_at').gte('created_at', startDateStr),
    supabase.from('market_products').select('created_at').eq('is_deleted', false).gte('created_at', startDateStr),
    supabase.from('crm_leads').select('created_at').gte('created_at', startDateStr),
    supabase.from('growbot_shared_responses').select('created_at').gte('created_at', startDateStr)
  ]);

  const profiles = profilesRes.data || [];
  const products = productsRes.data || [];
  const leads = leadsRes.data || [];
  const shares = sharesRes.data || [];

  const trendPoints: WeeklyTrendPoint[] = [];
  for (let i = 0; i < weeksCount; i++) {
    const weekStart = new Date(startOfPeriod);
    weekStart.setDate(weekStart.getDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const signupsCount = profiles.filter((p: any) => {
      const d = new Date(p.created_at);
      return d >= weekStart && d < weekEnd;
    }).length;

    const listingsCount = products.filter((p: any) => {
      const d = new Date(p.created_at);
      return d >= weekStart && d < weekEnd;
    }).length;

    const leadsCount = leads.filter((p: any) => {
      const d = new Date(p.created_at);
      return d >= weekStart && d < weekEnd;
    }).length;

    const sharesCount = shares.filter((p: any) => {
      const d = new Date(p.created_at);
      return d >= weekStart && d < weekEnd;
    }).length;

    trendPoints.push({
      weekLabel: label,
      signups: signupsCount,
      listings: listingsCount,
      leads: leadsCount,
      shares: sharesCount
    });
  }

  return trendPoints;
}


export async function fetchUserGrowth(
  dateRange: DateRange,
  granularity: Granularity,
  geoFilter?: GeoFilter
): Promise<UserGrowthData> {
  // Try RPC first
  try {
    const { data, error } = await supabase.rpc('metrics_user_growth', {
      p_start: dateRange.start,
      p_end: dateRange.end,
      p_granularity: granularity,
      p_state: geoFilter?.state_code || null,
      p_city: geoFilter?.city || null,
      p_zip: geoFilter?.zip_code || null,
    })
    if (!error && data && !data?.error) return data as UserGrowthData
  } catch {}

  // Fallback: demo data
  markDemo()
  const days = 30
  const timeSeries = generateTimeSeries(days, 12, 5, 0.03)
  const newInPeriod = timeSeries.reduce((s, p) => s + p.value, 0)
  return {
    timeSeries,
    cumulative: generateCumulative(timeSeries, 850),
    byGeo: [
      { region: 'California', count: 89 },
      { region: 'Texas', count: 67 },
      { region: 'New York', count: 54 },
      { region: 'Florida', count: 43 },
      { region: 'Illinois', count: 31 },
      { region: 'Washington', count: 28 },
      { region: 'Oregon', count: 22 },
      { region: 'Colorado', count: 19 },
    ],
    total: 850 + newInPeriod,
    newInPeriod,
  }
}

export async function fetchSalesSummary(
  dateRange: DateRange,
  granularity: Granularity,
  geoFilter?: GeoFilter
): Promise<SalesSummaryData> {
  try {
    const { data, error } = await supabase.rpc('metrics_sales_summary', {
      p_start: dateRange.start,
      p_end: dateRange.end,
      p_granularity: granularity,
      p_state: geoFilter?.state_code || null,
      p_city: geoFilter?.city || null,
      p_zip: geoFilter?.zip_code || null,
    })
    if (!error && data && !data?.error) return data as SalesSummaryData
  } catch {}

  markDemo()
  const days = 30
  const gmvTimeSeries = generateTimeSeries(days, 2400, 800, 0.04)
  const orderCountTimeSeries = generateTimeSeries(days, 35, 12, 0.03)
  const totalGMV = gmvTimeSeries.reduce((s, p) => s + p.value, 0)
  const totalOrders = orderCountTimeSeries.reduce((s, p) => s + p.value, 0)

  return {
    gmvTimeSeries,
    orderCountTimeSeries,
    avgOrderValue: Math.round(totalGMV / totalOrders),
    totalGMV,
    totalOrders,
    totalTax: Math.round(totalGMV * 0.082),
    totalFees: Math.round(totalGMV * 0.029),
    fulfillmentSplit: [
      { type: 'Delivery', count: Math.round(totalOrders * 0.45) },
      { type: 'Pickup', count: Math.round(totalOrders * 0.55) },
    ],
    topProducts: [
      { name: 'Organic Tomatoes', revenue: 4250, orders: 156 },
      { name: 'Fresh Basil Bundle', revenue: 3100, orders: 210 },
      { name: 'Artisan Sourdough', revenue: 2800, orders: 140 },
      { name: 'Heritage Eggs (dozen)', revenue: 2650, orders: 188 },
      { name: 'Wildflower Honey', revenue: 2200, orders: 102 },
    ],
    topSellers: [
      { name: 'Green Valley Farm', revenue: 8200, orders: 312 },
      { name: 'Sunrise Bakery', revenue: 6100, orders: 245 },
      { name: 'Happy Hen Ranch', revenue: 5400, orders: 198 },
      { name: 'Mountain Herb Co.', revenue: 4300, orders: 167 },
      { name: 'Coastal Produce', revenue: 3900, orders: 145 },
    ],
  }
}

export async function fetchPayoutTrends(
  dateRange: DateRange,
  geoFilter?: GeoFilter
): Promise<PayoutData> {
  try {
    const { data, error } = await supabase.rpc('metrics_payout_trends', {
      p_start: dateRange.start,
      p_end: dateRange.end,
      p_state: geoFilter?.state_code || null,
      p_city: geoFilter?.city || null,
      p_zip: geoFilter?.zip_code || null,
    })
    if (!error && data && !data?.error) return data as PayoutData
  } catch {}

  markDemo()
  const days = 30
  const now = new Date()
  const methodTrends = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    methodTrends.push({
      date: d.toISOString().split('T')[0]!,
      giftcards: Math.round(15 + Math.random() * 10),
      charity: Math.round(5 + Math.random() * 8),
      cashout: Math.round(8 + Math.random() * 6),
    })
  }

  return {
    methodTrends,
    methodTotals: [
      { method: 'Gift Cards', amount: 12450.00, count: 487 },
      { method: 'Charity Donation', amount: 5200.00, count: 203 },
      { method: 'Cash Out ($)', amount: 8100.00, count: 312 },
    ],
    instrumentTotals: [
      { method: 'Gift Cards', instrument: 'Reloadly', amount: 7230.00, count: 283 },
      { method: 'Gift Cards', instrument: 'Tremendous', amount: 5220.00, count: 204 },
      { method: 'Charity Donation', instrument: 'Direct', amount: 5200.00, count: 203 },
      { method: 'Cash Out ($)', instrument: 'Stripe Payout', amount: 8100.00, count: 312 },
    ],
    successRates: [
      { method: 'Gift Cards', success: 96, failure: 4 },
      { method: 'Charity Donation', success: 99, failure: 1 },
      { method: 'Cash Out ($)', success: 91, failure: 9 },
    ],
  }
}

export async function fetchPageAnalytics(
  dateRange: DateRange,
  geoFilter?: GeoFilter,
  utmFilter?: any
): Promise<PageAnalyticsData> {
  try {
    const { data, error } = await supabase.rpc('metrics_page_analytics', {
      p_start: dateRange.start,
      p_end: dateRange.end,
      p_state: geoFilter?.state_code || null,
      p_city: geoFilter?.city || null,
      p_zip: geoFilter?.zip_code || null,
      p_utm_source: utmFilter?.utm_source || null,
      p_utm_medium: utmFilter?.utm_medium || null,
      p_utm_campaign: utmFilter?.utm_campaign || null,
      p_utm_term: utmFilter?.utm_term || null,
    })
    if (!error && data && !data?.error) return data as PageAnalyticsData
  } catch {}

  // Demo fallback
  markDemo()
  return {
    routes: [
      { route: '/', pageLoads: 12400, uniqueUsers: 8900, avgDwellTime: 45, bounceRate: 25, dropOffRate: 15, errors: 2 },
      { route: '/market', pageLoads: 8500, uniqueUsers: 5400, avgDwellTime: 120, bounceRate: 15, dropOffRate: 35, errors: 5 },
    ],
    dropOffDistribution: [{ route: '/checkout', count: 150 }, { route: '/signup', count: 85 }],
    errorHotspots: [{ route: '/checkout', errorName: 'PaymentFailed', count: 12 }],
    sessionDurations: [{ bucket: '1-3m', count: 450 }, { bucket: '3-10m', count: 280 }],
  }
}

export async function fetchMarketplaceHealth(
  dateRange: DateRange,
  geoFilter?: GeoFilter
): Promise<MarketplaceHealthData> {
  try {
    const { data, error } = await supabase.rpc('metrics_marketplace_health', {
      p_start: dateRange.start,
      p_end: dateRange.end,
      p_state: geoFilter?.state_code || null,
      p_city: geoFilter?.city || null,
      p_zip: geoFilter?.zip_code || null,
    })
    if (!error && data && !data?.error) return data as MarketplaceHealthData
  } catch {}

  markDemo()
  const days = 30
  return {
    activeSellers: generateTimeSeries(days, 45, 8, 0.02),
    activeBuyers: generateTimeSeries(days, 120, 25, 0.04),
    newBooths: generateTimeSeries(days, 3, 2, 0.01),
    productListings: { active: 342, inactive: 89 },
    flagActivity: generateTimeSeries(days, 4, 3, -0.01),
    avgSellerRating: 4.3,
  }
}

export async function fetchCommunityChatMetrics(
  dateRange: DateRange,
  granularity: Granularity,
  geoFilter?: GeoFilter
): Promise<CommunityChatData> {
  try {
    const { data, error } = await supabase.rpc('metrics_community_chat', {
      p_start: dateRange.start,
      p_end: dateRange.end,
      p_granularity: granularity,
      p_state: geoFilter?.state_code || null,
      p_city: geoFilter?.city || null,
      p_zip: geoFilter?.zip_code || null,
    })
    if (!error && data && !data?.error) return data as CommunityChatData
  } catch {}

  markDemo()
  const days = 30
  return {
    dailyActiveUsers: generateTimeSeries(days, 18, 5, 0.05),
    userGrowth: generateCumulative(generateTimeSeries(days, 8, 3, 0.02), 120),
    totalMessages: 3450,
    avgDailyActiveUsers: 22,
  }
}

export async function fetchSettlementSummary(
  dateRange: DateRange
): Promise<SettlementData> {
  try {
    const { data, error } = await supabase.rpc('metrics_settlement_summary', {
      p_start: dateRange.start,
      p_end: dateRange.end,
    })
    if (!error && data && !data?.error) return data as SettlementData
  } catch {}

  markDemo()
  const days = 30
  const now = new Date()
  const dailySummary = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const captured = Math.round(2000 + Math.random() * 1500)
    dailySummary.push({
      date: d.toISOString().split('T')[0]!,
      captured,
      released: Math.round(captured * 0.85),
      refunded: Math.round(captured * 0.03),
    })
  }

  return {
    dailySummary,
    payoutTotals: dailySummary.reduce((s, d) => s + d.released, 0),
    recentSettlements: [
      { date: '2026-03-16', status: 'completed', orders: 42, captured: 3240, payouts: 2856 },
      { date: '2026-03-15', status: 'completed', orders: 38, captured: 2980, payouts: 2621 },
      { date: '2026-03-14', status: 'completed', orders: 45, captured: 3560, payouts: 3134 },
      { date: '2026-03-13', status: 'completed', orders: 33, captured: 2650, payouts: 2332 },
      { date: '2026-03-12', status: 'pending', orders: 41, captured: 3180, payouts: 0 },
    ],
  }
}

export async function fetchPlatformUsage(
  dateRange: DateRange
): Promise<PlatformUsageData> {
  try {
    const { data, error } = await supabase.rpc('metrics_platform_usage', {
      p_start: dateRange.start,
      p_end: dateRange.end,
    })
    if (!error && data && !data?.error) return data as PlatformUsageData
  } catch {}

  // Demo fallback
  markDemo()
  return {
    platformUsage: [
      { os: 'iOS', pwa_users: 145, browser_users: 89, pwa_sessions: 1230, browser_sessions: 456 },
      { os: 'Android', pwa_users: 112, browser_users: 67, pwa_sessions: 980, browser_sessions: 312 },
      { os: 'macOS', pwa_users: 23, browser_users: 156, pwa_sessions: 210, browser_sessions: 1340 },
      { os: 'Windows', pwa_users: 8, browser_users: 98, pwa_sessions: 65, browser_sessions: 780 },
      { os: 'Other', pwa_users: 3, browser_users: 12, pwa_sessions: 18, browser_sessions: 54 },
    ],
  }
}

export async function searchLogs(
  searchText: string,
  eventType: string,
  dateRange: DateRange,
  page: number,
  pageSize: number
): Promise<LogSearchResult> {
  try {
    const { data, error } = await supabase.rpc('metrics_search_logs', {
      p_query: searchText,
      p_event_type: eventType || '',
      p_start: dateRange.start,
      p_end: dateRange.end,
      p_page: page,
      p_page_size: pageSize,
    })
    if (!error && data && !data?.error) return data as LogSearchResult
  } catch {}

  // Demo data
  markDemo()
  const eventTypes = ['page_view', 'button_click', 'form_submit', 'error']
  // Event defs: [name, elementId, elementLabel, route]
  const eventDefs: Record<string, { name: string; elementId: string | null; elementLabel: string | null; route: string }[]> = {
    page_view: [
      { name: 'View Market', elementId: null, elementLabel: null, route: '/market' },
      { name: 'View Booth', elementId: null, elementLabel: null, route: '/market/booth/3' },
      { name: 'View Product', elementId: null, elementLabel: null, route: '/market/product/12' },
      { name: 'View Profile', elementId: null, elementLabel: null, route: '/profile' },
      { name: 'View Earnings', elementId: null, elementLabel: null, route: '/earnings' },
      { name: 'View Chat', elementId: null, elementLabel: null, route: '/chat' },
    ],
    button_click: [
      { name: 'Add to Cart', elementId: 'btn-add-to-cart', elementLabel: 'Add to Cart', route: '/market/product/12' },
      { name: 'Follow Booth', elementId: 'btn-follow', elementLabel: 'Follow', route: '/market/booth/3' },
      { name: 'Send Message', elementId: 'btn-send-msg', elementLabel: 'Send', route: '/chat/conv/5' },
      { name: 'Buy Now', elementId: 'btn-buy-now', elementLabel: 'Buy Now', route: '/market/product/8' },
      { name: 'Request Payout', elementId: 'btn-request-payout', elementLabel: 'Cash Out', route: '/earnings/payout' },
      { name: 'Apply Coupon', elementId: 'btn-apply-coupon', elementLabel: 'Apply', route: '/market/order/new' },
    ],
    form_submit: [
      { name: 'Place Order', elementId: 'form-checkout', elementLabel: 'Place Order', route: '/market/order/new' },
      { name: 'Submit Review', elementId: 'form-review', elementLabel: 'Submit Review', route: '/market/product/12' },
      { name: 'Update Profile', elementId: 'form-profile', elementLabel: 'Save Changes', route: '/profile' },
      { name: 'Create Booth', elementId: 'form-booth-setup', elementLabel: 'Create Booth', route: '/my-booth' },
      { name: 'Add Product', elementId: 'form-add-product', elementLabel: 'Publish', route: '/my-booth/products/new' },
    ],
    error: [
      { name: 'PaymentProcessError', elementId: null, elementLabel: null, route: '/market/order/new' },
      { name: 'GeolocationTimeout', elementId: null, elementLabel: null, route: '/market' },
      { name: 'ImageUploadFailed', elementId: null, elementLabel: null, route: '/my-booth/products/new' },
      { name: 'NetworkError', elementId: null, elementLabel: null, route: '/chat' },
    ],
  }

  const errorStacks: string[] = [
    'Error: Payment declined\n  at processPayment (checkout.ts:142)\n  at handleSubmit (OrderForm.tsx:89)\n  at onClick (Button.tsx:23)',
    'Error: Geolocation timed out\n  at getCurrentPosition (geocode.ts:34)\n  at loadMarket (market/page.tsx:67)',
    'Error: Upload failed: 413 Payload Too Large\n  at uploadImage (storage.ts:55)\n  at handleDrop (ImageDropzone.tsx:41)',
    'Error: WebSocket connection lost\n  at reconnect (realtime.ts:112)\n  at onClose (chat.ts:78)',
  ]

  const entries: LogEntry[] = []

  for (let i = 0; i < pageSize; i++) {
    const d = new Date()
    d.setMinutes(d.getMinutes() - (page - 1) * pageSize - i * 3)
    const et = eventTypes[Math.floor(Math.random() * eventTypes.length)]!
    const defs = eventDefs[et]!
    const def = defs[Math.floor(Math.random() * defs.length)]!
    entries.push({
      id: `log-${page}-${i}`,
      timestamp: d.toISOString(),
      userId: `user-${Math.floor(Math.random() * 200) + 1}`,
      userIdShort: pseudonymize(`user-${Math.floor(Math.random() * 200) + 1}`),
      userName: null,
      eventType: et,
      eventName: def.name,
      pagePath: def.route,
      sessionId: `sess-${Math.floor(Math.random() * 50) + 1}`,
      txnId: et === 'form_submit' ? `txn-${Math.floor(Math.random() * 100) + 1}` : null,
      elementId: def.elementId,
      elementLabel: def.elementLabel,
      stackTrace: et === 'error' ? errorStacks[Math.floor(Math.random() * errorStacks.length)]! : null,
      metadata: {},
    })
  }

  return { entries, totalCount: 500 }
}

export async function fetchSessionTimeline(sessionId: string): Promise<LogEntry[]> {
  // Demo: generate a plausible session timeline
  const events = [
    { eventType: 'page_view', eventName: 'View Market', pagePath: '/market', elementId: null, elementLabel: null },
    { eventType: 'page_view', eventName: 'View Booth', pagePath: '/market/booth/3', elementId: null, elementLabel: null },
    { eventType: 'button_click', eventName: 'View Product', pagePath: '/market/booth/3', elementId: 'btn-product-12', elementLabel: 'Organic Tomatoes' },
    { eventType: 'page_view', eventName: 'View Product', pagePath: '/market/product/12', elementId: null, elementLabel: null },
    { eventType: 'button_click', eventName: 'Add to Cart', pagePath: '/market/product/12', elementId: 'btn-add-to-cart', elementLabel: 'Add to Cart' },
    { eventType: 'page_view', eventName: 'Checkout', pagePath: '/market/order/new', elementId: null, elementLabel: null },
    { eventType: 'form_submit', eventName: 'Place Order', pagePath: '/market/order/new', elementId: 'form-checkout', elementLabel: 'Place Order' },
  ]

  const now = new Date()
  return events.map((e, i) => {
    const d = new Date(now)
    d.setMinutes(d.getMinutes() - (events.length - i) * 2)
    return {
      id: `session-event-${i}`,
      timestamp: d.toISOString(),
      userId: 'user-42',
      userIdShort: pseudonymize('user-42'),
      userName: null,
      ...e,
      sessionId,
      txnId: e.eventType === 'form_submit' ? 'txn-99' : null,
      stackTrace: null,
      metadata: {},
    }
  })
}

export async function fetchTransactionFlow(txnId: string): Promise<LogEntry[]> {
  const events = [
    { eventType: 'page_view', eventName: 'View Product', pagePath: '/market/product/12', elementId: null, elementLabel: null },
    { eventType: 'button_click', eventName: 'Add to Cart', pagePath: '/market/product/12', elementId: 'btn-add-to-cart', elementLabel: 'Add to Cart' },
    { eventType: 'page_view', eventName: 'Checkout', pagePath: '/market/order/new', elementId: null, elementLabel: null },
    { eventType: 'form_submit', eventName: 'Submit Payment', pagePath: '/market/order/new', elementId: 'form-checkout', elementLabel: 'Place Order' },
    { eventType: 'page_view', eventName: 'Order Confirmation', pagePath: '/market/orders/42', elementId: null, elementLabel: null },
  ]

  const now = new Date()
  return events.map((e, i) => {
    const d = new Date(now)
    d.setMinutes(d.getMinutes() - (events.length - i) * 1)
    return {
      id: `txn-event-${i}`,
      timestamp: d.toISOString(),
      userId: 'user-42',
      userIdShort: pseudonymize('user-42'),
      userName: null,
      ...e,
      sessionId: 'sess-77',
      txnId,
      stackTrace: null,
      metadata: {},
    }
  })
}

// ─── CRM & Marketing Metrics ────────────────────────────────────────────────

export interface CrmTrafficRow {
  page_slug: string
  visits: number
  unique_sessions: number
  avg_duration_secs: number
  conversions: number
  conversion_rate: number
  top_utm_source: string | null
}

export interface CrmFunnelRow {
  stage: string
  count: number
  pct_of_top: number
}

export interface CrmCampaignStatsRow {
  campaign_id: string
  campaign_name: string
  channel: string
  sent: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
  open_rate: number
  click_rate: number
}

export interface CrmAbResult {
  landing_page_id: string
  page_slug: string
  variant: string
  visits: number
  conversions: number
  conversion_rate: number
}

export interface CrmLeadFunnelRow {
  source: string
  leads: number
  contacted: number
  converted: number
  conversion_rate: number
}

export async function fetchWizardDropoffs(dateRange: DateRange, wizardSlug: string, geoFilter?: GeoFilter): Promise<CrmFunnelRow[]> {
  const { data, error } = await supabase.rpc('metrics_wizard_dropoffs', {
    p_start: dateRange.start,
    p_end: dateRange.end,
    p_wizard: wizardSlug,
    p_state: geoFilter?.state_code || null,
    p_zip: geoFilter?.zip_code || null,
  })
  if (error || !data || !Array.isArray(data)) {
    return []
  }
  return data.map((d: any) => ({ stage: d.step_name || `Step ${d.step_index}`, count: Number(d.count), pct_of_top: Number(d.pct_of_top) }))
}

export async function fetchActiveWizards(dateRange: DateRange): Promise<string[]> {
  const defaultWizards = ['/join', '/sell', '/create-listing']
  const { data, error } = await supabase.rpc('metrics_active_wizards', {
    p_start: dateRange.start,
    p_end: dateRange.end,
  })
  if (error || !data || !Array.isArray(data)) return defaultWizards
  
  const dbWizards = data.map((d: any) => d.wizard_slug)
  return Array.from(new Set([...defaultWizards, ...dbWizards]))
}

export interface WizardFieldAnalyticsData {
  stepFunnel: Array<{ step: number; step_name: string; unique_sessions: number }>
  fieldInteractions: Array<{ step: number; field_name: string; interact_count: number; filled_count: number; empty_count: number }>
  validationErrors: Array<{ step: number; field_name: string; error_type: string; error_count: number }>
  aiUsage: Array<{ button_name: string; click_count: number; applied_count: number; dismissed_count: number; abandon_wait_count: number }>
  stepTiming: Array<{ step: number; step_name: string; session_count: number; avg_secs: number; median_secs: number }>
  abandonPoints: Array<{ last_step: number; last_step_name: string; abandon_count: number; avg_time_on_step_secs: number }>
  buttonClicks?: Array<{ step: number; button_name: string; click_count: number }>
}

export async function fetchWizardFieldAnalytics(
  dateRange: DateRange,
  wizardSlug: string = '/create-listing',
  geoFilter?: GeoFilter,
  utmFilter?: any
): Promise<WizardFieldAnalyticsData> {
  const empty: WizardFieldAnalyticsData = { stepFunnel: [], fieldInteractions: [], validationErrors: [], aiUsage: [], stepTiming: [], abandonPoints: [], buttonClicks: [] }
  try {
    const { data, error } = await supabase.rpc('metrics_wizard_field_analytics', {
      p_start: dateRange.start,
      p_end: dateRange.end,
      p_wizard: wizardSlug,
      p_state: geoFilter?.state_code || null,
      p_city: geoFilter?.city || null,
      p_zip: geoFilter?.zip_code || null,
      p_utm_source: utmFilter?.utm_source || null,
      p_utm_medium: utmFilter?.utm_medium || null,
      p_utm_campaign: utmFilter?.utm_campaign || null,
      p_utm_term: utmFilter?.utm_term || null,
    })
    if (error) { _isDemoMode = true; return empty }
    return (data as WizardFieldAnalyticsData) || empty
  } catch {
    _isDemoMode = true
    return empty
  }
}

export async function fetchCrmTraffic(dateRange: DateRange): Promise<CrmTrafficRow[]> {
  const { data, error } = await supabase.rpc('metrics_crm_landing_pages', {
    p_start: dateRange.start,
    p_end: dateRange.end,
  })
  if (error || !data || !Array.isArray((data as any).pages)) {
    markDemo()
    return [
      { page_slug: '/', visits: 1240, unique_sessions: 980, avg_duration_secs: 72, conversions: 38, conversion_rate: 3.9, top_utm_source: 'google' },
      { page_slug: '/sellers', visits: 540, unique_sessions: 420, avg_duration_secs: 95, conversions: 22, conversion_rate: 5.2, top_utm_source: 'facebook' },
      { page_slug: '/join', visits: 310, unique_sessions: 295, avg_duration_secs: 110, conversions: 88, conversion_rate: 29.8, top_utm_source: 'direct' },
    ]
  }
  return (data as any).pages as CrmTrafficRow[]
}

export async function fetchCrmLeadFunnel(dateRange: DateRange): Promise<CrmLeadFunnelRow[]> {
  const { data, error } = await supabase.rpc('metrics_crm_lead_funnel', {
    p_start: dateRange.start,
    p_end: dateRange.end,
  })
  if (error || !data || !Array.isArray((data as any).by_source)) {
    markDemo()
    return [
      { source: 'facebook', leads: 420, contacted: 180, converted: 42, conversion_rate: 10.0 },
      { source: 'google', leads: 310, contacted: 140, converted: 38, conversion_rate: 12.3 },
      { source: 'direct', leads: 190, contacted: 95, converted: 29, conversion_rate: 15.3 },
      { source: 'instagram', leads: 85, contacted: 30, converted: 7, conversion_rate: 8.2 },
    ]
  }
  return (data as any).by_source as CrmLeadFunnelRow[]
}

export async function fetchCrmCampaignStats(dateRange: DateRange): Promise<CrmCampaignStatsRow[]> {
  const { data, error } = await supabase.rpc('metrics_crm_campaigns', {
    p_start: dateRange.start,
    p_end: dateRange.end,
  })
  if (error || !data || !Array.isArray((data as any).campaigns)) {
    markDemo()
    return [
      { campaign_id: 'c1', campaign_name: 'Spring Launch Email', channel: 'email', sent: 1200, opened: 348, clicked: 96, bounced: 12, unsubscribed: 4, open_rate: 29.0, click_rate: 8.0 },
      { campaign_id: 'c2', campaign_name: 'Seller Onboarding SMS', channel: 'sms', sent: 420, opened: 0, clicked: 87, bounced: 6, unsubscribed: 1, open_rate: 0, click_rate: 20.7 },
      { campaign_id: 'c3', campaign_name: 'May Produce Promo', channel: 'email', sent: 980, opened: 294, clicked: 68, bounced: 8, unsubscribed: 2, open_rate: 30.0, click_rate: 6.9 },
    ]
  }
  return (data as any).campaigns as CrmCampaignStatsRow[]
}

export async function fetchCrmAbResults(dateRange: DateRange): Promise<CrmAbResult[]> {
  const { data, error } = await supabase.rpc('metrics_crm_ab_results', {
    p_start: dateRange.start,
    p_end: dateRange.end,
  })
  if (error || !data || !Array.isArray((data as any).variants)) {
    markDemo()
    return [
      { landing_page_id: 'lp1', page_slug: '/join', variant: 'A', visits: 540, conversions: 32, conversion_rate: 5.9 },
      { landing_page_id: 'lp1', page_slug: '/join', variant: 'B', visits: 520, conversions: 44, conversion_rate: 8.5 },
      { landing_page_id: 'lp2', page_slug: '/sellers', variant: 'A', visits: 280, conversions: 18, conversion_rate: 6.4 },
      { landing_page_id: 'lp2', page_slug: '/sellers', variant: 'B', visits: 260, conversions: 22, conversion_rate: 8.5 },
    ]
  }
  return (data as any).variants as CrmAbResult[]
}

export async function fetchCrmTrafficSources(dateRange: DateRange): Promise<{ source: string; visits: number; pct: number }[]> {
  const { data, error } = await supabase.rpc('metrics_crm_traffic_sources', {
    p_start: dateRange.start,
    p_end: dateRange.end,
  })
  if (error || !data || !Array.isArray((data as any).by_source)) {
    markDemo()
    const sources = [
      { source: 'organic', visits: 580 },
      { source: 'facebook', visits: 420 },
      { source: 'google', visits: 310 },
      { source: 'direct', visits: 190 },
      { source: 'instagram', visits: 85 },
    ]
    const total = sources.reduce((s, r) => s + r.visits, 0)
    return sources.map(r => ({ ...r, pct: Math.round((r.visits / total) * 100) }))
  }
  const bySource = (data as any).by_source as { visits: number }[]
  const total = bySource.reduce((s, r) => s + r.visits, 0)
  return bySource.map(r => ({ ...r, pct: total > 0 ? Math.round((r.visits / total) * 100) : 0 })) as { source: string; visits: number; pct: number }[]
}
export async function generateUtmAnalyticsQuery(prompt: string, conversationHistory: any[]): Promise<any> {
  try {
    const response = await supabase.functions.invoke('generate-utm-analytics-query', {
      body: {
        prompt,
        conversationHistory,
      },
    })
    return response.data || { valid: false, error: 'Empty response from edge function' };
  } catch (err: any) {
    return { valid: false, error: err.message || String(err) };
  }
}

export interface CrmTrafficAnalysisData {
  completedListings: {
    hourStr: string;
    total: number;
    sameSession: number;
    sameDay: number;
    later: number;
  }[];
  funnelHour: {
    hourStr: string;
    starts: number;
    completed: number;
    dropStep1: number;
    dropStep2Plus: number;
  }[];
  listingsWeekday: {
    weekday: string;
    total: number;
    sameSession: number;
    sameDay: number;
    later: number;
  }[];
  funnelWeekday: {
    weekday: string;
    starts: number;
    completed: number;
    dropStep1: number;
    dropStep2Plus: number;
  }[];
  leadsGrid: any[];
  accountsGrid: any[];
  listingsGrid: any[];
  leadsToAccountGrid: any[];
  leadsToAccountStats: {
    totalLeads: number;
    convertedLeads: number;
  };
  dropOffGrids: Record<string, any[]>;
}

export async function fetchCrmTrafficAnalysis(
  dateRange: DateRange,
  utmFilter: any,
  selectedWizard: string = "/create-listing"
): Promise<CrmTrafficAnalysisData> {
  const [
    { data: analyticsRows },
    { data: products },
    { data: profiles },
    { data: booths },
    { data: pageVisits },
    { data: leads }
  ] = await Promise.all([
    supabase
      .from("user_analytics")
      .select("*")
      .gte("created_at", dateRange.start)
      .lte("created_at", dateRange.end),
    supabase.from("market_products").select("*"),
    supabase.from("profiles").select("id, email, state_code, created_at"),
    supabase.from("market_booths").select("id, owner_id"),
    supabase
      .from("crm_page_visits")
      .select("session_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term")
      .gte("visited_at", dateRange.start)
      .lte("visited_at", dateRange.end),
    supabase.from("crm_leads").select("email, created_at, metadata, source_platform, utm_source, utm_medium, utm_campaign, utm_content, utm_term")
  ]);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  const profileEmailMap = new Map((profiles || []).map((p: any) => [p.email?.toLowerCase(), p]));
  const boothMap = new Map((booths || []).map((b: any) => [b.id, b]));


  // Build lookup maps for UTM attribution
  const visitUtmMap = new Map<string, any>();
  for (const visit of (pageVisits || [])) {
    if (visit.session_id) {
      visitUtmMap.set(visit.session_id, {
        utm_source: visit.utm_source,
        utm_medium: visit.utm_medium,
        utm_campaign: visit.utm_campaign,
        utm_content: visit.utm_content,
        utm_term: visit.utm_term
      });
    }
  }

  const leadUtmMap = new Map<string, any>();
  for (const lead of (leads || [])) {
    if (lead.email) {
      leadUtmMap.set(lead.email.toLowerCase(), {
        utm_source: lead.utm_source,
        utm_medium: lead.utm_medium,
        utm_campaign: lead.utm_campaign,
        utm_content: lead.utm_content,
        utm_term: lead.utm_term
      });
    }
  }

  function matchesUtmFilter(resolvedUtm: any): boolean {
    if (!resolvedUtm) {
      // If we are filtering by a UTM param, but this record has none, filter it out!
      return !utmFilter.utm_source && !utmFilter.utm_medium && !utmFilter.utm_campaign;
    }
    
    if (utmFilter.utm_source && (!resolvedUtm.utm_source || !resolvedUtm.utm_source.toLowerCase().includes(utmFilter.utm_source.toLowerCase()))) {
      return false;
    }
    if (utmFilter.utm_medium && (!resolvedUtm.utm_medium || !resolvedUtm.utm_medium.toLowerCase().includes(utmFilter.utm_medium.toLowerCase()))) {
      return false;
    }
    if (utmFilter.utm_campaign && (!resolvedUtm.utm_campaign || !resolvedUtm.utm_campaign.toLowerCase().includes(utmFilter.utm_campaign.toLowerCase()))) {
      return false;
    }
    return true;
  }

  function getStateTimezone(stateCode: string | null): string {
    if (!stateCode) return "America/Los_Angeles";
    const code = stateCode.trim().toUpperCase();
    const pacific = ["CA", "OR", "WA", "NV"];
    const mountain = ["CO", "UT", "WY", "ID", "MT", "NM", "AZ"];
    const central = ["TX", "IL", "MN", "WI", "IA", "MO", "AR", "LA", "OK", "KS", "NE", "SD", "ND", "MS", "TN", "AL"];
    const eastern = ["NY", "FL", "PA", "OH", "MI", "GA", "NC", "VA", "NJ", "MA", "MD", "IN", "SC", "CT", "ME", "NH", "VT", "RI", "DE", "WV", "KY"];
    
    if (pacific.includes(code)) return "America/Los_Angeles";
    if (mountain.includes(code)) return "America/Denver";
    if (central.includes(code)) return "America/Chicago";
    if (eastern.includes(code)) return "America/New_York";
    return "America/Los_Angeles";
  }

  function getLocalHour(dateString: string, timezone: string): number {
    try {
      const date = new Date(dateString);
      const formatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone,
      });
      const parts = formatter.formatToParts(date);
      const hourPart = parts.find(p => p.type === "hour");
      if (hourPart) {
        const val = parseInt(hourPart.value);
        return val === 24 ? 0 : val;
      }
      return date.getUTCHours();
    } catch {
      return new Date(dateString).getUTCHours();
    }
  }

  function getLocalDayOfWeek(dateString: string, timezone: string): string {
    try {
      const date = new Date(dateString);
      const formatter = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: timezone,
      });
      return formatter.format(date);
    } catch {
      const date = new Date(dateString);
      const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return weekdays[date.getUTCDay()];
    }
  }

  // Define steps for each wizard slug
  let step1Path = "/create-listing";
  let step2Path = "/my-booth/products/new";
  let completionCheck = (rows: any[], sessionId?: string) => rows.some(r => r.event_type === "form_submit" && (r.event_name === "add_product" || r.event_name === "edit_product"));

  if (selectedWizard === "/profile-setup") {
    step1Path = "/profile-setup";
    step2Path = "";
    completionCheck = (rows: any[]) => rows.some(r => r.event_type === "form_submit" && r.event_name === "profile_setup");
  } else if (selectedWizard === "/join") {
    step1Path = "/join";
    step2Path = "/auth-callback";
    completionCheck = (rows: any[]) => rows.some(r => r.page_path === "/profile" || r.event_type === "form_submit");
  } else if (selectedWizard === "/sell") {
    step1Path = "/sell";
    step2Path = "/profile-setup";
    completionCheck = (rows: any[]) => rows.some(r => r.event_type === "form_submit" && r.event_name === "profile_setup");
  } else if (selectedWizard === "/check-nutrition-loss") {
    step1Path = "/check-nutrition-loss";
    step2Path = "";
    completionCheck = (rows: any[], sessionId?: string) => {
      let email = "";
      const firstRow = rows[0];
      if (firstRow?.user_id) {
        const p = profileMap.get(firstRow.user_id) as any;
        if (p?.email) email = p.email.toLowerCase();
      }
      if (email) {
        const lead = (leads || []).find((l: any) => l.email?.toLowerCase() === email);
        if (lead && (lead.source_platform === "nutrition-calculator" || lead.metadata?.source_platform === "nutrition-calculator")) {
          return true;
        }
      }
      return false;
    };
  }

  const targetSlugs = [step1Path, step2Path].filter(Boolean);
  const wizardEvents = (analyticsRows || []).filter((row: any) => {
    if (targetSlugs.includes(row.page_path)) return true;
    if (row.event_type === "form_submit") {
      if (selectedWizard === "/create-listing" && (row.event_name === "add_product" || row.event_name === "edit_product")) return true;
      if (selectedWizard === "/profile-setup" && row.event_name === "profile_setup") return true;
      if (selectedWizard === "/sell" && row.event_name === "profile_setup") return true;
    }
    return false;
  });

  const sessionRecords = new Map<string, any[]>();
  for (const row of wizardEvents) {
    const arr = sessionRecords.get(row.session_id) || [];
    arr.push(row);
    sessionRecords.set(row.session_id, arr);
  }

  // Identify all user IDs who started/entered the selected wizard in the active date range (matching UTM filters)
  const wizardUserIds = new Set<string>();
  for (const [sessionId, rows] of Array.from(sessionRecords.entries())) {
    rows.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const firstRow = rows[0];
    let resolvedUtm = visitUtmMap.get(sessionId);
    if (!resolvedUtm && firstRow.user_id) {
      const p = profileMap.get(firstRow.user_id) as any;
      if (p?.email) {
        resolvedUtm = leadUtmMap.get(p.email.toLowerCase());
      }
    }
    if (!matchesUtmFilter(resolvedUtm)) {
      continue;
    }
    for (const r of rows) {
      if (r.user_id) {
        wizardUserIds.add(r.user_id);
      }
    }
  }

  const weekdaysOrdered = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const completedListings = Array.from({ length: 24 }, (_, i) => ({
    hourStr: `${i.toString().padStart(2, "0")}:00`,
    total: 0,
    sameSession: 0,
    sameDay: 0,
    later: 0
  }));

  const listingsWeekday = weekdaysOrdered.map(day => ({
    weekday: day,
    total: 0,
    sameSession: 0,
    sameDay: 0,
    later: 0
  }));

  // Only count listings where the creator is associated with a user from the selected wizard funnel
  const productsFiltered = (products || []).filter((p: any) => {
    const d = new Date(p.created_at);
    if (d < new Date(dateRange.start) || d > new Date(dateRange.end)) {
      return false;
    }
    const booth = boothMap.get(p.booth_id) as any;
    const ownerId = booth?.owner_id;
    const profile = (ownerId ? profileMap.get(ownerId) : null) as any;
    const resolvedUtm = profile?.email ? leadUtmMap.get(profile.email.toLowerCase()) : null;
    if (!matchesUtmFilter(resolvedUtm)) {
      return false;
    }
    if (!ownerId || !wizardUserIds.has(ownerId)) {
      return false;
    }
    return true;
  });

  for (const prod of productsFiltered as any[]) {
    const booth = boothMap.get(prod.booth_id) as any;
    const ownerId = booth?.owner_id;
    const profile = (ownerId ? profileMap.get(ownerId) : null) as any;
    const tz = profile ? getStateTimezone(profile.state_code) : "America/Los_Angeles";
    const prodHour = getLocalHour(prod.created_at, tz);
    const prodDay = getLocalDayOfWeek(prod.created_at, tz);

    let sameSession = 0;
    let sameDay = 0;
    let later = 1;

    if (profile && profile.created_at) {
      const diffMs = new Date(prod.created_at).getTime() - new Date(profile.created_at).getTime();
      const diffMin = diffMs / (60 * 1000);
      
      if (diffMin <= 15) {
        sameSession = 1;
        later = 0;
      } else if (diffMin <= 24 * 60) {
        sameDay = 1;
        later = 0;
      }
    }

    completedListings[prodHour].total++;
    completedListings[prodHour].sameSession += sameSession;
    completedListings[prodHour].sameDay += sameDay;
    completedListings[prodHour].later += later;

    const wItem = listingsWeekday.find(w => w.weekday === prodDay);
    if (wItem) {
      wItem.total++;
      wItem.sameSession += sameSession;
      wItem.sameDay += sameDay;
      wItem.later += later;
    }
  }

  const funnelHour = Array.from({ length: 24 }, (_, i) => ({
    hourStr: `${i.toString().padStart(2, "0")}:00`,
    starts: 0,
    completed: 0,
    dropStep1: 0,
    dropStep2Plus: 0
  }));

  const funnelWeekday = weekdaysOrdered.map(day => ({
    weekday: day,
    starts: 0,
    completed: 0,
    dropStep1: 0,
    dropStep2Plus: 0
  }));

  for (const [sessionId, rows] of Array.from(sessionRecords.entries())) {
    rows.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const firstRow = rows[0];
    
    // Resolve UTM for this session: check page visits first, then lead email
    let resolvedUtm = visitUtmMap.get(sessionId);
    if (!resolvedUtm && firstRow.user_id) {
      const p = profileMap.get(firstRow.user_id) as any;
      if (p?.email) {
        resolvedUtm = leadUtmMap.get(p.email.toLowerCase());
      }
    }

    if (!matchesUtmFilter(resolvedUtm)) {
      continue;
    }

    const userProfile = (firstRow.user_id ? profileMap.get(firstRow.user_id) : null) as any;
    const tz = userProfile ? getStateTimezone(userProfile.state_code) : "America/Los_Angeles";
    const startHour = getLocalHour(firstRow.created_at, tz);
    const startDay = getLocalDayOfWeek(firstRow.created_at, tz);

    const hasVisitedStep2 = step2Path ? rows.some((r: any) => r.page_path === step2Path) : false;
    const hasCompleted = completionCheck(rows, sessionId);

    let completed = 0;
    let dropStep1 = 0;
    let dropStep2Plus = 0;

    if (hasCompleted) {
      completed = 1;
    } else if (hasVisitedStep2) {
      dropStep2Plus = 1;
    } else {
      dropStep1 = 1;
    }

    funnelHour[startHour].starts++;
    funnelHour[startHour].completed += completed;
    funnelHour[startHour].dropStep1 += dropStep1;
    funnelHour[startHour].dropStep2Plus += dropStep2Plus;

    const wItem = funnelWeekday.find(w => w.weekday === startDay);
    if (wItem) {
      wItem.starts++;
      wItem.completed += completed;
      wItem.dropStep1 += dropStep1;
      wItem.dropStep2Plus += dropStep2Plus;
    }
  }

  function createEmptyGrid() {
    return Array.from({ length: 24 }, (_, hour) => {
      const row: any = { hourStr: `${hour.toString().padStart(2, "0")}:00` };
      for (const day of weekdaysOrdered) {
        row[day] = 0;
      }
      return row;
    });
  }

  // 1. Leads Grid
  const leadsGrid = createEmptyGrid();
  const leadsFiltered = (leads || []).filter((l: any) => {
    if (!l.created_at) return false;
    const d = new Date(l.created_at);
    return d >= new Date(dateRange.start) && d <= new Date(dateRange.end);
  });
  for (const lead of leadsFiltered) {
    if (!matchesUtmFilter(lead)) continue;
    let tz = "America/Los_Angeles";
    if (lead.email) {
      const p = profileEmailMap.get(lead.email.toLowerCase()) as any;
      if (p) {
        tz = getStateTimezone(p.state_code);
      } else if (lead.metadata?.timezone) {
        tz = lead.metadata.timezone;
      }
    }
    const hour = getLocalHour(lead.created_at, tz);
    const day = getLocalDayOfWeek(lead.created_at, tz);
    leadsGrid[hour][day]++;
  }

  // 2. Account Creations Grid
  const accountsGrid = createEmptyGrid();
  const profilesFiltered = (profiles || []).filter((p: any) => {
    const d = new Date(p.created_at);
    return d >= new Date(dateRange.start) && d <= new Date(dateRange.end);
  });
  for (const p of profilesFiltered as any[]) {
    const resolvedUtm = p.email ? leadUtmMap.get(p.email.toLowerCase()) : null;
    if (!matchesUtmFilter(resolvedUtm)) continue;
    const tz = getStateTimezone(p.state_code);
    const hour = getLocalHour(p.created_at, tz);
    const day = getLocalDayOfWeek(p.created_at, tz);
    accountsGrid[hour][day]++;
  }

  // 3. Listings Grid
  const listingsGrid = createEmptyGrid();
  for (const prod of productsFiltered as any[]) {
    const booth = boothMap.get(prod.booth_id) as any;
    const ownerId = booth?.owner_id;
    const profile = (ownerId ? profileMap.get(ownerId) : null) as any;
    const resolvedUtm = profile?.email ? leadUtmMap.get(profile.email.toLowerCase()) : null;
    if (!matchesUtmFilter(resolvedUtm)) continue;
    const tz = profile ? getStateTimezone(profile.state_code) : "America/Los_Angeles";
    const hour = getLocalHour(prod.created_at, tz);
    const day = getLocalDayOfWeek(prod.created_at, tz);
    listingsGrid[hour][day]++;
  }

  // 4 & 5. Drop Off Grids for all wizards
  const dropOffGrids: Record<string, any[]> = {
    listing: createEmptyDropOffGrid(),
    join: createEmptyDropOffGrid(),
    sell: createEmptyDropOffGrid(),
    profileSetup: createEmptyDropOffGrid(),
    nutrition: createEmptyDropOffGrid()
  };

  const wizardConfigs = [
    {
      key: "listing",
      step1Path: "/create-listing",
      step2Path: "/my-booth/products/new",
      completionCheck: (rows: any[]) => rows.some(r => r.event_type === "form_submit" && (r.event_name === "add_product" || r.event_name === "edit_product"))
    },
    {
      key: "join",
      step1Path: "/join",
      step2Path: "/auth-callback",
      completionCheck: (rows: any[]) => rows.some(r => r.page_path === "/profile" || r.event_type === "form_submit")
    },
    {
      key: "sell",
      step1Path: "/sell",
      step2Path: "/profile-setup",
      completionCheck: (rows: any[]) => rows.some(r => r.event_type === "form_submit" && r.event_name === "profile_setup")
    },
    {
      key: "profileSetup",
      step1Path: "/profile-setup",
      step2Path: "",
      completionCheck: (rows: any[]) => rows.some(r => r.event_type === "form_submit" && r.event_name === "profile_setup")
    },
    {
      key: "nutrition",
      step1Path: "/check-nutrition-loss",
      step2Path: "",
      completionCheck: (rows: any[], sessionId?: string) => {
        let email = "";
        const firstRow = rows[0];
        if (firstRow?.user_id) {
          const p = profileMap.get(firstRow.user_id) as any;
          if (p?.email) email = p.email.toLowerCase();
        }
        if (email) {
          const lead = (leads || []).find((l: any) => l.email?.toLowerCase() === email);
          if (lead && (lead.source_platform === "nutrition-calculator" || lead.metadata?.source_platform === "nutrition-calculator")) {
            return true;
          }
        }
        return false;
      }
    }
  ];


  const allSlugs = wizardConfigs.flatMap(c => [c.step1Path, c.step2Path].filter(Boolean));
  const allWizardEvents = (analyticsRows || []).filter((row: any) => {
    if (allSlugs.includes(row.page_path)) return true;
    if (row.event_type === "form_submit" && ["add_product", "edit_product", "profile_setup"].includes(row.event_name)) return true;
    return false;
  });

  const sessionAllMap = new Map<string, any[]>();
  for (const row of allWizardEvents) {
    const arr = sessionAllMap.get(row.session_id) || [];
    arr.push(row);
    sessionAllMap.set(row.session_id, arr);
  }

  for (const [sessionId, rows] of Array.from(sessionAllMap.entries())) {
    rows.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const firstRow = rows[0];
    let resolvedUtm = visitUtmMap.get(sessionId);
    if (!resolvedUtm && firstRow.user_id) {
      const p = profileMap.get(firstRow.user_id) as any;
      if (p?.email) {
        resolvedUtm = leadUtmMap.get(p.email.toLowerCase());
      }
    }
    if (!matchesUtmFilter(resolvedUtm)) continue;

    const userProfile = (firstRow.user_id ? profileMap.get(firstRow.user_id) : null) as any;
    const tz = userProfile ? getStateTimezone(userProfile.state_code) : "America/Los_Angeles";
    const hour = getLocalHour(firstRow.created_at, tz);
    const day = getLocalDayOfWeek(firstRow.created_at, tz);

    for (const config of wizardConfigs) {
      const configSlugs = [config.step1Path, config.step2Path].filter(Boolean);
      const wizardRows = rows.filter((r: any) => {
        if (configSlugs.includes(r.page_path)) return true;
        if (r.event_type === "form_submit") {
          if (config.key === "listing" && (r.event_name === "add_product" || r.event_name === "edit_product")) return true;
          if (config.key === "sell" && r.event_name === "profile_setup") return true;
          if (config.key === "profileSetup" && r.event_name === "profile_setup") return true;
        }
        return false;
      });

      if (wizardRows.length === 0) continue;

      const hasVisitedStep2 = config.step2Path ? wizardRows.some((r: any) => r.page_path === config.step2Path) : false;
      const hasCompleted = config.completionCheck(wizardRows, sessionId);

      dropOffGrids[config.key][hour][day].starts++;

      if (!hasCompleted) {
        if (hasVisitedStep2) {
          dropOffGrids[config.key][hour][day].step2++;
        } else {
          dropOffGrids[config.key][hour][day].step1++;
        }
      }
    }
  }

  // Helper for dropoff grid initialization
  function createEmptyDropOffGrid() {
    return Array.from({ length: 24 }, (_, hour) => {
      const row: any = { hourStr: `${hour.toString().padStart(2, "0")}:00` };
      for (const day of weekdaysOrdered) {
        row[day] = { step1: 0, step2: 0, starts: 0 };
      }
      return row;
    });
  }

  // 6. Leads-to-Account Conversions Grid & Stats
  const leadsToAccountGrid = createEmptyGrid();
  let convertedLeadsCount = 0;
  for (const lead of leadsFiltered) {
    if (!matchesUtmFilter(lead)) continue;
    if (lead.email) {
      const p = profileEmailMap.get(lead.email.toLowerCase()) as any;
      if (p) {
        convertedLeadsCount++;
        const tz = getStateTimezone(p.state_code);
        const hour = getLocalHour(p.created_at, tz);
        const day = getLocalDayOfWeek(p.created_at, tz);
        leadsToAccountGrid[hour][day]++;
      }
    }
  }


  const leadsToAccountStats = {
    totalLeads: leadsFiltered.filter(matchesUtmFilter).length,
    convertedLeads: convertedLeadsCount
  };

  return {
    completedListings,
    funnelHour,
    listingsWeekday,
    funnelWeekday,
    leadsGrid,
    accountsGrid,
    listingsGrid,
    leadsToAccountGrid,
    leadsToAccountStats,
    dropOffGrids
  };
}

