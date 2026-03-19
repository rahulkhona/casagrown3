'use client'

import React, { useEffect, useState } from 'react'
import { YStack, XStack, Text, Button, Input, Label, ScrollView, Separator, Spinner } from 'tamagui'
import { Plus, Edit3, Trash2, FileSpreadsheet, ChevronDown } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

type Threshold = {
  state_code: string
  amount: number
  min_txns: number
  warn_pct: number
  updated_at: string | null
}

const US_STATES = [
  '_default',
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY'
]

export default function TaxReportingPage() {
  const [rules, setRules] = useState<Threshold[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Create/Edit form state
  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formStateCode, setFormStateCode] = useState('')
  const [formAmount, setFormAmount] = useState('20000')
  const [formMinTxns, setFormMinTxns] = useState('0')
  const [formWarnPct, setFormWarnPct] = useState('0.75')

  // Edit mode
  const [editingState, setEditingState] = useState<string | null>(null)

  const fetchRules = async () => {
    setLoading(true)
    const { data } = await adminApi.select(
      'tax_reporting_thresholds', '*',
      undefined,
      { order: { column: 'state_code', ascending: true } }
    )

    if (data) setRules(data as Threshold[])
    setLoading(false)
  }

  useEffect(() => { fetchRules() }, [])

  const resetForm = () => {
    setFormStateCode('')
    setFormAmount('20000')
    setFormMinTxns('0')
    setFormWarnPct('0.75')
    setEditingState(null)
    setErrorMessage('')
  }

  const handleCreate = async () => {
    if (!formStateCode) {
      setErrorMessage('Please select a state or _default.')
      return
    }
    const amount = parseFloat(formAmount)
    if (isNaN(amount) || amount <= 0) {
      setErrorMessage('Amount must be a positive number.')
      return
    }
    const minTxns = parseInt(formMinTxns)
    if (isNaN(minTxns) || minTxns < 0) {
      setErrorMessage('Min transactions must be 0 or greater.')
      return
    }
    const warnPct = parseFloat(formWarnPct)
    if (isNaN(warnPct) || warnPct < 0 || warnPct > 1) {
      setErrorMessage('Warning percentage must be between 0 and 1.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')
    try {
      if (editingState) {
        // Update existing
        const { error } = await adminApi.update(
          'tax_reporting_thresholds',
          {
            amount,
            min_txns: minTxns,
            warn_pct: warnPct,
            updated_at: new Date().toISOString(),
          },
          { eq: { state_code: editingState } }
        )

        if (error) throw new Error(error)
        setSuccessMessage(`Updated threshold for ${editingState}`)
      } else {
        // Insert new
        const { error } = await adminApi.insert('tax_reporting_thresholds', {
            state_code: formStateCode,
            amount,
            min_txns: minTxns,
            warn_pct: warnPct,
          })

        if (error) throw new Error(error)
        setSuccessMessage(`Created threshold for ${formStateCode}`)
      }

      setIsAdding(false)
      resetForm()
      setTimeout(() => setSuccessMessage(''), 4000)
      fetchRules()
    } catch (e: any) {
      setErrorMessage(`Failed to save: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (stateCode: string) => {
    setErrorMessage('')
    const { error } = await adminApi.delete(
      'tax_reporting_thresholds',
      { eq: { state_code: stateCode } }
    )

    if (error) {
      setErrorMessage(`Failed to delete: ${error}`)
    } else {
      setSuccessMessage(`Removed threshold for ${stateCode}`)
      setTimeout(() => setSuccessMessage(''), 3000)
      fetchRules()
    }
  }

  const startEdit = (rule: Threshold) => {
    setEditingState(rule.state_code)
    setFormStateCode(rule.state_code)
    setFormAmount(rule.amount.toString())
    setFormMinTxns(rule.min_txns.toString())
    setFormWarnPct(rule.warn_pct.toString())
    setIsAdding(true)
  }

  const formatUsd = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)

  return (
    <YStack flex={1} padding="$6" gap="$5" maxWidth={1000}>
      <XStack justifyContent="space-between" alignItems="center">
        <XStack alignItems="center" gap="$2">
          <FileSpreadsheet size={24} color={colors.green[800]} />
          <YStack>
            <Text fontSize="$8" fontWeight="bold" color={colors.green[900]}>1099-K Reporting Thresholds</Text>
            <Text color={colors.gray[600]}>
              Set per-state 1099-K reporting thresholds. Use "_default" for the federal fallback.
            </Text>
          </YStack>
        </XStack>
        {!isAdding && (
          <Button icon={Plus} backgroundColor={colors.green[600]} onPress={() => { resetForm(); setIsAdding(true) }}>
            <Text color="white" fontWeight="600">New Threshold</Text>
          </Button>
        )}
      </XStack>

      {errorMessage ? (
        <YStack backgroundColor={colors.red[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.red[200]}>
          <Text color={colors.red[800]} fontWeight="600">{errorMessage}</Text>
        </YStack>
      ) : null}

      {successMessage ? (
        <YStack backgroundColor={colors.green[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.green[200]}>
          <Text color={colors.green[800]} fontWeight="600">{successMessage}</Text>
        </YStack>
      ) : null}

      {/* CREATE/EDIT FORM */}
      {isAdding && (
        <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$5" backgroundColor="white" borderRadius="$4" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2" borderBottomWidth={1} borderColor={colors.gray[200]} paddingBottom="$3">
              <FileSpreadsheet size={20} color={colors.green[700]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>
                {editingState ? `Edit Threshold — ${editingState}` : 'Create Threshold'}
              </Text>
            </XStack>

            <XStack gap="$3">
              {/* State dropdown */}
              <YStack gap="$1" width={180}>
                <Label>State *</Label>
                <XStack borderWidth={1} borderColor={colors.gray[300]} borderRadius="$3" overflow="hidden">
                  <select
                    value={formStateCode}
                    onChange={(e) => setFormStateCode(e.target.value)}
                    disabled={!!editingState}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      backgroundColor: editingState ? colors.gray[100] : 'transparent',
                      fontSize: 14,
                      color: formStateCode ? '#1a1a1a' : '#9ca3af',
                      cursor: editingState ? 'not-allowed' : 'pointer',
                      outline: 'none',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                    }}
                  >
                    <option value="">Select...</option>
                    {US_STATES.map(s => (
                      <option key={s} value={s}>{s === '_default' ? '_default (Federal)' : s}</option>
                    ))}
                  </select>
                  <XStack position="absolute" right={12} top={0} bottom={0} alignItems="center" pointerEvents="none">
                    <ChevronDown size={16} color={colors.gray[400]} />
                  </XStack>
                </XStack>
              </YStack>

              {/* Amount */}
              <YStack gap="$1" flex={1}>
                <Label>Threshold Amount ($) *</Label>
                <XStack alignItems="center" gap="$2">
                  <Text fontSize="$4" color={colors.gray[500]}>$</Text>
                  <Input value={formAmount} onChangeText={setFormAmount} keyboardType="numeric" flex={1} />
                </XStack>
              </YStack>
            </XStack>

            <XStack gap="$3">
              {/* Min Transactions */}
              <YStack gap="$1" flex={1}>
                <Label>Min Transactions</Label>
                <Input value={formMinTxns} onChangeText={setFormMinTxns} keyboardType="numeric" />
                <Text fontSize="$2" color={colors.gray[500]}>Set to 0 if only the dollar amount matters (federal: 200 → 0 after 2024).</Text>
              </YStack>

              {/* Warning Percentage */}
              <YStack gap="$1" flex={1}>
                <Label>Warning Threshold</Label>
                <XStack alignItems="center" gap="$2">
                  <Input value={formWarnPct} onChangeText={setFormWarnPct} keyboardType="numeric" flex={1} />
                  <Text fontSize="$3" color={colors.gray[500]}>× amount</Text>
                </XStack>
                <Text fontSize="$2" color={colors.gray[500]}>Show warning banner when user reaches this fraction of the threshold (e.g. 0.75 = 75%).</Text>
              </YStack>
            </XStack>

            <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
              <Button chromeless onPress={() => { setIsAdding(false); resetForm() }}>
                <Text color={colors.gray[600]}>Cancel</Text>
              </Button>
              <Button backgroundColor={colors.green[600]} onPress={handleCreate} disabled={submitting}>
                <Text color="white" fontWeight="600">
                  {submitting ? 'Saving...' : editingState ? 'Save Changes' : 'Create Threshold'}
                </Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      )}

      {/* THRESHOLDS TABLE */}
      <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
        <XStack backgroundColor={colors.gray[50]} padding="$3" borderBottomWidth={1} borderColor={colors.gray[200]}>
          <Text width={100} fontWeight="600" color={colors.gray[600]} fontSize={14}>State</Text>
          <Text flex={1} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="right">Threshold</Text>
          <Text width={120} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="right">Min Txns</Text>
          <Text width={120} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="right">Warning At</Text>
          <Text width={100} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="right">Actions</Text>
        </XStack>

        {loading ? (
          <YStack padding="$6" alignItems="center" justifyContent="center">
            <Spinner size="large" color={colors.green[600]} />
          </YStack>
        ) : rules.length === 0 ? (
          <YStack padding="$6" alignItems="center" justifyContent="center">
            <Text color={colors.gray[500]}>No thresholds configured. Add "_default" for the federal threshold and state-specific overrides as needed.</Text>
          </YStack>
        ) : (
          <ScrollView>
            {rules.map((rule, idx) => (
              <YStack key={rule.state_code}>
                {idx > 0 && <Separator />}
                <XStack padding="$3" paddingVertical="$3" alignItems="center" hoverStyle={{ backgroundColor: colors.gray[50] }}>
                  <XStack width={100}>
                    <XStack
                      backgroundColor={rule.state_code === '_default' ? colors.green[100] : colors.blue[100]}
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius="$2"
                    >
                      <Text fontSize={12} fontWeight="600" color={rule.state_code === '_default' ? colors.green[700] : colors.blue[700]}>
                        {rule.state_code === '_default' ? 'FEDERAL' : rule.state_code}
                      </Text>
                    </XStack>
                  </XStack>
                  <Text flex={1} textAlign="right" fontWeight="600" color={colors.gray[900]}>{formatUsd(rule.amount)}</Text>
                  <Text width={120} textAlign="right" color={colors.gray[700]}>
                    {rule.min_txns === 0 ? '—' : rule.min_txns.toLocaleString()}
                  </Text>
                  <Text width={120} textAlign="right" color={colors.gray[700]}>
                    {(rule.warn_pct * 100).toFixed(0)}% ({formatUsd(rule.amount * rule.warn_pct)})
                  </Text>
                  <XStack width={100} justifyContent="flex-end" gap="$2">
                    <Button size="$2" circular icon={Edit3} chromeless onPress={() => startEdit(rule)} />
                    <Button
                      size="$2" circular
                      icon={<Trash2 size={16} color={colors.red[500]} />}
                      chromeless
                      onPress={() => handleDelete(rule.state_code)}
                    />
                  </XStack>
                </XStack>
              </YStack>
            ))}
          </ScrollView>
        )}
      </YStack>

      {/* INFO BOX */}
      <YStack backgroundColor="#f0fdf4" padding="$4" borderRadius="$4" borderWidth={1} borderColor={colors.green[200]}>
        <Text fontWeight="bold" color={colors.green[800]}>How 1099-K Thresholds Work</Text>
        <Text fontSize={13} color={colors.green[700]} marginTop="$2">
          <Text fontWeight="bold">_default</Text> = Federal IRS threshold. Used when no state-specific override exists.
        </Text>
        <Text fontSize={13} color={colors.green[700]} marginTop="$1">
          <Text fontWeight="bold">State override</Text> = Some states (e.g. MA, VT, MD) have lower thresholds than the federal level.
        </Text>
        <Text fontSize={13} color={colors.green[700]} marginTop="$1">
          <Text fontWeight="bold">Warning</Text> = When a seller's YTD sales reach the warning % of the threshold, a yellow banner appears on their Earnings page.
        </Text>
        <Text fontSize={13} color={colors.green[700]} marginTop="$1">
          <Text fontWeight="bold">Breached</Text> = When sales exceed the threshold, a red banner warns that a 1099-K will be generated.
        </Text>
      </YStack>
    </YStack>
  )
}
