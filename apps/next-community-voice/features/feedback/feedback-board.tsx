'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { YStack, XStack, Text, Button, Card, Separator, Input, ScrollView, Avatar, Image, Spinner, useMedia } from 'tamagui'
import { useRouter } from 'next/navigation'
import { colors } from '@casagrown/app/design-tokens'
import { ArrowUp, MessageSquare, Bug, Lightbulb, Filter, Search, ChevronDown, X, Headphones, Lock, LogOut, LogIn, User, Flag, Trash2 } from '@tamagui/lucide-icons'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { supabase } from '@casagrown/app/utils/supabase'
import {
  fetchTickets,
  fetchReporters,
  updateTicketStatus,
  toggleVote,
  flagTicket,
  unflagTicket,
  deleteFeedback,
  FeedbackTicket,
  FeedbackStatus,
} from './feedback-service'

const ALL_STATUSES: FeedbackStatus[] = ['open', 'under_review', 'planned', 'in_progress', 'completed', 'rejected', 'duplicate']

export function FeedbackBoard({ isStaff = false, hideHeader = false }: { isStaff?: boolean, hideHeader?: boolean }) {
  const router = useRouter()
  const media = useMedia()
  const isDesktop = !media.sm
  const { user } = useAuth()

  // Data state
  const [tickets, setTickets] = useState<FeedbackTicket[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'bug_report' | 'feature_request' | 'support_request'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [reporterFilter, setReporterFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'most_votes' | 'least_votes'>('newest')
  const [showFilters, setShowFilters] = useState(false)
  const [reporterSearch, setReporterSearch] = useState('')
  const [statusPickerOpen, setStatusPickerOpen] = useState<string | null>(null)
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false)

  // Date filters
  const [createdDateOp, setCreatedDateOp] = useState<'any' | 'before' | 'after' | 'on'>('any')
  const [createdDateVal, setCreatedDateVal] = useState('')
  const [resolvedDateOp, setResolvedDateOp] = useState<'any' | 'before' | 'after' | 'on'>('any')
  const [resolvedDateVal, setResolvedDateVal] = useState('')

  // Reporter list for autocomplete
  const [allReporters, setAllReporters] = useState<string[]>([])

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load reporters on mount
  useEffect(() => {
    fetchReporters().then(setAllReporters)
  }, [])

  // Fetch tickets from server
  const loadTickets = useCallback(async () => {
    setLoading(true)
    const result = await fetchTickets({
      search: searchQuery,
      type: typeFilter,
      status: statusFilter,
      sort: sortBy,
      createdDateOp,
      createdDateVal,
      resolvedDateOp,
      resolvedDateVal,
      visibility: isStaff ? 'all' : 'public',
      page,
      pageSize,
      currentUserId: user?.id,
    })
    setTickets(result.tickets)
    setTotalCount(result.totalCount)
    setLoading(false)
  }, [searchQuery, typeFilter, statusFilter, sortBy, createdDateOp, createdDateVal, resolvedDateOp, resolvedDateVal, page, isStaff, user?.id])

  const handleInlineVote = async (e: any, ticket: FeedbackTicket) => {
    e.stopPropagation()
    if (!user) {
      router.push('/login?returnTo=/board')
      return
    }
    if (ticket.is_voted) return // Already voted
    const success = await toggleVote(ticket.id, user.id, ticket.is_voted)
    if (success) {
      setTickets(prev => prev.map(t =>
        t.id === ticket.id
          ? { ...t, is_voted: !t.is_voted, vote_count: t.is_voted ? t.vote_count - 1 : t.vote_count + 1 }
          : t
      ))
    }
  }

  const handleInlineFlag = async (e: any, ticket: FeedbackTicket) => {
    e.stopPropagation()
    if (!user) {
      router.push('/login?returnTo=/board')
      return
    }
    if (ticket.is_flagged) {
      const success = await unflagTicket(ticket.id, user.id)
      if (success) {
        setTickets(prev => prev.map(t =>
          t.id === ticket.id
            ? { ...t, is_flagged: false, flag_count: t.flag_count - 1 }
            : t
        ))
      }
    } else {
      const success = await flagTicket(ticket.id, user.id)
      if (success) {
        setTickets(prev => prev.map(t =>
          t.id === ticket.id
            ? { ...t, is_flagged: true, flag_count: t.flag_count + 1 }
            : t
        ))
      }
    }
  }

  const handleDelete = async (e: any, ticket: FeedbackTicket) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this ticket? This cannot be undone.')) return
    const success = await deleteFeedback(ticket.id)
    if (success) {
      setTickets(prev => prev.filter(t => t.id !== ticket.id))
      setTotalCount(prev => prev - 1)
    }
  }

  // Trigger fetch when filters change (debounced for search)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1) // Reset to first page on filter change
      loadTickets()
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [loadTickets])

  // Filtered reporters for autocomplete
  const filteredReporters = reporterSearch.trim()
    ? allReporters.filter(name => name.toLowerCase().includes(reporterSearch.toLowerCase()))
    : []

  const activeFilterCount = [
    typeFilter !== 'all',
    statusFilter !== 'all',
    reporterFilter !== 'all',
    searchQuery.trim() !== '',
    createdDateOp !== 'any',
    resolvedDateOp !== 'any',
  ].filter(Boolean).length

  const clearAllFilters = () => {
    setSearchQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
    setReporterFilter('all')
    setSortBy('newest')
    setCreatedDateOp('any')
    setCreatedDateVal('')
    setResolvedDateOp('any')
    setResolvedDateVal('')
  }

  const handleStatusChange = async (ticketId: string, newStatus: FeedbackStatus) => {
    const success = await updateTicketStatus(ticketId, newStatus)
    if (success) {
      // Update locally for instant feedback
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t))
    }
    setStatusPickerOpen(null)
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours < 1) return 'just now'
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return `${Math.floor(diffDays / 30)} months ago`
  }

  const getTypeBadge = (type: string) => {
    if (type === 'bug_report') return { icon: Bug, label: 'BUG', bg: colors.red[100], color: colors.red[700] }
    if (type === 'support_request') return { icon: Headphones, label: 'SUPPORT', bg: colors.blue[100], color: colors.blue[700] }
    return { icon: Lightbulb, label: 'FEATURE', bg: colors.amber[100], color: colors.amber[700] }
  }

  return (
    <YStack flex={1} backgroundColor={colors.green[50]} padding={isDesktop ? '$4' : '$3'} paddingTop={hideHeader ? '$2' : undefined}>
      {/* Header */}
      {!hideHeader && (
      <YStack gap="$3" marginBottom="$4" {...(isDesktop && { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as any)}>
        <XStack gap="$2" alignItems="center">
            <Image src="/logo.png" width={40} height={40} />
            <Text fontSize={isDesktop ? '$6' : '$5'} fontWeight="700" color={colors.green[800]}>Community Board</Text>
        </XStack>
        <XStack gap="$2" flexWrap="wrap">
            <Button 
                backgroundColor={colors.red[50]} 
                borderColor={colors.red[200]}
                borderWidth={1}
                size="$3" 
                icon={<Bug size={14} />}
                onPress={() => router.push('/submit?type=bug')}
            >
                <Text color={colors.red[700]}>Report Issue</Text>
            </Button>
            <Button 
                backgroundColor={colors.green[600]} 
                size="$3" 
                icon={<Lightbulb size={14} color="white" />}
                onPress={() => router.push('/submit?type=feature')}
            >
                <Text color="white">Suggest Feature</Text>
            </Button>
            {user ? (
              <Button
                size="$3"
                chromeless
                icon={<LogOut size={14} color={colors.gray[500]} />}
                onPress={async () => {
                  await supabase.auth.signOut()
                  router.push('/')
                }}
              >
                <Text color={colors.gray[500]} fontSize="$2">Logout</Text>
              </Button>
            ) : (
              <Button
                size="$3"
                chromeless
                icon={<LogIn size={14} color={colors.green[600]} />}
                onPress={() => router.push('/login?returnTo=/board')}
              >
                <Text color={colors.green[600]} fontSize="$2">Login</Text>
              </Button>
            )}
        </XStack>
      </YStack>
      )}

      {/* Search Bar */}
      <XStack gap="$2" marginBottom="$3" alignItems="center">
        <XStack flex={1} backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} paddingHorizontal="$3" alignItems="center" gap="$2">
          <Search size={18} color={colors.gray[400]} />
          <Input
            flex={1}
            placeholder="Search by title or keyword..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            borderWidth={0}
            backgroundColor="transparent"
            size="$3"
            fontWeight="400"
            style={{ fontWeight: 400 }}
          />
          {searchQuery ? (
            <Button size="$2" chromeless icon={<X size={14} />} onPress={() => setSearchQuery('')} />
          ) : null}
        </XStack>
        <Button
          size="$3"
          backgroundColor={showFilters || activeFilterCount > 0 ? colors.green[600] : 'white'}
          borderWidth={1}
          borderColor={activeFilterCount > 0 ? colors.green[600] : colors.gray[200]}
          icon={<Filter size={16} color={showFilters || activeFilterCount > 0 ? 'white' : colors.gray[600]} />}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Text color={showFilters || activeFilterCount > 0 ? 'white' : colors.gray[600]}>
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
          </Text>
        </Button>
        {isStaff && (
          <Button
            size="$3"
            backgroundColor={showFlaggedOnly ? colors.red[500] : 'white'}
            borderWidth={1}
            borderColor={showFlaggedOnly ? colors.red[500] : colors.gray[200]}
            icon={<Flag size={16} color={showFlaggedOnly ? 'white' : colors.gray[600]} />}
            onPress={() => setShowFlaggedOnly(!showFlaggedOnly)}
          >
            <Text color={showFlaggedOnly ? 'white' : colors.gray[600]}>Flagged</Text>
          </Button>
        )}
      </XStack>

      {/* Filter Panel */}
      {showFilters && (
        <Card padding="$3" marginBottom="$3" backgroundColor="white" borderWidth={1} borderColor={colors.gray[200]} borderRadius="$4">
          <YStack gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontWeight="600" color={colors.gray[800]}>Filter & Sort</Text>
              {activeFilterCount > 0 && (
                <Button size="$2" chromeless onPress={clearAllFilters}>
                  <Text color={colors.green[600]} fontSize="$2">Clear all</Text>
                </Button>
              )}
            </XStack>

            {/* Type Filter */}
            <YStack gap="$1">
              <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">TYPE</Text>
              <XStack gap="$2" flexWrap="wrap">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'bug_report', label: '🐛 Bugs' },
                  { key: 'feature_request', label: '💡 Features' },
                  { key: 'support_request', label: '🎧 Support' },
                ] as const).map(t => (
                  <Button
                    key={t.key}
                    size="$2"
                    backgroundColor={typeFilter === t.key ? colors.green[600] : colors.gray[100]}
                    borderRadius="$4"
                    onPress={() => setTypeFilter(t.key)}
                  >
                    <Text color={typeFilter === t.key ? 'white' : colors.gray[600]} fontSize="$2">{t.label}</Text>
                  </Button>
                ))}
              </XStack>
            </YStack>

            {/* Status Filter */}
            <YStack gap="$1">
              <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">STATUS</Text>
              <XStack gap="$2" flexWrap="wrap">
                <Button
                  size="$2"
                  backgroundColor={statusFilter === 'all' ? colors.green[600] : colors.gray[100]}
                  borderRadius="$4"
                  onPress={() => setStatusFilter('all')}
                >
                  <Text color={statusFilter === 'all' ? 'white' : colors.gray[600]} fontSize="$2">All</Text>
                </Button>
                {ALL_STATUSES.map(s => (
                  <Button
                    key={s}
                    size="$2"
                    backgroundColor={statusFilter === s ? colors.green[600] : colors.gray[100]}
                    borderRadius="$4"
                    onPress={() => setStatusFilter(s)}
                  >
                    <Text color={statusFilter === s ? 'white' : colors.gray[600]} fontSize="$2">
                      {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Text>
                  </Button>
                ))}
              </XStack>
            </YStack>

            {/* Reporter Filter */}
            <YStack gap="$1" position="relative" zIndex={10}>
              <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">REPORTER</Text>
              {reporterFilter !== 'all' ? (
                <XStack backgroundColor={colors.green[100]} paddingHorizontal="$3" paddingVertical="$2" borderRadius="$4" alignItems="center" gap="$2" alignSelf="flex-start">
                  <Text color={colors.green[800]} fontSize="$3" fontWeight="500">{reporterFilter}</Text>
                  <Button size="$1" chromeless icon={<X size={12} />} onPress={() => { setReporterFilter('all'); setReporterSearch('') }} />
                </XStack>
              ) : (
                <YStack>
                  <Input
                    placeholder="Type to search reporters..."
                    value={reporterSearch}
                    onChangeText={setReporterSearch}
                    size="$3"
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={colors.gray[300]}
                    backgroundColor="white"
                    fontWeight="400"
                    style={{ fontWeight: 400 }}
                  />
                  {reporterSearch.length > 0 && filteredReporters.length > 0 && (
                    <Card position="absolute" top="100%" left={0} right={0} marginTop="$1" backgroundColor="white" borderWidth={1} borderColor={colors.gray[200]} borderRadius="$3" padding="$1" elevation={4} zIndex={20}>
                      {filteredReporters.map(name => (
                        <Button
                          key={name}
                          size="$3"
                          chromeless
                          justifyContent="flex-start"
                          onPress={() => { setReporterFilter(name); setReporterSearch('') }}
                          hoverStyle={{ backgroundColor: colors.green[50] }}
                          borderRadius="$2"
                        >
                          <Text color={colors.gray[700]} fontSize="$3">{name}</Text>
                        </Button>
                      ))}
                    </Card>
                  )}
                  {reporterSearch.length > 0 && filteredReporters.length === 0 && (
                    <Text fontSize="$2" color={colors.gray[400]} marginTop="$1">No reporters found</Text>
                  )}
                </YStack>
              )}
            </YStack>

            {/* Sort */}
            <YStack gap="$1">
              <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">SORT BY</Text>
              <XStack gap="$2" flexWrap="wrap">
                {([
                  { key: 'newest', label: '📅 Newest' },
                  { key: 'oldest', label: '📅 Oldest' },
                  { key: 'most_votes', label: '👍 Most Votes' },
                  { key: 'least_votes', label: '👎 Least Votes' },
                ] as const).map(s => (
                  <Button
                    key={s.key}
                    size="$2"
                    backgroundColor={sortBy === s.key ? colors.green[600] : colors.gray[100]}
                    borderRadius="$4"
                    onPress={() => setSortBy(s.key)}
                  >
                    <Text color={sortBy === s.key ? 'white' : colors.gray[600]} fontSize="$2">{s.label}</Text>
                  </Button>
                ))}
              </XStack>
            </YStack>

            {/* Created Date Filter */}
            <YStack gap="$1">
              <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">CREATED DATE</Text>
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                {(['any', 'before', 'after', 'on'] as const).map(op => (
                  <Button
                    key={op}
                    size="$2"
                    backgroundColor={createdDateOp === op ? colors.green[600] : colors.gray[100]}
                    borderRadius="$4"
                    onPress={() => { setCreatedDateOp(op); if (op === 'any') setCreatedDateVal('') }}
                  >
                    <Text color={createdDateOp === op ? 'white' : colors.gray[600]} fontSize="$2">
                      {op === 'any' ? 'Any' : op === 'before' ? '< Before' : op === 'after' ? '> After' : '= On'}
                    </Text>
                  </Button>
                ))}
              </XStack>
              {createdDateOp !== 'any' && (
                <input
                  type="date"
                  value={createdDateVal}
                  onChange={(e) => setCreatedDateVal(e.target.value)}
                  style={{ padding: 8, borderRadius: 8, border: `1px solid ${colors.gray[300]}`, fontSize: 14, marginTop: 4 }}
                />
              )}
            </YStack>

            {/* Resolved Date Filter */}
            <YStack gap="$1">
              <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">RESOLVED DATE</Text>
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                {(['any', 'before', 'after', 'on'] as const).map(op => (
                  <Button
                    key={op}
                    size="$2"
                    backgroundColor={resolvedDateOp === op ? colors.green[600] : colors.gray[100]}
                    borderRadius="$4"
                    onPress={() => { setResolvedDateOp(op); if (op === 'any') setResolvedDateVal('') }}
                  >
                    <Text color={resolvedDateOp === op ? 'white' : colors.gray[600]} fontSize="$2">
                      {op === 'any' ? 'Any' : op === 'before' ? '< Before' : op === 'after' ? '> After' : '= On'}
                    </Text>
                  </Button>
                ))}
              </XStack>
              {resolvedDateOp !== 'any' && (
                <input
                  type="date"
                  value={resolvedDateVal}
                  onChange={(e) => setResolvedDateVal(e.target.value)}
                  style={{ padding: 8, borderRadius: 8, border: `1px solid ${colors.gray[300]}`, fontSize: 14, marginTop: 4 }}
                />
              )}
            </YStack>
          </YStack>
        </Card>
      )}

      {/* Results Count */}
      <XStack marginBottom="$2" alignItems="center" gap="$2">
        <Text fontSize="$3" color={colors.gray[500]}>
          {loading ? 'Loading...' : `${totalCount} ${totalCount === 1 ? 'result' : 'results'}`}
        </Text>
        {activeFilterCount > 0 && (
          <Button size="$2" chromeless onPress={clearAllFilters}>
            <Text color={colors.green[600]} fontSize="$2">Clear filters</Text>
          </Button>
        )}
      </XStack>

      <ScrollView showsVerticalScrollIndicator={false}>
        <YStack gap="$3" paddingBottom="$8">
          {loading ? (
            <YStack padding="$8" alignItems="center">
              <Spinner size="large" color={colors.green[600]} />
            </YStack>
          ) : tickets.length === 0 ? (
            <Card padding="$6" backgroundColor="white" borderRadius="$4" alignItems="center" gap="$2">
              <Search size={32} color={colors.gray[300]} />
              <Text color={colors.gray[500]} fontWeight="500">No results found</Text>
              <Text color={colors.gray[400]} fontSize="$3" textAlign="center">Try adjusting your filters or search terms</Text>
            </Card>
          ) : (
            <>
              {(showFlaggedOnly ? tickets.filter(t => t.flag_count > 0) : tickets).map((ticket) => {
                const typeBadge = getTypeBadge(ticket.type)
                const TypeIcon = typeBadge.icon
                return (
                <Card 
                  key={ticket.id} 
                  padding="$4" 
                  borderWidth={1}
                  borderColor={ticket.visibility === 'private' ? colors.blue[100] : colors.gray[200]}
                  backgroundColor="white" 
                  borderRadius="$4" 
                  hoverStyle={{ borderColor: colors.green[300] }}
                >
                  <XStack gap="$4">
                    {/* Vote Column */}
                    <YStack alignItems="center" width={50}>
                      <Button 
                        chromeless 
                        icon={<ArrowUp size={24} color={ticket.is_voted ? colors.green[600] : colors.gray[500]} />} 
                        padding="$0"
                        onPress={(e: any) => handleInlineVote(e, ticket)}
                        opacity={ticket.is_voted ? 0.6 : 1}
                      />
                      <Text fontSize="$5" fontWeight="600" color={ticket.is_voted ? colors.green[700] : colors.gray[700]}>{ticket.vote_count}</Text>
                    </YStack>

                    {/* Content Column */}
                    <YStack flex={1} gap="$2">
                      <XStack gap="$2" alignItems="center" flexWrap="wrap">
                        <StatusBadge status={ticket.status} />
                        <XStack backgroundColor={typeBadge.bg} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignItems="center" gap="$1">
                           <TypeIcon size={12} color={typeBadge.color} />
                           <Text fontSize="$2" color={typeBadge.color} fontWeight="600">{typeBadge.label}</Text>
                        </XStack>
                        {ticket.visibility === 'private' && (
                          <XStack backgroundColor={colors.blue[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignItems="center" gap="$1">
                            <Lock size={10} color={colors.blue[700]} />
                            <Text fontSize="$2" color={colors.blue[700]} fontWeight="600">PRIVATE</Text>
                          </XStack>
                        )}
                        <Text fontSize="$2" color={colors.gray[400]}>• {formatTimeAgo(ticket.created_at)}</Text>
                      </XStack>
                      
                      <Text 
                        testID="ticket-card-title"
                        fontSize="$5" fontWeight="600" numberOfLines={1}
                        cursor="pointer"
                        hoverStyle={{ color: colors.green[700] }}
                        onPress={() => router.push(`/board/${ticket.id}`)}
                      >{ticket.title}</Text>
                      <Text 
                        fontSize="$3" color={colors.gray[600]} numberOfLines={2}
                        cursor="pointer"
                        onPress={() => router.push(`/board/${ticket.id}`)}
                      >{ticket.description}</Text>
                      
                      <XStack marginTop="$2" justifyContent="space-between" alignItems="center">
                        <XStack gap="$2" alignItems="center">
                          <Avatar circular size="$2">
                            {ticket.author_avatar ? (
                              <Image src={ticket.author_avatar} width={24} height={24} borderRadius={12} />
                            ) : null}
                            <Avatar.Fallback backgroundColor={colors.green[300]} />
                          </Avatar>
                          <Text fontSize="$2" color={colors.gray[500]}>{ticket.author_name}</Text>
                        </XStack>
                        <XStack gap="$2" alignItems="center">
                          <XStack gap="$1" alignItems="center">
                            <MessageSquare size={16} color={colors.gray[400]} />
                            <Text fontSize="$2" color={colors.gray[500]}>{ticket.comment_count}</Text>
                          </XStack>
                          <Button
                            chromeless
                            size="$2"
                            padding="$1"
                            icon={<Flag size={14} color={ticket.is_flagged ? colors.red[500] : colors.gray[400]} />}
                            onPress={(e: any) => handleInlineFlag(e, ticket)}
                          />
                          {ticket.flag_count > 0 && (
                            <Text fontSize="$1" color={colors.red[500]} fontWeight="600">{ticket.flag_count} flagged</Text>
                          )}
                          {isStaff && ticket.flag_count > 0 && (
                            <Button
                              chromeless
                              size="$2"
                              padding="$1"
                              icon={<Trash2 size={14} color={colors.red[500]} />}
                              onPress={(e: any) => handleDelete(e, ticket)}
                            />
                          )}
                          {isStaff && (
                            <YStack position="relative">
                              <Button
                                size="$2"
                                backgroundColor={colors.green[100]}
                                borderRadius="$3"
                                onPress={(e: any) => { e.stopPropagation(); setStatusPickerOpen(statusPickerOpen === ticket.id ? null : ticket.id) }}
                                hoverStyle={{ backgroundColor: colors.green[200] }}
                              >
                                <Text fontSize="$2" color={colors.green[700]} fontWeight="600">Change Status</Text>
                              </Button>
                              {statusPickerOpen === ticket.id && (
                                <Card position="absolute" top="100%" right={0} marginTop="$1" backgroundColor="white" borderWidth={1} borderColor={colors.gray[200]} borderRadius="$3" padding="$1" elevation={4} zIndex={100} width={160}>
                                  {ALL_STATUSES.map(s => (
                                    <Button
                                      key={s}
                                      size="$3"
                                      chromeless
                                      justifyContent="flex-start"
                                      backgroundColor={ticket.status === s ? colors.green[50] : 'transparent'}
                                      borderRadius="$2"
                                      onPress={(e: any) => {
                                        e.stopPropagation()
                                        handleStatusChange(ticket.id, s)
                                      }}
                                      hoverStyle={{ backgroundColor: colors.gray[50] }}
                                    >
                                      <Text fontSize="$2" color={ticket.status === s ? colors.green[700] : colors.gray[600]} fontWeight={ticket.status === s ? '600' : '400'}>
                                        {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                      </Text>
                                    </Button>
                                  ))}
                                </Card>
                              )}
                            </YStack>
                          )}
                        </XStack>
                      </XStack>
                    </YStack>
                  </XStack>
                </Card>
              )})}

              {/* Pagination */}
              {totalPages > 1 && (
                <XStack justifyContent="center" gap="$2" marginTop="$2" alignItems="center">
                  <Button
                    size="$3"
                    disabled={page <= 1}
                    onPress={() => { setPage(p => p - 1); loadTickets() }}
                    backgroundColor={page <= 1 ? colors.gray[100] : 'white'}
                    borderWidth={1}
                    borderColor={colors.gray[200]}
                  >
                    <Text color={page <= 1 ? colors.gray[400] : colors.gray[700]}>Previous</Text>
                  </Button>
                  <Text color={colors.gray[600]} fontSize="$3">Page {page} of {totalPages}</Text>
                  <Button
                    size="$3"
                    disabled={page >= totalPages}
                    onPress={() => { setPage(p => p + 1); loadTickets() }}
                    backgroundColor={page >= totalPages ? colors.gray[100] : 'white'}
                    borderWidth={1}
                    borderColor={colors.gray[200]}
                  >
                    <Text color={page >= totalPages ? colors.gray[400] : colors.gray[700]}>Next</Text>
                  </Button>
                </XStack>
              )}
            </>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    open: { bg: colors.gray[100], color: colors.gray[600], label: 'Open' },
    planned: { bg: colors.blue[100], color: colors.blue[600], label: 'Planned' },
    in_progress: { bg: colors.purple[100], color: colors.purple[600], label: 'In Progress' },
    completed: { bg: colors.green[100], color: colors.green[600], label: 'Completed' },
    rejected: { bg: colors.red[100], color: colors.red[600], label: 'Rejected' },
    under_review: { bg: colors.amber[100], color: colors.amber[600], label: 'Under Review' },
    duplicate: { bg: colors.gray[100], color: colors.gray[600], label: 'Duplicate' },
  }[status] || { bg: colors.gray[100], color: colors.gray[600], label: status }

  return (
    <Text backgroundColor={styles.bg} color={styles.color} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" fontSize="$2" fontWeight="600">
      {styles.label}
    </Text>
  )
}
