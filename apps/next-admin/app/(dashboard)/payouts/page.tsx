'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { YStack, XStack, Text, Button, Spinner, Input, Switch, Checkbox, ScrollView } from 'tamagui'
import { RefreshCw, Play, Search, AlertCircle, Calendar, Download, Upload } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

type QueuedPayout = {
  id: string
  user_id: string
  full_name: string
  email: string
  provider: string
  status: string
  point_cost: number
  metadata: any
  created_at: string
  failed_reason: string
  payout_handle: string
  payout_handle_type: string
  item_id: string
}

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<QueuedPayout[]>([])
  const [loading, setLoading] = useState(true)
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [autoBatchLimitUsd, setAutoBatchLimitUsd] = useState<string>('1000')

  // Execution State
  const [processing, setProcessing] = useState(false)
  const [processResult, setProcessResult] = useState<{ success: number; failed: number } | null>(null)
  
  const [manualFulfillModalOpen, setManualFulfillModalOpen] = useState(false)
  const [manualInputs, setManualInputs] = useState<Record<string, { fulfillment_source: string, reference_id: string, proof_url: string }>>({})

  // CSV Upload State
  const [csvUploadOpen, setCsvUploadOpen] = useState(false)
  const [csvProvider, setCsvProvider] = useState<string>('paypal')
  const [csvParsedRows, setCsvParsedRows] = useState<Array<{ redemptionId: string, providerRef: string, status: string, matched: boolean, payoutRecord?: QueuedPayout }>>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [csvProcessing, setCsvProcessing] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setProcessResult(null)
    const res = await adminApi.rpc<QueuedPayout[]>('get_pending_payouts_admin', { p_limit: 500, p_offset: 0 })
    if (res.data) setPayouts(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === payouts.length && payouts.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(payouts.map(p => p.id)))
    }
  }

  const selectOldestUpToLimit = () => {
    const limit = parseFloat(autoBatchLimitUsd) || 0
    let currentTotal = 0
    const newSelection = new Set<string>()

    for (const p of payouts) {
      const usdValue = p.point_cost / 100
      if (currentTotal + usdValue <= limit) {
        currentTotal += usdValue
        newSelection.add(p.id)
      } else {
        // Stop once we hit the cap to maintain strict FIFO
        break
      }
    }
    
    setSelectedIds(newSelection)
  }

  const executeSelectedPayouts = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Are you sure you want to process ${selectedIds.size} selected payout(s)? Corporate cash will be deducted.`)) return
    
    setProcessing(true)
    setProcessResult(null)

    const idsArray = Array.from(selectedIds)
    
    try {
      const { data, error } = await adminApi.invokeFunction('process-selected-payouts', { redemption_ids: idsArray })
      if (error) throw new Error(error)
      if (data && data.success) {
        setProcessResult({ success: data.processed, failed: data.failed })
        setSelectedIds(new Set())
        await fetchData()
      } else {
        alert(data?.error || 'Execution failed')
      }
    } catch (err: any) {
      alert('Error during execution: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  const openManualFulfill = () => {
    if (selectedIds.size === 0) return
    const initInputs: Record<string, any> = {}
    Array.from(selectedIds).forEach(id => {
      const p = payouts.find(x => x.id === id)
      initInputs[id] = { fulfillment_source: p?.provider === 'paypal' ? 'CashApp' : p?.provider || 'Manual', reference_id: '', proof_url: '' }
    })
    setManualInputs(initInputs)
    setManualFulfillModalOpen(true)
  }

  const executeManualFulfill = async () => {
    if (!confirm(`Are you sure you want to mark ${selectedIds.size} payout(s) as manually resolved without calling external APIs?`)) return
    setProcessing(true)
    setProcessResult(null)
    const fulfillments = Object.keys(manualInputs).map(id => ({ redemption_id: id, ...manualInputs[id] }))

    try {
      const { data, error } = await adminApi.invokeFunction('process-manual-fulfillments', { fulfillments })
      if (error) throw new Error(error)
      if (data && data.success) {
        setProcessResult({ success: data.processed, failed: data.failed })
        setSelectedIds(new Set())
        setManualFulfillModalOpen(false)
        await fetchData()
      } else {
        alert(data?.error || 'Execution failed')
      }
    } catch (err: any) {
      alert('Error during execution: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  // ── CSV Upload Logic ──
  const CSV_PROVIDER_CONFIG: Record<string, { label: string; redemptionIdColumn: string; refColumn: string; statusColumn?: string }> = {
    paypal: { label: 'PayPal', redemptionIdColumn: 'Redemption ID', refColumn: 'Transaction ID', statusColumn: 'Status' },
    tremendous: { label: 'Tremendous', redemptionIdColumn: 'Redemption ID', refColumn: 'Order ID', statusColumn: 'Status' },
    reloadly: { label: 'Reloadly', redemptionIdColumn: 'Redemption ID', refColumn: 'Transaction ID', statusColumn: 'Status' },
    globalgiving: { label: 'GlobalGiving', redemptionIdColumn: 'Redemption ID', refColumn: 'Donation ID', statusColumn: 'Status' },
  }

  const parseCSVString = (text: string): Record<string, string>[] => {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
    return lines.slice(1).map(line => {
      const values: string[] = []
      let current = ''
      let inQuotes = false
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue }
        if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
        current += ch
      }
      values.push(current.trim())
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = values[i] || '' })
      return row
    })
  }

  const handleCSVFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      if (!text) return
      const rows = parseCSVString(text)
      const config = CSV_PROVIDER_CONFIG[csvProvider]
      if (!config) return

      // Try to find our Redemption ID column — check exact name, then fallback patterns
      const redemptionIdKey = Object.keys(rows[0] || {}).find(k =>
        k === config.redemptionIdColumn ||
        k.toLowerCase().includes('redemption') ||
        k.toLowerCase().includes('external_id') ||
        k.toLowerCase().includes('custom') ||
        k.toLowerCase().includes('refcode') ||
        k.toLowerCase().includes('unique id') ||
        k.toLowerCase().includes('sender_item_id')
      ) || config.redemptionIdColumn

      const refKey = Object.keys(rows[0] || {}).find(k =>
        k === config.refColumn ||
        k.toLowerCase().includes('transaction') ||
        k.toLowerCase().includes('order') ||
        k.toLowerCase().includes('donation') ||
        k.toLowerCase().includes('batch')
      ) || config.refColumn

      const statusKey = config.statusColumn ? Object.keys(rows[0] || {}).find(k =>
        k.toLowerCase().includes('status')
      ) : undefined

      const parsed = rows.map(row => {
        const redemptionId = row[redemptionIdKey] || ''
        const providerRef = row[refKey] || ''
        const status = statusKey ? (row[statusKey] || '') : 'SUCCESS'
        const matched = payouts.some(p => p.id === redemptionId)
        const payoutRecord = payouts.find(p => p.id === redemptionId)
        return { redemptionId, providerRef, status, matched, payoutRecord }
      }).filter(r => r.redemptionId) // Skip empty rows

      setCsvParsedRows(parsed)
    }
    reader.readAsText(file)
  }

  const executeCSVUpload = async () => {
    const matchedRows = csvParsedRows.filter(r => r.matched && isSuccessStatus(r.status))
    if (matchedRows.length === 0) return
    if (!confirm(`Mark ${matchedRows.length} redemption(s) as fulfilled via ${CSV_PROVIDER_CONFIG[csvProvider]?.label} CSV import?`)) return

    setCsvProcessing(true)
    const fulfillments = matchedRows.map(r => ({
      redemption_id: r.redemptionId,
      fulfillment_source: `${CSV_PROVIDER_CONFIG[csvProvider]?.label} CSV Import`,
      reference_id: r.providerRef,
      proof_url: '',
    }))

    try {
      const { data, error } = await adminApi.invokeFunction('process-manual-fulfillments', { fulfillments })
      if (error) throw new Error(error)
      if (data?.success) {
        setProcessResult({ success: data.processed, failed: data.failed })
        setCsvUploadOpen(false)
        setCsvParsedRows([])
        setCsvFileName('')
        await fetchData()
      } else {
        alert(data?.error || 'CSV import failed')
      }
    } catch (err: any) {
      alert('Error during CSV import: ' + err.message)
    } finally {
      setCsvProcessing(false)
    }
  }

  const isSuccessStatus = (status: string) => {
    const s = status.toUpperCase()
    return s === 'SUCCESS' || s === 'SUCCEEDED' || s === 'SUCCESSFUL' || s === 'COMPLETED' || s === 'DELIVERED' || s === ''
  }

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const downloadCSV = () => {
    const items = selectedIds.size > 0 ? payouts.filter(p => selectedIds.has(p.id)) : payouts
    if (items.length === 0) return

    // Group items by provider
    const grouped: Record<string, QueuedPayout[]> = {}
    for (const p of items) {
      const key = p.provider || 'other'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(p)
    }

    const makeCsv = (headers: string[], rows: string[][]) =>
      [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')

    const triggerDownload = (csv: string, filename: string) => {
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }

    const dateStr = new Date().toISOString().slice(0, 10)
    let fileCount = 0

    // PayPal / Venmo
    if (grouped['paypal']) {
      const headers = ['Recipient Email/Phone', 'Recipient Type', 'Amount USD', 'Currency', 'Note', 'User Name', 'Redemption ID', 'Date']
      const rows = grouped['paypal'].map(p => {
        const handle = p.payout_handle || p.metadata?.payout_target || ''
        const isPhone = /^\+?[1-9]\d{1,14}$/.test(handle)
        return [handle, isPhone ? 'PHONE' : 'EMAIL', (p.point_cost / 100).toFixed(2), 'USD', 'CasaGrown Payout', p.full_name || '', p.id, new Date(p.created_at).toISOString()]
      })
      triggerDownload(makeCsv(headers, rows), `paypal_payouts_${dateStr}.csv`)
      fileCount++
    }

    // Tremendous (gift cards)
    if (grouped['tremendous']) {
      const headers = ['Recipient Email', 'Recipient Name', 'Amount USD', 'Product/Brand', 'Product ID', 'Redemption ID', 'Date']
      const rows = grouped['tremendous'].map(p => [
        p.email || '', p.full_name || '', (p.point_cost / 100).toFixed(2),
        p.metadata?.brand_name || '', p.metadata?.product_id || '', p.id, new Date(p.created_at).toISOString()
      ])
      triggerDownload(makeCsv(headers, rows), `tremendous_giftcards_${dateStr}.csv`)
      fileCount++
    }

    // Reloadly (gift cards)
    if (grouped['reloadly']) {
      const headers = ['Recipient Email', 'Recipient Name', 'Amount USD', 'Product/Brand', 'Product ID', 'Redemption ID', 'Date']
      const rows = grouped['reloadly'].map(p => [
        p.email || '', p.full_name || '', (p.point_cost / 100).toFixed(2),
        p.metadata?.brand_name || '', p.metadata?.product_id || '', p.id, new Date(p.created_at).toISOString()
      ])
      triggerDownload(makeCsv(headers, rows), `reloadly_giftcards_${dateStr}.csv`)
      fileCount++
    }

    // GlobalGiving (donations)
    if (grouped['globalgiving']) {
      const headers = ['Donor Email', 'Donor Name', 'Amount USD', 'Recipient Organization', 'Project Title', 'Project ID', 'Redemption ID', 'Date']
      const rows = grouped['globalgiving'].map(p => [
        p.email || '', p.full_name || '', (p.point_cost / 100).toFixed(2),
        p.metadata?.organization || '', p.metadata?.project_title || '',
        p.item_id || '', p.id, new Date(p.created_at).toISOString()
      ])
      triggerDownload(makeCsv(headers, rows), `globalgiving_donations_${dateStr}.csv`)
      fileCount++
    }

    // Other / unknown providers
    const otherKeys = Object.keys(grouped).filter(k => !['paypal', 'tremendous', 'reloadly', 'globalgiving'].includes(k))
    if (otherKeys.length > 0) {
      const otherItems = otherKeys.flatMap(k => grouped[k])
      const headers = ['Date', 'Name', 'Email', 'Provider', 'Amount USD', 'Status', 'Payout Handle', 'Redemption ID', 'Failed Reason']
      const rows = otherItems.map(p => [
        new Date(p.created_at).toISOString(), p.full_name || '', p.email || '', p.provider || '',
        (p.point_cost / 100).toFixed(2), p.status, p.payout_handle || p.metadata?.payout_target || '', p.id, p.failed_reason || ''
      ])
      triggerDownload(makeCsv(headers, rows), `other_payouts_${dateStr}.csv`)
      fileCount++
    }

    if (fileCount > 1) {
      alert(`Downloaded ${fileCount} CSV files — one per provider.`)
    }
  }

  // Metrics
  const totalQueueUsd = payouts.reduce((acc, p) => acc + (p.point_cost / 100), 0)
  const selectedUsd = Array.from(selectedIds).reduce((acc, id) => {
    const p = payouts.find(x => x.id === id)
    return acc + (p ? p.point_cost / 100 : 0)
  }, 0)

  if (loading) {
    return (
      <YStack flex={1} padding="$4" alignItems="center" justifyContent="center">
        <Spinner size="large" color={colors.green[600]} />
      </YStack>
    )
  }

  return (
    <YStack flex={1} padding="$6" gap="$5">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize="$8" fontWeight="bold" color={colors.green[900]}>Payout Queue</Text>
          <Text color={colors.gray[600]}>Manual human-review for corporate cashouts</Text>
        </YStack>
        <XStack gap="$2">
          <Button icon={RefreshCw} backgroundColor={colors.white} color={colors.gray[800]} borderWidth={1} borderColor={colors.gray[300]} onPress={fetchData}>
            Refresh Queue
          </Button>
        </XStack>
      </XStack>

      {/* Metrics Banner */}
      <XStack gap="$4">
        <YStack flex={1} backgroundColor="white" padding="$4" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]}>
          <Text fontSize={12} color={colors.gray[500]} fontWeight="600" textTransform="uppercase">Total Pending Limit</Text>
          <Text fontSize="$8" fontWeight="bold" color={colors.gray[900]}>{fmt(totalQueueUsd * 100)}</Text>
          <Text fontSize={13} color={colors.gray[500]}>{payouts.length} items waiting in queue</Text>
        </YStack>
        <YStack flex={1} backgroundColor={colors.green[50]} padding="$4" borderRadius="$4" borderWidth={1} borderColor={colors.green[200]}>
          <Text fontSize={12} color={colors.green[700]} fontWeight="600" textTransform="uppercase">Selected for Execution</Text>
          <Text fontSize="$8" fontWeight="bold" color={colors.green[800]}>{fmt(selectedUsd * 100)}</Text>
          <Text fontSize={13} color={colors.green[600]}>{selectedIds.size} items selected</Text>
        </YStack>
      </XStack>

      {/* Execution Controls */}
      <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} padding="$4" gap="$4">
        <XStack justifyContent="space-between" alignItems="flex-end" flexWrap="wrap" gap="$4">
          
          <YStack gap="$2" flex={1} minWidth={300}>
            <Text fontSize={14} fontWeight="600" color={colors.gray[800]}>Fast Selection (Strict FIFO)</Text>
            <XStack gap="$2" alignItems="center">
              <Text fontSize={14} color={colors.gray[600]}>Select Oldest up to: $</Text>
              <Input 
                width={120} 
                height="$3"
                value={autoBatchLimitUsd} 
                onChangeText={setAutoBatchLimitUsd} 
                placeholder="1000" 
                keyboardType="numeric" 
              />
              <Button size="$3" backgroundColor={colors.gray[100]} color={colors.gray[800]} onPress={selectOldestUpToLimit}>
                Auto-Select
              </Button>
            </XStack>
          </YStack>

          <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
            {/* CSV Workflow */}
            <YStack gap="$2" padding="$3" backgroundColor="#f8fafc" borderRadius="$2" borderWidth={1} borderColor="#e2e8f0">
              <Text fontSize={12} fontWeight="700" color="#475569" textTransform="uppercase">Batch via Provider Portal</Text>
              <XStack gap="$2">
                <Button 
                  size="$3" 
                  icon={Download}
                  backgroundColor={colors.white}
                  color={colors.gray[800]}
                  borderWidth={1}
                  borderColor={colors.gray[300]}
                  onPress={downloadCSV}
                >
                  <Text color={colors.gray[800]} fontWeight="600">
                    {selectedIds.size > 0 ? `Export ${selectedIds.size}` : 'Export'}
                  </Text>
                </Button>
                <Button 
                  size="$3"
                  icon={Upload}
                  backgroundColor={colors.white}
                  color={colors.gray[800]}
                  borderWidth={1}
                  borderColor={colors.gray[300]}
                  onPress={() => { setCsvUploadOpen(true); setCsvParsedRows([]); setCsvFileName('') }}
                >
                  <Text color={colors.gray[800]} fontWeight="600">
                    Import
                  </Text>
                </Button>
              </XStack>
              <Text fontSize={11} color="#94a3b8" maxWidth={280}>Export CSV → upload to PayPal/Tremendous → download result → Import here to close the loop.</Text>
            </YStack>

            {/* Direct Actions */}
            <YStack gap="$2" padding="$3" backgroundColor="#f8fafc" borderRadius="$2" borderWidth={1} borderColor="#e2e8f0">
              <Text fontSize={12} fontWeight="700" color="#475569" textTransform="uppercase">Direct Actions</Text>
              <XStack gap="$2">
                <Button 
                  size="$3" 
                  backgroundColor={selectedIds.size > 0 && !manualFulfillModalOpen ? colors.blue[600] : colors.gray[300]} 
                  disabled={selectedIds.size === 0 || processing || manualFulfillModalOpen}
                  onPress={openManualFulfill}
                >
                  <Text color="white" fontWeight="bold">
                    Fulfill Manually...
                  </Text>
                </Button>
                
                <Button 
                  size="$3" 
                  backgroundColor={selectedIds.size > 0 && !manualFulfillModalOpen ? colors.green[600] : colors.gray[300]} 
                  disabled={selectedIds.size === 0 || processing || manualFulfillModalOpen}
                  icon={processing && !manualFulfillModalOpen ? <Spinner color="white" /> : Play}
                  onPress={executeSelectedPayouts}
                >
                  <Text color="white" fontWeight="bold">
                    {processing && !manualFulfillModalOpen ? 'Processing...' : `Execute Auto API (${fmt(selectedUsd * 100)})`}
                  </Text>
                </Button>
              </XStack>
              <Text fontSize={11} color="#94a3b8" maxWidth={340}>Fulfill Manually for one-off payouts. Execute Auto API calls provider APIs directly.</Text>
            </YStack>
          </XStack>

        </XStack>

        {manualFulfillModalOpen && (
          <YStack backgroundColor="#f8fafc" padding="$4" borderRadius="$2" gap="$4" borderWidth={1} borderColor="#cbd5e1" marginTop="$2">
            <Text fontSize={16} fontWeight="bold" color="#0f172a">Omni-Channel Manual Fulfillment</Text>
            <Text fontSize={13} color="#475569">Bypass automated API hooks and explicitly fulfill these debt requests manually. Values entered here will be trusted implicitly and piped cleanly into the users' receipts and push notifications.</Text>
            
            {Array.from(selectedIds).map(id => {
              const p = payouts.find(x => x.id === id)
              if (!p) return null
              return (
                <YStack key={id} gap="$2" padding="$3" backgroundColor="white" borderRadius="$2" borderWidth={1} borderColor="#e2e8f0">
                   <Text fontSize={14} fontWeight="600" color="#334155">{p.full_name} - {fmt(p.point_cost)} <Text color="#64748b" fontWeight="normal">(Requested: {p.provider})</Text></Text>
                   <XStack gap="$3" flexWrap="wrap">
                     <YStack flex={1} minWidth={150}>
                       <Text fontSize={12} color="#64748b" marginBottom="$1">Fulfillment Source (Venmo, Check)</Text>
                       <Input value={manualInputs[id]?.fulfillment_source} onChangeText={v => setManualInputs(prev => ({...prev, [id]: { ...prev[id], fulfillment_source: v }}))} placeholder="E.g. CashApp" backgroundColor="white" />
                     </YStack>
                     <YStack flex={1} minWidth={150}>
                       <Text fontSize={12} color="#64748b" marginBottom="$1">Reference / TX / Receipt ID</Text>
                       <Input value={manualInputs[id]?.reference_id} onChangeText={v => setManualInputs(prev => ({...prev, [id]: { ...prev[id], reference_id: v }}))} placeholder="Optional TX ID" backgroundColor="white" />
                     </YStack>
                     <YStack flex={2} minWidth={250}>
                       <Text fontSize={12} color="#64748b" marginBottom="$1">Proof URL / Gift Card Link</Text>
                       <Input value={manualInputs[id]?.proof_url} onChangeText={v => setManualInputs(prev => ({...prev, [id]: { ...prev[id], proof_url: v }}))} placeholder="https://..." backgroundColor="white" />
                     </YStack>
                   </XStack>
                </YStack>
              )
            })}
            
            <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
              <Button onPress={() => setManualFulfillModalOpen(false)} backgroundColor="white" borderWidth={1} borderColor="#cbd5e1" color="#475569">Cancel</Button>
              <Button backgroundColor="#0ea5e9" color="white" onPress={executeManualFulfill} disabled={processing} icon={processing ? <Spinner color="white" /> : undefined}>{processing ? 'Submitting...' : 'Mark as Successfully Paid'}</Button>
            </XStack>
          </YStack>
        )}

        {processResult && (
          <XStack backgroundColor={processResult.failed > 0 ? '#fffbeb' : colors.green[50]} padding="$3" borderRadius="$2" alignItems="center" gap="$2">
            <AlertCircle size={16} color={processResult.failed > 0 ? '#d97706' : colors.green[600]} />
            <Text color={processResult.failed > 0 ? '#92400e' : colors.green[800]} fontWeight="600">
              Execution Complete: {processResult.success} succeeded, {processResult.failed} failed.
            </Text>
          </XStack>
        )}

        {/* CSV Upload Modal */}
        {csvUploadOpen && (
          <YStack backgroundColor="#f0f9ff" padding="$4" borderRadius="$2" gap="$4" borderWidth={1} borderColor="#7dd3fc" marginTop="$2">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={16} fontWeight="bold" color="#0c4a6e">Import Provider Response CSV</Text>
              <Button size="$2" onPress={() => { setCsvUploadOpen(false); setCsvParsedRows([]) }} backgroundColor="white" borderWidth={1} borderColor="#cbd5e1" color="#475569">✕</Button>
            </XStack>
            <Text fontSize={13} color="#0369a1">Upload the response CSV from a provider portal. The system will match rows back to pending redemptions using the Redemption ID column.</Text>

            <XStack gap="$3" alignItems="flex-end" flexWrap="wrap">
              <YStack gap="$1" flex={1} minWidth={200}>
                <Text fontSize={12} color="#64748b" fontWeight="600">Provider</Text>
                <XStack gap="$2" flexWrap="wrap">
                  {Object.entries(CSV_PROVIDER_CONFIG).map(([key, cfg]) => (
                    <Button
                      key={key}
                      size="$3"
                      backgroundColor={csvProvider === key ? '#0284c7' : 'white'}
                      color={csvProvider === key ? 'white' : '#334155'}
                      borderWidth={1}
                      borderColor={csvProvider === key ? '#0284c7' : '#cbd5e1'}
                      onPress={() => { setCsvProvider(key); setCsvParsedRows([]); setCsvFileName('') }}
                    >
                      {cfg.label}
                    </Button>
                  ))}
                </XStack>
              </YStack>
              <YStack gap="$1" flex={1} minWidth={250}>
                <Text fontSize={12} color="#64748b" fontWeight="600">Response CSV File</Text>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVFileSelect}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', backgroundColor: 'white', fontSize: 14 }}
                />
              </YStack>
            </XStack>

            {csvParsedRows.length > 0 && (
              <YStack gap="$3">
                <XStack gap="$4">
                  <YStack backgroundColor="white" padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.green[200]} flex={1}>
                    <Text fontSize={12} color={colors.green[700]} fontWeight="600">MATCHED</Text>
                    <Text fontSize="$7" fontWeight="bold" color={colors.green[800]}>{csvParsedRows.filter(r => r.matched && isSuccessStatus(r.status)).length}</Text>
                    <Text fontSize={11} color={colors.green[600]}>Ready to fulfill</Text>
                  </YStack>
                  <YStack backgroundColor="white" padding="$3" borderRadius="$2" borderWidth={1} borderColor="#fde047" flex={1}>
                    <Text fontSize={12} color="#a16207" fontWeight="600">FAILED AT PROVIDER</Text>
                    <Text fontSize="$7" fontWeight="bold" color="#92400e">{csvParsedRows.filter(r => r.matched && !isSuccessStatus(r.status)).length}</Text>
                    <Text fontSize={11} color="#a16207">Will not be fulfilled</Text>
                  </YStack>
                  <YStack backgroundColor="white" padding="$3" borderRadius="$2" borderWidth={1} borderColor="#fca5a5" flex={1}>
                    <Text fontSize={12} color="#991b1b" fontWeight="600">UNMATCHED</Text>
                    <Text fontSize="$7" fontWeight="bold" color="#991b1b">{csvParsedRows.filter(r => !r.matched).length}</Text>
                    <Text fontSize={11} color="#b91c1c">No matching redemption found</Text>
                  </YStack>
                </XStack>

                <ScrollView style={{ maxHeight: 300 }}>
                  <YStack borderWidth={1} borderColor="#e2e8f0" borderRadius="$2" overflow="hidden">
                    {/* Preview header */}
                    <XStack backgroundColor="#f1f5f9" paddingHorizontal="$3" paddingVertical="$2" borderBottomWidth={1} borderColor="#e2e8f0">
                      <Text width={40} fontSize={11} fontWeight="700" color="#64748b">✓</Text>
                      <Text width={280} fontSize={11} fontWeight="700" color="#64748b">REDEMPTION ID</Text>
                      <Text width={200} fontSize={11} fontWeight="700" color="#64748b">PROVIDER REF</Text>
                      <Text width={120} fontSize={11} fontWeight="700" color="#64748b">PROVIDER STATUS</Text>
                      <Text width={160} fontSize={11} fontWeight="700" color="#64748b">USER</Text>
                      <Text flex={1} fontSize={11} fontWeight="700" color="#64748b" textAlign="right">AMOUNT</Text>
                    </XStack>
                    {csvParsedRows.map((row, idx) => (
                      <XStack
                        key={idx}
                        paddingHorizontal="$3"
                        paddingVertical="$2"
                        borderBottomWidth={1}
                        borderColor="#f1f5f9"
                        backgroundColor={row.matched && isSuccessStatus(row.status) ? '#f0fdf4' : !row.matched ? '#fef2f2' : '#fffbeb'}
                      >
                        <Text width={40} fontSize={13}>{row.matched && isSuccessStatus(row.status) ? '✅' : !row.matched ? '❌' : '⚠️'}</Text>
                        <Text width={280} fontSize={12} color="#334155" numberOfLines={1}>{row.redemptionId}</Text>
                        <Text width={200} fontSize={12} color="#475569" numberOfLines={1}>{row.providerRef || '—'}</Text>
                        <Text width={120} fontSize={12} color={isSuccessStatus(row.status) ? colors.green[700] : '#dc2626'} fontWeight="600">{row.status || 'SUCCESS'}</Text>
                        <Text width={160} fontSize={12} color="#475569" numberOfLines={1}>{row.payoutRecord?.full_name || '—'}</Text>
                        <Text flex={1} fontSize={12} color="#334155" textAlign="right" fontWeight="600">{row.payoutRecord ? fmt(row.payoutRecord.point_cost) : '—'}</Text>
                      </XStack>
                    ))}
                  </YStack>
                </ScrollView>

                <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
                  <Button onPress={() => { setCsvUploadOpen(false); setCsvParsedRows([]) }} backgroundColor="white" borderWidth={1} borderColor="#cbd5e1" color="#475569">Cancel</Button>
                  <Button
                    backgroundColor={csvParsedRows.some(r => r.matched && isSuccessStatus(r.status)) ? '#0284c7' : colors.gray[300]}
                    disabled={!csvParsedRows.some(r => r.matched && isSuccessStatus(r.status)) || csvProcessing}
                    color="white"
                    onPress={executeCSVUpload}
                    icon={csvProcessing ? <Spinner color="white" /> : undefined}
                  >
                    {csvProcessing ? 'Processing...' : `Fulfill ${csvParsedRows.filter(r => r.matched && isSuccessStatus(r.status)).length} Matched Items`}
                  </Button>
                </XStack>
              </YStack>
            )}
          </YStack>
        )}
      </YStack>

      {/* Queue Table */}
      <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <YStack minWidth={1400}>
            
            {/* Header Row */}
          <XStack paddingHorizontal="$4" paddingVertical="$3" borderBottomWidth={1} borderColor={colors.gray[200]} backgroundColor={colors.gray[50]} alignItems="center">
            <XStack width={40} justifyContent="center">
              <Checkbox 
                checked={selectedIds.size > 0 && selectedIds.size === payouts.length} 
                onCheckedChange={toggleSelectAll}
                size="$3"
              >
                <Checkbox.Indicator><Text>✓</Text></Checkbox.Indicator>
              </Checkbox>
            </XStack>
            <Text width={120} fontSize={12} fontWeight="600" color={colors.gray[500]}>DATE</Text>
            <Text width={160} fontSize={12} fontWeight="600" color={colors.gray[500]}>USER</Text>
            <Text width={90} fontSize={12} fontWeight="600" color={colors.gray[500]}>PROVIDER</Text>
            <Text width={150} fontSize={12} fontWeight="600" color={colors.gray[500]}>DESTINATION</Text>
            <Text width={150} fontSize={12} fontWeight="600" color={colors.gray[500]}>SETTLEMENT ID</Text>
            <Text width={100} fontSize={12} fontWeight="600" color={colors.gray[500]}>SETTLEMENT DT</Text>
            <Text width={150} fontSize={12} fontWeight="600" color={colors.gray[500]}>PAYMENT ID</Text>
            <Text width={100} fontSize={12} fontWeight="600" color={colors.gray[500]}>PAYMENT DT</Text>
            <Text flex={1} fontSize={12} fontWeight="600" color={colors.gray[500]} textAlign="right">AMOUNT</Text>
            <Text width={90} fontSize={12} fontWeight="600" color={colors.gray[500]} textAlign="center">STATUS</Text>
          </XStack>

        {payouts.length === 0 ? (
          <YStack padding="$8" alignItems="center">
            <Text color={colors.gray[400]}>The queue is empty.</Text>
          </YStack>
        ) : (
          payouts.map((p, idx) => {
            const isSelected = selectedIds.has(p.id)
            return (
              <YStack key={p.id}>
                <XStack
                  paddingHorizontal="$4"
                  paddingVertical="$3"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderColor={colors.gray[100]}
                  backgroundColor={isSelected ? colors.green[50] : 'transparent'}
                  onPress={() => toggleSelect(p.id)}
                  cursor="pointer"
                  hoverStyle={{ backgroundColor: isSelected ? colors.green[100] : colors.gray[50] }}
                >
                  <XStack width={40} justifyContent="center" onPress={(e) => { e.stopPropagation(); toggleSelect(p.id); }}>
                    <Checkbox checked={isSelected} size="$3">
                      <Checkbox.Indicator><Text>✓</Text></Checkbox.Indicator>
                    </Checkbox>
                  </XStack>
                  <Text width={120} fontSize={13} color={colors.gray[600]}>
                    {new Date(p.created_at).toLocaleDateString()} {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <YStack width={160}>
                    <Text fontSize={13} fontWeight="600" color={colors.gray[900]} numberOfLines={1}>{p.full_name || 'Anonymous'}</Text>
                    <Text fontSize={12} color={colors.gray[500]} numberOfLines={1}>{p.email}</Text>
                  </YStack>
                  <Text width={90} fontSize={13} color={colors.gray[800]} textTransform="capitalize">{p.provider}</Text>

                  <YStack width={150}>
                    {p.metadata?.brand_name ? (
                      <Text fontSize={12} color={colors.blue[600]} numberOfLines={2}>Giftcard: {p.metadata.brand_name}</Text>
                    ) : p.metadata?.organization ? (
                      <Text fontSize={12} color={colors.purple[600]} numberOfLines={2}>Charity: {p.metadata.organization}</Text>
                    ) : (p.payout_handle || p.metadata?.payout_target) ? (
                      <YStack>
                        <Text fontSize={12} color={colors.green[700]} numberOfLines={1} fontWeight="600">
                          {p.payout_handle || p.metadata?.payout_target}
                        </Text>
                        {(p.payout_handle_type || (p.provider === 'paypal' && p.metadata?.payout_target)) && (
                          <Text fontSize={11} color={colors.gray[500]} textTransform="capitalize">
                            {p.payout_handle_type || (/^\+?[1-9]\d{1,14}$/.test(p.payout_handle || p.metadata?.payout_target || '') ? 'venmo' : 'paypal')}
                          </Text>
                        )}
                      </YStack>
                    ) : (
                      <Text fontSize={12} color={colors.gray[400]}>Standard Cashout</Text>
                    )}
                  </YStack>

                  <Text width={150} fontSize={12} color={colors.gray[700]} numberOfLines={1}>{p.metadata?.settlement_id || 'N/A'}</Text>
                  <Text width={100} fontSize={12} color={colors.gray[700]}>{p.metadata?.settlement_date || 'N/A'}</Text>

                  <Text width={150} fontSize={12} color={colors.gray[700]} numberOfLines={1}>{p.metadata?.payment_id || 'N/A'}</Text>
                  <Text width={100} fontSize={12} color={colors.gray[700]}>{p.metadata?.payment_received_date || 'N/A'}</Text>

                  <Text flex={1} fontSize={13} fontWeight="700" textAlign="right" color={colors.gray[900]}>{fmt(p.point_cost)}</Text>
                  <XStack width={90} justifyContent="center" marginLeft="$4">
                    <Text fontSize={11} fontWeight="700" paddingHorizontal="$2" paddingVertical={2} borderRadius="$2" backgroundColor={p.status === 'failed' ? '#fef2f2' : '#fefce8'} color={p.status === 'failed' ? '#991b1b' : '#a16207'} borderWidth={1} borderColor={p.status === 'failed' ? '#fca5a5' : '#fde047'}>
                      {p.status.toUpperCase()}
                    </Text>
                  </XStack>
                </XStack>
                
                {p.failed_reason && (
                  <XStack backgroundColor="#fef2f2" padding="$3" paddingLeft={40}>
                    <AlertCircle size={14} color="#dc2626" />
                    <Text fontSize={12} color="#991b1b" marginLeft="$2">Failure Reason: {p.failed_reason}</Text>
                  </XStack>
                )}
              </YStack>
            )
          })
        )}
          </YStack>
        </ScrollView>
      </YStack>
    </YStack>
  )
}
