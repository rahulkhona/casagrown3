'use client'

import React, { useEffect, useState } from 'react'
import { fetchActiveListingsData, type ActiveListingsData, type ActiveListingRow } from '../../../lib/portal-service'
import { useFilters } from '../layout'
import { formatNumber } from '../../../lib/charts'
import SocialShareModal from '../../components/SocialShareModal'

export function ActiveListingsAnalysisView() {
  const { geoFilter } = useFilters()
  const [data, setData] = useState<ActiveListingsData | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters & Sorting
  const [searchItem, setSearchItem] = useState('')
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'ALL' | 'PICKUP' | 'DELIVERY'>('ALL')
  const [selectedZip, setSelectedZip] = useState('')
  const [sortField, setSortField] = useState<'zipcode' | 'produceName' | 'priceUsd' | 'availableQty'>('zipcode')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Multi-select state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // Modal Payload
  const [activeModalPayload, setActiveModalPayload] = useState<{
    title: string
    subtitle: string
    entityName: string
    shareUrl: string
    shareMessage: string
    shareContext: string
  } | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchActiveListingsData(geoFilter).then(res => {
      if (active) {
        setData(res)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [geoFilter])

  if (loading || !data) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading active produce listings & Facebook ad promo generator...</span>
      </div>
    )
  }

  // Filter rows
  const filteredRows = data.rows.filter(row => {
    const q = searchItem.toLowerCase().trim()
    const matchesSearch = !q ||
      row.produceName.toLowerCase().includes(q) ||
      row.sellerName.toLowerCase().includes(q) ||
      row.boothName.toLowerCase().includes(q) ||
      row.zipcode.includes(q) ||
      row.cityState.toLowerCase().includes(q)

    const matchesFulfillment =
      fulfillmentFilter === 'ALL' ||
      (fulfillmentFilter === 'PICKUP' && row.fulfillmentOptions.includes('pickup')) ||
      (fulfillmentFilter === 'DELIVERY' && row.fulfillmentOptions.includes('delivery'))

    const matchesZip = !selectedZip || row.zipcode === selectedZip

    return matchesSearch && matchesFulfillment && matchesZip
  })

  // Sort rows
  const sortedRows = [...filteredRows].sort((a, b) => {
    let aVal: any = a[sortField]
    let bVal: any = b[sortField]

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase()
      bVal = (bVal as string).toLowerCase()
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const handleSort = (field: 'zipcode' | 'produceName' | 'priceUsd' | 'availableQty') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const getBaseOrigin = () => {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      const origin = window.location.origin
      if (!origin.includes('metrics')) return origin
    }
    return 'https://casagrown.com'
  }

  const formatFulfillmentText = (options: string[]) => {
    const parts: string[] = []
    if (options.includes('pickup')) parts.push('📍 Porch Pickup')
    if (options.includes('delivery')) parts.push('🚗 Local Delivery')
    return parts.join(' & ') || '📍 Local Pickup'
  }

  const handleCopyParams = (row: ActiveListingRow, index: number) => {
    const textToCopy = `[Listing Target]\nProduce: ${row.produceName}\nPrice: $${row.priceUsd.toFixed(2)} / ${row.unit}\nInventory: ${row.availableQty} ${row.unit}s\nSeller: ${row.sellerName} (${row.boothName})\nZipcode: ${row.zipcode} (${row.cityState})\nFulfillment: ${formatFulfillmentText(row.fulfillmentOptions)} (${row.fulfillmentWindows})`
    navigator.clipboard.writeText(textToCopy)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  // Single Active Listing Social Post Helper
  const openSingleSocialModal = (row: ActiveListingRow) => {
    const baseOrigin = getBaseOrigin()
    const landingUrl = `${baseOrigin}${row.productPath}`
    const fulfillmentStr = formatFulfillmentText(row.fulfillmentOptions)

    const headline = `🥑 Fresh Homegrown ${row.produceName} Available in Zipcode ${row.zipcode}!`
    const priceText = row.priceUsd === 0 ? '🎁 Free Share' : `$${row.priceUsd.toFixed(2)} / ${row.unit}`
    const bodyText = `Harvested fresh from ${row.sellerName} (${row.boothName}) in ${row.cityState}!\n\n💰 Price: ${priceText}\n📦 Available Quantity: ${row.availableQty} ${row.unit}${row.availableQty > 1 ? 's' : ''} left\n🚚 Fulfillment: ${fulfillmentStr}\n⏰ Availability: ${row.fulfillmentWindows}\n\nOrder online for local pickup or neighborhood delivery:\n👉 Buy & Order Fresh Produce Here: ${landingUrl}\n📍 Serving Zipcode ${row.zipcode}`

    setActiveModalPayload({
      title: `🛍️ Share ${row.produceName} Listing ($${row.priceUsd.toFixed(2)} / ${row.unit})`,
      subtitle: `${row.sellerName} • Zip ${row.zipcode} (${row.availableQty} ${row.unit}s available)`,
      entityName: row.produceName,
      shareUrl: landingUrl,
      shareMessage: `${headline}\n\n${bodyText}`,
      shareContext: 'metrics_listing_promotion',
    })
  }

  // Multi-Select Batch Active Listings Social Post Helper
  const openBatchSocialModal = () => {
    const selectedRows = sortedRows.filter(r => selectedKeys.has(r.id))
    if (selectedRows.length === 0) return

    const baseOrigin = getBaseOrigin()
    const zipcodes = Array.from(new Set(selectedRows.map(r => r.zipcode)))
    const primaryZip = zipcodes[0] || '95125'
    const cityState = selectedRows[0]?.cityState || 'San Jose, CA'
    const primaryBooth = selectedRows[0]?.boothName || 'Local Garden Stand'

    const itemNames = Array.from(new Set(selectedRows.map(r => r.produceName.trim()))).filter(Boolean)
    const itemsFormatted = itemNames.length > 1
      ? `${itemNames.slice(0, -1).join(', ')} and ${itemNames[itemNames.length - 1]}`
      : itemNames[0] || 'Fresh Produce'

    // Smart destination link resolution:
    // If all items are from 1 seller booth -> link to seller's booth (/market?zipcode=...&booth=...)
    // If items are from multiple sellers -> link to zipcode marketplace (/market?zipcode=...)
    const booths = Array.from(new Set(selectedRows.map(r => r.boothName)))
    const landingUrl = booths.length === 1 && primaryBooth
      ? `${baseOrigin}/market?zipcode=${encodeURIComponent(primaryZip)}&booth=${encodeURIComponent(primaryBooth)}`
      : `${baseOrigin}/market?zipcode=${encodeURIComponent(primaryZip)}`

    const itemDetailsList = selectedRows.map(r => {
      const pText = r.priceUsd === 0 ? 'Free Share' : `$${r.priceUsd.toFixed(2)} / ${r.unit}`
      return `• ${r.produceName}: ${pText} (${r.availableQty} ${r.unit}s left)`
    }).join('\n')

    const headline = `🧺 Fresh Backyard Harvest Available in Zipcode ${primaryZip}!`
    const bodyText = `Local backyard growers in ${cityState} (${primaryZip}) have fresh harvest ready for pickup or delivery!\n\nAvailable Items:\n${itemDetailsList}\n\n🚚 Fulfillment Options: Pickup & Local Delivery Available\n\nClick below to view listings and order directly online:\n👉 Browse & Order Fresh Harvest Here: ${landingUrl}\n📍 Serving Zipcode ${primaryZip}`

    setActiveModalPayload({
      title: `🚀 Share Batch (${selectedRows.length} Active Listings) in Zip ${primaryZip}`,
      subtitle: `Promoting: ${itemsFormatted} from ${primaryBooth}`,
      entityName: itemsFormatted,
      shareUrl: landingUrl,
      shareMessage: `${headline}\n\n${bodyText}`,
      shareContext: 'metrics_listing_promotion',
    })
  }

  const toggleSelectRow = (id: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedKeys.size === sortedRows.length) {
      setSelectedKeys(new Set())
    } else {
      const allKeys = new Set(sortedRows.map(r => r.id))
      setSelectedKeys(allKeys)
    }
  }

  const uniqueZipcodes = Array.from(new Set(data.rows.map(r => r.zipcode))).sort()

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">🛍️ Active Produce Listings & Social Ads Generator</h1>
          <p className="page-subtitle">
            Create high-converting Facebook & social posts for active garden listings with price, available quantity, fulfillment options & direct product links.
          </p>
        </div>
      </div>

      {/* Summary KPI Grid */}
      <div className="kpi-grid stagger">
        <div className="kpi-card green">
          <span className="kpi-label">🛍️ Active Listings</span>
          <span className="kpi-value">{formatNumber(data.totalListings)}</span>
          <span className="kpi-sub">Published harvest offers</span>
        </div>

        <div className="kpi-card blue">
          <span className="kpi-label">📍 Zipcodes Covered</span>
          <span className="kpi-value">{formatNumber(data.totalZipcodes)}</span>
          <span className="kpi-sub">Active seller postal codes</span>
        </div>

        <div className="kpi-card purple">
          <span className="kpi-label">📍 Offers Porch Pickup</span>
          <span className="kpi-value">{formatNumber(data.pickupCount)}</span>
          <span className="kpi-sub">Local pickup listings</span>
        </div>

        <div className="kpi-card orange">
          <span className="kpi-label">🚗 Offers Neighborhood Delivery</span>
          <span className="kpi-value">{formatNumber(data.deliveryCount)}</span>
          <span className="kpi-sub">Local delivery listings</span>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        padding: '16px 20px',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Input */}
          <input
            type="text"
            placeholder="🔍 Search produce, seller name, or zipcode..."
            value={searchItem}
            onChange={e => setSearchItem(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '0.875rem',
              minWidth: 260,
            }}
          />

          {/* Fulfillment Dropdown */}
          <select
            value={fulfillmentFilter}
            onChange={e => setFulfillmentFilter(e.target.value as any)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '0.875rem',
            }}
          >
            <option value="ALL">All Fulfillment Options ({data.rows.length})</option>
            <option value="PICKUP">📍 Pickup Available ({data.pickupCount})</option>
            <option value="DELIVERY">🚗 Delivery Available ({data.deliveryCount})</option>
          </select>

          {/* Zipcode Filter Dropdown */}
          <select
            value={selectedZip}
            onChange={e => setSelectedZip(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '0.875rem',
            }}
          >
            <option value="">All Zipcodes ({uniqueZipcodes.length})</option>
            {uniqueZipcodes.map(z => (
              <option key={z} value={z}>Zip {z}</option>
            ))}
          </select>
        </div>

        {/* Batch Selection Action Button */}
        {selectedKeys.size > 0 && (
          <button
            onClick={openBatchSocialModal}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--accent-green)',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
            }}
          >
            🚀 Generate Combined Social Post ({selectedKeys.size} Listings Selected)
          </button>
        )}
      </div>

      {/* Active Listings Table */}
      <div className="card shadow-sm" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
            🛍️ Published Market Produce Listings ({sortedRows.length} active)
          </h2>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={sortedRows.length > 0 && selectedKeys.size === sortedRows.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th onClick={() => handleSort('produceName')} style={{ cursor: 'pointer' }}>
                  Produce Item {sortField === 'produceName' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th>Seller / Backyard Garden</th>
                <th onClick={() => handleSort('zipcode')} style={{ cursor: 'pointer' }}>
                  Zipcode {sortField === 'zipcode' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th onClick={() => handleSort('priceUsd')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                  Price {sortField === 'priceUsd' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th onClick={() => handleSort('availableQty')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                  Available Qty {sortField === 'availableQty' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th>Fulfillment & Windows</th>
                <th style={{ textAlign: 'center' }}>Social Post Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                    No active listings matching your filter criteria.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => {
                  const isChecked = selectedKeys.has(row.id)
                  return (
                    <tr key={`${row.id}_${idx}`} style={{ background: isChecked ? 'rgba(16, 185, 129, 0.05)' : undefined }}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(row.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span>{row.produceName}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--text-main)', fontSize: '0.875rem' }}>{row.sellerName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.boothName}</div>
                      </td>
                      <td>
                        <span className="badge badge-gray" style={{ fontWeight: 600 }}>{row.zipcode}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-green)' }}>
                        {row.priceUsd === 0 ? '🎁 Free' : `$${row.priceUsd.toFixed(2)} / ${row.unit}`}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatNumber(row.availableQty)} {row.unit}{row.availableQty > 1 ? 's' : ''}
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                          {formatFulfillmentText(row.fulfillmentOptions)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {row.fulfillmentWindows}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                          <button
                            onClick={() => openSingleSocialModal(row)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 'var(--radius-sm)',
                              border: 'none',
                              background: 'var(--accent-green)',
                              color: '#ffffff',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              width: '100%',
                            }}
                          >
                            🚀 Share Listing on FB
                          </button>
                          <button
                            onClick={() => handleCopyParams(row, idx)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border-subtle)',
                              background: copiedIndex === idx ? 'var(--accent-green)' : 'var(--bg-main)',
                              color: copiedIndex === idx ? '#fff' : 'var(--text-muted)',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              width: '100%',
                            }}
                          >
                            {copiedIndex === idx ? '✓ Copied!' : '📋 Copy Details'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SocialShareModal Dialog */}
      {activeModalPayload && (
        <SocialShareModal
          isOpen={!!activeModalPayload}
          onClose={() => setActiveModalPayload(null)}
          title={activeModalPayload.title}
          subtitle={activeModalPayload.subtitle}
          entityName={activeModalPayload.entityName}
          shareUrl={activeModalPayload.shareUrl}
          shareMessage={activeModalPayload.shareMessage}
          shareContext={activeModalPayload.shareContext}
        />
      )}
    </div>
  )
}
