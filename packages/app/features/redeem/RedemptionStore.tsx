'use client'

/**
 * RedemptionStore — 3-tab screen: Gift Cards | Donate | 529 Savings
 *
 * Follows the BuyPointsScreen pattern: on web the AppHeader handles
 * navigation, on native this component renders its own inline header.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input, ScrollView, Spinner, useMedia } from 'tamagui'
import { Platform, Image, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Search, Gift, Heart, GraduationCap, CheckCircle, ArrowLeft, Banknote } from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'solito/navigation'
import {
  MOCK_GIFT_CARDS,
  MOCK_CHARITIES, CHARITY_THEMES,
  POINTS_PER_DOLLAR,
  type GiftCardProduct, type CharityProject,
} from './mock-data'
import { supabase } from '../auth/auth-hook'
import { GiftCardSheet } from './GiftCardSheet'
import { GiftCardDetailSheet } from './GiftCardDetailSheet'
import { DonationSheet } from './DonationSheet'
import { DonationReceiptSheet } from './DonationReceiptSheet'
import { useAuth } from '../auth/auth-hook'
import { usePointsBalance } from '../../hooks/usePointsBalance'
import { CashoutSheet } from './CashoutSheet'

// =============================================================================
// Props
// =============================================================================

export interface RedemptionStoreProps {
  onNavigateToFeed?: () => void
}

type Tab = 'giftCards' | 'donate' | '529' | 'cashout'

// =============================================================================
// Component
// =============================================================================

export function RedemptionStore({ onNavigateToFeed }: RedemptionStoreProps) {
  const { t } = useTranslation()
  const media = useMedia()
  // @ts-ignore
  const isDesktop = media.lg || media.xl || media.xxl

  const { user: realUser } = useAuth()
  
  // E2E Test Bypass: Provide a mocked user ID so profile queries execute
  let bypassE2E = false
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      if (window.localStorage.getItem('E2E_BYPASS_AUTH') === 'true') {
        bypassE2E = true
      }
    }
  } catch (e) {
    // Ignore native crashes where localStorage getters are not implemented
  }

  const user = bypassE2E ? { id: '00000000-0000-0000-0000-000000000000', email: 'test@example.com' } as any : realUser

  const { balance: userPoints, refetch: refetchBalance, adjustBalance } = usePointsBalance(user?.id)

  // Tab state — persisted to localStorage on web, AsyncStorage on native
  const [activeTab, setActiveTab] = useState<Tab | null>(null)

  // Load saved tab from AsyncStorage on native
  useEffect(() => {
    const loadSavedTab = async () => {
      let saved: string | null = null
      if (Platform.OS === 'web') {
        try { saved = localStorage.getItem('redeem_active_tab') } catch (e) {}
      } else {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default
        try { saved = await AsyncStorage.getItem('redeem_active_tab') } catch (e) {}
      }
      if (saved === 'giftCards' || saved === 'donate' || saved === '529' || saved === 'cashout') {
        setActiveTab(saved as Tab)
      }
    }
    loadSavedTab()
  }, [])

  useEffect(() => {
    if (!activeTab) return
    if (Platform.OS === 'web') {
      try { localStorage.setItem('redeem_active_tab', activeTab) } catch (e) {}
    } else {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default
      AsyncStorage.setItem('redeem_active_tab', activeTab).catch(() => {})
    }
  }, [activeTab])

  // Gift Cards state
  const [gcSearch, setGcSearch] = useState('')
  const [gcCategory, setGcCategory] = useState('All')
  const [selectedCard, setSelectedCard] = useState<GiftCardProduct | null>(null)
  const [sheetVisible, setSheetVisible] = useState(false)
  const [catalogCards, setCatalogCards] = useState<GiftCardProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [redeeming, setRedeeming] = useState(false)
  const [redemptionResult, setRedemptionResult] = useState<{
    brandName: string; amount: number; pointsCost: number;
    code?: string; url?: string; provider?: string; redeemedAt: string;
    status?: string;
  } | null>(null)

  // Donate state
  const [charitySearch, setCharitySearch] = useState('')
  const [charityTheme, setCharityTheme] = useState('All')
  const [selectedCharity, setSelectedCharity] = useState<CharityProject | null>(null)
  const [donationProjects, setDonationProjects] = useState<CharityProject[]>([])
  const [completedDonation, setCompletedDonation] = useState<{
    organizationName: string; projectTitle: string; theme: string;
    amount: number; donatedAt: string; receiptId?: string; status?: string;
  } | null>(null)

  // Active Methods State
  const [activeMethods, setActiveMethods] = useState<{
    method: string;
    is_active: boolean;
    instruments: { instrument: string; is_active: boolean }[];
  }[]>([])

  useEffect(() => {
    const fetchMethods = () => {
      supabase.rpc('get_active_redemption_providers').then(({ data }) => {
        if (data) setActiveMethods(data)
      })
    }

    fetchMethods()

    const channel1 = supabase
      .channel('methods-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'available_redemption_methods' },
        () => fetchMethods()
      )
      .subscribe()

    const channel2 = supabase
      .channel('instruments-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'available_redemption_method_instruments' },
        () => fetchMethods()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel1)
      supabase.removeChannel(channel2)
    }
  }, [])

  // Generate Available Tabs
  const availableTabs = useMemo(() => {
    const tabs: { key: Tab; icon: any; label: string }[] = []

    const isMethodAvailable = (methodName: string) => {
      const methodObj = activeMethods.find(m => m.method === methodName)
      if (!methodObj?.is_active) return false
      
      // Secondary check: if it has instruments, at least one MUST be active
      if (methodObj.instruments && methodObj.instruments.length > 0) {
        return methodObj.instruments.some(inst => inst.is_active)
      }
      
      return true
    }
    
    // Gift Cards
    if (isMethodAvailable('giftcards')) {
      tabs.push({ key: 'giftCards', icon: Gift, label: 'Gift Cards' })
    }
    
    // Donate
    if (isMethodAvailable('charity')) {
      tabs.push({ key: 'donate', icon: Heart, label: 'Donate' })
    }    
    
    // Cashout
    if (isMethodAvailable('cashout')) {
      tabs.push({ key: 'cashout', icon: Banknote, label: 'Cashout' })
    }
    
    // 529
    if (isMethodAvailable('529c')) {
      tabs.push({ key: '529', icon: GraduationCap, label: '529 Savings' })
    }
    
    return tabs
  }, [activeMethods])

  // Fix active tab logic ensuring a hidden tab defaults gracefully
  useEffect(() => {
    if (availableTabs.length > 0) {
      if (!activeTab || !availableTabs.find(t => t.key === activeTab)) {
        setActiveTab(availableTabs[0]!.key)
      }
    }
  }, [availableTabs, activeTab])

  // 529 state — persisted to feature_waitlist table
  const [waitlistJoined, setWaitlistJoined] = useState(false)

  // Check if user already joined 529 waitlist
  useEffect(() => {
    if (!user?.id) return
    supabase.from('feature_waitlist').select('id').eq('user_id', user.id).eq('feature', '529').maybeSingle()
      .then(({ data }) => { if (data) setWaitlistJoined(true) })
  }, [user?.id])

  const handleJoinWaitlist = useCallback(async () => {
    if (!user?.id) return
    const { error } = await supabase.from('feature_waitlist').insert({
      user_id: user.id,
      feature: '529',
      email: user.email,
    })
    if (!error) {
      setWaitlistJoined(true)
      Alert.alert('You\'re on the list! 🎉', 'We\'ll notify you when 529 plans become available.')
    }
  }, [user?.id, user?.email])

  // ── Fetch gift card catalog from edge function ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        console.log('[REDEEM] Fetching catalog from edge function...')
        const { data, error } = await supabase.functions.invoke('fetch-gift-cards')
        console.log('[REDEEM] Response:', { data: data ? `${data?.cards?.length ?? 0} cards` : 'null', error })
        if (!cancelled && !error && data?.cards?.length > 0) {
          setCatalogCards(data.cards)
          console.log('[REDEEM] Loaded', data.cards.length, 'real products')
        } else if (error) {
          console.warn('[REDEEM] Edge function error:', error)
        }
      } catch (err) {
        console.warn('[REDEEM] Catalog fetch failed:', err)
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Derive unique categories from fetched catalog
  const dynamicCategories = useMemo(() => {
    if (catalogCards.length === 0) return ['All']
    const cats = new Set(catalogCards.map((c) => c.category))
    return ['All', ...Array.from(cats).sort()]
  }, [catalogCards])

  // Filtered lists
  const filteredCards = useMemo(() => {
    let cards = catalogCards
    if (gcCategory !== 'All') cards = cards.filter((c) => c.category === gcCategory)
    if (gcSearch) cards = cards.filter((c) => c.brandName.toLowerCase().includes(gcSearch.toLowerCase()))
    return cards
  }, [gcSearch, gcCategory, catalogCards])

  // ── Fetch donation projects from edge function ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('fetch-donation-projects')
        if (!cancelled && !error && data?.projects?.length > 0) {
          setDonationProjects(data.projects)
          console.log('[DONATE] Loaded', data.projects.length, 'projects')
        }
      } catch (err) {
        console.warn('[DONATE] Fetch failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Debounced server-side search for donations ──
  const [searchResults, setSearchResults] = useState<CharityProject[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const handleCharitySearchSubmit = useCallback(async () => {
    if (!charitySearch || charitySearch.length < 2) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      const { data, error } = await supabase.functions.invoke('fetch-donation-projects', {
        body: { q: charitySearch },
      })
      if (error) throw error
      if (data?.projects) {
        setSearchResults(data.projects)
      }
    } catch (err) {
      console.warn('[DONATE] Search failed:', err)
    } finally {
      setIsSearching(false)
    }
  }, [charitySearch])

  // Clear search results immediately if the user clears the search box
  useEffect(() => {
    if (!charitySearch) {
      setSearchResults(null)
    }
  }, [charitySearch])

  const filteredCharities = useMemo(() => {
    // If searching via API, use search results
    if (searchResults !== null) {
      let charities = searchResults
      if (charityTheme !== 'All') charities = charities.filter((c) => c.theme === charityTheme)
      return charities
    }
    // Otherwise filter cached browse projects
    let charities = donationProjects
    if (charityTheme !== 'All') charities = charities.filter((c) => c.theme === charityTheme)
    if (charitySearch) charities = charities.filter((c) => c.title.toLowerCase().includes(charitySearch.toLowerCase()))
    return charities
  }, [charitySearch, charityTheme, donationProjects, searchResults])

  const handleSelectCard = useCallback((card: GiftCardProduct) => {
    setSelectedCard(card)
    setSheetVisible(true)
  }, [])

  const handleCloseSheet = useCallback(() => {
    setSheetVisible(false)
  }, [])

  const handleGiftCardConfirm = useCallback(async (card: GiftCardProduct, amount: number, totalPoints: number) => {
    setSheetVisible(false)
    // Optimistically deduct points and show loading
    adjustBalance(-totalPoints)
    setRedeeming(true)
    try {
      console.log('[REDEEM] Calling edge function...', { brandName: card.brandName, amount, totalPoints })
      const { data, error } = await supabase.functions.invoke('redeem-gift-card', {
        body: {
          brandName: card.brandName,
          faceValueCents: Math.round(amount * 100),
          pointsCost: totalPoints,
        },
      })
      console.log('[REDEEM] Response:', { data, error })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      // Show details sheet immediately so user can share
      setRedemptionResult({
        brandName: card.brandName,
        amount,
        pointsCost: totalPoints,
        code: data?.cardCode || undefined,
        url: data?.cardUrl || undefined,
        provider: data?.provider,
        redeemedAt: new Date().toISOString(),
        status: data?.status || 'pending',
      })
      setTimeout(() => refetchBalance(), 2000)
    } catch (err) {
      console.error('[REDEEM] Error:', err)
      // Reverse optimistic deduction
      adjustBalance(totalPoints)
      const msg = err instanceof Error ? err.message : 'Redemption failed'
      if (Platform.OS === 'web') {
        window.alert(`Redemption Failed: ${msg}`)
      } else {
        Alert.alert('Redemption Failed', msg)
      }
    } finally {
      setRedeeming(false)
    }
  }, [refetchBalance, adjustBalance])

  const handleDonationConfirm = useCallback(async (project: CharityProject, pointsAmount: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('donate-points', {
        body: {
          projectId: project.id,
          projectTitle: project.title,
          organizationName: project.organization,
          theme: project.theme,
          pointsAmount,
        },
      })

      if (error) {
        Alert.alert('Donation Failed', error.message || 'Something went wrong. Please try again.')
        return
      }

      if (data?.error) {
        Alert.alert('Donation Failed', data.error)
        return
      }

      // Success — update balance and show confirmation
      adjustBalance(-pointsAmount)
      refetchBalance()
      setSelectedCharity(null)

      // Dispatch custom event for cross-page balance sync
      if (typeof window !== 'undefined') {
      if (Platform.OS === 'web') {
        window.dispatchEvent(new CustomEvent('points-balance-changed'))
      }
      }

      setCompletedDonation({
        organizationName: project.organization,
        projectTitle: project.title,
        theme: project.theme || '',
        amount: pointsAmount,
        donatedAt: new Date().toISOString(),
        receiptId: data.receiptNumber,
        status: data.status || 'queued',
      })
    } catch (err: any) {
      Alert.alert('Donation Failed', err?.message || 'Something went wrong. Please try again.')
    }
  }, [adjustBalance, refetchBalance])

  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* ── Native Header ── */}
      {Platform.OS !== 'web' && !isDesktop && (
        <XStack
          paddingTop={insets.top + (Platform.OS === 'ios' ? 10 : 20)}
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
            onPress={() => onNavigateToFeed ? onNavigateToFeed() : router.back()}
            padding="$2"
            marginLeft="$-2"
          />
          <Text fontSize={20} fontWeight="700" color={colors.gray[900]} marginLeft="$2">
            Redeem points
          </Text>
        </XStack>
      )}

      <ScrollView flex={1} contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <YStack maxWidth={896} width="100%" alignSelf="center" paddingHorizontal={isDesktop ? '$6' : '$4'} paddingVertical="$4" gap="$4">

          {/* Page Title + Balance */}
          <XStack justifyContent="space-between" alignItems="center">
            <YStack gap="$1" flex={1}>
              {(Platform.OS === 'web' || isDesktop) && (
                <Text fontSize="$7" fontWeight="700" color={colors.gray[900]}>Redeem Points</Text>
              )}
              <Text fontSize="$3" color={colors.gray[500]}>
                Turn your CasaGrown points into gift cards, donations, or college savings.
              </Text>
            </YStack>
            {!isDesktop && (
              <YStack
                backgroundColor={colors.green[600]} paddingHorizontal="$3" paddingVertical="$2"
                borderRadius={borderRadius.lg} alignItems="center"
              >
                <Text fontSize={11} fontWeight="500" color="rgba(255,255,255,0.8)">Balance</Text>
                <Text fontSize="$4" fontWeight="700" color="white">{userPoints.toLocaleString()} pts</Text>
              </YStack>
            )}
          </XStack>

          {/* Tabs */}
          <XStack flexWrap="wrap" gap="$3" justifyContent="center" width="100%">
            {availableTabs.map(({ key, icon: Icon, label }) => (
              <Button 
                key={key} 
                unstyled 
                paddingVertical="$3" 
                paddingHorizontal="$4" 
                alignItems="center" 
                justifyContent="center" 
                flexGrow={1}
                flexBasis={isDesktop ? 0 : '45%'} // 2 columns minimum on mobile
                backgroundColor={activeTab === key ? colors.green[600] : 'white'}
                onPress={() => setActiveTab(key)}
                flexDirection="row" 
                gap="$2"
                borderRadius={borderRadius.lg}
                borderWidth={1}
                borderColor={activeTab === key ? colors.green[600] : colors.gray[200]}
                shadowColor="rgba(0,0,0,0.05)"
                shadowOffset={{ width: 0, height: 2 }}
                shadowRadius={4}
              >
                <Icon size={18} color={activeTab === key ? 'white' : colors.gray[500]} />
                <Text fontSize="$3" fontWeight="600" color={activeTab === key ? 'white' : colors.gray[700]} numberOfLines={1}>
                  {label}
                </Text>
              </Button>
            ))}
          </XStack>

          {/* Tab content */}
          {activeTab === 'giftCards' && (
            <GiftCardsTab
              search={gcSearch} setSearch={setGcSearch}
              category={gcCategory} setCategory={setGcCategory}
              cards={filteredCards} onSelect={handleSelectCard}
              isDesktop={isDesktop}
              categories={dynamicCategories}
              userPoints={userPoints}
              loading={catalogLoading}
            />
          )}

          {activeTab === 'donate' && (
            <DonateTab
              search={charitySearch} setSearch={setCharitySearch}
              theme={charityTheme} setTheme={setCharityTheme}
              charities={filteredCharities} onSelect={setSelectedCharity}
              isSearching={isSearching}
              onSubmit={handleCharitySearchSubmit}
            />
          )}

          {activeTab === '529' && (
            <Tab529 joined={waitlistJoined} onJoin={handleJoinWaitlist} />
          )}

          {activeTab === 'cashout' && (
            <CashoutTab balance={userPoints} userId={user?.id} adjustBalance={adjustBalance} />
          )}


        </YStack>
      </ScrollView>

      {/* Loading overlay while redeeming */}
      {redeeming && Platform.OS === 'web' && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9998, flexDirection: 'column', gap: 16,
        }}>
          <Spinner size="large" color="white" />
          <Text fontSize="$4" fontWeight="600" color="white">Processing your gift card...</Text>
        </div>
      )}
      {redeeming && Platform.OS !== 'web' && (
        <YStack position="absolute" top={0} left={0} right={0} bottom={0}
          backgroundColor="rgba(0,0,0,0.5)" alignItems="center" justifyContent="center" zIndex={9998}
        >
          <Spinner size="large" color="white" />
          <Text fontSize="$4" fontWeight="600" color="white" marginTop="$3">Processing your gift card...</Text>
        </YStack>
      )}

      {/* Sheets */}
      {selectedCard && (
        <GiftCardSheet
          visible={sheetVisible}
          card={selectedCard}
          balance={userPoints}
          onClose={handleCloseSheet}
          onConfirm={handleGiftCardConfirm}
          t={t}
        />
      )}
      {selectedCharity && (
        <DonationSheet
          visible={!!selectedCharity}
          project={selectedCharity}
          balance={userPoints}
          onClose={() => setSelectedCharity(null)}
          onConfirm={handleDonationConfirm}
          t={t}
        />
      )}
      {redemptionResult && (
        <GiftCardDetailSheet
          visible
          onClose={() => setRedemptionResult(null)}
          brandName={redemptionResult.brandName}
          amount={redemptionResult.amount}
          pointsCost={redemptionResult.pointsCost}
          code={redemptionResult.code}
          url={redemptionResult.url}
          status={redemptionResult.status as any}
          redeemedAt={redemptionResult.redeemedAt}
          provider={redemptionResult.provider}
        />
      )}
      {completedDonation && (
        <DonationReceiptSheet
          visible
          onClose={() => setCompletedDonation(null)}
          organizationName={completedDonation.organizationName}
          projectTitle={completedDonation.projectTitle}
          theme={completedDonation.theme}
          amount={completedDonation.amount}
          donatedAt={completedDonation.donatedAt}
          receiptId={completedDonation.receiptId}
        />
      )}
    </YStack>
  )
}

