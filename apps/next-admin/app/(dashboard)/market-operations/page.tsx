'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input, Switch } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Store, Clock, Save, Check } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'

type ScheduleRow = {
  day_of_week: number
  day_name: string
  open_time: string
  close_time: string
  is_enabled: boolean
}

export default function MarketOperationsPage() {
  // ── Market Settings State ──
  const [productsNeverExpire, setProductsNeverExpire] = useState(false)
  const [marketNeverCloses, setMarketNeverCloses] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSuccess, setSettingsSuccess] = useState('')

  // ── Schedule State ──
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [editedSchedule, setEditedSchedule] = useState<Record<number, Partial<ScheduleRow>>>({})
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [savingDay, setSavingDay] = useState<number | null>(null)
  const [scheduleSuccess, setScheduleSuccess] = useState('')

  // ── Load Settings ──
  useEffect(() => {
    loadSettings()
    loadSchedule()
  }, [])

  const loadSettings = async () => {
    setSettingsLoading(true)
    const { data } = await adminApi.select('market_settings', '*', undefined, { limit: 1, single: true })
    if (data) {
      setProductsNeverExpire(data.products_never_expire)
      setMarketNeverCloses(data.market_never_closes)
    }
    setSettingsLoading(false)
  }

  const loadSchedule = async () => {
    setScheduleLoading(true)
    const { data } = await adminApi.select('market_schedule_policies', '*', undefined, { order: { column: 'day_of_week', ascending: true } })
    if (data) {
      setSchedule(data as ScheduleRow[])
    }
    setScheduleLoading(false)
  }

  // ── Save Settings ──
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    const { error } = await adminApi.update(
      'market_settings',
      {
        products_never_expire: productsNeverExpire,
        market_never_closes: marketNeverCloses,
        updated_at: new Date().toISOString(),
      },
      { eq: { id: true } }
    )

    if (!error) {
      setSettingsSuccess('Market settings saved successfully')
      setTimeout(() => setSettingsSuccess(''), 3000)
    }
    setSavingSettings(false)
  }

  // ── Save Schedule Row ──
  const handleSaveDay = async (dayOfWeek: number) => {
    const edits = editedSchedule[dayOfWeek]
    if (!edits) return

    const original = schedule.find(s => s.day_of_week === dayOfWeek)
    if (!original) return

    setSavingDay(dayOfWeek)
    const { error } = await adminApi.update(
      'market_schedule_policies',
      {
        open_time: edits.open_time ?? original.open_time,
        close_time: edits.close_time ?? original.close_time,
        is_enabled: edits.is_enabled ?? original.is_enabled,
        updated_at: new Date().toISOString(),
      },
      { eq: { day_of_week: dayOfWeek } }
    )

    if (!error) {
      setScheduleSuccess(`Updated ${original.day_name}`)
      setTimeout(() => setScheduleSuccess(''), 3000)
      // Clear edits and reload
      setEditedSchedule(prev => {
        const next = { ...prev }
        delete next[dayOfWeek]
        return next
      })
      loadSchedule()
    }
    setSavingDay(null)
  }

  const updateDayField = (dayOfWeek: number, field: keyof ScheduleRow, value: any) => {
    setEditedSchedule(prev => ({
      ...prev,
      [dayOfWeek]: { ...(prev[dayOfWeek] || {}), [field]: value },
    }))
  }

  const isDayDirty = (dayOfWeek: number) => {
    const edits = editedSchedule[dayOfWeek]
    if (!edits) return false
    const original = schedule.find(s => s.day_of_week === dayOfWeek)
    if (!original) return false
    return (
      (edits.open_time !== undefined && edits.open_time !== original.open_time) ||
      (edits.close_time !== undefined && edits.close_time !== original.close_time) ||
      (edits.is_enabled !== undefined && edits.is_enabled !== original.is_enabled)
    )
  }

  const getEffectiveValue = (dayOfWeek: number, field: keyof ScheduleRow) => {
    const edits = editedSchedule[dayOfWeek]
    const original = schedule.find(s => s.day_of_week === dayOfWeek)
    if (edits && edits[field] !== undefined) return edits[field]
    return original ? original[field] : ''
  }

  return (
    <YStack flex={1} padding="$4" gap="$6">
      {/* ── MARKET SETTINGS SECTION ── */}
      <YStack gap="$4">
        <XStack alignItems="center" gap="$2">
          <Store size={24} color={colors.green[800]} />
          <YStack>
            <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Market Settings</Text>
            <Text fontSize="$3" color={colors.gray[600]}>Global market behavior toggles</Text>
          </YStack>
        </XStack>

        {settingsSuccess ? (
          <YStack backgroundColor={colors.green[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.green[200]}>
            <Text color={colors.green[800]} fontWeight="600">{settingsSuccess}</Text>
          </YStack>
        ) : null}

        <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$4" backgroundColor="white" borderRadius="$4" elevation="$1">
          {settingsLoading ? (
            <Text>Loading settings...</Text>
          ) : (
            <YStack gap="$5">
              {/* Products Never Expire Toggle */}
              <XStack justifyContent="space-between" alignItems="center">
                <YStack flex={1} paddingRight="$4">
                  <Text fontWeight="600" color={colors.gray[800]}>Products Never Expire</Text>
                  <Text fontSize="$2" color={colors.gray[500]}>
                    When enabled, seller listings remain active indefinitely instead of expiring based on post type policies.
                  </Text>
                </YStack>
                <Switch
                  id="products-never-expire"
                  size="$3"
                  checked={productsNeverExpire}
                  onCheckedChange={setProductsNeverExpire}
                  backgroundColor={productsNeverExpire ? colors.green[500] : colors.gray[300]}
                >
                  <Switch.Thumb backgroundColor="white" />
                </Switch>
              </XStack>

              {/* Market Never Closes Toggle */}
              <XStack justifyContent="space-between" alignItems="center">
                <YStack flex={1} paddingRight="$4">
                  <Text fontWeight="600" color={colors.gray[800]}>Market Never Closes</Text>
                  <Text fontSize="$2" color={colors.gray[500]}>
                    When enabled, the market is open 24/7 regardless of the schedule below. Useful during testing or special events.
                  </Text>
                </YStack>
                <Switch
                  id="market-never-closes"
                  size="$3"
                  checked={marketNeverCloses}
                  onCheckedChange={setMarketNeverCloses}
                  backgroundColor={marketNeverCloses ? colors.green[500] : colors.gray[300]}
                >
                  <Switch.Thumb backgroundColor="white" />
                </Switch>
              </XStack>

              <Button
                alignSelf="flex-start"
                backgroundColor={colors.green[600]}
                onPress={handleSaveSettings}
                disabled={savingSettings}
                icon={<Save size={16} color="white" />}
              >
                <Text color="white" fontWeight="600">{savingSettings ? 'Saving...' : 'Save Settings'}</Text>
              </Button>
            </YStack>
          )}
        </YStack>
      </YStack>

      <YStack height={1} backgroundColor={colors.gray[200]} marginVertical="$2" />

      {/* ── MARKET SCHEDULE SECTION ── */}
      <YStack gap="$4">
        <XStack alignItems="center" gap="$2">
          <Clock size={24} color={colors.blue[700]} />
          <YStack>
            <Text fontSize="$6" fontWeight="700" color={colors.gray[900]}>Market Schedule</Text>
            <Text fontSize="$3" color={colors.gray[600]}>Set open/close times for each day of the week</Text>
          </YStack>
        </XStack>

        {scheduleSuccess ? (
          <YStack backgroundColor={colors.green[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.green[200]}>
            <Text color={colors.green[800]} fontWeight="600">{scheduleSuccess}</Text>
          </YStack>
        ) : null}

        {scheduleLoading ? (
          <Text>Loading schedule...</Text>
        ) : (
          <YStack borderWidth={1} borderColor={colors.gray[200]} borderRadius="$4" backgroundColor="white" overflow="hidden">
            {/* Header */}
            <XStack backgroundColor={colors.gray[50]} paddingHorizontal="$4" paddingVertical="$3" borderBottomWidth={1} borderColor={colors.gray[200]}>
              <Text flex={1} fontWeight="700" fontSize="$2" color={colors.gray[500]} textTransform="uppercase">Day</Text>
              <Text width={120} fontWeight="700" fontSize="$2" color={colors.gray[500]} textTransform="uppercase" textAlign="center">Open</Text>
              <Text width={120} fontWeight="700" fontSize="$2" color={colors.gray[500]} textTransform="uppercase" textAlign="center">Close</Text>
              <Text width={80} fontWeight="700" fontSize="$2" color={colors.gray[500]} textTransform="uppercase" textAlign="center">Enabled</Text>
              <Text width={100} fontWeight="700" fontSize="$2" color={colors.gray[500]} textTransform="uppercase" textAlign="center">Action</Text>
            </XStack>

            {schedule.map((day, idx) => {
              const isEnabled = getEffectiveValue(day.day_of_week, 'is_enabled') as boolean
              return (
                <XStack
                  key={day.day_of_week}
                  paddingHorizontal="$4"
                  paddingVertical="$3"
                  alignItems="center"
                  borderBottomWidth={idx < schedule.length - 1 ? 1 : 0}
                  borderColor={colors.gray[100]}
                  backgroundColor={isEnabled ? 'white' : colors.gray[50]}
                  hoverStyle={{ backgroundColor: colors.gray[50] }}
                >
                  <YStack flex={1}>
                    <Text fontWeight="600" fontSize="$4" color={isEnabled ? colors.gray[900] : colors.gray[400]}>
                      {day.day_name}
                    </Text>
                  </YStack>

                  <XStack width={120} justifyContent="center">
                    <input
                      type="time"
                      value={(getEffectiveValue(day.day_of_week, 'open_time') as string) || ''}
                      onChange={(e) => updateDayField(day.day_of_week, 'open_time', e.target.value)}
                      disabled={!isEnabled}
                      style={{
                        padding: '6px 8px',
                        border: `1px solid ${colors.gray[300]}`,
                        borderRadius: 8,
                        fontSize: 14,
                        width: 100,
                        textAlign: 'center',
                        backgroundColor: isEnabled ? 'white' : colors.gray[100],
                        color: isEnabled ? '#1a1a1a' : '#9ca3af',
                      }}
                    />
                  </XStack>

                  <XStack width={120} justifyContent="center">
                    <input
                      type="time"
                      value={(getEffectiveValue(day.day_of_week, 'close_time') as string) || ''}
                      onChange={(e) => updateDayField(day.day_of_week, 'close_time', e.target.value)}
                      disabled={!isEnabled}
                      style={{
                        padding: '6px 8px',
                        border: `1px solid ${colors.gray[300]}`,
                        borderRadius: 8,
                        fontSize: 14,
                        width: 100,
                        textAlign: 'center',
                        backgroundColor: isEnabled ? 'white' : colors.gray[100],
                        color: isEnabled ? '#1a1a1a' : '#9ca3af',
                      }}
                    />
                  </XStack>

                  <XStack width={80} justifyContent="center">
                    <Switch
                      size="$2"
                      checked={isEnabled}
                      onCheckedChange={(checked) => updateDayField(day.day_of_week, 'is_enabled', !!checked)}
                      backgroundColor={isEnabled ? colors.green[500] : colors.gray[300]}
                    >
                      <Switch.Thumb backgroundColor="white" />
                    </Switch>
                  </XStack>

                  <XStack width={100} justifyContent="center">
                    {isDayDirty(day.day_of_week) ? (
                      <Button
                        size="$3"
                        backgroundColor={colors.green[600]}
                        icon={<Save size={14} color="white" />}
                        onPress={() => handleSaveDay(day.day_of_week)}
                        disabled={savingDay === day.day_of_week}
                      >
                        <Text color="white" fontWeight="600" fontSize="$2">
                          {savingDay === day.day_of_week ? 'Saving...' : 'Save'}
                        </Text>
                      </Button>
                    ) : (
                      <Text fontSize="$2" color={colors.gray[300]}>—</Text>
                    )}
                  </XStack>
                </XStack>
              )
            })}
          </YStack>
        )}

        {/* Info Box */}
        <YStack backgroundColor="#f0fdf4" padding="$4" borderRadius="$4" borderWidth={1} borderColor={colors.green[200]}>
          <Text fontWeight="bold" color={colors.green[800]}>How Market Hours Work</Text>
          <Text fontSize={13} color={colors.green[700]} marginTop="$2">
            <Text fontWeight="bold">Enabled days</Text> = The market is open during the specified hours on these days.
          </Text>
          <Text fontSize={13} color={colors.green[700]} marginTop="$1">
            <Text fontWeight="bold">Disabled days</Text> = The market is closed on these days (regardless of the hours shown).
          </Text>
          <Text fontSize={13} color={colors.green[700]} marginTop="$1">
            <Text fontWeight="bold">"Market Never Closes"</Text> = Overrides the schedule above — the market stays open 24/7.
          </Text>
        </YStack>
      </YStack>
    </YStack>
  )
}
