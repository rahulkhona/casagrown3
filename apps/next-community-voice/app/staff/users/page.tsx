'use client'

import { useState, useEffect, useCallback } from 'react'
import { YStack, XStack, Text, Card, ScrollView, Spinner, Button, Image, useMedia } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { ArrowLeft, Search, ShieldAlert, ShieldCheck, User } from '@tamagui/lucide-icons'
import { useRouter } from 'next/navigation'
import { fetchUsers, banUser, unbanUser, type UserEntry } from '../../features/feedback/feedback-service'

export default function StaffUsersPage() {
  const router = useRouter()
  const media = useMedia()
  const isDesktop = !media.sm

  const [users, setUsers] = useState<UserEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [banDialogUser, setBanDialogUser] = useState<UserEntry | null>(null)
  const [banReason, setBanReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const PAGE_SIZE = 25

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await fetchUsers(search, page, PAGE_SIZE)
    setUsers(result.users)
    setTotalCount(result.totalCount)
    setLoading(false)
  }, [search, page])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleBan = async () => {
    if (!banDialogUser) return
    setActionLoading(banDialogUser.id)
    const result = await banUser(banDialogUser.id, banReason || 'Banned by staff')
    if (result.success) {
      setUsers(prev => prev.map(u =>
        u.id === banDialogUser.id ? { ...u, isBanned: true, banReason: banReason || 'Banned by staff', bannedAt: new Date().toISOString() } : u
      ))
    } else {
      setError(result.error || 'Failed to ban user')
    }
    setBanDialogUser(null)
    setBanReason('')
    setActionLoading(null)
  }

  const handleUnban = async (userId: string) => {
    setActionLoading(userId)
    const result = await unbanUser(userId)
    if (result.success) {
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, isBanned: false, banReason: null, bannedAt: null } : u
      ))
    } else {
      setError(result.error || 'Failed to unban user')
    }
    setActionLoading(null)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <ScrollView>
      <YStack padding={isDesktop ? '$4' : '$3'} gap="$4" backgroundColor={colors.gray[100]} minHeight="100vh">
        {/* Header */}
        <XStack alignItems="center" gap="$3">
          <Button icon={ArrowLeft} size="$3" chromeless onPress={() => router.push('/staff')} />
          <YStack>
            <Text fontSize="$6" fontWeight="700" color={colors.gray[900]}>Manage Users</Text>
            <Text fontSize="$3" color={colors.gray[500]}>{totalCount} users total</Text>
          </YStack>
        </XStack>

        {/* Search */}
        <Card padding="$3" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]}>
          <XStack gap="$2" alignItems="center">
            <Search size={16} color={colors.gray[400]} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              style={{
                flex: 1,
                padding: 8,
                border: `1px solid ${colors.gray[300]}`,
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
              }}
            />
          </XStack>
        </Card>

        {/* Error Banner */}
        {error && (
          <Card padding="$3" backgroundColor={colors.red[50]} borderRadius="$4" borderWidth={1} borderColor={colors.red[200]}>
            <Text color={colors.red[700]} fontSize="$3">{error}</Text>
          </Card>
        )}

        {/* Ban Confirmation Dialog */}
        {banDialogUser && (
          <Card padding="$4" backgroundColor={colors.amber[50]} borderRadius="$4" borderWidth={2} borderColor={colors.amber[300]} gap="$3">
            <Text fontSize="$4" fontWeight="600" color={colors.gray[800]}>
              Ban {banDialogUser.fullName || banDialogUser.email}?
            </Text>
            <Text fontSize="$3" color={colors.gray[600]}>
              This will block the user from accessing both the Voice app and the Market app.
            </Text>
            <input
              type="text"
              placeholder="Reason for ban (optional)"
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              style={{
                padding: 8,
                border: `1px solid ${colors.gray[300]}`,
                borderRadius: 8,
                fontSize: 14,
              }}
            />
            <XStack gap="$2">
              <Button size="$3" backgroundColor={colors.red[600]} onPress={handleBan} disabled={!!actionLoading}>
                <Text color="white" fontWeight="600" fontSize="$3">Confirm Ban</Text>
              </Button>
              <Button size="$3" backgroundColor={colors.gray[200]} onPress={() => { setBanDialogUser(null); setBanReason('') }}>
                <Text color={colors.gray[700]} fontWeight="600" fontSize="$3">Cancel</Text>
              </Button>
            </XStack>
          </Card>
        )}

        {/* User List */}
        {loading ? (
          <YStack alignItems="center" padding="$8">
            <Spinner size="large" color={colors.green[600]} />
            <Text marginTop="$3" color={colors.gray[500]}>Loading users…</Text>
          </YStack>
        ) : users.length === 0 ? (
          <Card padding="$8" backgroundColor="white" borderRadius="$4" alignItems="center">
            <Text color={colors.gray[400]} fontSize="$4">No users found</Text>
          </Card>
        ) : (
          <YStack gap="$2">
            {users.map(user => (
              <Card
                key={user.id}
                padding="$3"
                backgroundColor={user.isBanned ? colors.red[50] : 'white'}
                borderRadius="$4"
                borderWidth={1}
                borderColor={user.isBanned ? colors.red[200] : colors.gray[200]}
              >
                <XStack gap="$3" alignItems="center" justifyContent="space-between" flexWrap="wrap">
                  <XStack gap="$3" alignItems="center" flex={1} minWidth={200}>
                    {/* Avatar */}
                    <XStack width={40} height={40} borderRadius={20} backgroundColor={colors.gray[100]} alignItems="center" justifyContent="center" overflow="hidden">
                      {user.avatarUrl ? (
                        <Image src={user.avatarUrl} width={40} height={40} />
                      ) : (
                        <User size={20} color={colors.gray[400]} />
                      )}
                    </XStack>
                    <YStack flex={1}>
                      <XStack gap="$2" alignItems="center">
                        <Text fontSize="$3" fontWeight="600" color={colors.gray[800]} numberOfLines={1}>
                          {user.fullName || 'No Name'}
                        </Text>
                        {user.isBanned && (
                          <XStack backgroundColor={colors.red[100]} paddingHorizontal="$1" borderRadius="$1">
                            <Text fontSize={10} color={colors.red[700]} fontWeight="700">BANNED</Text>
                          </XStack>
                        )}
                      </XStack>
                      <Text fontSize="$2" color={colors.gray[500]} numberOfLines={1}>{user.email}</Text>
                      <Text fontSize="$1" color={colors.gray[400]}>
                        Joined {new Date(user.createdAt).toLocaleDateString()}
                      </Text>
                      {user.isBanned && user.banReason && (
                        <Text fontSize="$2" color={colors.red[600]} marginTop="$1">
                          Reason: {user.banReason}
                        </Text>
                      )}
                    </YStack>
                  </XStack>

                  {/* Action Button */}
                  <XStack>
                    {user.isBanned ? (
                      <Button
                        icon={ShieldCheck}
                        size="$3"
                        backgroundColor={colors.green[100]}
                        onPress={() => handleUnban(user.id)}
                        disabled={actionLoading === user.id}
                      >
                        {actionLoading === user.id ? (
                          <Spinner size="small" color={colors.green[600]} />
                        ) : (
                          <Text color={colors.green[700]} fontSize="$2" fontWeight="600">Unban</Text>
                        )}
                      </Button>
                    ) : (
                      <Button
                        icon={ShieldAlert}
                        size="$3"
                        backgroundColor={colors.red[100]}
                        onPress={() => setBanDialogUser(user)}
                        disabled={actionLoading === user.id}
                      >
                        <Text color={colors.red[700]} fontSize="$2" fontWeight="600">Ban</Text>
                      </Button>
                    )}
                  </XStack>
                </XStack>
              </Card>
            ))}
          </YStack>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <XStack justifyContent="center" gap="$2" alignItems="center">
            <Button size="$3" disabled={page <= 1} onPress={() => setPage(p => p - 1)} backgroundColor={colors.gray[200]}>
              <Text fontSize="$2" color={colors.gray[700]}>← Previous</Text>
            </Button>
            <Text fontSize="$3" color={colors.gray[600]}>Page {page} of {totalPages}</Text>
            <Button size="$3" disabled={page >= totalPages} onPress={() => setPage(p => p + 1)} backgroundColor={colors.gray[200]}>
              <Text fontSize="$2" color={colors.gray[700]}>Next →</Text>
            </Button>
          </XStack>
        )}
      </YStack>
    </ScrollView>
  )
}