// =============================================================================
// Gift Cards Tab
// =============================================================================

function GiftCardsTab({
  search, setSearch, category, setCategory, cards, onSelect, isDesktop, categories, userPoints, loading,
}: {
  search: string; setSearch: (v: string) => void
  category: string; setCategory: (v: string) => void
  cards: GiftCardProduct[]; onSelect: (c: GiftCardProduct) => void
  isDesktop: boolean
  categories: string[]
  userPoints: number
  loading: boolean
}) {
  return (
    <YStack gap="$3">
      {/* Search */}
      <XStack
        backgroundColor="white" borderRadius={borderRadius.lg} borderWidth={1}
        borderColor={colors.gray[200]} paddingHorizontal="$3" alignItems="center" height={44}
      >
        <Search size={16} color={colors.gray[400]} />
        <Input flex={1} unstyled placeholder="Search gift cards..." placeholderTextColor={colors.gray[400] as any}
          value={search} onChangeText={setSearch} fontSize={14} marginLeft="$2" color={colors.gray[800]}
        />
      </XStack>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$2">
          {categories.map((cat) => (
            <Button key={cat} unstyled paddingHorizontal="$3" paddingVertical="$1.5" borderRadius={20}
              borderWidth={1} borderColor={category === cat ? colors.green[600] : colors.gray[200]}
              backgroundColor={category === cat ? colors.green[50] : 'white'}
              onPress={() => setCategory(cat)}
            >
              <Text fontSize="$2" fontWeight="500" color={category === cat ? colors.green[700] : colors.gray[600]}>
                {cat}
              </Text>
            </Button>
          ))}
        </XStack>
      </ScrollView>

      {/* Grid */}
      {loading ? (
        <YStack padding="$6" alignItems="center" gap="$3">
          <Spinner size="large" color={colors.green[600]} />
          <Text color={colors.gray[400]}>Loading gift cards...</Text>
        </YStack>
      ) : cards.length === 0 ? (
        <YStack padding="$6" alignItems="center">
          <Text color={colors.gray[400]}>No gift cards found</Text>
        </YStack>
      ) : Platform.OS === 'web' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {cards.map((card, index) => (
            <GiftCard key={card.id} card={card} onSelect={onSelect} canAfford={userPoints >= card.minDenomination * POINTS_PER_DOLLAR} index={index} />
          ))}
        </ScrollView>
      ) : (
        <XStack flexWrap="wrap" gap="$3" justifyContent="space-between">
          {cards.map((card, index) => (
            <YStack key={card.id} width="48%">
              <GiftCard card={card} onSelect={onSelect} canAfford={userPoints >= card.minDenomination * POINTS_PER_DOLLAR} index={index} />
            </YStack>
          ))}
        </XStack>
      )}
    </YStack>
  )
}

