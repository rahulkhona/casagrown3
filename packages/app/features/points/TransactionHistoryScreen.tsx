'use client'

/**
 * TransactionHistoryScreen — Shows all point transactions:
 * purchases, receipts (from sales), deductions (from orders/redemptions),
 * and associated context (order details, gift card info, etc.)
 *
 * Each card shows:
 * - Date & time
 * - Buy/sell: link to chat, platform fee breakdown
 * - Redemption: link to gift card (copy/share)
 * - Donation: link to donation receipt
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Input, useMedia } from 'tamagui'
import { Platform, Alert, Share, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownLeft, ArrowUpRight, Coins, Gift, Heart,
  MessageSquare, ExternalLink, Copy, Share2, FileText, Receipt,
  Search, ArrowDown, ArrowUp, Clock, CheckCircle, AlertTriangle, ArrowLeft
} from '@tamagui/lucide-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'solito/navigation'
import { colors, borderRadius } from '../../design-tokens'
import { useAuth } from '../auth/auth-hook'
import { supabase } from '../auth/auth-hook'
import { usePointsBalance } from '../../hooks/usePointsBalance'
import { GiftCardDetailSheet } from '../redeem/GiftCardDetailSheet'
import { DonationReceiptSheet } from '../redeem/DonationReceiptSheet'
import { POINTS_PER_DOLLAR } from '../redeem/mock-data'

// =============================================================================
// Types
// =============================================================================

type TransactionType = 'purchase' | 'sale_credit' | 'order_debit' | 'redemption' | 'donation' | 'referral' | 'refund'
type FilterType = 'all' | 'credits' | 'debits'
type TransactionStatus = 'queued' | 'processing' | 'completed' | 'failed'
type DatePeriod = 'all' | '7d' | '90d' | 'custom'

interface Transaction {
  id: string
  type: TransactionType
  amount: number           // positive = credit, negative = debit
  date: string             // ISO string
  description: string
  detail?: string          // e.g. order id, gift card brand
  counterparty?: string    // e.g. buyer/seller name

  // Buy/sell specific
  postId?: string          // link to associated chat via post
  otherUserId?: string     // the other party's user ID
  orderId?: string         // order reference
  platformFee?: number     // points deducted as platform fee (for sales)
  grossAmount?: number     // total before fee (for sales)

  // Redemption specific
  giftCardCode?: string    // redeemed gift card code/link
  giftCardUrl?: string     // url to the gift card

  // Donation specific
  donationReceiptUrl?: string // link to donation receipt
  donationOrg?: string       // organization name
  donationProject?: string   // project title
  donationTheme?: string     // theme category

  // Status tracking
  status?: TransactionStatus  // queued, processing, completed, failed
  provider?: string           // 'tremendous' | 'reloadly' | 'globalgiving'
}

// =============================================================================
// Ledger → Transaction mapping
// =============================================================================

const PLATFORM_FEE_PERCENT = 10

/** Map point_ledger DB type to UI TransactionType */
function mapLedgerType(dbType: string, amount: number): TransactionType {
  switch (dbType) {
    case 'purchase': return 'purchase'
    case 'payment': return amount > 0 ? 'sale_credit' : 'order_debit'
    case 'transfer': return amount > 0 ? 'sale_credit' : 'order_debit'
    case 'platform_fee': return 'sale_credit' // shown as part of sale
    case 'platform_charge': return 'order_debit'
    case 'redemption': return 'redemption'
    case 'donation': return 'donation'
    case 'reward': return 'referral'
    case 'refund': return 'refund'
    default: return amount > 0 ? 'purchase' : 'order_debit'
  }
}

