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
function markDemo() { _isDemoMode = true }

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
  geoFilter?: GeoFilter
): Promise<PageAnalyticsData> {
  try {
    const { data, error } = await supabase.rpc('metrics_page_analytics', {
      p_start: dateRange.start,
      p_end: dateRange.end,
      p_state: geoFilter?.state_code || null,
      p_city: geoFilter?.city || null,
      p_zip: geoFilter?.zip_code || null,
    })
    if (!error && data && !data?.error) return data as PageAnalyticsData
  } catch {}

  markDemo()
  return {
    routes: [
      { route: '/market', pageLoads: 4521, uniqueUsers: 2890, avgDwellTime: 45, bounceRate: 12, dropOffRate: 8, errors: 3 },
      { route: '/market/booth/:id', pageLoads: 2134, uniqueUsers: 1430, avgDwellTime: 67, bounceRate: 18, dropOffRate: 15, errors: 1 },
      { route: '/market/product/:id', pageLoads: 1876, uniqueUsers: 1210, avgDwellTime: 52, bounceRate: 22, dropOffRate: 20, errors: 2 },
      { route: '/market/order/new', pageLoads: 987, uniqueUsers: 756, avgDwellTime: 120, bounceRate: 8, dropOffRate: 35, errors: 5 },
      { route: '/market/orders', pageLoads: 654, uniqueUsers: 432, avgDwellTime: 38, bounceRate: 15, dropOffRate: 10, errors: 0 },
      { route: '/profile', pageLoads: 543, uniqueUsers: 412, avgDwellTime: 28, bounceRate: 25, dropOffRate: 12, errors: 1 },
      { route: '/redeem', pageLoads: 432, uniqueUsers: 378, avgDwellTime: 55, bounceRate: 14, dropOffRate: 18, errors: 2 },
      { route: '/chat', pageLoads: 321, uniqueUsers: 234, avgDwellTime: 180, bounceRate: 5, dropOffRate: 4, errors: 0 },
      { route: '/settings', pageLoads: 198, uniqueUsers: 167, avgDwellTime: 22, bounceRate: 30, dropOffRate: 8, errors: 0 },
      { route: '/giftcards', pageLoads: 156, uniqueUsers: 123, avgDwellTime: 40, bounceRate: 20, dropOffRate: 22, errors: 1 },
    ],
    dropOffDistribution: [
      { route: '/market/order/new', count: 345 },
      { route: '/market/product/:id', count: 245 },
      { route: '/redeem', count: 180 },
      { route: '/market/booth/:id', count: 156 },
      { route: '/giftcards', count: 98 },
      { route: '/profile', count: 65 },
    ],
    errorHotspots: [
      { route: '/market/order/new', errorName: 'PaymentProcessError', count: 3 },
      { route: '/market/product/:id', errorName: 'ImageLoadError', count: 2 },
      { route: '/redeem', errorName: 'InsufficientPoints', count: 2 },
      { route: '/market', errorName: 'GeolocationTimeout', count: 3 },
    ],
    sessionDurations: [
      { bucket: '0-30s', count: 234 },
      { bucket: '30s-1m', count: 456 },
      { bucket: '1-3m', count: 678 },
      { bucket: '3-5m', count: 543 },
      { bucket: '5-10m', count: 321 },
      { bucket: '10m+', count: 123 },
    ],
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
