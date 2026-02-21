'use client'

import { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Card, Image, useMedia } from 'tamagui'
import { useRouter } from 'next/navigation'
import { colors } from '@casagrown/app/design-tokens'
import { BarChart3, LogOut, Users, Plus, User } from '@tamagui/lucide-icons'
import { FeedbackBoard } from './feedback-board'
import { supabase } from '@casagrown/app/utils/supabase'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

export function StaffDashboard() {
  const router = useRouter()
  const media = useMedia()
  const isDesktop = !media.sm
  const { user } = useAuth()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
      .then(({ data }) => { if (data?.avatar_url) setAvatarUrl(data.avatar_url) })
  }, [user])

  return (
    <YStack flex={1} backgroundColor={colors.green[50]}>
      {/* Staff Header */}
      <YStack padding={isDesktop ? '$4' : '$3'} paddingBottom="$0" gap="$3">
        <XStack justifyContent="space-between" alignItems="center">
          <XStack gap="$3" alignItems="center">
              <Image src="/logo.png" width={40} height={40} />
              <YStack>
                  <Text fontSize="$6" fontWeight="700" color={colors.green[800]}>Staff Dashboard</Text>
                  <Text color={colors.gray[500]} fontWeight="400" fontSize="$3">Manage community feedback</Text>
              </YStack>
          </XStack>
          <XStack gap="$2" alignItems="center">
              <Button icon={Plus} size="$3" backgroundColor={colors.green[600]} onPress={() => router.push('/submit')} pressStyle={{ backgroundColor: colors.green[700] }}>
                <Text color="white" fontSize="$2" fontWeight="600">New Ticket</Text>
              </Button>
              <Button icon={Users} size="$3" backgroundColor={colors.green[100]} onPress={() => router.push('/staff/manage')}>
                <Text color={colors.green[700]} fontSize="$2" fontWeight="600">Manage Staff</Text>
              </Button>
              <Button icon={BarChart3} size="$3" backgroundColor={colors.green[100]} onPress={() => router.push('/staff/reports')}>
                <Text color={colors.green[700]} fontSize="$2" fontWeight="600">Reports</Text>
              </Button>
              <XStack
                width={32}
                height={32}
                borderRadius={16}
                backgroundColor={colors.green[100]}
                alignItems="center"
                justifyContent="center"
                overflow="hidden"
                cursor="pointer"
                onPress={() => router.push('/staff/profile')}
                borderWidth={2}
                borderColor={colors.green[300]}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} width={32} height={32} style={{ objectFit: 'cover', borderRadius: 16 }} alt="Profile" />
                ) : (
                  <User size={16} color={colors.green[600]} />
                )}
              </XStack>
              <Button icon={LogOut} size="$3" chromeless onPress={async () => {
                await supabase.auth.signOut()
                router.push('/staff/login')
              }}>
                <Text color={colors.gray[500]} fontSize="$2">Logout</Text>
              </Button>
          </XStack>
        </XStack>

        {/* Stats Cards */}
        <XStack gap="$3" flexWrap="wrap">
          <Card flex={1} minWidth={140} padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$2">
              <Text color={colors.gray[500]} fontSize="$3">Open Tickets</Text>
              <Text fontSize="$8" fontWeight="700" color={colors.gray[800]}>24</Text>
          </Card>
          <Card flex={1} minWidth={140} padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$2">
              <Text color={colors.gray[500]} fontSize="$3">Pending Review</Text>
              <Text fontSize="$8" fontWeight="700" color={colors.amber[600]}>5</Text>
          </Card>
          <Card flex={1} minWidth={140} padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$2">
              <Text color={colors.gray[500]} fontSize="$3">Completed</Text>
              <Text fontSize="$8" fontWeight="700" color={colors.green[600]}>112</Text>
          </Card>
        </XStack>
      </YStack>

      {/* Shared Board with staff capabilities */}
      <FeedbackBoard isStaff hideHeader />
    </YStack>
  )
}