/** Convert a point_ledger row + metadata into a UI Transaction */
function mapLedgerToTransaction(row: any): Transaction {
  const meta = row.metadata || {}
  const uiType = mapLedgerType(row.type, row.amount)

  const tx: Transaction = {
    id: row.id,
    type: uiType,
    amount: row.amount,
    date: row.created_at,
    description: buildDescription(uiType, row.amount, meta),
    detail: meta.detail,
    counterparty: meta.counterparty || meta.seller_name || meta.buyer_name,
    orderId: meta.order_id,
    postId: meta.post_id,
    otherUserId: meta.other_user_id,
    platformFee: meta.platform_fee,
    grossAmount: meta.total || meta.gross_amount,
    giftCardCode: meta.gift_card_code || meta.card_code,
    giftCardUrl: meta.gift_card_url || meta.card_url,
    donationReceiptUrl: meta.donation_receipt_url || meta.receipt_url,
    donationOrg: meta.organization || meta.donation_org,
    donationProject: meta.project_title,
    donationTheme: meta.theme,
    status: meta.status || (row.type === 'redemption' || row.type === 'donation' ? 'completed' : undefined),
    provider: meta.provider,
  }

  return tx
}

/** Build a human-readable description from type + metadata */
function buildDescription(type: TransactionType, amount: number, meta: any): string {
  switch (type) {
    case 'purchase':
      return `Purchased ${Math.abs(amount).toLocaleString()} points`
    case 'sale_credit': {
      const product = meta.product || meta.item_name || 'item'
      return `Sale: ${product}`
    }
    case 'order_debit': {
      const product = meta.product || meta.item_name || 'item'
      return `Purchase: ${product}`
    }
    case 'redemption': {
      const brand = meta.brand_name || meta.gift_card_brand || 'Gift Card'
      const value = meta.face_value_cents
        ? `$${(meta.face_value_cents / 100).toFixed(0)}`
        : ''
      return `Redeemed: ${brand}${value ? ` ${value}` : ''} Gift Card`
    }
    case 'donation': {
      const org = meta.organization || meta.donation_org || 'Charity'
      return `Donated to: ${org}`
    }
    case 'referral':
      return meta.description || 'Referral bonus'
    case 'refund': {
      const reason = meta.reason || 'Order cancelled'
      return `Refund: ${reason}`
    }
    default:
      return meta.description || `${amount > 0 ? 'Credit' : 'Debit'}: ${Math.abs(amount)} points`
  }
}

// =============================================================================
// Helpers
// =============================================================================

const TYPE_CONFIG: Record<TransactionType, { icon: any; label: string; color: string; bgColor: string }> = {
  purchase:     { icon: Coins,        label: 'Points Purchase',  color: colors.green[600], bgColor: colors.green[100] },
  sale_credit:  { icon: ArrowDownLeft, label: 'Sale Credit',     color: colors.green[600], bgColor: colors.green[100] },
  order_debit:  { icon: ArrowUpRight, label: 'Purchase',         color: colors.red[600],   bgColor: colors.red[100] },
  redemption:   { icon: Gift,         label: 'Redemption',       color: colors.purple[600], bgColor: colors.purple[100] },
  donation:     { icon: Heart,        label: 'Donation',         color: colors.pink[600],  bgColor: colors.pink[100] },
  referral:     { icon: Coins,        label: 'Referral Bonus',   color: colors.blue[600],  bgColor: colors.blue[100] },
  refund:       { icon: ArrowDownLeft, label: 'Refund',          color: colors.amber[600],  bgColor: colors.amber[100] },
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }) + ' at ' + d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
}

// =============================================================================
// Component
// =============================================================================

export interface TransactionHistoryScreenProps {
  onNavigateToFeed?: () => void
  onNavigateToChat?: (postId: string, otherUserId: string) => void
}

