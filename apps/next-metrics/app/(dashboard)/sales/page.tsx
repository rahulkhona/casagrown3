'use client'

import { useEffect, useState } from 'react'
import { useFilters } from '../layout'
import { fetchSalesSummary, type SalesSummaryData } from '../../../lib/metrics-service'
import { BarChart, LineChart, DonutChart, formatNumber, formatCurrency } from '../../../lib/charts'

export default function SalesPage() {
  const { dateRange, granularity, geoFilter } = useFilters()
  const [data, setData] = useState<SalesSummaryData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSalesSummary(dateRange, granularity, geoFilter).then(d => {
      if (!cancelled) { setData(d); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [dateRange, granularity, geoFilter])

  if (loading || !data) {
    return <div className="loading-container"><div className="spinner" /><span>Loading sales data...</span></div>
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Sales & Revenue</h1>
        <p className="page-subtitle">Gross merchandise value, orders, and seller performance</p>
      </div>

      <div className="kpi-grid stagger">
        <div className="kpi-card green">
          <span className="kpi-label">Total GMV</span>
          <span className="kpi-value">{formatCurrency(data.totalGMV)}</span>
        </div>
        <div className="kpi-card blue">
          <span className="kpi-label">Total Orders</span>
          <span className="kpi-value">{formatNumber(data.totalOrders)}</span>
        </div>
        <div className="kpi-card orange">
          <span className="kpi-label">Avg Order Value</span>
          <span className="kpi-value">{formatCurrency(data.avgOrderValue)}</span>
        </div>
        <div className="kpi-card purple">
          <span className="kpi-label">Tax Collected</span>
          <span className="kpi-value">{formatCurrency(data.totalTax)}</span>
        </div>
        <div className="kpi-card blue">
          <span className="kpi-label">Platform Fees</span>
          <span className="kpi-value">{formatCurrency(data.totalFees)}</span>
        </div>
      </div>

      <div className="chart-grid-2">
        <div className="card">
          <div className="chart-title">Sales Growth (GMV)</div>
          <BarChart data={data.gmvTimeSeries} color="var(--chart-2)" height={220} formatValue={formatCurrency} />
        </div>
        <div className="card">
          <div className="chart-title">Order Volume</div>
          <LineChart data={data.orderCountTimeSeries} color="var(--chart-1)" height={220} />
        </div>
      </div>

      <div className="chart-grid-2">
        <div className="card">
          <div className="chart-title">Fulfillment Split</div>
          <DonutChart
            data={data.fulfillmentSplit.map((f, i) => ({
              label: f.type,
              value: f.count,
              color: i === 0 ? 'var(--chart-1)' : 'var(--chart-2)',
            }))}
            size={140}
          />
        </div>
        <div className="card">
          <div className="chart-title">Top Products</div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Revenue</th>
                  <th>Orders</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((p, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</td>
                    <td>{formatCurrency(p.revenue)}</td>
                    <td>{formatNumber(p.orders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="chart-title">Top Sellers</div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Seller</th>
                <th>Revenue</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {data.topSellers.map((s, i) => (
                <tr key={i}>
                  <td><span className="badge badge-blue">{i + 1}</span></td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{s.name}</td>
                  <td>{formatCurrency(s.revenue)}</td>
                  <td>{formatNumber(s.orders)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
