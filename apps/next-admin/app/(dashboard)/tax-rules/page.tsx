'use client'

import React, { useEffect, useState } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Separator, Spinner, Input, Label } from 'tamagui'
import { Plus, Edit3, Trash2, Receipt } from '@tamagui/lucide-icons'
import { supabase } from '@casagrown/app/features/auth/auth-hook'
import { adminApi } from '../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

type TaxRule = {
  id: string
  state_code: string
  category_name: string
  rule_type: 'fixed' | 'evaluate'
  rate_pct: number
  notes: string | null
  effective_from: string
  effective_until: string | null
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY'
]

export default function TaxRulesPage() {
  const [rules, setRules] = useState<TaxRule[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Create/Edit form state
  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formStateCode, setFormStateCode] = useState('')
  const [formCategoryName, setFormCategoryName] = useState('')
  const [formRatePct, setFormRatePct] = useState('0')
  const [formNotes, setFormNotes] = useState('')
  
  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null)

  // Categories for dropdown
  const [categories, setCategories] = useState<any[]>([])

  const fetchRules = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('category_tax_rules')
      .select('*')
      .is('effective_until', null)
      .eq('rule_type', 'fixed')
      .order('state_code')
      .order('category_name')
    
    if (data) setRules(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchRules()
    supabase.from('sales_categories').select('name').order('display_order').then(({ data }: any) => {
      if (data) setCategories(data)
    })
  }, [])

  const resetForm = () => {
    setFormStateCode('')
    setFormCategoryName('')
    setFormRatePct('0')
    setFormNotes('')
    setEditingId(null)
    setErrorMessage('')
  }

  const handleCreate = async () => {
    if (!formStateCode) {
      setErrorMessage('Please select a state.')
      return
    }
    if (!formCategoryName) {
      setErrorMessage('Please select a category.')
      return
    }
    const rateNum = parseFloat(formRatePct)
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
      setErrorMessage('Rate must be between 0 and 100.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')
    try {
      // If editing, soft-delete the old rule first
      if (editingId) {
        const { error: retireError } = await adminApi.update('category_tax_rules',
          { effective_until: new Date().toISOString().split('T')[0] },
          { eq: { id: editingId } }
        )
        if (retireError) throw new Error(retireError)
      }

      const { error } = await adminApi.insert('category_tax_rules', {
          state_code: formStateCode,
          category_name: formCategoryName,
          rule_type: 'fixed',
          rate_pct: rateNum,
          notes: formNotes.trim() || null,
          effective_from: new Date().toISOString().split('T')[0],
        })
      
      if (error) throw new Error(error)
      
      setIsAdding(false)
      resetForm()
      setSuccessMessage(`Rule saved: ${formCategoryName} in ${formStateCode} → ${rateNum === 0 ? 'Exempt' : rateNum + '%'}`)
      setTimeout(() => setSuccessMessage(''), 4000)
      fetchRules()
    } catch (e: any) {
      setErrorMessage(`Failed to save rule: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (rule: TaxRule) => {
    setErrorMessage('')
    const { error } = await adminApi.update('category_tax_rules',
      { effective_until: new Date().toISOString().split('T')[0] },
      { eq: { id: rule.id } }
    )
    
    if (error) {
      setErrorMessage(`Failed to retire rule: ${error}`)
    } else {
      setSuccessMessage(`Retired: ${rule.category_name} in ${rule.state_code}`)
      setTimeout(() => setSuccessMessage(''), 3000)
      fetchRules()
    }
  }

  const startEdit = (rule: TaxRule) => {
    setEditingId(rule.id)
    setFormStateCode(rule.state_code)
    setFormCategoryName(rule.category_name)
    setFormRatePct(rule.rate_pct?.toString() || '0')
    setFormNotes(rule.notes || '')
    setIsAdding(true)
  }

  return (
    <YStack flex={1} padding="$6" gap="$5" maxWidth={1000}>
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize="$8" fontWeight="bold" color={colors.green[900]}>Sales Tax Rules</Text>
          <Text color={colors.gray[600]}>
            Override default ZipTax rates for specific state + category combinations. Use 0% for tax-exempt categories.
          </Text>
        </YStack>
        {!isAdding && (
          <Button 
            icon={Plus} 
            backgroundColor={colors.green[600]} 
            onPress={() => { resetForm(); setIsAdding(true) }}
          >
            <Text color="white" fontWeight="600">New Rule</Text>
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

      {/* CREATE / EDIT FORM */}
      {isAdding && (
        <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$5" backgroundColor="white" borderRadius="$4" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2" borderBottomWidth={1} borderColor={colors.gray[200]} paddingBottom="$3">
              <Receipt size={20} color={colors.green[700]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>
                {editingId ? 'Edit Tax Rule' : 'Create Tax Rule'}
              </Text>
              {editingId && (
                <XStack backgroundColor={colors.blue[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" marginLeft="$2">
                  <Text fontSize="$2" color={colors.blue[700]} fontWeight="600">Editing — old rule will be retired</Text>
                </XStack>
              )}
            </XStack>

            <XStack gap="$3">
              {/* State dropdown */}
              <YStack gap="$1" width={140}>
                <Label>State *</Label>
                <XStack borderWidth={1} borderColor={colors.gray[300]} borderRadius="$3" overflow="hidden">
                  <select
                    value={formStateCode}
                    onChange={(e) => setFormStateCode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      fontSize: 14,
                      color: formStateCode ? '#1a1a1a' : '#9ca3af',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="">Select...</option>
                    {US_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </XStack>
              </YStack>

              {/* Category dropdown */}
              <YStack gap="$1" flex={2}>
                <Label>Category *</Label>
                <XStack borderWidth={1} borderColor={colors.gray[300]} borderRadius="$3" overflow="hidden">
                  <select
                    value={formCategoryName}
                    onChange={(e) => setFormCategoryName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      fontSize: 14,
                      color: formCategoryName ? '#1a1a1a' : '#9ca3af',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="">Select category...</option>
                    {categories.map((c: any) => (
                      <option key={c.name} value={c.name}>
                        {c.name.replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </XStack>
              </YStack>
            </XStack>

            {/* Tax Rate */}
            <YStack gap="$1">
              <Label>Tax Rate (%) *</Label>
              <XStack alignItems="center" gap="$2">
                <Input 
                  value={formRatePct} 
                  onChangeText={setFormRatePct} 
                  placeholder="0"
                  keyboardType="numeric"
                  width={120}
                  textAlign="center"
                />
                <Text fontSize="$3" color={colors.gray[500]}>%</Text>
                <XStack 
                  backgroundColor={parseFloat(formRatePct) === 0 ? colors.green[100] : '#fffbeb'}
                  paddingHorizontal="$2" 
                  paddingVertical="$1" 
                  borderRadius="$2"
                >
                  <Text 
                    fontSize="$2" 
                    fontWeight="600" 
                    color={parseFloat(formRatePct) === 0 ? colors.green[700] : '#d97706'}
                  >
                    {parseFloat(formRatePct) === 0 ? '← TAX EXEMPT' : `← Fixed ${formRatePct}% rate`}
                  </Text>
                </XStack>
              </XStack>
              <Text fontSize="$2" color={colors.gray[500]}>Enter 0 for exempt. Otherwise enter the fixed tax rate for this state + category.</Text>
            </YStack>

            {/* Notes */}
            <YStack gap="$1">
              <Label>Notes</Label>
              <Input 
                value={formNotes} 
                onChangeText={setFormNotes} 
                placeholder="e.g. Cottage food exempt per CA AB-626"
              />
            </YStack>

            <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
              <Button chromeless onPress={() => { setIsAdding(false); resetForm() }}>
                <Text color={colors.gray[600]}>Cancel</Text>
              </Button>
              <Button backgroundColor={colors.green[600]} onPress={handleCreate} disabled={submitting}>
                <Text color="white" fontWeight="600">
                  {submitting ? 'Saving...' : editingId ? 'Save & Replace' : 'Create Rule'}
                </Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      )}

      {/* TAX RULES TABLE */}
      <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
        <XStack backgroundColor={colors.gray[50]} padding="$3" borderBottomWidth={1} borderColor={colors.gray[200]}>
          <Text width={80} fontWeight="600" color={colors.gray[600]} fontSize={14}>State</Text>
          <Text flex={2} fontWeight="600" color={colors.gray[600]} fontSize={14}>Category</Text>
          <Text width={100} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="right">Rate</Text>
          <Text flex={2} fontWeight="600" color={colors.gray[600]} fontSize={14} paddingLeft="$3">Notes</Text>
          <Text width={100} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="right">Actions</Text>
        </XStack>
        
        {loading ? (
          <YStack padding="$6" alignItems="center" justifyContent="center">
            <Spinner size="large" color={colors.green[600]} />
          </YStack>
        ) : rules.length === 0 ? (
          <YStack padding="$6" alignItems="center" justifyContent="center">
            <Text color={colors.gray[500]}>No fixed-rate rules. Categories without rules will use ZipTax rates automatically.</Text>
          </YStack>
        ) : (
          <ScrollView>
            {rules.map((rule, idx) => (
              <YStack key={rule.id}>
                {idx > 0 && <Separator />}
                <XStack padding="$3" paddingVertical="$3" alignItems="center" hoverStyle={{ backgroundColor: colors.gray[50] }}>
                  <YStack width={80}>
                    <Text fontWeight="bold" color={colors.gray[900]}>{rule.state_code}</Text>
                  </YStack>
                  <YStack flex={2}>
                    <Text fontWeight="600" color={colors.gray[900]}>
                      {rule.category_name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </Text>
                  </YStack>
                  <XStack width={100} justifyContent="flex-end" alignItems="center">
                    {rule.rate_pct === 0 ? (
                      <XStack backgroundColor={colors.green[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2">
                        <Text fontSize={12} fontWeight="600" color={colors.green[700]}>EXEMPT</Text>
                      </XStack>
                    ) : (
                      <Text fontWeight="600" color={colors.gray[900]}>{rule.rate_pct}%</Text>
                    )}
                  </XStack>
                  <YStack flex={2} paddingLeft="$3">
                    {rule.notes ? (
                      <Text fontSize={13} color={colors.gray[500]} numberOfLines={1}>{rule.notes}</Text>
                    ) : (
                      <Text fontSize={13} color={colors.gray[300]}>—</Text>
                    )}
                  </YStack>
                  <XStack width={100} justifyContent="flex-end" gap="$2">
                    <Button size="$2" circular icon={Edit3} chromeless onPress={() => startEdit(rule)} data-testid={`tax-rule-edit-${rule.id}`} />
                    <Button 
                      size="$2" circular 
                      icon={<Trash2 size={16} color={colors.red[500]} />} 
                      chromeless 
                      onPress={() => handleDelete(rule)}
                      data-testid={`tax-rule-delete-${rule.id}`}
                    />
                  </XStack>
                </XStack>
              </YStack>
            ))}
          </ScrollView>
        )}
      </YStack>

      <YStack backgroundColor="#f0fdf4" padding="$4" borderRadius="$4" borderWidth={1} borderColor={colors.green[200]}>
        <Text fontWeight="bold" color={colors.green[800]}>How Tax Rules Work</Text>
        <Text fontSize={13} color={colors.green[700]} marginTop="$2">
          <Text fontWeight="bold">No entry</Text> = ZipTax API lookup (standard sales tax rate for the buyer's ZIP code).
        </Text>
        <Text fontSize={13} color={colors.green[700]} marginTop="$1">
          <Text fontWeight="bold">Entry with 0%</Text> = Category is tax-exempt in that state (e.g., unprocessed food in CA).
        </Text>
        <Text fontSize={13} color={colors.green[700]} marginTop="$1">
          <Text fontWeight="bold">Entry with X%</Text> = Fixed tax rate override (e.g., a flat state-wide rate for that category).
        </Text>
      </YStack>
    </YStack>
  )
}
