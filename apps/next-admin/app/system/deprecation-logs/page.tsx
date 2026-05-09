'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@casagrown/app/features/auth/auth-hook'
import { H1, H2, Paragraph, YStack, XStack, Card, Separator, Theme, ScrollView, Button } from 'tamagui'
import { ActivityIndicator } from 'react-native'

export default function DeprecationLogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [cleanupLogs, setCleanupLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [])

  async function fetchLogs() {
    setLoading(true)
    const [usageRes, cleanupRes] = await Promise.all([
      supabase.from('obsolete_usage_logs').select('*').order('referenced_at', { ascending: false }).limit(100),
      supabase.from('obsolete_cleanup_logs').select('*').order('cleared_at', { ascending: false }).limit(10)
    ])

    if (usageRes.data) setLogs(usageRes.data)
    if (cleanupRes.data) setCleanupLogs(cleanupRes.data)
    setLoading(false)
  }

  return (
    <ScrollView padding="$4" space>
      <XStack justifyContent="space-between" alignItems="center">
        <H1>Deprecation Logs</H1>
        <Button onPress={fetchLogs} disabled={loading}>Refresh</Button>
      </XStack>
      <Paragraph color="$color11">
        This portal monitors telemetry for the deprecated community platform (Next, Expo, and legacy database objects).
        If new logs appear here, it means legacy code is still executing.
      </Paragraph>

      <Separator marginVertical="$4" />

      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <YStack space="$6">
          <YStack space>
            <H2 size="$6">Recent Usage (Last 100)</H2>
            {logs.length === 0 ? (
              <Card padded bordered>
                <Paragraph>No obsolete usage logs found. Systems look clean!</Paragraph>
              </Card>
            ) : (
              <YStack space="$2">
                {logs.map(log => (
                  <Card key={log.id} padded bordered>
                    <XStack justifyContent="space-between">
                      <YStack>
                        <Paragraph fontWeight="bold">[{log.object_type.toUpperCase()}] {log.object_name}</Paragraph>
                        <Paragraph size="$2" color="$color11">{JSON.stringify(log.details)}</Paragraph>
                      </YStack>
                      <Paragraph size="$2">{new Date(log.referenced_at).toLocaleString()}</Paragraph>
                    </XStack>
                  </Card>
                ))}
              </YStack>
            )}
          </YStack>

          <YStack space>
            <H2 size="$6">Cron Cleanup History</H2>
            {cleanupLogs.length === 0 ? (
              <Card padded bordered>
                <Paragraph>No cleanup history yet. The 30-day cron has not purged any rows.</Paragraph>
              </Card>
            ) : (
              <YStack space="$2">
                {cleanupLogs.map(log => (
                  <Card key={log.id} padded bordered theme="alt1">
                    <XStack justifyContent="space-between">
                      <Paragraph>Deleted {log.rows_deleted} old rows</Paragraph>
                      <Paragraph size="$2">{new Date(log.cleared_at).toLocaleString()}</Paragraph>
                    </XStack>
                  </Card>
                ))}
              </YStack>
            )}
          </YStack>
        </YStack>
      )}
    </ScrollView>
  )
}
