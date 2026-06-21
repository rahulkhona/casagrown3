'use client'

/**
 * Pure SVG chart components — no external dependencies.
 * Bar charts, line charts, sparklines, and stacked bar charts.
 */

import React from 'react'

// ─── Shared Utilities ───────────────────────────────────────────────────────

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Bar Chart ──────────────────────────────────────────────────────────────

interface BarChartProps {
  data: { date: string; value: number }[]
  color?: string
  height?: number
  showLabels?: boolean
  formatValue?: (n: number) => string
}

export function BarChart({
  data,
  color = 'var(--chart-1)',
  height = 200,
  showLabels = true,
  formatValue = formatNumber,
}: BarChartProps) {
  if (!data.length) return <div className="empty-state"><span>No data</span></div>

  const max = Math.max(...data.map(d => d.value), 1)
  const barWidth = Math.max(4, Math.min(24, (800 / data.length) - 4))
  const width = data.length * (barWidth + 4) + 60
  const chartH = height - 30

  return (
    <div className="chart-wrapper" style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ minWidth: 300, width: '100%', height }}>
        {/* Y-axis labels */}
        <text x="0" y="12" fill="var(--text-muted)" fontSize="10">{formatValue(max)}</text>
        <text x="0" y={chartH / 2 + 4} fill="var(--text-muted)" fontSize="10">{formatValue(Math.round(max / 2))}</text>
        <text x="0" y={chartH} fill="var(--text-muted)" fontSize="10">0</text>

        {/* Grid lines */}
        <line x1="50" y1="6" x2={width} y2="6" stroke="var(--border-subtle)" strokeDasharray="4" />
        <line x1="50" y1={chartH / 2} x2={width} y2={chartH / 2} stroke="var(--border-subtle)" strokeDasharray="4" />
        <line x1="50" y1={chartH - 2} x2={width} y2={chartH - 2} stroke="var(--border-subtle)" />

        {/* Bars */}
        {data.map((d, i) => {
          const barH = (d.value / max) * (chartH - 10)
          const x = 55 + i * (barWidth + 4)
          const y = chartH - barH
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                fill={color}
                rx={2}
                opacity={0.85}
              >
                <title>{`${shortDate(d.date)}: ${formatValue(d.value)}`}</title>
              </rect>
              {showLabels && i % Math.ceil(data.length / 8) === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={height - 2}
                  fill="var(--text-muted)"
                  fontSize="9"
                  textAnchor="middle"
                >
                  {shortDate(d.date)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Line Chart ─────────────────────────────────────────────────────────────

interface LineChartProps {
  data: { date: string; value: number }[]
  color?: string
  height?: number
  fillGradient?: boolean
  formatValue?: (n: number) => string
}

export function LineChart({
  data,
  color = 'var(--chart-2)',
  height = 200,
  fillGradient = true,
  formatValue = formatNumber,
}: LineChartProps) {
  if (!data.length) return <div className="empty-state"><span>No data</span></div>

  const max = Math.max(...data.map(d => d.value), 1)
  const min = Math.min(...data.map(d => d.value))
  const range = max - min || 1
  const chartH = height - 30
  const width = 800
  const gradientId = `lg-${Math.random().toString(36).slice(2, 8)}`

  const points = data.map((d, i) => ({
    x: 55 + (i / (data.length - 1)) * (width - 70),
    y: 10 + ((max - d.value) / range) * (chartH - 20),
    ...d,
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = pathD + ` L ${points[points.length - 1]!.x} ${chartH} L ${points[0]!.x} ${chartH} Z`

  return (
    <div className="chart-wrapper" style={{ overflowX: 'auto' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ minWidth: 300 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-axis labels */}
        <text x="0" y="16" fill="var(--text-muted)" fontSize="10">{formatValue(max)}</text>
        <text x="0" y={chartH} fill="var(--text-muted)" fontSize="10">{formatValue(min)}</text>

        {/* Grid */}
        <line x1="50" y1="10" x2={width} y2="10" stroke="var(--border-subtle)" strokeDasharray="4" />
        <line x1="50" y1={chartH / 2} x2={width} y2={chartH / 2} stroke="var(--border-subtle)" strokeDasharray="4" />
        <line x1="50" y1={chartH - 2} x2={width} y2={chartH - 2} stroke="var(--border-subtle)" />

        {/* Area fill */}
        {fillGradient && <path d={areaD} fill={`url(#${gradientId})`} />}

        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" />

        {/* Dots at endpoints */}
        {points.filter((_, i) => i === 0 || i === points.length - 1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
        ))}

        {/* X-axis labels */}
        {points.filter((_, i) => i % Math.ceil(data.length / 6) === 0).map((p, i) => (
          <text key={i} x={p.x} y={height - 2} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
            {shortDate(p.date)}
          </text>
        ))}
      </svg>
    </div>
  )
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
}

export function Sparkline({ data, color = 'var(--chart-1)', width = 100, height = 32 }: SparklineProps) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: 2 + ((max - v) / range) * (height - 4),
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const gradientId = `sp-${Math.random().toString(36).slice(2, 8)}`
  const areaD = pathD + ` L ${width} ${height} L 0 ${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

// ─── Stacked Bar Chart ──────────────────────────────────────────────────────

interface StackedBarChartProps {
  data: { date: string; values: Record<string, number> }[]
  colors: Record<string, string>
  height?: number
  legend?: boolean
}

export function StackedBarChart({
  data,
  colors,
  height = 200,
  legend = true,
}: StackedBarChartProps) {
  if (!data.length) return <div className="empty-state"><span>No data</span></div>

  const keys = Object.keys(colors)
  const maxTotal = Math.max(...data.map(d => keys.reduce((s, k) => s + (d.values[k] || 0), 0)), 1)
  const barWidth = Math.max(6, Math.min(20, (700 / data.length) - 4))
  const width = data.length * (barWidth + 4) + 80
  const chartH = height - 40

  return (
    <div className="chart-wrapper">
      {legend && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          {keys.map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: colors[k] }} />
              {k}
            </div>
          ))}
        </div>
      )}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 300 }}>
        <text x="0" y="12" fill="var(--text-muted)" fontSize="10">{formatNumber(maxTotal)}</text>
        <line x1="50" y1="6" x2={width} y2="6" stroke="var(--border-subtle)" strokeDasharray="4" />
        <line x1="50" y1={chartH - 2} x2={width} y2={chartH - 2} stroke="var(--border-subtle)" />

        {data.map((d, i) => {
          let y = chartH
          return (
            <g key={i}>
              {keys.map(k => {
                const val = d.values[k] || 0
                const h = (val / maxTotal) * (chartH - 10)
                y -= h
                return (
                  <rect
                    key={k}
                    x={55 + i * (barWidth + 4)}
                    y={y}
                    width={barWidth}
                    height={h}
                    fill={colors[k]}
                    rx={1}
                    opacity={0.85}
                  >
                    <title>{`${shortDate(d.date)} — ${k}: ${val}`}</title>
                  </rect>
                )
              })}
              {i % Math.ceil(data.length / 8) === 0 && (
                <text x={55 + i * (barWidth + 4) + barWidth / 2} y={height - 4} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
                  {shortDate(d.date)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Horizontal Bar Chart (for lists) ───────────────────────────────────────

interface HBarChartProps {
  data: { label: string; value: number }[]
  color?: string
  formatValue?: (n: number) => string
}

export function HBarChart({ data, color = 'var(--chart-1)', formatValue = formatNumber }: HBarChartProps) {
  if (!data.length) return <div className="empty-state"><span>No data</span></div>
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 120, fontSize: '0.8125rem', color: 'var(--text-secondary)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {d.label}
          </span>
          <div style={{ flex: 1, height: 20, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                height: '100%',
                background: color,
                borderRadius: 4,
                transition: 'width 0.5s ease',
                opacity: 0.8,
              }}
            />
          </div>
          <span style={{ width: 60, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>
            {formatValue(d.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Donut / Pie ────────────────────────────────────────────────────────────

interface DonutChartProps {
  data: { label: string; value: number; color: string }[]
  size?: number
}

export function DonutChart({ data, size = 120 }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const r = size / 2 - 8
  const cx = size / 2, cy = size / 2
  let cumulativeAngle = -90

  const segments = data.map(d => {
    const angle = (d.value / total) * 360
    const startAngle = (cumulativeAngle * Math.PI) / 180
    cumulativeAngle += angle
    const endAngle = (cumulativeAngle * Math.PI) / 180
    const largeArc = angle > 180 ? 1 : 0
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    return { ...d, path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z` }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} opacity={0.85}>
            <title>{`${s.label}: ${formatNumber(s.value)} (${Math.round((s.value / total) * 100)}%)`}</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r={r * 0.5} fill="var(--bg-card)" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, marginLeft: 'auto' }}>{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export { formatNumber, formatCurrency }
