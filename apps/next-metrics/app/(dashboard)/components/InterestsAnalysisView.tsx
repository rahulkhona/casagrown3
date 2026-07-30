'use client'

import React, { useEffect, useState } from 'react'
import { fetchProduceInterestsByZipcode, type ZipcodeInterestsData, type ZipcodeInterestRow } from '../../../lib/portal-service'
import { useFilters } from '../layout'
import { formatNumber } from '../../../lib/charts'
import SocialShareModal from '../../components/SocialShareModal'

export function InterestsAnalysisView() {
  const { geoFilter } = useFilters()
  const [data, setData] = useState<ZipcodeInterestsData | null>(null)
  const [loading, setLoading] = useState(true)

  // Interactive UI Filters & Sorting
  const [searchItem, setSearchItem] = useState('')
  const [signalFilter, setSignalFilter] = useState<'ALL' | 'HIGH_DEMAND' | 'HIGH_SUPPLY' | 'BALANCED'>('ALL')
  const [selectedZip, setSelectedZip] = useState('')
  const [sortField, setSortField] = useState<'zipcode' | 'produceName' | 'buyCount' | 'sellCount' | 'totalInterest'>('zipcode')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Multi-select state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // Modal State for Single or Batch Social Post
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
    fetchProduceInterestsByZipcode(geoFilter).then(res => {
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
        <span>Loading produce interest & Facebook ad targeting analytics by zipcode...</span>
      </div>
    )
  }

  // Filter rows
  const filteredRows = data.rows.filter(row => {
    const q = searchItem.toLowerCase().trim()
    const matchesSearch = !q || 
      row.produceName.toLowerCase().includes(q) || 
      row.zipcode.includes(q) ||
      row.cityState.toLowerCase().includes(q)
    const matchesSignal = signalFilter === 'ALL' || row.marketSignal === signalFilter
    const matchesZip = !selectedZip || row.zipcode === selectedZip
    return matchesSearch && matchesSignal && matchesZip
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

  const handleSort = (field: 'zipcode' | 'produceName' | 'buyCount' | 'sellCount' | 'totalInterest') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const highDemandCount = data.rows.filter(r => r.marketSignal === 'HIGH_DEMAND').length
  const highSupplyCount = data.rows.filter(r => r.marketSignal === 'HIGH_SUPPLY').length

  const getBaseOrigin = () => {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      const origin = window.location.origin
      if (!origin.includes('metrics')) return origin
    }
    return 'https://casagrown.com'
  }

  const handleCopyAdStrategy = (row: ZipcodeInterestRow, index: number) => {
    const textToCopy = `[Facebook Ad Campaign Target]\nProduce Item: ${row.produceName}\nZipcode: ${row.zipcode} (${row.cityState})\nStrategy: ${row.recommendedAdStrategy}\nAudience Target: ${row.targetAdAudience}`
    navigator.clipboard.writeText(textToCopy)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  // Single Row Social Post Helper
  const openSingleSocialModal = (row: ZipcodeInterestRow) => {
    const baseOrigin = getBaseOrigin()
    const isSellerSupply = row.marketSignal === 'HIGH_SUPPLY'
    const isBuyerDemand = row.marketSignal === 'HIGH_DEMAND'
    const modeParam = isSellerSupply ? 'buy' : 'sell'
    const targetAudienceRole = isSellerSupply ? 'BUYERS (Neighbors wanting fresh produce)' : isBuyerDemand ? 'SELLERS & GARDENERS (Neighbors with trees/harvest)' : 'LOCAL NEIGHBORS'
    
    // Direct sellers to /create-listing, buyers to /demand
    const landingUrl = isBuyerDemand
      ? `${baseOrigin}/create-listing?produce=${encodeURIComponent(row.produceName)}&zipcode=${encodeURIComponent(row.zipcode)}`
      : `${baseOrigin}/demand?items=${encodeURIComponent(row.produceName)}&location=${encodeURIComponent(row.zipcode)}&mode=${modeParam}&name=${encodeURIComponent('Local Neighbors')}`

    let headline = ''
    let bodyText = ''

    if (isSellerSupply) {
      headline = `🍋 Fresh Homegrown ${row.produceName} Available in Zipcode ${row.zipcode}!`
      bodyText = `Backyard growers in ${row.cityState} (${row.zipcode}) have extra homegrown ${row.produceName} ready to share, sell, or gift to neighbors!\n\nIf you would like to get this produce, click the link below and we will notify you as soon as sellers list their produce!\n\n👉 Get Notified When Produce is Listed: ${landingUrl}\n📍 Serving Zipcode ${row.zipcode}`
    } else if (isBuyerDemand) {
      headline = `🌱 Neighbors in Zipcode ${row.zipcode} are Looking for Fresh ${row.produceName}!`
      bodyText = `Do you have extra ${row.produceName} in your backyard or garden in ${row.cityState} (${row.zipcode})?\n\nLocal neighbors in your zipcode are actively looking to buy fresh, organic ${row.produceName}! If you have extra harvest to share or sell, click the link below to list your ${row.produceName} and connect with local buyers!\n\n👉 List Your ${row.produceName} Harvest & Sell Here: ${landingUrl}\n📍 Serving Zipcode ${row.zipcode}`
    } else {
      headline = `🛒 Buy, Sell, or Share Homegrown ${row.produceName} in Zipcode ${row.zipcode}!`
      bodyText = `Connect with neighbors in ${row.cityState} (${row.zipcode}) for fresh homegrown ${row.produceName}!\n\nClick the link below to buy, sell, or list produce in your area!\n\n👉 Connect & List Harvest Here: ${landingUrl}\n📍 Serving Zipcode ${row.zipcode}`
    }

    setActiveModalPayload({
      title: `🥑 Share ${row.produceName} Interest in Zip ${row.zipcode}`,
      subtitle: targetAudienceRole,
      entityName: row.produceName,
      shareUrl: landingUrl,
      shareMessage: `${headline}\n\n${bodyText}`,
      shareContext: 'metrics_interest_matching',
    })
  }

  // Multi-Select Batch Social Post Helper
  const openBatchSocialModal = () => {
    const selectedRows = sortedRows.filter(r => selectedKeys.has(`${r.produceName}_${r.zipcode}`))
    if (selectedRows.length === 0) return

    const baseOrigin = getBaseOrigin()
    const zipcodes = Array.from(new Set(selectedRows.map(r => r.zipcode)))
    const primaryZip = zipcodes[0] || '95125'
    const cityState = selectedRows[0]?.cityState || 'San Jose, CA'

    // Deduplicate produce item names clean
    const itemNames = Array.from(new Set(selectedRows.map(r => r.produceName.trim()))).filter(Boolean)
    const itemsParam = itemNames.join(',')

    const totalBuy = selectedRows.reduce((sum, r) => sum + r.buyCount, 0)
    const totalSell = selectedRows.reduce((sum, r) => sum + r.sellCount, 0)

    const isSellerSupplyBatch = totalSell >= totalBuy
    
    // Direct sellers to /create-listing when sharing buyer demand batch, buyers to /demand
    const landingUrl = !isSellerSupplyBatch
      ? `${baseOrigin}/create-listing?produce=${encodeURIComponent(itemsParam)}&zipcode=${encodeURIComponent(primaryZip)}`
      : `${baseOrigin}/demand?items=${encodeURIComponent(itemsParam)}&location=${encodeURIComponent(primaryZip)}&mode=buy&name=${encodeURIComponent('Local Neighbors')}`

    const itemsFormatted = itemNames.length > 1
      ? `${itemNames.slice(0, -1).join(', ')} and ${itemNames[itemNames.length - 1]}`
      : itemNames[0] || 'Fresh Produce'

    let headline = ''
    let bodyText = ''

    if (isSellerSupplyBatch) {
      headline = `🍓 Fresh Homegrown ${itemsFormatted} Available in Zipcode ${primaryZip}!`
      bodyText = `Backyard growers in ${cityState} (${primaryZip}) have extra ${itemsFormatted} ready to share, sell, or gift to neighbors!\n\nIf you would like to get this produce, click the link below and we will notify you as soon as sellers list their produce!\n\n👉 Get Notified When Produce is Listed: ${landingUrl}\n📍 Serving Zipcode ${primaryZip}`
    } else {
      headline = `🌱 Neighbors in Zipcode ${primaryZip} are Looking for Fresh ${itemsFormatted}!`
      bodyText = `Do you have extra ${itemsFormatted} in your backyard or garden in ${cityState} (${primaryZip})?\n\nLocal neighbors in your zipcode are actively looking to buy fresh, organic produce! If you have extra harvest to share or sell, click the link below to list your produce and connect with eager local buyers!\n\n👉 List Your Produce Harvest & Sell Here: ${landingUrl}\n📍 Serving Zipcode ${primaryZip}`
    }

    setActiveModalPayload({
      title: `🚀 Share Batch (${itemNames.length} Unique Items) in Zip ${primaryZip}`,
      subtitle: `Targeting: ${isSellerSupplyBatch ? 'BUYERS' : 'SELLERS & GARDENERS'} for ${itemsFormatted}`,
      entityName: itemsFormatted,
      shareUrl: landingUrl,
      shareMessage: `${headline}\n\n${bodyText}`,
      shareContext: 'metrics_interest_matching',
    })
  }

  const toggleSelectRow = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedKeys.size === sortedRows.length) {
      setSelectedKeys(new Set())
    } else {
      const allKeys = new Set(sortedRows.map(r => `${r.produceName}_${r.zipcode}`))
      setSelectedKeys(allKeys)
    }
  }

  const uniqueZipcodes = Array.from(new Set(data.rows.map(r => r.zipcode))).sort()

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">🥑 Produce Interests & FB Ad Target Generator</h1>
          <p className="page-subtitle">
            Analyze buy (buyer demand) vs. sell (seller supply) interest per produce item & zipcode to launch high-converting Facebook Ads.
          </p>
        </div>
      </div>

      {/* Summary KPI Grid */}
      <div className="kpi-grid stagger">
        <div className="kpi-card green">
          <span className="kpi-label">📍 Zipcodes Analyzed</span>
          <span className="kpi-value">{formatNumber(data.totalZipcodes)}</span>
          <span className="kpi-sub">Targetable postal areas</span>
        </div>

        <div className="kpi-card blue">
          <span className="kpi-label">🥦 Unique Produce Items</span>
          <span className="kpi-value">{formatNumber(data.totalItems)}</span>
          <span className="kpi-sub">Registered produce categories</span>
        </div>

        <div className="kpi-card purple">
          <span className="kpi-label">🎯 High Buyer Demand Targets</span>
          <span className="kpi-value">{formatNumber(highDemandCount)}</span>
          <span className="kpi-sub">Run "Buyers Wanted" FB Ads</span>
        </div>

        <div className="kpi-card orange">
          <span className="kpi-label">🌿 High Seller Supply Targets</span>
          <span className="kpi-value">{formatNumber(highSupplyCount)}</span>
          <span className="kpi-sub">Run "Sell Extra Harvest" FB Ads</span>
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
            placeholder="🔍 Search Zipcode, Produce, or City (e.g. 95125, Strawberries, Fremont)..."
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

          {/* Signal Filter Dropdown */}
          <select
            value={signalFilter}
            onChange={e => setSignalFilter(e.target.value as any)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '0.875rem',
            }}
          >
            <option value="ALL">All Market Signals ({data.rows.length})</option>
            <option value="HIGH_DEMAND">🎯 High Buyer Demand ({highDemandCount})</option>
            <option value="HIGH_SUPPLY">🌿 High Seller Supply ({highSupplyCount})</option>
            <option value="BALANCED">⚖️ Balanced Market ({data.rows.length - highDemandCount - highSupplyCount})</option>
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
            🚀 Generate Combined Social Post ({selectedKeys.size} Selected)
          </button>
        )}
      </div>

      {/* Produce Interests by Zipcode Data Table */}
      <div className="card shadow-sm" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
            📍 Aggregated Produce Buy & Sell Interest Breakdown by Zipcode ({sortedRows.length} matching)
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
                <th onClick={() => handleSort('zipcode')} style={{ cursor: 'pointer' }}>
                  Zipcode {sortField === 'zipcode' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th>City / Region</th>
                <th onClick={() => handleSort('buyCount')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                  Buy Demand {sortField === 'buyCount' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th onClick={() => handleSort('sellCount')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                  Sell Supply {sortField === 'sellCount' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th onClick={() => handleSort('totalInterest')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                  Total Interest {sortField === 'totalInterest' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th>Market Signal</th>
                <th>Recommended Strategy</th>
                <th style={{ textAlign: 'center' }}>Social Post & Ad Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                    No produce interest records matching your filter criteria.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => {
                  const key = `${row.produceName}_${row.zipcode}`
                  const isChecked = selectedKeys.has(key)
                  return (
                    <tr key={`${key}_${idx}`} style={{ background: isChecked ? 'rgba(16, 185, 129, 0.05)' : undefined }}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(key)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{row.produceName}</td>
                      <td>
                        <span className="badge badge-gray" style={{ fontWeight: 600 }}>{row.zipcode}</span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{row.cityState}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-green)' }}>
                        🛒 {formatNumber(row.buyCount)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--chart-4)' }}>
                        🌱 {formatNumber(row.sellCount)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatNumber(row.totalInterest)}</td>
                      <td>
                        {row.marketSignal === 'HIGH_DEMAND' ? (
                          <span className="badge badge-green">🎯 High Buyer Demand</span>
                        ) : row.marketSignal === 'HIGH_SUPPLY' ? (
                          <span className="badge badge-orange">🌿 High Seller Supply</span>
                        ) : (
                          <span className="badge badge-blue">⚖️ Balanced Market</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', maxWidth: 320 }}>
                        <div style={{ fontWeight: 500 }}>{row.recommendedAdStrategy}</div>
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
                            🚀 Generate Social Post & Link
                          </button>
                          <button
                            onClick={() => handleCopyAdStrategy(row, idx)}
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
                            {copiedIndex === idx ? '✓ Copied!' : '📋 Copy Target Params'}
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
