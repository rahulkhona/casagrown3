'use client'

import React, { useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Card, Input, Spinner } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Search, AlertTriangle, Ghost, Shield, User as UserIcon } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'

type MemberResult = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  is_ghosted: boolean
  post_count: number
  flag_count: number
}

export default function MembersPage() {
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResults, setSearchResults] = useState<MemberResult[]>([])
  const [flaggedUsers, setFlaggedUsers] = useState<MemberResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingFlagged, setLoadingFlagged] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showFlagged, setShowFlagged] = useState(false)

  // Search user by email
  const handleSearch = useCallback(async () => {
    if (!searchEmail.trim()) return
    setSearching(true)
    setError('')
    try {
      // Search profiles by email (partial match)
      const { data: profiles, error: profileErr } = await adminApi.select(
        'profiles',
        'id, email, full_name, avatar_url, is_ghosted',
        { ilike: { email: `%${searchEmail.trim()}%` } },
        { limit: 20 }
      )

      if (profileErr) throw new Error(String(profileErr))

      // For each profile, get post count and flag count
      const results: MemberResult[] = await Promise.all(
        (profiles || []).map(async (profile: any) => {
          const { count: postCount } = await adminApi.select(
            'posts',
            'id',
            { eq: { author_id: profile.id } }
          )

          // Get post ids for this author, then count flags
          const { data: authorPosts } = await adminApi.select(
            'posts',
            'id',
            { eq: { author_id: profile.id } }
          )
          const postIds = (authorPosts || []).map((p: any) => p.id)
          let flagCount = 0
          if (postIds.length > 0) {
            const { count: fc } = await adminApi.select(
              'post_flags',
              'post_id',
              { in: { post_id: postIds } }
            )
            flagCount = fc || 0
          }

          return {
            id: profile.id,
            email: profile.email || '',
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            is_ghosted: profile.is_ghosted ?? false,
            post_count: postCount || 0,
            flag_count: flagCount,
          }
        })
      )
      setSearchResults(results)
    } catch (err: any) {
      setError(err.message || 'Search failed')
    } finally {
      setSearching(false)
    }
  }, [searchEmail])

  // Find users with ≥3 flagged posts in the last 24 hours
  const handleShowFlagged = useCallback(async () => {
    setLoadingFlagged(true)
    setError('')
    setShowFlagged(true)
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      // Get flags from the last 24 hours, grouped by post author
      const { data: recentFlags, error: flagErr } = await adminApi.select(
        'post_flags',
        'post_id, posts!inner(author_id)',
        { gte: { created_at: oneDayAgo } }
      )

      if (flagErr) throw new Error(String(flagErr))

      // Count flags per author
      const authorFlagCounts = new Map<string, number>()
      for (const flag of (recentFlags || [])) {
        const authorId = (flag as any).posts?.author_id
        if (authorId) {
          authorFlagCounts.set(authorId, (authorFlagCounts.get(authorId) || 0) + 1)
        }
      }

      // Filter to authors with ≥3 flags
      const highFlagAuthors = Array.from(authorFlagCounts.entries())
        .filter(([_, count]) => count >= 3)
        .map(([authorId]) => authorId)

      if (highFlagAuthors.length === 0) {
        setFlaggedUsers([])
        setLoadingFlagged(false)
        return
      }

      // Fetch their profiles
      const { data: profiles } = await adminApi.select(
        'profiles',
        'id, email, full_name, avatar_url, is_ghosted',
        { in: { id: highFlagAuthors } }
      )

      const results: MemberResult[] = (profiles || []).map((profile: any) => ({
        id: profile.id,
        email: profile.email || '',
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        is_ghosted: profile.is_ghosted ?? false,
        post_count: 0, // Not needed for flagged view
        flag_count: authorFlagCounts.get(profile.id) || 0,
      }))

      setFlaggedUsers(results)
    } catch (err: any) {
      setError(err.message || 'Failed to load flagged users')
    } finally {
      setLoadingFlagged(false)
    }
  }, [])

  // Toggle ghost status for a user
  const toggleGhost = useCallback(async (userId: string, currentStatus: boolean) => {
    setTogglingId(userId)
    try {
      const { error: updateErr } = await adminApi.update(
        'profiles',
        { is_ghosted: !currentStatus },
        { eq: { id: userId } }
      )

      if (updateErr) throw new Error(String(updateErr))

      // Update local state in both lists
      const updateUser = (user: MemberResult) =>
        user.id === userId ? { ...user, is_ghosted: !currentStatus } : user

      setSearchResults(prev => prev.map(updateUser))
      setFlaggedUsers(prev => prev.map(updateUser))
    } catch (err: any) {
      setError(err.message || 'Failed to update ghost status')
    } finally {
      setTogglingId(null)
    }
  }, [])

  const MemberCard = ({ member }: { member: MemberResult }) => (
    <Card
      borderWidth={1}
      padding="$4"
      backgroundColor="white"
      borderColor={member.is_ghosted ? colors.red[200] : colors.gray[200]}
      data-testid={`member-card-${member.id}`}
    >
      <XStack alignItems="center" justifyContent="space-between" flexWrap="wrap" gap="$3">
        <XStack alignItems="center" gap="$3" flex={1} minWidth={200}>
          {/* Avatar */}
          <YStack
            width={40}
            height={40}
            borderRadius={20}
            backgroundColor={colors.green[100]}
            alignItems="center"
            justifyContent="center"
          >
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt={member.full_name || 'User'}
                style={{ width: 40, height: 40, borderRadius: 20, objectFit: 'cover' }}
              />
            ) : (
              <UserIcon size={20} color={colors.green[600]} />
            )}
          </YStack>

          {/* Info */}
          <YStack gap="$1" flex={1}>
            <Text fontWeight="600" color={colors.gray[900]} data-testid={`member-name-${member.id}`}>
              {member.full_name || 'No name'}
            </Text>
            <Text fontSize="$2" color={colors.gray[500]} data-testid={`member-email-${member.id}`}>
              {member.email}
            </Text>
            <XStack gap="$3" marginTop="$1">
              <Text fontSize="$2" color={colors.gray[500]}>
                Posts: {member.post_count}
              </Text>
              <Text
                fontSize="$2"
                color={member.flag_count >= 3 ? colors.red[600] : colors.gray[500]}
                fontWeight={member.flag_count >= 3 ? '700' : '400'}
              >
                Flags: {member.flag_count}
              </Text>
            </XStack>
          </YStack>
        </XStack>

        {/* Ghost status + toggle */}
        <XStack alignItems="center" gap="$3">
          {/* Status Badge */}
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$1"
            borderRadius={999}
            backgroundColor={member.is_ghosted ? colors.red[100] : colors.green[100]}
            data-testid={`ghost-badge-${member.id}`}
          >
            <Text
              fontSize="$2"
              fontWeight="600"
              color={member.is_ghosted ? colors.red[700] : colors.green[700]}
            >
              {member.is_ghosted ? '👻 Ghosted' : '✓ Active'}
            </Text>
          </XStack>

          {/* Toggle Button */}
          <Button
            size="$3"
            backgroundColor={member.is_ghosted ? colors.green[600] : colors.red[100]}
            borderColor={member.is_ghosted ? colors.green[700] : colors.red[300]}
            borderWidth={1}
            onPress={() => toggleGhost(member.id, member.is_ghosted)}
            disabled={togglingId === member.id}
            hoverStyle={{
              backgroundColor: member.is_ghosted ? colors.green[700] : colors.red[200],
            }}
            data-testid={`ghost-toggle-${member.id}`}
          >
            {togglingId === member.id ? (
              <Spinner size="small" color={member.is_ghosted ? 'white' : colors.red[600]} />
            ) : (
              <Text
                color={member.is_ghosted ? 'white' : colors.red[600]}
                fontWeight="600"
                fontSize="$2"
              >
                {member.is_ghosted ? 'Remove Ghost' : 'Ghost User'}
              </Text>
            )}
          </Button>
        </XStack>
      </XStack>
    </Card>
  )

  return (
    <YStack gap="$6" maxWidth={900} width="100%">
      {/* Page Header */}
      <YStack gap="$2">
        <Text fontSize="$8" fontWeight="700" color={colors.gray[900]} data-testid="members-title">
          Member Management
        </Text>
        <Text fontSize="$4" color={colors.gray[500]}>
          Search users by email, view flagged accounts, and manage ghost status.
        </Text>
      </YStack>

      {/* Search Section */}
      <Card borderWidth={1} padding="$4" backgroundColor="white" data-testid="search-section">
        <YStack gap="$3">
          <XStack alignItems="center" gap="$2">
            <Search size={16} color={colors.gray[600]} />
            <Text fontWeight="600" color={colors.gray[800]} fontSize="$4">
              Search by Email
            </Text>
          </XStack>
          <XStack gap="$2" alignItems="center">
            <Input
              flex={1}
              value={searchEmail}
              onChangeText={setSearchEmail}
              placeholder="Enter email address..."
              size="$4"
              borderWidth={1}
              borderColor={colors.gray[300]}
              onSubmitEditing={handleSearch}
              data-testid="email-search-input"
            />
            <Button
              backgroundColor={colors.green[600]}
              height="$4"
              paddingHorizontal="$4"
              onPress={handleSearch}
              disabled={searching || !searchEmail.trim()}
              hoverStyle={{ backgroundColor: colors.green[700] }}
              data-testid="search-button"
            >
              {searching ? (
                <Spinner size="small" color="white" />
              ) : (
                <Text color="white" fontWeight="600">Search</Text>
              )}
            </Button>
          </XStack>
        </YStack>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <YStack gap="$3" data-testid="search-results">
          <Text fontWeight="600" color={colors.gray[700]}>
            Search Results ({searchResults.length})
          </Text>
          {searchResults.map(member => (
            <MemberCard key={member.id} member={member} />
          ))}
        </YStack>
      )}

      {/* Flagged Users Section */}
      <Card borderWidth={1} padding="$4" backgroundColor="white" data-testid="flagged-section">
        <YStack gap="$3">
          <XStack justifyContent="space-between" alignItems="center">
            <XStack alignItems="center" gap="$2">
              <AlertTriangle size={16} color={colors.red[500]} />
              <Text fontWeight="600" color={colors.gray[800]} fontSize="$4">
                Highly Flagged Users
              </Text>
            </XStack>
            <Button
              backgroundColor={colors.red[50]}
              borderColor={colors.red[200]}
              borderWidth={1}
              onPress={handleShowFlagged}
              disabled={loadingFlagged}
              hoverStyle={{ backgroundColor: colors.red[100] }}
              data-testid="show-flagged-button"
            >
              {loadingFlagged ? (
                <Spinner size="small" color={colors.red[600]} />
              ) : (
                <Text color={colors.red[600]} fontWeight="600" fontSize="$3">
                  {showFlagged ? 'Refresh' : 'Show Flagged Users (≥3 flags/24h)'}
                </Text>
              )}
            </Button>
          </XStack>

          {showFlagged && flaggedUsers.length === 0 && !loadingFlagged && (
            <XStack
              padding="$4"
              backgroundColor={colors.green[50]}
              borderRadius="$2"
              alignItems="center"
              gap="$2"
              data-testid="no-flagged-message"
            >
              <Shield size={20} color={colors.green[600]} />
              <Text color={colors.green[700]}>
                No users with ≥3 flags in the last 24 hours. Community is healthy!
              </Text>
            </XStack>
          )}

          {flaggedUsers.map(member => (
            <MemberCard key={member.id} member={member} />
          ))}
        </YStack>
      </Card>

      {/* Error Display */}
      {error && (
        <Card
          borderWidth={1}
          padding="$3"
          backgroundColor={colors.red[50]}
          borderColor={colors.red[200]}
          data-testid="error-message"
        >
          <Text color={colors.red[600]}>{error}</Text>
        </Card>
      )}
    </YStack>
  )
}