// =============================================================================
// Gift Card Tile (used by both web grid and native flex)
// =============================================================================

function GiftCard({ card, onSelect, canAfford, index }: { card: GiftCardProduct; onSelect: (c: GiftCardProduct) => void; canAfford: boolean; index?: number }) {
  // Derive a lighter shade for gradient
  const hex = card.brandColor || '#4B5563'
  const lighterHex = hex + '99'

  // Affordability check
  const minPointsNeeded = card.minDenomination * POINTS_PER_DOLLAR
  const pointsShort = minPointsNeeded - (canAfford ? minPointsNeeded : 0) // Only show if not affordable

  const inner = (
    <YStack
      borderRadius={borderRadius.lg}
      overflow="hidden"
      height={180}
      position="relative"
      pointerEvents="none"
    >
      {/* ── Background: card image or brand gradient ── */}
      {Platform.OS === 'web' ? (
        <div style={{
          position: 'absolute', inset: 0,
          background: card.cardImageUrl
            ? `url(${card.cardImageUrl}) center/contain no-repeat, linear-gradient(135deg, ${hex} 0%, ${lighterHex} 60%, ${hex}DD 100%)`
            : `linear-gradient(135deg, ${hex} 0%, ${lighterHex} 60%, ${hex}DD 100%)`,
        }} />
      ) : card.cardImageUrl ? (
        <Image 
          source={{ uri: card.cardImageUrl }}
          style={{ width: '100%', height: '100%', position: 'absolute', backgroundColor: hex }}
          resizeMode="contain"
        />
      ) : (
        <YStack position="absolute" top={0} left={0} right={0} bottom={0}
          backgroundColor={hex as any} />
      )}

      {/* ── Subtle overlay for text readability ── */}
      {(Platform.OS === 'web' || card.cardImageUrl) && (
        <YStack position="absolute" top={0} left={0} right={0} bottom={0} backgroundColor="rgba(0,0,0,0.3)" />
      )}

      {/* ── "Need more points" badge (top-right) ── */}
      {!canAfford && (
        <YStack
          position="absolute" top={8} right={8} zIndex={3}
          backgroundColor="rgba(220,38,38,0.85)" paddingHorizontal={6} paddingVertical={2}
          borderRadius={6}
        >
          <Text fontSize={9} fontWeight="700" color="white">
            Need {pointsShort.toLocaleString()} more pts
          </Text>
        </YStack>
      )}

      {/* ── Brand logo (only when no card design image) ── */}
      {!card.cardImageUrl && (
        <YStack flex={1} alignItems="center" justifyContent="center" paddingTop="$2" zIndex={1}>
          {card.logoUrl ? (
            <Image
              source={{ uri: card.logoUrl }}
              style={{
                width: 64, height: 64, borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.92)',
              }}
              resizeMode="contain"
            />
          ) : (
            <YStack
              width={64} height={64} borderRadius={14}
              backgroundColor="rgba(255,255,255,0.92)"
              alignItems="center" justifyContent="center"
            >
              <Text fontSize={32}>{card.brandIcon}</Text>
            </YStack>
          )}
        </YStack>
      )}

      {/* ── Bottom info: name, range, fee ── */}
      <YStack position="absolute" bottom={0} left={0} right={0} padding="$2.5" zIndex={2}>
        <Text fontSize="$3" fontWeight="700" color="white" numberOfLines={1}
          style={{ textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}
        >
          {card.brandName}
        </Text>
        <XStack alignItems="center" gap="$2" marginTop={2}>
          <Text fontSize={11} fontWeight="500" color="rgba(255,255,255,0.85)">
            ${card.minDenomination}–${card.maxDenomination}
          </Text>
          {card.hasProcessingFee && (
            <YStack backgroundColor="rgba(255,255,255,0.2)" paddingHorizontal={6} paddingVertical={1} borderRadius={6}>
              <Text fontSize={9} fontWeight="600" color="rgba(255,255,255,0.9)">
                +${card.processingFeeUsd.toFixed(2)} fee
              </Text>
            </YStack>
          )}
        </XStack>
      </YStack>
    </YStack>
  )

  // On web, use a plain div with onClick to avoid Tamagui Button stacking issues
  if (Platform.OS === 'web') {
    return (
      <div
        onClick={() => onSelect(card)}
        data-testid={`giftcard-item-${index}`}
        style={{
          cursor: 'pointer',
          borderRadius: borderRadius.lg,
          overflow: 'hidden',
          opacity: canAfford ? 1 : 0.55,
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = String(canAfford ? 0.92 : 0.5) }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = String(canAfford ? 1 : 0.55) }}
      >
        {inner}
      </div>
    )
  }

  return (
    <Button unstyled backgroundColor="transparent" borderRadius={borderRadius.lg} overflow="hidden"
      hoverStyle={{ opacity: 0.92 }}
      pressStyle={{ opacity: 0.85 }}
      onPress={() => onSelect(card)}
      opacity={canAfford ? 1 : 0.55}
      testID={`giftcard-item-${index}`}
    >
      {inner}
    </Button>
  )
}

