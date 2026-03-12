import React from 'react'
import { YStack, XStack, Text, Button, ScrollView, Spinner } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { ChevronLeft, ChevronRight } from '@tamagui/lucide-icons'

export interface ColumnDef<T> {
  header: string
  accessorKey: keyof T | string
  cell?: (item: T) => React.ReactNode
  width?: number | string
  minWidth?: number | string
  flex?: number
}

interface AdminDataGridProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  isLoading?: boolean
  onRowClick?: (item: T) => void
  onNextPage?: () => void
  onPrevPage?: () => void
  hasMore?: boolean
  hasPrev?: boolean
  page?: number
  emptyMessage?: string
}

export function AdminDataGrid<T>({
  data,
  columns,
  isLoading = false,
  onRowClick,
  onNextPage,
  onPrevPage,
  hasMore = false,
  hasPrev = false,
  page = 1,
  emptyMessage = 'No records found.'
}: AdminDataGridProps<T>) {

  const renderCell = (item: T, col: ColumnDef<T>) => {
    if (col.cell) {
      return col.cell(item)
    }
    const val = item[col.accessorKey as keyof T]
    return <Text color={colors.gray[700]} numberOfLines={1}>{String(val ?? '')}</Text>
  }

  return (
    <YStack 
      backgroundColor="white" 
      borderRadius="$4" 
      borderWidth={1} 
      borderColor={colors.gray[200]} 
      overflow="hidden"
      elevation="$1"
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <YStack minWidth={800} flex={1}>
          
          {/* HEADER */}
          <XStack 
            backgroundColor={colors.gray[50]} 
            borderBottomWidth={1} 
            borderColor={colors.gray[200]}
            paddingVertical="$3"
            paddingHorizontal="$4"
          >
            {columns.map((col, idx) => (
              <XStack 
                key={String(col.accessorKey) + idx} 
                flex={col.flex ?? (col.width ? undefined : 1)} 
                width={col.width as any}
                minWidth={col.minWidth as any}
                paddingRight="$2"
              >
                <Text color={colors.gray[600]} fontSize="$3" fontWeight="600" textTransform="uppercase" letterSpacing={0.5}>
                  {col.header}
                </Text>
              </XStack>
            ))}
          </XStack>

          {/* LOADING STATE */}
          {isLoading && data.length === 0 && (
            <YStack padding="$6" alignItems="center" justifyContent="center">
              <Spinner size="large" color={colors.green[600]} />
            </YStack>
          )}

          {/* EMPTY STATE */}
          {!isLoading && data.length === 0 && (
            <YStack padding="$6" alignItems="center" justifyContent="center">
              <Text color={colors.gray[500]} fontSize="$4">{emptyMessage}</Text>
            </YStack>
          )}

          {/* ROWS */}
          {data.map((item, rowIndex) => (
            <XStack
              key={rowIndex}
              borderBottomWidth={rowIndex === data.length - 1 ? 0 : 1}
              borderColor={colors.gray[100]}
              paddingVertical="$3"
              paddingHorizontal="$4"
              cursor={onRowClick ? 'pointer' : 'default'}
              hoverStyle={onRowClick ? { backgroundColor: colors.gray[50] } : undefined}
              onPress={() => onRowClick && onRowClick(item)}
              alignItems="center"
            >
              {columns.map((col, colIndex) => (
                <XStack 
                  key={String(col.accessorKey) + colIndex} 
                  flex={col.flex ?? (col.width ? undefined : 1)} 
                  width={col.width as any}
                  minWidth={col.minWidth as any}
                  paddingRight="$2"
                >
                  {renderCell(item, col)}
                </XStack>
              ))}
            </XStack>
          ))}
        </YStack>
      </ScrollView>

      {/* FOOTER / PAGINATION */}
      {(onNextPage || onPrevPage) && (
        <XStack 
          borderTopWidth={1} 
          borderColor={colors.gray[200]} 
          padding="$3" 
          justifyContent="space-between" 
          alignItems="center"
          backgroundColor={colors.white}
        >
          <Text color={colors.gray[500]} fontSize="$3">
            Page {page}
          </Text>
          <XStack gap="$2">
            <Button 
              size="$3" 
              icon={ChevronLeft} 
              disabled={!hasPrev || isLoading}
              onPress={onPrevPage}
              chromeless
            >
              Previous
            </Button>
            <Button 
              size="$3" 
              iconAfter={ChevronRight} 
              disabled={!hasMore || isLoading}
              onPress={onNextPage}
              chromeless
            >
              Next
            </Button>
          </XStack>
        </XStack>
      )}
    </YStack>
  )
}
