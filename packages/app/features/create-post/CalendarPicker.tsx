/**
 * CalendarPicker — A pure-JS calendar modal for picking dates.
 * Works on both web and native without any native module dependencies.
 */

import { useState, useMemo } from 'react'
import { Modal, Pressable } from 'react-native'
import {
  YStack,
  XStack,
  Text,
  Button,
} from 'tamagui'
import { ChevronLeft, ChevronRight } from '@tamagui/lucide-icons'
import { colors, borderRadius } from '../../design-tokens'

interface CalendarPickerProps {
  visible: boolean
  /** Initial date in YYYY-MM-DD format */
  initialDate?: string
  /** Minimum selectable date */
  minimumDate?: Date
  onSelect: (dateStr: string) => void
  onCancel: () => void
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function pad(n: number) {
  return n < 10 ? '0' + n : '' + n
}

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

export function CalendarPicker({
  visible,
  initialDate,
  minimumDate,
  onSelect,
  onCancel,
}: CalendarPickerProps) {
  const today = new Date()

  // Parse initial date
  const initYear = initialDate
    ? parseInt(initialDate.split('-')[0]!, 10)
    : today.getFullYear()
  const initMonth = initialDate
    ? parseInt(initialDate.split('-')[1]!, 10) - 1
    : today.getMonth()

  const [viewYear, setViewYear] = useState(initYear)
  const [viewMonth, setViewMonth] = useState(initMonth)

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    const grid: (number | null)[] = []

    // Blank cells before first day
    for (let i = 0; i < firstDay; i++) grid.push(null)

    // Actual days
    for (let d = 1; d <= daysInMonth; d++) grid.push(d)

    return grid
  }, [viewYear, viewMonth])

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  function isDisabled(day: number) {
    if (!minimumDate) return false
    const date = new Date(viewYear, viewMonth, day)
    const minCopy = new Date(minimumDate)
    minCopy.setHours(0, 0, 0, 0)
    return date < minCopy
  }

  function isToday(day: number) {
    return (
      viewYear === today.getFullYear() &&
      viewMonth === today.getMonth() &&
      day === today.getDate()
    )
  }

  const selectedDateStr = initialDate || ''

  function isSelected(day: number) {
    return toDateStr(viewYear, viewMonth, day) === selectedDateStr
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
        onPress={onCancel}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius.lg}
            padding="$4"
            width={320}
            gap="$3"
            shadowColor="rgba(0,0,0,0.15)"
            shadowOffset={{ width: 0, height: 4 }}
            shadowOpacity={1}
            shadowRadius={12}
            elevation={8}
          >
            {/* Header: Month Year + nav */}
            <XStack justifyContent="space-between" alignItems="center">
              <Pressable onPress={prevMonth} hitSlop={10}>
                <ChevronLeft size={22} color={colors.neutral[600]} />
              </Pressable>
              <Text fontWeight="700" fontSize="$4" color={colors.neutral[900]}>
                {MONTHS[viewMonth]} {viewYear}
              </Text>
              <Pressable onPress={nextMonth} hitSlop={10}>
                <ChevronRight size={22} color={colors.neutral[600]} />
              </Pressable>
            </XStack>

            {/* Day headers */}
            <XStack justifyContent="space-around">
              {DAYS.map((d) => (
                <Text
                  key={d}
                  width={36}
                  textAlign="center"
                  fontSize="$2"
                  fontWeight="600"
                  color={colors.neutral[400]}
                >
                  {d}
                </Text>
              ))}
            </XStack>

            {/* Day cells */}
            <XStack flexWrap="wrap" justifyContent="flex-start">
              {calendarDays.map((day, i) => (
                <YStack
                  key={i}
                  width="14.28%"
                  height={36}
                  alignItems="center"
                  justifyContent="center"
                >
                  {day !== null ? (
                    <Pressable
                      disabled={isDisabled(day)}
                      onPress={() => onSelect(toDateStr(viewYear, viewMonth, day))}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected(day)
                          ? colors.primary[600]
                          : isToday(day)
                          ? colors.primary[50]
                          : 'transparent',
                      }}
                    >
                      <Text
                        fontSize="$3"
                        fontWeight={isSelected(day) || isToday(day) ? '700' : '400'}
                        color={
                          isDisabled(day)
                            ? colors.neutral[300]
                            : isSelected(day)
                            ? 'white'
                            : colors.neutral[800]
                        }
                      >
                        {day}
                      </Text>
                    </Pressable>
                  ) : null}
                </YStack>
              ))}
            </XStack>

            {/* Actions */}
            <XStack justifyContent="flex-end" gap="$3" paddingTop="$2">
              <Button
                size="$3"
                backgroundColor="transparent"
                onPress={onCancel}
                pressStyle={{ backgroundColor: colors.neutral[100] }}
              >
                <Text fontSize="$3" color={colors.neutral[600]} fontWeight="500">Cancel</Text>
              </Button>
              <Button
                size="$3"
                backgroundColor="transparent"
                borderWidth={1}
                borderColor={colors.primary[300]}
                borderRadius={borderRadius.md}
                onPress={() => {
                  // Jump to today's month and select today
                  setViewYear(today.getFullYear())
                  setViewMonth(today.getMonth())
                  onSelect(toDateStr(today.getFullYear(), today.getMonth(), today.getDate()))
                }}
                pressStyle={{ backgroundColor: colors.primary[50] }}
              >
                <Text fontSize="$3" color={colors.primary[600]} fontWeight="600">Today</Text>
              </Button>
            </XStack>
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