// =============================================================================
// Donate Tab
// =============================================================================

function DonateTab({
  search, setSearch, theme, setTheme, charities, onSelect, isSearching, onSubmit
}: {
  search: string; setSearch: (v: string) => void
  theme: string; setTheme: (v: string) => void
  charities: CharityProject[]; onSelect: (c: CharityProject) => void
  isSearching?: boolean
  onSubmit?: () => void
}) {
  return (
    <YStack gap="$3">
      {/* Search */}
      <XStack
        backgroundColor="white" borderRadius={borderRadius.lg} borderWidth={1}
        borderColor={colors.gray[200]} paddingHorizontal="$3" alignItems="center" height={44}
      >
        <Search size={16} color={colors.gray[400]} />
        <Input flex={1} unstyled placeholder="Search charities (press Enter)..." placeholderTextColor={colors.gray[400] as any}
          value={search} onChangeText={setSearch} fontSize={14} marginLeft="$2" color={colors.gray[800]}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          onKeyPress={(e: any) => {
            if (e.nativeEvent.key === 'Enter' && Platform.OS === 'web') {
              onSubmit?.()
            }
          }}
        />
        {isSearching && <Spinner size="small" color={colors.green[500]} />}
      </XStack>
      {search.length >= 2 && (
        <Text fontSize={11} color={colors.gray[400]} marginTop={-8}>
          Searching 30,000+ charities on GlobalGiving...
        </Text>
      )}

      {/* Theme filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$2">
          {CHARITY_THEMES.map((th) => (
            Platform.OS === 'web' ? (
              <button key={th}
                onClick={() => setTheme(th)}
                style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1px solid ${theme === th ? colors.green[600] : colors.gray[200]}`,
                  backgroundColor: theme === th ? colors.green[50] : 'white',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  color: theme === th ? colors.green[700] : colors.gray[600],
                  whiteSpace: 'nowrap',
                }}
              >{th}</button>
            ) : (
              <Button key={th} unstyled paddingHorizontal="$3" paddingVertical="$1.5" borderRadius={20}
                borderWidth={1} borderColor={theme === th ? colors.green[600] : colors.gray[200]}
                backgroundColor={theme === th ? colors.green[50] : 'white'}
                onPress={() => setTheme(th)}
              >
                <Text fontSize="$2" fontWeight="500" color={theme === th ? colors.green[700] : colors.gray[600]}>
                  {th}
                </Text>
              </Button>
            )
          ))}
        </XStack>
      </ScrollView>

      {/* Cards */}
      {charities.length === 0 ? (
        <YStack padding="$6" alignItems="center">
          <Text color={colors.gray[400]}>No charities found</Text>
        </YStack>
      ) : (
        <YStack gap="$3">
          {charities.map((charity, index) => {
            const progress = Math.min(charity.raised / charity.goal, 1)
            if (Platform.OS === 'web') {
              return (
                <div key={charity.id}
                  onClick={() => onSelect(charity)}
                  data-testid={`donate-button-${index}`}
                  style={{
                    backgroundColor: 'white', borderRadius: borderRadius.lg,
                    border: `1px solid ${colors.gray[200]}`, overflow: 'hidden',
                    cursor: 'pointer', display: 'flex', flexDirection: 'row',
                  }}
                >
                  <Image source={{ uri: charity.imageUrl }} style={{ width: 120, height: 120 }} resizeMode="cover" />
                  <YStack flex={1} padding="$3" gap="$1.5">
                    <Text fontSize="$3" fontWeight="600" color={colors.gray[800]} numberOfLines={1}>{charity.title}</Text>
                    <Text fontSize={12} color={colors.gray[500]} numberOfLines={1}>{charity.organization}</Text>
                    <Text fontSize={11} color={colors.gray[400]} numberOfLines={2}>{charity.summary}</Text>
                    <YStack height={4} backgroundColor={colors.gray[200]} borderRadius={2} overflow="hidden" marginTop="auto">
                      <YStack height={4} width={`${progress * 100}%` as any} backgroundColor={colors.green[500]} borderRadius={2} />
                    </YStack>
                    <Text fontSize={10} color={colors.gray[400]}>
                      ${charity.raised.toLocaleString()} / ${charity.goal.toLocaleString()} • {Math.round(progress * 100)}%
                    </Text>
                  </YStack>
                </div>
              )
            }
            return (
              <Button key={charity.id} unstyled backgroundColor="white" borderRadius={borderRadius.lg}
                borderWidth={1} borderColor={colors.gray[200]} overflow="hidden"
                pressStyle={{ backgroundColor: colors.gray[50] }}
                onPress={() => onSelect(charity)}
                testID={`donate-button-${index}`}
              >
                <XStack>
                  <Image source={{ uri: charity.imageUrl }} style={{ width: 120, height: 120 }} resizeMode="cover" />
                  <YStack flex={1} padding="$3" gap="$1.5">
                    <Text fontSize="$3" fontWeight="600" color={colors.gray[800]} numberOfLines={1}>{charity.title}</Text>
                    <Text fontSize={12} color={colors.gray[500]} numberOfLines={1}>{charity.organization}</Text>
                    <Text fontSize={11} color={colors.gray[400]} numberOfLines={2}>{charity.summary}</Text>
                    <YStack height={4} backgroundColor={colors.gray[200]} borderRadius={2} overflow="hidden" marginTop="auto">
                      <YStack height={4} width={`${progress * 100}%` as any} backgroundColor={colors.green[500]} borderRadius={2} />
                    </YStack>
                    <Text fontSize={10} color={colors.gray[400]}>
                      ${charity.raised.toLocaleString()} / ${charity.goal.toLocaleString()} • {Math.round(progress * 100)}%
                    </Text>
                  </YStack>
                </XStack>
              </Button>
            )
          })}
        </YStack>
      )}
    </YStack>
  )
}