export function TransactionHistoryScreen({ onNavigateToFeed, onNavigateToChat }: TransactionHistoryScreenProps) {
  const { t } = useTranslation()
  const media = useMedia()
  // @ts-ignore
  const isDesktop = media.lg || media.xl || media.xxl

  const { user } = useAuth()
  const { balance: userPoints } = usePointsBalance(user?.id)

  const [filter, setFilter] = useState<FilterType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [datePeriod, setDatePeriod] = useState<DatePeriod>('all')
  const [customFrom, setCustomFrom] = useState('')  // YYYY-MM-DD
  const [customTo, setCustomTo] = useState('')      // YYYY-MM-DD

  // Fetch real transactions from point_ledger
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txLoading, setTxLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) {
      setTransactions([])
      setTxLoading(false)
      return
    }

    let cancelled = false

    async function fetchTransactions() {
      setTxLoading(true)
      const { data, error } = await supabase
        .from('point_ledger')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(200)

      if (cancelled) return

      if (error) {
        console.warn('[TXN] Failed to fetch transactions:', error)
        setTransactions([])
      } else {
        // Filter out platform_fee entries (they're shown in the sale_credit card)
        const mapped = (data || [])
          .filter((row: any) => row.type !== 'platform_fee')
          .map(mapLedgerToTransaction)
        setTransactions(mapped)
      }
      setTxLoading(false)
    }

    fetchTransactions()

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`txn-history:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'point_ledger', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new && payload.new.type !== 'platform_fee') {
            setTransactions(prev => [mapLedgerToTransaction(payload.new), ...prev])
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  const filteredTransactions = useMemo(() => {
    let result = [...transactions]
    const now = new Date()

    // Filter by date period
    if (datePeriod === 'custom') {
      if (customFrom) {
        const [y, m, d] = customFrom.split('-').map(Number)
        const from = new Date(y, m - 1, d, 0, 0, 0, 0)
        result = result.filter(tx => new Date(tx.date) >= from)
      }
      if (customTo) {
        const [y, m, d] = customTo.split('-').map(Number)
        const to = new Date(y, m - 1, d, 23, 59, 59, 999)
        result = result.filter(tx => new Date(tx.date) <= to)
      }
    } else if (datePeriod !== 'all') {
      const daysMap: Record<string, number> = { '7d': 7, '90d': 90 }
      const days = daysMap[datePeriod] ?? 0
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - days)
      result = result.filter(tx => new Date(tx.date) >= cutoff)
    }

    // Filter by type
    if (filter === 'credits') result = result.filter(tx => tx.amount > 0)
    else if (filter === 'debits') result = result.filter(tx => tx.amount < 0)

    // Search across relevant fields
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(tx =>
        tx.description.toLowerCase().includes(q) ||
        tx.counterparty?.toLowerCase().includes(q) ||
        tx.donationOrg?.toLowerCase().includes(q) ||
        tx.giftCardCode?.toLowerCase().includes(q) ||
        tx.orderId?.toLowerCase().includes(q) ||
        tx.detail?.toLowerCase().includes(q)
      )
    }

    // Sort by date
    result.sort((a, b) => {
      const diff = new Date(b.date).getTime() - new Date(a.date).getTime()
      return sortOrder === 'newest' ? diff : -diff
    })

    return result
  }, [filter, searchQuery, sortOrder, datePeriod, customFrom, customTo, transactions])

  // Summary calculations
  const totalBought = transactions
    .filter(tx => tx.type === 'purchase')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

  const totalEarned = transactions
    .filter(tx => ['sale_credit', 'referral', 'refund'].includes(tx.type))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

  const totalPlatformCharges = transactions
    .filter(tx => tx.platformFee != null)
    .reduce((sum, tx) => sum + (tx.platformFee || 0), 0)

  const totalSpent = Math.abs(transactions
    .filter(tx => ['order_debit', 'redemption', 'donation'].includes(tx.type))
    .reduce((sum, tx) => sum + tx.amount, 0)) + totalPlatformCharges

  const handleCopyCode = useCallback((code: string) => {
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(code)
      // No alert on web — clipboard copy is silent
    } else {
      Alert.alert('Gift Card Code', code)
    }
  }, [])

  const handleShare = useCallback(async (url: string, title: string) => {
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ title, url })
        } else {
          await navigator.clipboard?.writeText(url)
        }
      } else {
        await Share.share({ message: title, url, title })
      }
    } catch {
      // user cancelled
    }
   }, [])

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  
  const router = useRouter()
  const { top, bottom } = useSafeAreaInsets()

  return (
    <>
    <YStack flex={1} backgroundColor={colors.gray[50]} paddingTop={Platform.OS !== 'web' && !isDesktop ? top : 0}>
      {/* ── Native Header ── */}
      {Platform.OS !== 'web' && !isDesktop && (
        <XStack
          paddingTop="$2"
          paddingBottom="$3"
          paddingHorizontal="$4"
          alignItems="center"
          backgroundColor="white"
          borderBottomWidth={1}
          borderBottomColor={colors.gray[200]}
          zIndex={50}
        >
          <Button
            unstyled
            icon={<ArrowLeft size={24} color={colors.gray[800]} />}
            onPress={() => router.back()}
            padding="$2"
            marginLeft="$-2"
          />
          <Text fontSize={20} fontWeight="700" color={colors.gray[900]} marginLeft="$2">
            Transaction History
          </Text>
        </XStack>
      )}

      <ScrollView flex={1} contentContainerStyle={{ flexGrow: 1, paddingBottom: (bottom || 20) + 60 }} keyboardShouldPersistTaps="handled">
        <YStack maxWidth={896} width="100%" alignSelf="center" paddingHorizontal={isDesktop ? '$6' : '$4'} paddingVertical="$4" gap="$4">

          {/* Page Title */}
          <YStack gap="$1">
            {(Platform.OS === 'web' || isDesktop) && (
              <Text fontSize="$7" fontWeight="700" color={colors.gray[900]}>Transaction History</Text>
            )}
            <Text fontSize="$3" color={colors.gray[500]}>
              All point transactions for your account
            </Text>
          </YStack>

          {/* Summary Cards */}
          <XStack gap="$3" flexWrap="wrap">
            <SummaryCard label="Current Balance" value={`${userPoints.toLocaleString()} pts`} color={colors.green[600]} />
            <SummaryCard label="Total Bought" value={`${totalBought.toLocaleString()} pts`} color={colors.blue[600]} />
            <SummaryCard label="Total Earned" value={`${totalEarned.toLocaleString()} pts`} color={colors.amber[600]} />
            <SummaryCard label="Total Spent" value={`${totalSpent.toLocaleString()} pts`} color={colors.red[600]}
              subtitle={totalPlatformCharges > 0 ? `(incl. ${totalPlatformCharges.toLocaleString()} platform fees)` : undefined}
            />
          </XStack>

          {/* Search */}
          <XStack
            backgroundColor="white" borderRadius={borderRadius.lg} borderWidth={1}
            borderColor={colors.gray[200]} paddingHorizontal="$3" alignItems="center" height={44} gap="$2"
          >
            <Search size={16} color={colors.gray[400]} />
            <Input flex={1} unstyled
              placeholder="Search by name, brand, charity, order..."
              placeholderTextColor={colors.gray[400] as any}
              value={searchQuery}
              onChangeText={setSearchQuery}
              fontSize={14} color={colors.gray[800]}
            />
          </XStack>

          {/* Date Period Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <XStack gap="$2" paddingVertical="$1">
              {([
                { key: 'all', label: 'All Time' },
                { key: '7d', label: 'Last 7 Days' },
                { key: '90d', label: 'Last 90 Days' },
                { key: 'custom', label: 'Custom Range' },
              ] as { key: DatePeriod; label: string }[]).map((p) => (
                <Button key={p.key} unstyled paddingHorizontal="$3" paddingVertical="$1.5" borderRadius={20}
                  borderWidth={1} borderColor={datePeriod === p.key ? colors.blue[600] : colors.gray[200]}
                  backgroundColor={datePeriod === p.key ? colors.blue[50] as any : 'white'}
                  onPress={() => {
                    setDatePeriod(p.key)
                    if (p.key !== 'custom') {
                      setCustomFrom('')
                      setCustomTo('')
                    }
                  }}
                >
                  <Text fontSize="$2" fontWeight="500" color={datePeriod === p.key ? colors.blue[700] as any : colors.gray[600]}>
                    {p.label}
                  </Text>
                </Button>
              ))}
            </XStack>
          </ScrollView>

          {/* Custom Date Range Picker */}
          {datePeriod === 'custom' && Platform.OS === 'web' && (
            <XStack gap="$3" alignItems="center" flexWrap="wrap">
              <XStack gap="$2" alignItems="center">
                <Text fontSize={12} fontWeight="500" color={colors.gray[600]}>From</Text>
                <div style={{ position: 'relative' }}>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e: any) => setCustomFrom(e.target.value)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: `1px solid ${colors.gray[300]}`,
                      fontSize: 13, color: colors.gray[800], backgroundColor: 'white', outline: 'none',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              </XStack>
              <XStack gap="$2" alignItems="center">
                <Text fontSize={12} fontWeight="500" color={colors.gray[600]}>To</Text>
                <div style={{ position: 'relative' }}>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e: any) => setCustomTo(e.target.value)}
                    min={customFrom || undefined}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: `1px solid ${colors.gray[300]}`,
                      fontSize: 13, color: colors.gray[800], backgroundColor: 'white', outline: 'none',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              </XStack>
              {(customFrom || customTo) && (
                <Button unstyled paddingHorizontal="$2" paddingVertical="$1" borderRadius={6}
                  hoverStyle={{ backgroundColor: colors.gray[100] }}
                  onPress={() => { setCustomFrom(''); setCustomTo('') }}
                >
                  <Text fontSize={11} color={colors.gray[500]}>Clear</Text>
                </Button>
              )}
            </XStack>
          )}

          {/* Type Filters + Sort */}
          <XStack justifyContent="space-between" alignItems="center">
            <XStack gap="$2">
              {([
                { key: 'all', label: 'All' },
                { key: 'credits', label: 'Credits' },
                { key: 'debits', label: 'Debits' },
              ] as { key: FilterType; label: string }[]).map((f) => (
                <Button key={f.key} unstyled paddingHorizontal="$3" paddingVertical="$1.5" borderRadius={20}
                  borderWidth={1} borderColor={filter === f.key ? colors.green[600] : colors.gray[200]}
                  backgroundColor={filter === f.key ? colors.green[50] : 'white'}
                  onPress={() => setFilter(f.key)}
                >
                  <Text fontSize="$2" fontWeight="500" color={filter === f.key ? colors.green[700] : colors.gray[600]}>
                    {f.label}
                  </Text>
                </Button>
              ))}
            </XStack>

            {/* Sort toggle */}
            <Button unstyled flexDirection="row" gap="$1" alignItems="center"
              paddingHorizontal="$2" paddingVertical="$1.5" borderRadius={8}
              hoverStyle={{ backgroundColor: colors.gray[100] }}
              onPress={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
            >
              {sortOrder === 'newest'
                ? <ArrowDown size={14} color={colors.gray[600]} />
                : <ArrowUp size={14} color={colors.gray[600]} />
              }
              <Text fontSize={12} fontWeight="500" color={colors.gray[600]}>
                {sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
              </Text>
            </Button>
          </XStack>

          {/* Transaction List */}
          <YStack gap="$3">
            {txLoading ? (
              <YStack padding="$6" alignItems="center">
                <Text color={colors.gray[400]}>Loading transactions…</Text>
              </YStack>
            ) : filteredTransactions.length === 0 ? (
              <YStack padding="$6" alignItems="center">
                <Text color={colors.gray[400]}>No transactions found</Text>
              </YStack>
            ) : (
              filteredTransactions.map((tx) => (
                <TransactionCard
                  key={tx.id} tx={tx}
                  onOpenChat={onNavigateToChat}
                  onCopyCode={handleCopyCode}
                  onShare={handleShare}
                  onViewDetail={setSelectedTx}
                />
              ))
            )}
          </YStack>
        </YStack>
      </ScrollView>
    </YStack>

      {/* Gift Card Detail Sheet */}
      {selectedTx?.type === 'redemption' && (
        <GiftCardDetailSheet
          key={selectedTx.id}
          visible
          onClose={() => setSelectedTx(null)}
          brandName={selectedTx.description.replace('Redeemed: ', '')}
          amount={Math.abs(selectedTx.amount) / POINTS_PER_DOLLAR}
          pointsCost={Math.abs(selectedTx.amount)}
          code={selectedTx.giftCardCode}
          url={selectedTx.giftCardUrl}
          status={(selectedTx.status || 'completed') as any}
          redeemedAt={selectedTx.date}
          provider={selectedTx.provider}
        />
      )}

      {/* Donation Receipt Sheet */}
      {selectedTx?.type === 'donation' && selectedTx.donationOrg && (
        <DonationReceiptSheet
          visible
          onClose={() => setSelectedTx(null)}
          organizationName={selectedTx.donationOrg}
          projectTitle={selectedTx.donationProject}
          theme={selectedTx.donationTheme}
          amount={Math.abs(selectedTx.amount)}
          donatedAt={selectedTx.date}
          receiptUrl={selectedTx.donationReceiptUrl}
        />
      )}
    </>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

function SummaryCard({ label, value, color, subtitle }: { label: string; value: string; color: string; subtitle?: string }) {
  return (
    <YStack flex={1} minWidth={140} backgroundColor="white" borderRadius={borderRadius.lg}
      borderWidth={1} borderColor={colors.gray[200]} padding="$3" gap="$1"
    >
      <Text fontSize={12} color={colors.gray[500]}>{label}</Text>
      <Text fontSize="$5" fontWeight="700" color={color as any}>{value}</Text>
      {subtitle && <Text fontSize={10} color={colors.gray[400]}>{subtitle}</Text>}
    </YStack>
  )
}

function TransactionCard({ tx, onOpenChat, onCopyCode, onShare, onViewDetail }: {
  tx: Transaction
  onOpenChat?: (postId: string, otherUserId: string) => void
  onCopyCode: (code: string) => void
  onShare: (url: string, title: string) => void
  onViewDetail?: (tx: Transaction) => void
}) {
  const config = TYPE_CONFIG[tx.type]
  const Icon = config.icon
  const isCredit = tx.amount > 0

  return (
    <YStack
      backgroundColor="white" borderRadius={borderRadius.lg} borderWidth={1}
      borderColor={colors.gray[200]} overflow="hidden"
    >
      {/* Main Row */}
      <XStack padding="$3" gap="$3" alignItems="center">
        {/* Icon */}
        <YStack
          width={40} height={40} borderRadius={20}
          backgroundColor={config.bgColor as any} alignItems="center" justifyContent="center"
          flexShrink={0}
        >
          <Icon size={18} color={config.color} />
        </YStack>

        {/* Details */}
        <YStack flex={1} gap={2}>
          <Text fontSize="$3" fontWeight="600" color={colors.gray[800]} numberOfLines={2}>
            {tx.description}
          </Text>
          {/* Date & Time — always shown */}
          <Text fontSize={11} color={colors.gray[400]}>
            {formatDateTime(tx.date)}
          </Text>
          {tx.counterparty && (
            <Text fontSize={11} color={colors.gray[500]}>with {tx.counterparty}</Text>
          )}
        </YStack>

        {/* Amount */}
        <YStack alignItems="flex-end" gap={2} flexShrink={0}>
          <Text fontSize="$4" fontWeight="700" color={isCredit ? colors.green[600] : colors.red[600]}>
            {isCredit ? '+' : ''}{tx.amount.toLocaleString()} pts
          </Text>
          {tx.orderId && (
            <Text fontSize={10} color={colors.gray[400]}>#{tx.orderId}</Text>
          )}
        </YStack>
      </XStack>

      {/* Sale: platform fee breakdown */}
      {tx.type === 'sale_credit' && tx.platformFee != null && tx.grossAmount != null && (
        <YStack backgroundColor={colors.gray[50]} paddingHorizontal="$3" paddingVertical="$2"
          borderTopWidth={1} borderTopColor={colors.gray[100]} gap={2}
        >
          <XStack justifyContent="space-between">
            <Text fontSize={11} color={colors.gray[500]}>Sale total</Text>
            <Text fontSize={11} color={colors.gray[600]}>{tx.grossAmount.toLocaleString()} pts</Text>
          </XStack>
          <XStack justifyContent="space-between">
            <Text fontSize={11} color={colors.amber[700]}>Platform fee ({PLATFORM_FEE_PERCENT}%)</Text>
            <Text fontSize={11} color={colors.amber[700]}>-{tx.platformFee.toLocaleString()} pts</Text>
          </XStack>
          <XStack justifyContent="space-between">
            <Text fontSize={11} fontWeight="600" color={colors.green[700]}>You received</Text>
            <Text fontSize={11} fontWeight="600" color={colors.green[700]}>{tx.amount.toLocaleString()} pts</Text>
          </XStack>
        </YStack>
      )}

      {/* Purchase details */}
      {tx.type === 'purchase' && tx.detail && (
        <YStack backgroundColor={colors.gray[50]} paddingHorizontal="$3" paddingVertical="$2"
          borderTopWidth={1} borderTopColor={colors.gray[100]}
        >
          <Text fontSize={11} color={colors.gray[500]}>{tx.detail}</Text>
        </YStack>
      )}

      {/* Referral detail */}
      {tx.type === 'referral' && tx.detail && (
        <YStack backgroundColor={colors.blue[50] as any} paddingHorizontal="$3" paddingVertical="$2"
          borderTopWidth={1} borderTopColor={colors.gray[100]}
        >
          <Text fontSize={11} color={colors.blue[700] as any}>{tx.detail}</Text>
        </YStack>
      )}

      {/* Action buttons row */}
      {(tx.postId || tx.giftCardCode || tx.donationOrg || tx.type === 'redemption' || tx.type === 'donation') && (
        <XStack borderTopWidth={1} borderTopColor={colors.gray[100]} paddingHorizontal="$2" paddingVertical="$1.5" gap="$1" flexWrap="wrap">
          {/* Buy/Sell/Refund → Open Chat */}
          {tx.postId && tx.otherUserId && (
            <ActionButton icon={MessageSquare} label="Open Chat"
              color={colors.blue[600]}
              onPress={() => onOpenChat?.(tx.postId!, tx.otherUserId!)}
            />
          )}

          {/* Redemption → Copy Code + Share Link */}
          {tx.giftCardCode && (
            <>
              <ActionButton icon={Copy} label={`Copy: ${tx.giftCardCode}`}
                color={colors.purple[600]}
                onPress={() => onCopyCode(tx.giftCardCode!)}
              />
              {tx.giftCardUrl && (
                <ActionButton icon={Share2} label="Share Card"
                  color={colors.purple[600]}
                  onPress={() => onShare(tx.giftCardUrl!, tx.description)}
                />
              )}
            </>
          )}

          {/* Donation → View Receipt */}
          {tx.type === 'donation' && tx.donationOrg && (
            <ActionButton icon={Receipt} label="View Receipt"
              color={colors.pink[600]}
              onPress={() => onViewDetail?.(tx)}
            />
          )}

          {/* Redemption → View Card Details */}
          {tx.type === 'redemption' && (
            <ActionButton icon={Gift} label="View Details"
              color={colors.purple[600]}
              onPress={() => onViewDetail?.(tx)}
            />
          )}
        </XStack>
      )}
    </YStack>
  )
}

function ActionButton({ icon: Icon, label, color, onPress }: {
  icon: any; label: string; color: string; onPress: () => void
}) {
  if (Platform.OS === 'web') {
    return (
      <button
        onClick={onPress}
        style={{
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6,
          padding: '6px 8px', borderRadius: 8, border: 'none', background: 'transparent',
          cursor: 'pointer', fontSize: 11, fontWeight: 500, color,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = colors.gray[100] }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <Icon size={13} color={color} />
        <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      </button>
    )
  }
  return (
    <Button unstyled
      paddingHorizontal="$2" paddingVertical="$1.5" borderRadius={8}
      flexDirection="row" gap="$1.5" alignItems="center"
      hoverStyle={{ backgroundColor: colors.gray[100] }}
      pressStyle={{ backgroundColor: colors.gray[200] }}
      onPress={onPress}
    >
      <Icon size={13} color={color} />
      <Text fontSize={11} fontWeight="500" color={color as any} numberOfLines={1}>{label}</Text>
    </Button>
  )
}
