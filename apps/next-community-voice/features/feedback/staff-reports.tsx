'use client'

import { useState } from 'react'
import { YStack, XStack, Text, Card, ScrollView, Separator, Button, useMedia } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Calendar } from '@tamagui/lucide-icons'

// Mock chart data
const WEEKLY_DATA = [
  { week: 'W1', bugs: 5, features: 8 },
  { week: 'W2', bugs: 3, features: 12 },
  { week: 'W3', bugs: 7, features: 6 },
  { week: 'W4', bugs: 4, features: 10 },
  { week: 'W5', bugs: 9, features: 7 },
  { week: 'W6', bugs: 2, features: 15 },
  { week: 'W7', bugs: 6, features: 9 },
  { week: 'W8', bugs: 8, features: 5 },
  { week: 'W9', bugs: 3, features: 11 },
  { week: 'W10', bugs: 5, features: 8 },
  { week: 'W11', bugs: 4, features: 13 },
  { week: 'W12', bugs: 7, features: 10 },
]

const STATUS_DATA = [
  { status: 'Open', count: 24, color: colors.gray[500] },
  { status: 'Planned', count: 15, color: colors.blue[600] },
  { status: 'In Progress', count: 8, color: colors.purple[600] },
  { status: 'Completed', count: 112, color: colors.green[600] },
  { status: 'Rejected', count: 6, color: colors.red[600] },
]

const UPVOTE_BUCKETS = [
  { range: '0-5', count: 45 },
  { range: '6-10', count: 32 },
  { range: '11-25', count: 28 },
  { range: '26-50', count: 18 },
  { range: '51-100', count: 12 },
  { range: '100+', count: 5 },
]

const SUMMARY_STATS = [
  { label: 'Avg Resolution Time', value: '4.2 days', trend: '-12%', positive: true },
  { label: 'Total Submissions', value: '165', trend: '+23%', positive: true },
  { label: 'Closure Rate', value: '68%', trend: '+5%', positive: true },
  { label: 'Avg Upvotes', value: '18.3', trend: '-3%', positive: false },
]

type RangePreset = '7d' | '30d' | '90d' | 'custom'