// =============================================================================
// 529 Savings Tab
// =============================================================================

function Tab529({ joined, onJoin }: { joined: boolean; onJoin: () => void }) {
  return (
    <YStack
      backgroundColor="white" borderRadius={borderRadius.lg} borderWidth={1}
      borderColor={colors.gray[200]} padding="$6" gap="$4" alignItems="center"
    >
      <YStack
        width={72} height={72} borderRadius={36}
        backgroundColor={colors.green[100]} alignItems="center" justifyContent="center"
      >
        <GraduationCap size={36} color={colors.green[600]} />
      </YStack>
      <YStack gap="$1" alignItems="center">
        <XStack gap="$2" alignItems="center">
          <Text fontSize="$6" fontWeight="700" color={colors.gray[800]}>Fund Your Child's Future</Text>
          <YStack backgroundColor={colors.amber[100]} paddingHorizontal="$2" paddingVertical={2} borderRadius={8}>
            <Text fontSize={11} fontWeight="600" color={colors.amber[700]}>Coming Soon</Text>
          </YStack>
        </XStack>
        <Text fontSize="$3" color={colors.gray[500]} textAlign="center" maxWidth={480}>
          Convert your CasaGrown points into contributions to your child's 529 college savings plan.
          Start building their education fund from your backyard.
        </Text>
      </YStack>

      <YStack gap="$2" marginTop="$2">
        {['Direct 529 plan contributions', 'Tax-advantaged savings', 'Any state 529 plan supported'].map((f) => (
          <XStack key={f} gap="$2" alignItems="center">
            <CheckCircle size={16} color={colors.green[600]} />
            <Text fontSize="$3" color={colors.gray[600]}>{f}</Text>
          </XStack>
        ))}
      </YStack>

      <Button
        unstyled paddingVertical="$3" paddingHorizontal="$8" borderRadius={24}
        backgroundColor={joined ? colors.gray[200] : colors.green[600]}
        alignItems="center" justifyContent="center" marginTop="$2"
        onPress={joined ? undefined : onJoin}
      >
        <Text fontSize="$4" fontWeight="600" color={joined ? colors.gray[600] : 'white'}>
          {joined ? "You're on the list! ✓" : 'Join Waitlist'}
        </Text>
      </Button>
      {joined && (
        <Text fontSize="$2" color={colors.gray[400]}>We'll notify you when this feature launches</Text>
      )}
    </YStack>
  )
}

