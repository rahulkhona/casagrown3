'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Settings, Percent, DollarSign, CreditCard } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../packages/app/features/admin/components/AdminDataGrid'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../lib/adminApi'

export default function PlatformSettingsPage() {
  const { data: historyData, loading: historyLoading, page: historyPage, next: historyNext, prev: historyPrev, hasMore: historyHasMore, hasPrev: historyHasPrev, refresh: refreshHistory } = useAdminQuery({
    table: 'subscription_tier_price_history',
    defaultSortParams: { column: 'changed_at', ascending: false }
  })

  const [settings, setSettings] = useState<any>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [gracePeriod, setGracePeriod] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  // Subscription tiers state
  const [tiers, setTiers] = useState<any[]>([])
  const [tiersLoading, setTiersLoading] = useState(true)
  const [savingTiers, setSavingTiers] = useState<Record<string, boolean>>({})

  // Create tier state
  const [isAddingTier, setIsAddingTier] = useState(false)
  const [newTierName, setNewTierName] = useState('')
  const [newTierDisplayName, setNewTierDisplayName] = useState('')
  const [newTierPrice, setNewTierPrice] = useState('0.00')
  const [newTierFee, setNewTierFee] = useState('10.00')
  const [newTierMaxBooths, setNewTierMaxBooths] = useState('1')
  const [newTierStripeHandling, setNewTierStripeHandling] = useState('pass_through')
  const [newTierError, setNewTierError] = useState('')
  const [submittingTier, setSubmittingTier] = useState(false)
  const [newTierFeatures, setNewTierFeatures] = useState<Record<string, boolean>>({
    facebook_sync: false,
    growbot_copilot: false
  })
  const [newTierOffered, setNewTierOffered] = useState(true)

  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    loadSettings()
    loadTiers()
  }, [])

  const loadTiers = async () => {
    setTiersLoading(true)
    try {
      const { data, error } = await adminApi.select('subscription_tiers', '*', undefined, { order: { column: 'subscription_price', ascending: true } })
      if (!error && data) {
        setTiers(data)
      }
    } catch (e) {
      console.error('Failed to load subscription tiers:', e)
    } finally {
      setTiersLoading(false)
    }
  }

  const handleTierChange = (tierName: string, field: string, value: any) => {
    setTiers(prev => prev.map(t => {
      if (t.tier_name === tierName) {
        if (field.startsWith('features.')) {
          const featureKey = field.split('.')[1]
          return {
            ...t,
            features: {
              ...t.features,
              [featureKey]: value
            }
          }
        }
        return { ...t, [field]: value }
      }
      return t
    }))
  }

  const handleSaveTier = async (tier: any) => {
    // Validation: at most one tier can have a blank/empty display name
    const hasBlankDisplayName = !tier.display_name || tier.display_name.trim() === ''
    if (hasBlankDisplayName) {
      const alreadyHasBlank = tiers.some(t => t.tier_name !== tier.tier_name && (!t.display_name || t.display_name.trim() === ''))
      if (alreadyHasBlank) {
        setToast('Error: Only one subscription tier can have a blank display name.')
        setToastType('error')
        setTimeout(() => setToast(''), 5000)
        return
      }
    }

    setSavingTiers(prev => ({ ...prev, [tier.tier_name]: true }))
    try {
      const { error } = await adminApi.update(
        'subscription_tiers',
        {
          display_name: tier.display_name.trim(),
          subscription_price: parseFloat(tier.subscription_price),
          platform_fee_pct: parseFloat(tier.platform_fee_pct),
          max_booths: parseInt(tier.max_booths),
          stripe_fee_handling: tier.stripe_fee_handling,
          offered: tier.offered !== false, // default to true if undefined
          features: tier.features,
          updated_at: new Date().toISOString()
        },
        { eq: { tier_name: tier.tier_name } }
      )
      
      if (error) {
        setToast(`Error saving tier ${tier.display_name || tier.tier_name}: ${error}`)
        setToastType('error')
      } else {
        setToast(`Tier ${tier.display_name || tier.tier_name} saved successfully!`)
        setToastType('success')
        
        // Synchronize settings table standard/pro rates if they match
        if (tier.tier_name === 'lite') {
          await adminApi.update('platform_settings', { standard_platform_fee: parseFloat(tier.platform_fee_pct) / 100 }, { eq: { id: settings?.id } })
        } else if (tier.tier_name === 'pro') {
          await adminApi.update('platform_settings', { 
            pro_platform_fee: parseFloat(tier.platform_fee_pct) / 100,
            pro_monthly_price_usd: parseFloat(tier.subscription_price)
          }, { eq: { id: settings?.id } })
        }
        loadSettings() // refresh settings values
        refreshHistory() // refresh history grid
      }
    } catch (e: any) {
      setToast(`Error saving tier: ${e.message}`)
      setToastType('error')
    } finally {
      setSavingTiers(prev => ({ ...prev, [tier.tier_name]: false }))
      setTimeout(() => setToast(''), 5000)
    }
  }

  const handleCreateTier = async () => {
    if (!newTierName.trim()) {
      setNewTierError('Please enter a unique Tier Name.')
      return
    }
    if (!/^[a-z0-9_]+$/.test(newTierName.trim())) {
      setNewTierError('Tier Name must be lowercase, alphanumeric, and can contain underscores.')
      return
    }

    // Validation: at most one tier can have a blank/empty display name
    const hasBlankDisplayName = newTierDisplayName.trim() === ''
    if (hasBlankDisplayName) {
      const alreadyHasBlank = tiers.some(t => !t.display_name || t.display_name.trim() === '')
      if (alreadyHasBlank) {
        setNewTierError('Only one subscription tier can have a blank display name.')
        return
      }
    }

    setSubmittingTier(true)
    setNewTierError('')

    try {
      const { error } = await adminApi.insert('subscription_tiers', {
        tier_name: newTierName.trim(),
        display_name: newTierDisplayName.trim(),
        subscription_price: parseFloat(newTierPrice) || 0.00,
        platform_fee_pct: parseFloat(newTierFee) || 0.00,
        max_booths: parseInt(newTierMaxBooths) || 1,
        stripe_fee_handling: newTierStripeHandling,
        offered: newTierOffered,
        features: {
          ...newTierFeatures,
          max_booths: parseInt(newTierMaxBooths) || 1
        }
      })

      if (error) throw new Error(error)

      setToast('Subscription tier created successfully!')
      setToastType('success')
      setIsAddingTier(false)
      
      // Reset form
      setNewTierName('')
      setNewTierDisplayName('')
      setNewTierPrice('0.00')
      setNewTierFee('10.00')
      setNewTierMaxBooths('1')
      setNewTierStripeHandling('pass_through')
      setNewTierOffered(true)
      setNewTierFeatures({
        facebook_sync: false,
        growbot_copilot: false
      })
      setNewTierError('')

      loadTiers()
      refreshHistory()
    } catch (e: any) {
      setNewTierError(`Failed to create tier: ${e.message}`)
    } finally {
      setSubmittingTier(false)
      setTimeout(() => setToast(''), 5000)
    }
  }

  const handleDeleteTier = async (tierName: string) => {
    if (['lite', 'pro', 'elite'].includes(tierName)) {
      setToast(`Error: System-critical tier "${tierName}" cannot be deleted.`)
      setToastType('error')
      setTimeout(() => setToast(''), 5000)
      return
    }

    if (!window.confirm(`Are you sure you want to delete the subscription tier "${tierName}"?`)) {
      return
    }

    try {
      const { error } = await adminApi.delete('subscription_tiers', { eq: { tier_name: tierName } })
      if (error) {
        setToast(`Error deleting tier: ${error}`)
        setToastType('error')
      } else {
        setToast(`Tier "${tierName}" deleted successfully!`)
        setToastType('success')
        loadTiers()
        refreshHistory()
      }
    } catch (e: any) {
      setToast(`Error deleting tier: ${e.message}`)
      setToastType('error')
    } finally {
      setTimeout(() => setToast(''), 5000)
    }
  }

  const loadSettings = async () => {
    setSettingsLoading(true)
    try {
      const { data, error } = await adminApi.select('platform_settings', '*', undefined, { limit: 1, single: true })
      if (error) {
        console.error('Failed to load platform settings:', error)
      }
      if (data) {
        setSettings(data)
        setGracePeriod(((data.provider_grace_period_ms ?? 300000) / 60000).toString()) // convert to minutes
      }
    } catch (e) {
      console.error('Failed to load platform settings:', e)
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    if (!settings) return
    setSavingSettings(true)
    const ms = parseInt(gracePeriod) * 60000
    const { error } = await adminApi.update(
      'platform_settings',
      {
        provider_grace_period_ms: ms,
        updated_at: new Date().toISOString()
      },
      { eq: { id: settings.id } }
    )
    
    if (error) {
      setToast(`Error saving settings: ${error}`)
      setToastType('error')
    } else {
      setToast('Platform settings saved successfully!')
      setToastType('success')
    }
    setSavingSettings(false)
    setTimeout(() => setToast(''), 5000)
  }

  const handleCreateFee = async () => {
    if (!feePercentage.trim() || isNaN(parseFloat(feePercentage))) {
      setFeeError('Please enter a valid standard fee percentage.')
      return
    }
    if (!feeProPercentage.trim() || isNaN(parseFloat(feeProPercentage))) {
      setFeeError('Please enter a valid Pro fee percentage.')
      return
    }
    setSubmittingFee(true)
    setFeeError('')
    try {
      const { error } = await adminApi.insert('platform_fees', {
        country_code: 'USA',
        fees: parseFloat(feePercentage) / 100,
        free_fee_pct: parseFloat(feePercentage),
        pro_fee_pct: parseFloat(feeProPercentage),
        pro_sub_price: feeSubPrice ? parseFloat(feeSubPrice) : null,
        stripe_fee_handling: feeStripeHandling,
      })
      if (error) throw new Error(error)
      setIsAddingFee(false)
      setFeePercentage('')
      setFeeProPercentage('')
      setFeeSubPrice('')
      setFeeStripeHandling('pass_through')
      setFeeError('')
      refreshFees()
    } catch (e: any) {
      setFeeError(`Failed to apply fee: ${e.message}`)
    } finally {
      setSubmittingFee(false)
    }
  }

  const feeColumns: ColumnDef<any>[] = [
    {
      header: 'Country',
      accessorKey: 'country_code',
      flex: 0.6,
    },
    {
      header: 'Standard (Free)',
      accessorKey: 'free_fee_pct',
      flex: 0.8,
      cell: (item) => <Text>{item.free_fee_pct != null ? `${item.free_fee_pct}%` : `${(item.fees * 100).toFixed(1)}%`}</Text>
    },
    {
      header: 'Pro',
      accessorKey: 'pro_fee_pct',
      flex: 0.6,
      cell: (item) => <Text>{item.pro_fee_pct != null ? `${item.pro_fee_pct}%` : '—'}</Text>
    },
    {
      header: 'Sub Price',
      accessorKey: 'pro_sub_price',
      flex: 0.7,
      cell: (item) => <Text>{item.pro_sub_price != null ? `$${item.pro_sub_price}/mo` : '—'}</Text>
    },
    {
      header: 'Stripe Fees',
      accessorKey: 'stripe_fee_handling',
      flex: 0.8,
      cell: (item) => <Text>{item.stripe_fee_handling === 'absorb' ? 'Absorbed' : item.stripe_fee_handling === 'pass_through' ? 'Pass-through' : '—'}</Text>
    },
    {
      header: 'Effective Date',
      accessorKey: 'creation_date',
      flex: 1,
      cell: (item) => <Text>{new Date(item.creation_date).toLocaleString()}</Text>
    },
  ]

  const historyColumns: ColumnDef<any>[] = [
    {
      header: 'Tier Name',
      accessorKey: 'tier_name',
      flex: 0.8,
      cell: (item) => <Text textTransform="capitalize" fontWeight="600">{item.tier_name}</Text>
    },
    {
      header: 'Old Price',
      accessorKey: 'old_price',
      flex: 0.8,
      cell: (item) => <Text>{item.old_price != null ? `$${parseFloat(item.old_price).toFixed(2)}/mo` : '—'}</Text>
    },
    {
      header: 'New Price',
      accessorKey: 'new_price',
      flex: 0.8,
      cell: (item) => <Text fontWeight="600" color={colors.green[700]}>${parseFloat(item.new_price).toFixed(2)}/mo</Text>
    },
    {
      header: 'Old platform_fee %',
      accessorKey: 'old_platform_fee',
      flex: 1.0,
      cell: (item) => <Text>{item.old_platform_fee != null ? `${parseFloat(item.old_platform_fee).toFixed(1)}%` : '—'}</Text>
    },
    {
      header: 'New platform_fee %',
      accessorKey: 'new_platform_fee',
      flex: 1.0,
      cell: (item) => <Text fontWeight="600" color={colors.green[700]}>{parseFloat(item.new_platform_fee).toFixed(1)}%</Text>
    },
    {
      header: 'Change Date',
      accessorKey: 'changed_at',
      flex: 1.2,
      cell: (item) => <Text>{new Date(item.changed_at).toLocaleString()}</Text>
    },
  ]

  const renderFeatureToggle = (tier: any, key: string, label: string) => {
    const isEnabled = tier.features?.[key] === true
    return (
      <XStack
        alignItems="center" gap="$2" cursor="pointer"
        onPress={() => handleTierChange(tier.tier_name, `features.${key}`, !isEnabled)}
        style={{ marginBottom: 4 }}
      >
        <YStack
          width={18} height={18} borderRadius={4}
          borderWidth={2}
          borderColor={isEnabled ? colors.green[600] : colors.gray[300]}
          alignItems="center" justifyContent="center"
          backgroundColor={isEnabled ? colors.green[50] : 'transparent'}
        >
          {isEnabled && (
            <YStack width={10} height={10} borderRadius={2} backgroundColor={colors.green[600]} />
          )}
        </YStack>
        <Text fontSize="$3" fontWeight="500" color={colors.gray[700]}>{label}</Text>
      </XStack>
    )
  }

  const renderNewTierFeatureToggle = (key: string, label: string) => {
    const isEnabled = newTierFeatures[key] === true
    return (
      <XStack
        alignItems="center" gap="$2" cursor="pointer"
        onPress={() => setNewTierFeatures(prev => ({ ...prev, [key]: !isEnabled }))}
        style={{ marginBottom: 4 }}
      >
        <YStack
          width={18} height={18} borderRadius={4}
          borderWidth={2}
          borderColor={isEnabled ? colors.green[600] : colors.gray[300]}
          alignItems="center" justifyContent="center"
          backgroundColor={isEnabled ? colors.green[50] : 'transparent'}
        >
          {isEnabled && (
            <YStack width={10} height={10} borderRadius={2} backgroundColor={colors.green[600]} />
          )}
        </YStack>
        <Text fontSize="$3" fontWeight="500" color={colors.gray[700]}>{label}</Text>
      </XStack>
    )
  }

  return (
    <YStack flex={1} padding="$4" gap="$6">

      {/* Toast notification */}
      {toast ? (
        <YStack
          backgroundColor={toastType === 'success' ? colors.green[50] : colors.red[50]}
          padding="$3" borderRadius="$2" borderWidth={1}
          borderColor={toastType === 'success' ? colors.green[200] : colors.red[200]}
        >
          <Text color={toastType === 'success' ? colors.green[800] : colors.red[800]} fontWeight="600">
            {toast}
          </Text>
        </YStack>
      ) : null}
      
      {/* Platform Settings Section */}
      <YStack gap="$4">
        <XStack alignItems="center" gap="$2">
          <Settings size={24} color={colors.green[800]} />
          <YStack>
            <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Global Platform Settings</Text>
            <Text fontSize="$3" color={colors.gray[600]}>Core operational configuration</Text>
          </YStack>
        </XStack>

        <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$4" backgroundColor="white" borderRadius="$4" elevation="$1">
          {settingsLoading ? (
            <Text>Loading settings...</Text>
          ) : (
            <YStack gap="$4">
              <YStack gap="$2">
                <Text fontWeight="600" color={colors.gray[800]}>Disabled Provider Grace Period (Minutes)</Text>
                <Input 
                  value={gracePeriod}
                  onChangeText={setGracePeriod}
                  keyboardType="numeric"
                  width={200}
                />
                <Text fontSize="$2" color={colors.gray[500]}>
                  How long a disabled redemption provider (PayPal, gift cards, donations) can still process in-flight transactions before fully blocking.
                </Text>
              </YStack>

              <Button 
                alignSelf="flex-start" 
                backgroundColor={colors.green[600]} 
                onPress={async () => {
                  if (!settings) return
                  setSavingSettings(true)
                  try {
                    const { error } = await adminApi.update(
                      'platform_settings',
                      {
                        provider_grace_period_ms: parseInt(gracePeriod) * 60000,
                        updated_at: new Date().toISOString(),
                      },
                      { eq: { id: settings.id } }
                    )
                    if (error) throw new Error(typeof error === 'string' ? error : JSON.stringify(error))

                    setToast('Settings saved successfully!')
                    setToastType('success')
                  } catch (e: any) {
                    setToast(`Error saving settings: ${e.message}`)
                    setToastType('error')
                  }
                  setSavingSettings(false)
                  setTimeout(() => setToast(''), 5000)
                }}
                disabled={savingSettings}
              >
                <Text color="white" fontWeight="600">{savingSettings ? 'Saving...' : 'Save Settings'}</Text>
              </Button>
            </YStack>
          )}
        </YStack>
      </YStack>

      <YStack height={1} backgroundColor={colors.gray[200]} marginVertical="$2" />

      {/* Subscription Tiers & Packages Configuration Section */}
      <YStack gap="$4">
        <XStack justifyContent="space-between" alignItems="center">
          <XStack alignItems="center" gap="$2">
            <CreditCard size={24} color={colors.green[800]} />
            <YStack>
              <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Subscription Packages & Tiers</Text>
              <Text fontSize="$3" color={colors.gray[600]}>Configure features, rates, and limits for Lite, Pro, Elite, and custom tiers</Text>
            </YStack>
          </XStack>
          {!isAddingTier && (
            <Button 
              backgroundColor={colors.green[600]} 
              icon={<Plus size={16} color="white" />} 
              onPress={() => setIsAddingTier(true)}
            >
              <Text color="white" fontWeight="600">Create New Tier</Text>
            </Button>
          )}
        </XStack>

        {isAddingTier && (
          <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$4" backgroundColor="white" borderRadius="$4" elevation="$1">
            <YStack gap="$4">
              <Text fontSize="$5" fontWeight="600" color={colors.green[800]}>Create New Subscription Tier</Text>
              
              {newTierError ? (
                <YStack backgroundColor={colors.red[50]} padding="$2" borderRadius="$2" borderWidth={1} borderColor={colors.red[200]}>
                  <Text color={colors.red[800]} fontSize="$3">{newTierError}</Text>
                </YStack>
              ) : null}

              <XStack flexWrap="wrap" gap="$3">
                <YStack flex={1} minWidth={200} gap="$1">
                  <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Tier Name (Unique Key) *</Text>
                  <Input
                    value={newTierName}
                    onChangeText={setNewTierName}
                    placeholder="e.g. gold (lowercase only)"
                    size="$3"
                  />
                </YStack>

                <YStack flex={1} minWidth={200} gap="$1">
                  <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Display Name</Text>
                  <Input
                    value={newTierDisplayName}
                    onChangeText={setNewTierDisplayName}
                    placeholder="Optional for only one tier"
                    size="$3"
                  />
                </YStack>
              </XStack>

              <XStack flexWrap="wrap" gap="$3">
                <YStack flex={1} minWidth={150} gap="$1">
                  <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Monthly Price (USD)</Text>
                  <XStack alignItems="center" gap="$2">
                    <Text color={colors.gray[400]}>$</Text>
                    <Input
                      value={newTierPrice}
                      onChangeText={setNewTierPrice}
                      keyboardType="numeric"
                      size="$3"
                      flex={1}
                    />
                  </XStack>
                </YStack>

                <YStack flex={1} minWidth={150} gap="$1">
                  <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Platform Sales Fee (%)</Text>
                  <XStack alignItems="center" gap="$2">
                    <Input
                      value={newTierFee}
                      onChangeText={setNewTierFee}
                      keyboardType="numeric"
                      size="$3"
                      flex={1}
                    />
                    <Text color={colors.gray[400]}>%</Text>
                  </XStack>
                </YStack>

              </XStack>

              <YStack gap="$1">
                <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Stripe Fee Handling</Text>
                <XStack gap="$4">
                  <XStack alignItems="center" gap="$2" cursor="pointer" onPress={() => setNewTierStripeHandling('pass_through')}>
                    <YStack width={16} height={16} borderRadius={8} borderWidth={2}
                      borderColor={newTierStripeHandling === 'pass_through' ? colors.green[600] : colors.gray[300]}
                      alignItems="center" justifyContent="center"
                    >
                      {newTierStripeHandling === 'pass_through' && <YStack width={8} height={8} borderRadius={4} backgroundColor={colors.green[600]} />}
                    </YStack>
                    <Text fontSize="$3" fontWeight="500">Pass-through (Deducted from payouts)</Text>
                  </XStack>
                  <XStack alignItems="center" gap="$2" cursor="pointer" onPress={() => setNewTierStripeHandling('absorb')}>
                    <YStack width={16} height={16} borderRadius={8} borderWidth={2}
                      borderColor={newTierStripeHandling === 'absorb' ? colors.green[600] : colors.gray[300]}
                      alignItems="center" justifyContent="center"
                    >
                      {newTierStripeHandling === 'absorb' && <YStack width={8} height={8} borderRadius={4} backgroundColor={colors.green[600]} />}
                    </YStack>
                    <Text fontSize="$3" fontWeight="500">Absorb (Absorbed by platform)</Text>
                  </XStack>
                </XStack>
              </YStack>

              {/* Dynamic Feature Flags & Limits */}
              <YStack gap="$3" marginTop="$2" borderTopWidth={1} borderTopColor={colors.gray[200]} paddingTop="$3">
                <Text fontWeight="700" fontSize="$3.5" color={colors.green[800]} letterSpacing={0.5}>PLAN LIMITS & FEATURE FLAGS</Text>
                
                <XStack alignItems="center" justifyContent="space-between" maxWidth={400} style={{ marginBottom: 6 }}>
                  <Text fontSize="$3" fontWeight="600" color={colors.gray[700]}>Offer / Enable this Tier</Text>
                  <XStack
                    width={18} height={18} borderRadius={4}
                    borderWidth={2}
                    borderColor={newTierOffered ? colors.green[600] : colors.gray[300]}
                    alignItems="center" justifyContent="center"
                    backgroundColor={newTierOffered ? colors.green[50] : 'transparent'}
                    cursor="pointer"
                    onPress={() => setNewTierOffered(!newTierOffered)}
                  >
                    {newTierOffered && <YStack width={10} height={10} borderRadius={2} backgroundColor={colors.green[600]} />}
                  </XStack>
                </XStack>

                <XStack alignItems="center" justifyContent="space-between" maxWidth={400} style={{ marginBottom: 6 }}>
                  <YStack>
                    <Text fontSize="$3" fontWeight="600" color={colors.gray[700]}>Max Booths / Stands Limit *</Text>
                    <Text fontSize="$2.5" color={colors.gray[500]}>Enter -1 for unlimited</Text>
                  </YStack>
                  <Input
                    value={newTierMaxBooths}
                    onChangeText={setNewTierMaxBooths}
                    keyboardType="numeric"
                    size="$2.5"
                    width={80}
                    textAlign="center"
                  />
                </XStack>

                <YStack gap="$2">
                  {renderNewTierFeatureToggle('facebook_sync', 'Facebook Catalog Sync')}
                  {renderNewTierFeatureToggle('growbot_copilot', 'GrowBot Copilot Auto-Replies')}
                </YStack>
              </YStack>

              <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
                <Button chromeless onPress={() => { setIsAddingTier(false); setNewTierError(''); setNewTierName(''); setNewTierDisplayName(''); }}>Cancel</Button>
                <Button backgroundColor={colors.green[600]} onPress={handleCreateTier} disabled={submittingTier}>
                  <Text color="white" fontWeight="600">{submittingTier ? 'Creating...' : 'Create Tier'}</Text>
                </Button>
              </XStack>
            </YStack>
          </YStack>
        )}

        {tiersLoading ? (
          <Text>Loading subscription tiers...</Text>
        ) : (
          <XStack flexWrap="wrap" gap="$4">
            {tiers.map((tier) => {
              const isSaving = savingTiers[tier.tier_name] === true
              return (
                <YStack 
                  key={tier.tier_name} 
                  flex={1} 
                  minWidth={320} 
                  maxWidth={380} 
                  borderWidth={1} 
                  borderColor={colors.gray[200]} 
                  padding="$4" 
                  backgroundColor="white" 
                  borderRadius="$4" 
                  elevation="$1"
                  gap="$4"
                >
                  {/* Header Tag */}
                  <XStack justifyContent="space-between" alignItems="center" borderBottomWidth={1} borderBottomColor={colors.gray[100]} paddingBottom="$2">
                    <XStack alignItems="center" gap="$2">
                      <Text fontSize="$5" fontWeight="700" color={colors.green[800]} textTransform="capitalize">
                        {tier.tier_name}
                      </Text>
                      {!['lite', 'pro', 'elite'].includes(tier.tier_name) && (
                        <Button 
                          circular 
                          size="$2" 
                          chromeless 
                          icon={<Trash2 size={14} color={colors.red[600]} />} 
                          onPress={() => handleDeleteTier(tier.tier_name)}
                          hoverStyle={{ backgroundColor: colors.red[50] }}
                        />
                      )}
                    </XStack>
                    <XStack 
                      backgroundColor={tier.offered !== false ? colors.green[50] : colors.gray[100]} 
                      paddingHorizontal="$2.5" 
                      paddingVertical="$1" 
                      borderRadius="$2"
                    >
                      <Text 
                        fontSize="$2.5" 
                        fontWeight="700" 
                        color={tier.offered !== false ? colors.green[700] : colors.gray[600]}
                      >
                        {tier.offered !== false ? 'Active' : 'Hidden'}
                      </Text>
                    </XStack>
                  </XStack>

                  {/* Fields */}
                  <YStack gap="$3">
                    <YStack gap="$1">
                      <Text fontSize="$2.5" fontWeight="600" color={colors.gray[500]}>Display Name</Text>
                      <Input 
                        value={tier.display_name} 
                        onChangeText={(val) => handleTierChange(tier.tier_name, 'display_name', val)} 
                        placeholder="Optional for only one tier"
                        size="$3"
                      />
                    </YStack>

                    <YStack gap="$1">
                      <Text fontSize="$2.5" fontWeight="600" color={colors.gray[500]}>Monthly Price (USD)</Text>
                      <XStack alignItems="center" gap="$2">
                        <Text color={colors.gray[400]}>$</Text>
                        <Input 
                          value={tier.subscription_price?.toString()} 
                          onChangeText={(val) => handleTierChange(tier.tier_name, 'subscription_price', val)} 
                          keyboardType="numeric"
                          size="$3"
                          flex={1}
                        />
                        <Text fontSize="$3" color={colors.gray[400]}>/ mo</Text>
                      </XStack>
                    </YStack>

                    <YStack gap="$1">
                      <Text fontSize="$2.5" fontWeight="600" color={colors.gray[500]}>Platform Sales Fee (%)</Text>
                      <XStack alignItems="center" gap="$2">
                        <Input 
                          value={tier.platform_fee_pct?.toString()} 
                          onChangeText={(val) => handleTierChange(tier.tier_name, 'platform_fee_pct', val)} 
                          keyboardType="numeric"
                          size="$3"
                          flex={1}
                        />
                        <Text fontSize="$3" color={colors.gray[400]}>%</Text>
                      </XStack>
                    </YStack>

                    <YStack gap="$2">
                      <Text fontSize="$2.5" fontWeight="600" color={colors.gray[500]}>Stripe Fee Handling</Text>
                      <XStack gap="$3">
                        <XStack alignItems="center" gap="$1.5" cursor="pointer" onPress={() => handleTierChange(tier.tier_name, 'stripe_fee_handling', 'pass_through')}>
                          <YStack width={14} height={14} borderRadius={7} borderWidth={2}
                            borderColor={tier.stripe_fee_handling === 'pass_through' ? colors.green[600] : colors.gray[300]}
                            alignItems="center" justifyContent="center"
                          >
                            {tier.stripe_fee_handling === 'pass_through' && <YStack width={6} height={6} borderRadius={3} backgroundColor={colors.green[600]} />}
                          </YStack>
                          <Text fontSize="$2.5" fontWeight="500">Pass-through</Text>
                        </XStack>
                        <XStack alignItems="center" gap="$1.5" cursor="pointer" onPress={() => handleTierChange(tier.tier_name, 'stripe_fee_handling', 'absorb')}>
                          <YStack width={14} height={14} borderRadius={7} borderWidth={2}
                            borderColor={tier.stripe_fee_handling === 'absorb' ? colors.green[600] : colors.gray[300]}
                            alignItems="center" justifyContent="center"
                          >
                            {tier.stripe_fee_handling === 'absorb' && <YStack width={6} height={6} borderRadius={3} backgroundColor={colors.green[600]} />}
                          </YStack>
                          <Text fontSize="$2.5" fontWeight="500">Absorbed</Text>
                        </XStack>
                      </XStack>
                    </YStack>

                    <YStack gap="$2.5" marginTop="$2" borderTopWidth={1} borderTopColor={colors.gray[100]} paddingTop="$3">
                      <Text fontSize="$2.5" fontWeight="700" color={colors.gray[400]} letterSpacing={0.5}>PLAN LIMITS & FEATURE FLAGS</Text>
                      
                      <XStack alignItems="center" justifyContent="space-between" style={{ marginBottom: 6 }}>
                        <Text fontSize="$2.5" fontWeight="600" color={colors.gray[600]}>Offer / Enable this Tier</Text>
                        <XStack
                          width={16} height={16} borderRadius={4}
                          borderWidth={2}
                          borderColor={tier.offered !== false ? colors.green[600] : colors.gray[300]}
                          alignItems="center" justifyContent="center"
                          backgroundColor={tier.offered !== false ? colors.green[50] : 'transparent'}
                          cursor="pointer"
                          onPress={() => handleTierChange(tier.tier_name, 'offered', tier.offered === false)}
                        >
                          {tier.offered !== false && <YStack width={8} height={8} borderRadius={2} backgroundColor={colors.green[600]} />}
                        </XStack>
                      </XStack>

                      <XStack alignItems="center" justifyContent="space-between" style={{ marginBottom: 6 }}>
                        <YStack>
                          <Text fontSize="$2.5" fontWeight="600" color={colors.gray[600]}>Max Booths / Stands Limit *</Text>
                          <Text fontSize="$2" color={colors.gray[500]}>Enter -1 for unlimited</Text>
                        </YStack>
                        <Input 
                          value={tier.max_booths?.toString()} 
                          onChangeText={(val) => {
                            handleTierChange(tier.tier_name, 'max_booths', val);
                            handleTierChange(tier.tier_name, 'features.max_booths', parseInt(val) || 1);
                          }} 
                          keyboardType="numeric"
                          size="$2.5"
                          width={70}
                          textAlign="center"
                        />
                      </XStack>

                      {renderFeatureToggle(tier, 'facebook_sync', 'Facebook Catalog Sync')}
                      {renderFeatureToggle(tier, 'growbot_copilot', 'GrowBot Copilot Auto-Replies')}
                    </YStack>
                  </YStack>

                  {/* Save Button */}
                  <Button 
                    backgroundColor={colors.green[600]} 
                    size="$3" 
                    onPress={() => handleSaveTier(tier)}
                    disabled={isSaving}
                    marginTop="auto"
                  >
                    <Text color="white" fontWeight="600">
                      {isSaving ? 'Saving...' : `Save ${tier.display_name || tier.tier_name} Settings`}
                    </Text>
                  </Button>
                </YStack>
              )
            })}
          </XStack>
        )}
      </YStack>

      <YStack height={1} backgroundColor={colors.gray[200]} marginVertical="$2" />

      {/* Pricing Change History Section */}
      <YStack gap="$4">
        <XStack alignItems="center" gap="$2">
          <DollarSign size={24} color={colors.green[800]} />
          <YStack>
            <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Pricing & Platform Fee History</Text>
            <Text fontSize="$3" color={colors.gray[600]}>Audit ledger of price changes for all subscription tiers</Text>
          </YStack>
        </XStack>

        <AdminDataGrid 
          data={historyData} 
          columns={historyColumns} 
          isLoading={historyLoading}
          page={historyPage}
          hasMore={historyHasMore}
          hasPrev={historyHasPrev}
          onNextPage={historyNext}
          onPrevPage={historyPrev}
          emptyMessage="No pricing history records found."
        />
      </YStack>

    </YStack>
  )
}