export function StaffReports() {
  const media = useMedia()
  const isDesktop = !media.sm
  const maxBugFeature = Math.max(...WEEKLY_DATA.map(d => Math.max(d.bugs, d.features)))
  const maxStatus = Math.max(...STATUS_DATA.map(d => d.count))
  const maxUpvote = Math.max(...UPVOTE_BUCKETS.map(d => d.count))

  const [rangePreset, setRangePreset] = useState<RangePreset>('30d')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const rangeLabel = rangePreset === 'custom' && startDate && endDate
    ? `${startDate} — ${endDate}`
    : rangePreset === '7d' ? 'Last 7 days'
    : rangePreset === '90d' ? 'Last 90 days'
    : 'Last 30 days'

  return (
    <ScrollView>
    <YStack padding={isDesktop ? '$4' : '$3'} gap="$4" backgroundColor={colors.gray[100]}>
      <YStack gap="$2">
        <Text fontSize="$7" fontWeight="700" color={colors.gray[900]}>Reports & Analytics</Text>
        <Text fontSize="$4" color={colors.gray[500]} fontWeight="400">Insights from community feedback</Text>

        {/* Date Range Picker */}
        <Card padding="$3" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} marginTop="$2">
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <Calendar size={16} color={colors.gray[500]} />
            <Text fontSize="$3" color={colors.gray[600]} fontWeight="500">Date Range:</Text>
            {([
              { key: '7d', label: '7 days' },
              { key: '30d', label: '30 days' },
              { key: '90d', label: '90 days' },
              { key: 'custom', label: 'Custom' },
            ] as const).map(p => (
              <Button
                key={p.key}
                size="$2"
                backgroundColor={rangePreset === p.key ? colors.green[600] : colors.gray[100]}
                borderRadius="$4"
                onPress={() => setRangePreset(p.key)}
              >
                <Text color={rangePreset === p.key ? 'white' : colors.gray[600]} fontSize="$2" fontWeight="500">{p.label}</Text>
              </Button>
            ))}
          </XStack>
          {rangePreset === 'custom' && (
            <XStack gap="$2" alignItems="center" marginTop="$2" flexWrap="wrap">
              <Text fontSize="$2" color={colors.gray[500]}>From:</Text>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{ padding: 6, borderRadius: 8, border: `1px solid ${colors.gray[300]}`, fontSize: 13 }}
              />
              <Text fontSize="$2" color={colors.gray[500]}>To:</Text>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{ padding: 6, borderRadius: 8, border: `1px solid ${colors.gray[300]}`, fontSize: 13 }}
              />
            </XStack>
          )}
          <Text fontSize="$2" color={colors.gray[400]} marginTop="$1">Showing data for: {rangeLabel}</Text>
        </Card>
      </YStack>

      {/* Summary Stats */}
      <XStack gap="$3" flexWrap="wrap">
        {SUMMARY_STATS.map(stat => (
          <Card key={stat.label} flex={1} minWidth={140} padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$1">
            <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">{stat.label}</Text>
            <XStack alignItems="baseline" gap="$2">
              <Text fontSize="$7" fontWeight="700" color={colors.gray[900]}>{stat.value}</Text>
              <Text fontSize="$2" fontWeight="600" color={stat.positive ? colors.green[600] : colors.red[500]}>{stat.trend}</Text>
            </XStack>
          </Card>
        ))}
      </XStack>

      {/* Trend Lines: Bugs vs Features */}
      <Card padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$3">
        <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Weekly Trend: Bugs vs Features</Text>
        <XStack gap="$2" marginBottom="$2">
          <XStack gap="$1" alignItems="center">
            <YStack width={12} height={12} borderRadius={2} backgroundColor={colors.red[400]} />
            <Text fontSize="$2" color={colors.gray[500]}>Bugs</Text>
          </XStack>
          <XStack gap="$1" alignItems="center">
            <YStack width={12} height={12} borderRadius={2} backgroundColor={colors.green[400]} />
            <Text fontSize="$2" color={colors.gray[500]}>Features</Text>
          </XStack>
        </XStack>
        <XStack gap={2} alignItems="flex-end" height={160}>
          {WEEKLY_DATA.map((d, i) => {
            const maxH = 140
            const bugH = Math.round((d.bugs / maxBugFeature) * maxH)
            const featH = Math.round((d.features / maxBugFeature) * maxH)
            return (
              <YStack key={i} flex={1} alignItems="center" gap={2} justifyContent="flex-end">
                <XStack gap={1} alignItems="flex-end">
                  <YStack
                    width={8}
                    height={bugH}
                    backgroundColor={colors.red[400]}
                    borderTopLeftRadius={2}
                    borderTopRightRadius={2}
                  />
                  <YStack
                    width={8}
                    height={featH}
                    backgroundColor={colors.green[400]}
                    borderTopLeftRadius={2}
                    borderTopRightRadius={2}
                  />
                </XStack>
                <Text fontSize={9} color={colors.gray[400]}>{d.week}</Text>
              </YStack>
            )
          })}
        </XStack>
      </Card>

      {/* Status Distribution */}
      <Card padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$3">
        <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Ticket Status Distribution</Text>
        <YStack gap="$3">
          {STATUS_DATA.map(d => (
            <YStack key={d.status} gap="$1">
              <XStack justifyContent="space-between">
                <Text fontSize="$3" color={colors.gray[700]} fontWeight="500">{d.status}</Text>
                <Text fontSize="$3" color={colors.gray[500]}>{d.count}</Text>
              </XStack>
              <YStack height={8} backgroundColor={colors.gray[100]} borderRadius={4} overflow="hidden">
                <YStack 
                  height="100%" 
                  width={`${(d.count / maxStatus) * 100}%`} 
                  backgroundColor={d.color} 
                  borderRadius={4}
                />
              </YStack>
            </YStack>
          ))}
        </YStack>
      </Card>

      {/* Upvote Histogram */}
      <Card padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$3">
        <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Upvote Distribution</Text>
        <Text fontSize="$3" color={colors.gray[500]} fontWeight="400">Number of tickets by upvote range</Text>
        <XStack gap="$2" alignItems="flex-end" height={140}>
          {UPVOTE_BUCKETS.map((d, i) => {
            const barH = Math.round((d.count / maxUpvote) * 120)
            return (
              <YStack key={i} flex={1} alignItems="center" gap="$1" justifyContent="flex-end">
                <Text fontSize={10} color={colors.gray[600]} fontWeight="600">{d.count}</Text>
                <YStack
                  width="80%"
                  height={barH}
                  backgroundColor={colors.green[400]}
                  borderTopLeftRadius={4}
                  borderTopRightRadius={4}
                />
                <Text fontSize={10} color={colors.gray[400]}>{d.range}</Text>
              </YStack>
            )
          })}
        </XStack>
      </Card>

      {/* Top Items */}
      <Card padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$3">
        <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Top Voted Tickets</Text>
        <YStack gap="$2">
          {[
            { title: 'Dark mode support', votes: 120, type: 'feature' },
            { title: 'Allow uploading videos in chat', votes: 45, type: 'feature' },
            { title: 'App crashes when opening profile', votes: 32, type: 'bug' },
            { title: 'Map not loading on slower connections', votes: 27, type: 'bug' },
            { title: 'Points transaction history export', votes: 15, type: 'feature' },
          ].map((item, i) => (
            <XStack key={i} justifyContent="space-between" alignItems="center" padding="$2" backgroundColor={i % 2 === 0 ? colors.gray[50] : 'transparent'} borderRadius="$2">
              <XStack gap="$2" alignItems="center" flex={1}>
                <Text fontSize="$3" fontWeight="600" color={colors.gray[400]} width={20}>#{i + 1}</Text>
                <Text fontSize="$3" color={colors.gray[800]} numberOfLines={1} flex={1}>{item.title}</Text>
              </XStack>
              <XStack gap="$2" alignItems="center">
                <Text fontSize="$2" color={item.type === 'bug' ? colors.red[600] : colors.amber[600]} fontWeight="600" backgroundColor={item.type === 'bug' ? colors.red[100] : colors.amber[100]} paddingHorizontal="$1" borderRadius="$1">
                  {item.type.toUpperCase()}
                </Text>
                <Text fontSize="$3" fontWeight="600" color={colors.green[600]}>▲ {item.votes}</Text>
              </XStack>
            </XStack>
          ))}
        </YStack>
      </Card>
    </YStack>
    </ScrollView>
  )
}