// =============================================================================
// Cashout Tab (PayPal/Venmo)
// =============================================================================

function CashoutTab({ balance, userId, adjustBalance }: { balance: number, userId?: string, adjustBalance: (delta: number) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [customPointsText, setCustomPointsText] = useState('500')
  const pointsToRedeem = parseInt(customPointsText, 10) || 0
  const usdAmount = pointsToRedeem / 100

  return (
    <>
      <YStack
        backgroundColor="white" borderRadius={borderRadius.lg} borderWidth={1}
        borderColor={colors.gray[200]} padding="$6" gap="$4" alignItems="center"
      >
        <YStack
          width={72} height={72} borderRadius={36}
          backgroundColor={colors.green[100]} alignItems="center" justifyContent="center"
        >
          <Banknote size={36} color={colors.green[600]} />
        </YStack>
        <YStack gap="$1" alignItems="center">
          <Text fontSize="$6" fontWeight="700" color={colors.gray[800]}>Cash Out to Venmo</Text>
          <Text fontSize="$3" color={colors.gray[500]} textAlign="center" maxWidth={480}>
            Convert your points directly to USD and transfer them instantly to your Venmo or PayPal account.
          </Text>
        </YStack>

        <YStack gap="$2" marginTop="$2">
          {['Fast instant deposits', 'Just enter your phone #', 'Secure and reliable transfers'].map((f) => (
            <XStack key={f} gap="$2" alignItems="center">
              <CheckCircle size={16} color={colors.green[600]} />
              <Text fontSize="$3" color={colors.gray[600]}>{f}</Text>
            </XStack>
          ))}
        </YStack>

        <YStack alignItems="center" gap="$2" marginTop="$2" marginBottom="$4">
          <Text fontSize="$3" fontWeight="600" color={colors.gray[800]}>
            How many points to redeem?
          </Text>
          <XStack alignItems="center" gap="$2">
            <Input
                testID="cashout-points-input"
                unstyled
                borderWidth={1} borderColor={colors.gray[300]} borderRadius={borderRadius.md} paddingVertical="$2" paddingHorizontal="$3"
                fontSize="$4" color={colors.gray[900]} backgroundColor="white" textAlign="center" width={120}
                value={customPointsText}
                onChangeText={(t) => setCustomPointsText(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                focusStyle={{ borderColor: colors.green[500], borderWidth: 2 }}
            />
            <Text fontSize="$4" color={colors.gray[600]}>pts</Text>
          </XStack>
          <Text fontSize="$5" fontWeight="700" color={colors.gray[900]} marginTop="$1">
            = ${usdAmount.toFixed(2)} USD
          </Text>
          {(pointsToRedeem < 1) && (
            <Text fontSize={12} color={colors.red[500]}>Minimum 1 point</Text>
          )}
          {(pointsToRedeem > balance) && (
            <Text fontSize={12} color={colors.red[500]}>Insufficient balance</Text>
          )}
        </YStack>

        <Button
          testID="cashout-submit-button"
          unstyled paddingVertical="$3" paddingHorizontal="$8" borderRadius={24}
          backgroundColor={pointsToRedeem < 1 || pointsToRedeem > balance ? colors.gray[300] : colors.green[600]}
          alignItems="center" justifyContent="center" marginTop="$2"
          disabled={pointsToRedeem < 1 || pointsToRedeem > balance}
          opacity={pointsToRedeem < 1 || pointsToRedeem > balance ? 0.7 : 1}
          onPress={() => setSheetOpen(true)}
        >
          <Text fontSize="$4" fontWeight="600" color={pointsToRedeem < 1 || pointsToRedeem > balance ? colors.gray[500] : 'white'}>
            Cashout
          </Text>
        </Button>
      </YStack>

      <CashoutSheet 
        visible={sheetOpen} 
        onClose={() => setSheetOpen(false)} 
        balance={balance} 
        userId={userId}
        pointsToRedeem={pointsToRedeem}
        adjustBalance={adjustBalance}
      />
    </>
  )
}
