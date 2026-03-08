/**
 * FeedbackBoardScreen — Shared board component for browsing feedback tickets.
 *
 * Search-first design: users search existing tickets, upvote, and comment
 * before submitting new ones.
 *
 * Works on iOS, Android, and Web (imported by both Expo and Next.js).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { YStack, XStack, Text, Button, Card, Input, ScrollView, Spinner, useMedia } from 'tamagui'
import { useRouter } from 'solito/navigation'
import { colors } from '../../design-tokens'
import { ArrowUp, MessageSquare, Bug, Lightbulb, Filter, Search, X, Headphones, Lock, Flag } from '@tamagui/lucide-icons'
import { useAuth } from '../auth/auth-hook'

import {
  fetchTickets,
  fetchReporters,
  toggleVote,
  flagTicket,
  unflagTicket,
  FeedbackTicket,
  FetchTicketsParams,
} from './feedback-service'
import { Platform, TouchableOpacity } from 'react-native'

// ===========================================================================
// Types
// ===========================================================================

const PAGE_SIZE = 20

type SortOption = 'newest' | 'oldest' | 'most_votes' | 'least_votes'
type BoardTab = 'community' | 'support'

// ===========================================================================
// Board Screen
// ===========================================================================

export function FeedbackBoardScreen() {
  const router = useRouter()
  const media = useMedia()
  const isDesktop = !media.sm
  const { user } = useAuth()

  // Data
  const [tickets, setTickets] = useState<FeedbackTicket[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reporters, setReporters] = useState<string[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [reporterFilter, setReporterFilter] = useState('all')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [page, setPage] = useState(1)
  const [boardTab, setBoardTab] = useState<BoardTab>('community')
  const [showFilters, setShowFilters] = useState(false)

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [search])

  // Load tickets
  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const params: FetchTicketsParams = boardTab === 'community'
        ? {
            search: debouncedSearch,
            type: typeFilter === 'all' ? 'all' : typeFilter,
            status: statusFilter,
            reporter: reporterFilter,
            sort: sortBy,
            page,
            pageSize: PAGE_SIZE,
            visibility: 'public',
            currentUserId: user?.id,
          }
        : {
            search: debouncedSearch,
            type: 'support_request',
            status: statusFilter,
            reporter: 'all',
            sort: sortBy,
            page,
            pageSize: PAGE_SIZE,
            visibility: 'all',
            currentUserId: user?.id,
          }
      const result = await fetchTickets(params, user?.id)
      setTickets(result.tickets)
      setTotalCount(result.totalCount)
    } catch (err) {
      console.error('loadTickets error:', err)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, typeFilter, statusFilter, reporterFilter, sortBy, page, user?.id, boardTab])

  useEffect(() => { loadTickets() }, [loadTickets])

  // Load reporters for filter dropdown
  useEffect(() => {
    fetchReporters().then(setReporters)
  }, [])

  const handleToggleVote = async (ticket: FeedbackTicket) => {
    if (!user) return
    const success = await toggleVote(ticket.id, user.id, ticket.is_voted)
    if (success) {
      setTickets(prev => prev.map(t =>
        t.id === ticket.id
          ? { ...t, is_voted: !t.is_voted, vote_count: t.is_voted ? t.vote_count - 1 : t.vote_count + 1 }
          : t
      ))
    }
  }

  const handleFlag = async (ticket: FeedbackTicket) => {
    if (!user) return
    if (ticket.is_flagged) {
      const ok = await unflagTicket(ticket.id, user.id)
      if (ok) setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, is_flagged: false, flag_count: t.flag_count - 1 } : t))
    } else {
      const ok = await flagTicket(ticket.id, user.id)
      if (ok) setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, is_flagged: true, flag_count: t.flag_count + 1 } : t))
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

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
    return `${Math.floor(diffDays / 7)} weeks ago`
  }

  const TypeIcon = ({ type, size = 14 }: { type: string; size?: number }) => {
    if (type === 'bug_report') return <Bug size={size} color={colors.red[500]} />
    if (type === 'feature_request') return <Lightbulb size={size} color={colors.amber[500]} />
    return <Headphones size={size} color={colors.blue[500]} />
  }

  const typeLabel = (t: string) =>
    t === 'bug_report' ? 'Bug' : t === 'feature_request' ? 'Feature' : 'Support'

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      open: 'Open', under_review: 'Under Review', planned: 'Planned',
      in_progress: 'In Progress', completed: 'Completed', rejected: 'Rejected', duplicate: 'Duplicate',
    }
    return map[s] || s
  }

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      open: colors.gray[500], under_review: colors.amber[600], planned: colors.blue[600],
      in_progress: colors.purple[600], completed: colors.green[600], rejected: colors.red[600], duplicate: colors.gray[500],
    }
    return map[s] || colors.gray[500]
  }

  const handleTabChange = (tab: BoardTab) => {
    setBoardTab(tab)
    setPage(1)
    setSearch('')
    setDebouncedSearch('')
  }

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      <ScrollView flex={1} contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Header */}
        <YStack padding={isDesktop ? '$5' : '$4'} gap="$3" backgroundColor={colors.green[700]}>
          <Text fontSize={isDesktop ? '$8' : '$6'} fontWeight="700" color="white">
            {boardTab === 'community' ? 'Community Feedback' : 'My Support Tickets'}
          </Text>
          <Text fontSize="$4" color="rgba(255,255,255,0.85)">
            {boardTab === 'community'
              ? 'Search existing issues, upvote, and comment — or submit a new one.'
              : 'Track your support requests and responses.'}
          </Text>
          {Platform.OS === 'web' && (
            <XStack gap="$2" marginTop="$1">
              <Button
                size="$3"
                backgroundColor={colors.red[500]}
                borderRadius="$3"
                icon={<Bug size={14} color="white" />}
                onPress={() => router.push('/feedback-submit?type=bug')}
                pressStyle={{ backgroundColor: colors.red[600] }}
              >
                <Text color="white" fontWeight="600" fontSize="$3">Report Issue</Text>
              </Button>
              <Button
                size="$3"
                backgroundColor={colors.amber[500]}
                borderRadius="$3"
                icon={<Lightbulb size={14} color="white" />}
                onPress={() => router.push('/feedback-submit?type=feature')}
                pressStyle={{ backgroundColor: colors.amber[600] }}
              >
                <Text color="white" fontWeight="600" fontSize="$3">Suggest Feature</Text>
              </Button>
              <Button
                size="$3"
                backgroundColor="rgba(255,255,255,0.2)"
                borderRadius="$3"
                borderWidth={1}
                borderColor="rgba(255,255,255,0.4)"
                icon={<Headphones size={14} color="white" />}
                onPress={() => router.push('/feedback-submit?type=support')}
                pressStyle={{ opacity: 0.8 }}
              >
                <Text color="white" fontWeight="600" fontSize="$3">Support</Text>
              </Button>
            </XStack>
          )}
        </YStack>

        {/* Tab Switcher */}
        <XStack
          backgroundColor="white"
          borderBottomWidth={1}
          borderColor={colors.gray[200]}
        >
          <TouchableOpacity
            onPress={() => handleTabChange('community')}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: boardTab === 'community' ? colors.green[600] : 'transparent' }}
          >
            <XStack alignItems="center" gap="$1.5">
              <Bug size={16} color={boardTab === 'community' ? colors.green[700] : colors.gray[400]} />
              <Text fontWeight="600" fontSize={14} color={boardTab === 'community' ? colors.green[700] : colors.gray[500]}>
                Community Board
              </Text>
            </XStack>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleTabChange('support')}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: boardTab === 'support' ? colors.blue[600] : 'transparent' }}
          >
            <XStack alignItems="center" gap="$1.5">
              <Headphones size={16} color={boardTab === 'support' ? colors.blue[700] : colors.gray[400]} />
              <Text fontWeight="600" fontSize={14} color={boardTab === 'support' ? colors.blue[700] : colors.gray[500]}>
                My Support
              </Text>
            </XStack>
          </TouchableOpacity>
        </XStack>

        {/* Search + Filters */}
        <YStack padding={isDesktop ? '$4' : '$3'} gap="$3">
          <XStack gap="$2" alignItems="center">
            <XStack
              flex={1}
              alignItems="center"
              gap="$2"
              backgroundColor="white"
              borderWidth={1}
              borderColor={colors.gray[300]}
              borderRadius="$3"
              paddingHorizontal="$3"
            >
              <Search size={18} color={colors.gray[400]} />
              <Input
                flex={1}
                placeholder={boardTab === 'community' ? 'Search issues and feature requests...' : 'Search your support tickets...'}
                value={search}
                onChangeText={setSearch}
                borderWidth={0}
                backgroundColor="transparent"
                size="$4"
                fontWeight="400"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <X size={16} color={colors.gray[400]} />
                </TouchableOpacity>
              )}
            </XStack>
            <Button
              size="$4"
              backgroundColor={showFilters ? colors.green[100] : 'white'}
              borderWidth={1}
              borderColor={showFilters ? colors.green[500] : colors.gray[300]}
              icon={<Filter size={18} color={showFilters ? colors.green[700] : colors.gray[500]} />}
              onPress={() => setShowFilters(!showFilters)}
            />
          </XStack>

          {/* Filters Panel */}
          {showFilters && (
            <Card padding="$3" backgroundColor="white" borderWidth={1} borderColor={colors.gray[200]}>
              <YStack gap="$3">
                {/* Type filter — only on Community tab */}
                {boardTab === 'community' && (
                <YStack gap="$1">
                  <Text fontSize="$2" fontWeight="500" color={colors.gray[600]}>Type</Text>
                  <XStack gap="$2" flexWrap="wrap">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'bug_report', label: 'Bugs' },
                      { value: 'feature_request', label: 'Features' },
                    ].map(opt => (
                      <Button
                        key={opt.value}
                        size="$3"
                        backgroundColor={typeFilter === opt.value ? colors.green[100] : colors.gray[50]}
                        borderWidth={1}
                        borderColor={typeFilter === opt.value ? colors.green[500] : colors.gray[200]}
                        onPress={() => { setTypeFilter(opt.value); setPage(1) }}
                      >
                        <Text
                          fontSize="$2"
                          fontWeight="500"
                          color={typeFilter === opt.value ? colors.green[700] : colors.gray[600]}
                        >
                          {opt.label}
                        </Text>
                      </Button>
                    ))}
                  </XStack>
                </YStack>
                )}

                {/* Status filter */}
                <YStack gap="$1">
                  <Text fontSize="$2" fontWeight="500" color={colors.gray[600]}>Status</Text>
                  <XStack gap="$2" flexWrap="wrap">
                    {['all', 'open', 'under_review', 'planned', 'in_progress', 'completed', 'rejected'].map(s => (
                      <Button
                        key={s}
                        size="$3"
                        backgroundColor={statusFilter === s ? colors.green[100] : colors.gray[50]}
                        borderWidth={1}
                        borderColor={statusFilter === s ? colors.green[500] : colors.gray[200]}
                        onPress={() => { setStatusFilter(s); setPage(1) }}
                      >
                        <Text fontSize="$2" fontWeight="500" color={statusFilter === s ? colors.green[700] : colors.gray[600]}>
                          {s === 'all' ? 'All' : statusLabel(s)}
                        </Text>
                      </Button>
                    ))}
                  </XStack>
                </YStack>

                {/* Sort */}
                <YStack gap="$1">
                  <Text fontSize="$2" fontWeight="500" color={colors.gray[600]}>Sort</Text>
                  <XStack gap="$2" flexWrap="wrap">
                    {([
                      { value: 'newest', label: 'Newest' },
                      { value: 'oldest', label: 'Oldest' },
                      { value: 'most_votes', label: 'Most Votes' },
                      { value: 'least_votes', label: 'Least Votes' },
                    ] as const).map(opt => (
                      <Button
                        key={opt.value}
                        size="$3"
                        backgroundColor={sortBy === opt.value ? colors.green[100] : colors.gray[50]}
                        borderWidth={1}
                        borderColor={sortBy === opt.value ? colors.green[500] : colors.gray[200]}
                        onPress={() => { setSortBy(opt.value); setPage(1) }}
                      >
                        <Text fontSize="$2" fontWeight="500" color={sortBy === opt.value ? colors.green[700] : colors.gray[600]}>
                          {opt.label}
                        </Text>
                      </Button>
                    ))}
                  </XStack>
                </YStack>
              </YStack>
            </Card>
          )}

          {/* Results count */}
          <Text fontSize="$3" color={colors.gray[500]}>
            {loading ? 'Searching...' : `${totalCount} results`}
          </Text>
        </YStack>

        {/* Ticket List */}
        {loading ? (
          <YStack padding="$8" alignItems="center">
            <Spinner size="large" color={colors.green[600]} />
          </YStack>
        ) : tickets.length === 0 ? (
          <YStack padding="$8" alignItems="center" gap="$3">
            <Text fontSize="$5" fontWeight="600" color={colors.gray[400]}>
              {boardTab === 'support' ? 'No support tickets yet' : 'No tickets found'}
            </Text>
            <Text fontSize="$4" color={colors.gray[400]}>
              {boardTab === 'support'
                ? 'Submit a support request to get help from our team.'
                : 'Try adjusting your search or filters'}
            </Text>
          </YStack>
        ) : (
          <YStack paddingHorizontal={isDesktop ? '$4' : '$3'} gap="$3">
            {tickets.map(ticket => (
              <TouchableOpacity
                key={ticket.id}
                activeOpacity={0.7}
                onPress={() => router.push(`/feedback-detail?id=${ticket.id}`)}
              >
                <Card
                  padding="$3"
                  borderWidth={1}
                  borderColor={colors.gray[200]}
                  backgroundColor="white"
                >
                  <XStack gap="$3">
                    {/* Vote column */}
                    <YStack alignItems="center" gap="$1">
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation?.()
                          handleToggleVote(ticket)
                        }}
                      >
                        <YStack
                          alignItems="center"
                          paddingHorizontal="$2"
                          paddingVertical="$1"
                          borderRadius="$2"
                          borderWidth={1}
                          borderColor={ticket.is_voted ? colors.green[300] : colors.gray[200]}
                          backgroundColor={ticket.is_voted ? colors.green[50] : 'transparent'}
                        >
                          <ArrowUp size={16} color={ticket.is_voted ? colors.green[600] : colors.gray[400]} />
                          <Text
                            fontSize="$3"
                            fontWeight="700"
                            color={ticket.is_voted ? colors.green[700] : colors.gray[600]}
                          >
                            {ticket.vote_count}
                          </Text>
                        </YStack>
                      </TouchableOpacity>
                    </YStack>

                    {/* Content */}
                    <YStack flex={1} gap="$1">
                      <XStack gap="$2" alignItems="center" flexWrap="wrap">
                        <TypeIcon type={ticket.type} />
                        <Text fontSize="$2" color={colors.gray[500]}>{typeLabel(ticket.type)}</Text>
                        <Text fontSize="$2" color={statusColor(ticket.status) as any} fontWeight="600">
                          {statusLabel(ticket.status)}
                        </Text>
                        {ticket.visibility === 'private' && (
                          <XStack alignItems="center" gap="$1">
                            <Lock size={10} color={colors.blue[600]} />
                            <Text fontSize="$1" color={colors.blue[600]} fontWeight="600">PRIVATE</Text>
                          </XStack>
                        )}
                      </XStack>

                      <Text
                        testID="ticket-card-title"
                        fontSize="$4"
                        fontWeight="600"
                        color={colors.gray[900]}
                        numberOfLines={2}
                      >
                        {ticket.title}
                      </Text>

                      <Text fontSize="$3" color={colors.gray[500]} numberOfLines={2}>
                        {ticket.description}
                      </Text>

                      <XStack gap="$3" alignItems="center" marginTop="$1">
                        <XStack alignItems="center" gap="$1">
                          <MessageSquare size={12} color={colors.gray[400]} />
                          <Text fontSize="$2" color={colors.gray[500]}>{ticket.comment_count}</Text>
                        </XStack>
                        <Text fontSize="$2" color={colors.gray[400]}>{formatTimeAgo(ticket.created_at)}</Text>
                        <Text fontSize="$2" color={colors.gray[400]}>by {ticket.author_name}</Text>
                        <TouchableOpacity onPress={() => handleFlag(ticket)}>
                          <Flag size={12} color={ticket.is_flagged ? colors.red[500] : colors.gray[300]} />
                        </TouchableOpacity>
                      </XStack>
                    </YStack>
                  </XStack>
                </Card>
              </TouchableOpacity>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <XStack justifyContent="center" gap="$2" paddingVertical="$3">
                <Button
                  size="$3"
                  disabled={page <= 1}
                  onPress={() => setPage(p => p - 1)}
                  backgroundColor={colors.gray[100]}
                >
                  <Text fontSize="$3" color={colors.gray[600]}>Previous</Text>
                </Button>
                <XStack alignItems="center" paddingHorizontal="$3">
                  <Text fontSize="$3" color={colors.gray[600]}>Page {page} of {totalPages}</Text>
                </XStack>
                <Button
                  size="$3"
                  disabled={page >= totalPages}
                  onPress={() => setPage(p => p + 1)}
                  backgroundColor={colors.gray[100]}
                >
                  <Text fontSize="$3" color={colors.gray[600]}>Next</Text>
                </Button>
              </XStack>
            )}
          </YStack>
        )}
      </ScrollView>

      {/* Floating Submit Buttons — mobile only; on web users navigate via header/menu */}
      {Platform.OS !== 'web' && (
      <YStack
        position="absolute"
        bottom={Platform.OS === 'ios' ? 30 : 16}
        right={16}
        left={16}
        alignItems="center"
      >
        <XStack gap="$2">
          <Button
            size="$4"
            backgroundColor={colors.red[600]}
            borderRadius="$4"
            paddingHorizontal="$3"
            icon={<Bug size={16} color="white" />}
            onPress={() => router.push('/feedback-submit?type=bug')}
            pressStyle={{ backgroundColor: colors.red[700] }}
            elevation={4}
          >
            <Text color="white" fontWeight="600" fontSize={12}>Report Issue</Text>
          </Button>
          <Button
            size="$4"
            backgroundColor={colors.amber[600]}
            borderRadius="$4"
            paddingHorizontal="$3"
            icon={<Lightbulb size={16} color="white" />}
            onPress={() => router.push('/feedback-submit?type=feature')}
            pressStyle={{ backgroundColor: colors.amber[700] }}
            elevation={4}
          >
            <Text color="white" fontWeight="600" fontSize={12}>Feature</Text>
          </Button>
          <Button
            size="$4"
            backgroundColor={colors.green[600]}
            borderRadius="$4"
            paddingHorizontal="$3"
            icon={<Headphones size={16} color="white" />}
            onPress={() => router.push('/feedback-submit?type=support')}
            pressStyle={{ backgroundColor: colors.green[700] }}
            elevation={4}
          >
            <Text color="white" fontWeight="600" fontSize={12}>Support</Text>
          </Button>
        </XStack>
      </YStack>
      )}
    </YStack>
  )
}
