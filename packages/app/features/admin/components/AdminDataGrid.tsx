'use client'

import React from 'react'
import { colors } from '@casagrown/app/design-tokens'

export interface ColumnDef<T> {
  header: string
  accessorKey: keyof T | string
  cell?: (item: T) => React.ReactNode
  width?: number | string
  minWidth?: number | string
  flex?: number
  sticky?: 'left' | 'right'  // pin this column to the edge — always visible
}

interface AdminDataGridProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  loading?: boolean
  isLoading?: boolean
  onRowClick?: (item: T) => void
  // Accept both naming conventions used across the codebase
  onNext?: () => void
  onPrev?: () => void
  onNextPage?: () => void
  onPrevPage?: () => void
  hasMore?: boolean
  hasNext?: boolean
  hasPrev?: boolean
  page?: number
  emptyMessage?: string
}

export function AdminDataGrid<T>({
  data,
  columns,
  loading,
  isLoading,
  onRowClick,
  onNext,
  onPrev,
  onNextPage,
  onPrevPage,
  hasMore,
  hasNext,
  hasPrev = false,
  page = 1,
  emptyMessage = 'No records found.',
}: AdminDataGridProps<T>) {
  const busy = isLoading || loading || false
  const canGoNext = hasMore || hasNext || false
  const goNext = onNext || onNextPage
  const goPrev = onPrev || onPrevPage
  const showPagination = !!(goNext || goPrev)

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {columns.map((col, i) => {
                const stickyStyle: React.CSSProperties = col.sticky === 'right'
                  ? { position: 'sticky', right: 0, zIndex: 2, background: '#f9fafb', boxShadow: '-2px 0 4px rgba(0,0,0,0.06)' }
                  : col.sticky === 'left'
                  ? { position: 'sticky', left: 0, zIndex: 2, background: '#f9fafb', boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }
                  : {}
                return (
                  <th
                    key={i}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                      width: col.width,
                      minWidth: col.minWidth as any,
                      ...stickyStyle,
                    }}
                  >
                    {col.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {busy && (!data || data.length === 0) && (
              <tr>
                <td colSpan={columns.length} style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
                  Loading…
                </td>
              </tr>
            )}
            {!busy && (!data || data.length === 0) && (
              <tr>
                <td colSpan={columns.length} style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
                  {emptyMessage}
                </td>
              </tr>
            )}
            {data && data.map((item, rowIdx) => (
              <tr
                key={rowIdx}
                onClick={() => onRowClick?.(item)}
                style={{
                  borderBottom: rowIdx < data.length - 1 ? '1px solid #f3f4f6' : 'none',
                  cursor: onRowClick ? 'pointer' : 'default',
                  background: '#fff',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff' }}
              >
                {columns.map((col, colIdx) => {
                  const val = (item as any)[col.accessorKey as string]
                  const stickyStyle: React.CSSProperties = col.sticky === 'right'
                    ? { position: 'sticky', right: 0, background: '#fff', boxShadow: '-2px 0 4px rgba(0,0,0,0.06)', zIndex: 1 }
                    : col.sticky === 'left'
                    ? { position: 'sticky', left: 0, background: '#fff', boxShadow: '2px 0 4px rgba(0,0,0,0.06)', zIndex: 1 }
                    : {}
                  return (
                    <td
                      key={colIdx}
                      style={{ padding: '10px 14px', verticalAlign: 'middle', color: '#374151', overflow: 'hidden', ...stickyStyle }}
                    >
                      {col.cell ? col.cell(item) : (
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(val ?? '')}>
                          {String(val ?? '')}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>Page {page}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => goPrev?.()}
              disabled={!hasPrev || busy}
              style={{ padding: '5px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db', background: !hasPrev ? '#f9fafb' : '#fff', color: !hasPrev ? '#9ca3af' : '#374151', cursor: !hasPrev ? 'default' : 'pointer' }}
            >
              ← Prev
            </button>
            <button
              onClick={() => goNext?.()}
              disabled={!canGoNext || busy}
              style={{ padding: '5px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db', background: !canGoNext ? '#f9fafb' : '#fff', color: !canGoNext ? '#9ca3af' : '#374151', cursor: !canGoNext ? 'default' : 'pointer' }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
