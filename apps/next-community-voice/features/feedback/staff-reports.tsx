'use client'

import { useState, useEffect, useCallback } from 'react'
import { YStack, XStack, Text, Card, ScrollView, Spinner, Button, useMedia } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Calendar } from '@tamagui/lucide-icons'
import { fetchReportStats, type ReportStats } from './feedback-service'

// Status colors for the distribution chart
const STATUS_COLORS: Record<string, string> = {
  open: colors.gray[500],
  under_review: colors.amber[500],
  planned: colors.blue[600],
  in_progress: colors.purple[600],
  completed: colors.green[600],
  rejected: colors.red[600],
  duplicate: colors.gray[400],
}

type RangePreset = '7d' | '30d' | '90d' | 'custom'

function getDateRange(preset: RangePreset, startDate: string, endDate: string) {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let start: Date

  switch (preset) {
    case '7d':
      start = new Date(end)
      start.setDate(start.getDate() - 7)
      break
    case '90d':
      start = new Date(end)
      start.setDate(start.getDate() - 90)
      break
    case 'custom':
      return {
        start: startDate || end.toISOString().slice(0, 10),
        end: endDate || end.toISOString().slice(0, 10),
      }
    default: // 30d
      start = new Date(end)
      start.setDate(start.getDate() - 30)
  }

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function formatStatus(status: string): string {
  return status.split('_').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ')
}

export function StaffReports() {
  const media = useMedia()
  const isDesktop = !media.sm

  const [rangePreset, setRangePreset] = useState<RangePreset>('30d')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [stats, setStats] = useState<ReportStats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    setLoading(true)
    const range = getDateRange(rangePreset, startDate, endDate)
    const data = await fetchReportStats(range.start, range.end)
    setStats(data)
    setLoading(false)
  }, [rangePreset, startDate, endDate])

  useEffect(() => { loadStats() }, [loadStats])

  const rangeLabel = rangePreset === 'custom' && startDate && endDate
    ? `${startDate} — ${endDate}`
    : rangePreset === '7d' ? 'Last 7 days'
    : rangePreset === '90d' ? 'Last 90 days'
    : 'Last 30 days'

  // Derived chart maxes
  const maxBugFeature = stats ? Math.max(1, ...stats.weeklyTrend.map(d => Math.max(d.bugs, d.features))) : 1
  const maxStatus = stats ? Math.max(1, ...stats.statusBreakdown.map(d => d.count)) : 1
  const maxUpvote = stats ? Math.max(1, ...stats.voteBuckets.map(d => d.count)) : 1

  return (
    <ScrollView>
    <YStack padding={isDesktop ? '$4' : '$3'} gap="$4" backgroundColor={colors.gray[100]}>
      <YStack gap="$2">
        <Text fontSize="$7" fontWeight="700" color={colors.gray[900]}>Reports & Analytics</Text>
        <Text fontSize="$4" color={colors.gray[500]} fontWeight="400">Live insights from community feedback</Text>

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

      {loading || !stats ? (
        <YStack alignItems="center" padding="$8">
          <Spinner size="large" color={colors.green[600]} />
          <Text marginTop="$3" color={colors.gray[500]}>Loading report data…</Text>
        </YStack>
      ) : (
        <>
          {/* Summary Stats */}
          <XStack gap="$3" flexWrap="wrap">
            {[
              { label: 'Avg Resolution Time', value: `${stats.avgResolutionDays} days` },
              { label: 'Total Submissions', value: String(stats.totalSubmissions) },
              { label: 'Closure Rate', value: `${stats.closureRate}%` },
              { label: 'Avg Upvotes', value: String(stats.avgVotes) },
            ].map(stat => (
              <Card key={stat.label} flex={1} minWidth={140} padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$1">
                <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">{stat.label}</Text>
                <Text fontSize="$7" fontWeight="700" color={colors.gray[900]}>{stat.value}</Text>
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
            {stats.weeklyTrend.length === 0 ? (
              <Text fontSize="$3" color={colors.gray[400]} padding="$4" textAlign="center">No data for this period</Text>
            ) : (
              <XStack gap={2} alignItems="flex-end" height={160}>
                {stats.weeklyTrend.map((d, i) => {
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
            )}
          </Card>

          {/* Status Distribution */}
          <Card padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$3">
            <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Ticket Status Distribution</Text>
            {stats.statusBreakdown.length === 0 ? (
              <Text fontSize="$3" color={colors.gray[400]} padding="$4" textAlign="center">No data for this period</Text>
            ) : (
              <YStack gap="$3">
                {stats.statusBreakdown.map(d => (
                  <YStack key={d.status} gap="$1">
                    <XStack justifyContent="space-between">
                      <Text fontSize="$3" color={colors.gray[700]} fontWeight="500">{formatStatus(d.status)}</Text>
                      <Text fontSize="$3" color={colors.gray[500]}>{d.count}</Text>
                    </XStack>
                    <YStack height={8} backgroundColor={colors.gray[100]} borderRadius={4} overflow="hidden">
                      <YStack
                        height="100%"
                        width={`${(d.count / maxStatus) * 100}%`}
                        backgroundColor={(STATUS_COLORS[d.status] || colors.gray[500]) as any}
                        borderRadius={4}
                      />
                    </YStack>
                  </YStack>
                ))}
              </YStack>
            )}
          </Card>

          {/* Upvote Histogram */}
          <Card padding="$4" backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} gap="$3">
            <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Upvote Distribution</Text>
            <Text fontSize="$3" color={colors.gray[500]} fontWeight="400">Number of tickets by upvote range</Text>
            {stats.voteBuckets.length === 0 ? (
              <Text fontSize="$3" color={colors.gray[400]} padding="$4" textAlign="center">No data</Text>
            ) : (
              <XStack gap="$2" alignItems="flex-end" height={140}>
                {stats.voteBuckets.map((d, i) => {
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
            )}
          </Card>
        </>
      )}
    </YStack>
    </ScrollView>
  )
}
