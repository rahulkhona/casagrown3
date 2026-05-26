'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Settings, Percent, DollarSign } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../packages/app/features/admin/components/AdminDataGrid'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../lib/adminApi'

export default function PlatformSettingsPage() {
  const { data: feesData, loading: feesLoading, page, next, prev, hasMore, hasPrev, refresh: refreshFees } = useAdminQuery({
    table: 'platform_fees',
    defaultSortParams: { column: 'creation_date', ascending: false }
  })

  const [settings, setSettings] = useState<any>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [gracePeriod, setGracePeriod] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  // Pro pricing state
  const [proMonthlyPrice, setProMonthlyPrice] = useState('')
  const [standardFee, setStandardFee] = useState('')
  const [proFee, setProFee] = useState('')
  const [stripeFeeHandling, setStripeFeeHandling] = useState('pass_through')
  const [freeTrialDays, setFreeTrialDays] = useState('0')
  const [savingPricing, setSavingPricing] = useState(false)

  const [isAddingFee, setIsAddingFee] = useState(false)
  const [submittingFee, setSubmittingFee] = useState(false)
  const [feePercentage, setFeePercentage] = useState('')
  const [feeProPercentage, setFeeProPercentage] = useState('')
  const [feeSubPrice, setFeeSubPrice] = useState('')
  const [feeStripeHandling, setFeeStripeHandling] = useState('pass_through')
  const [feeError, setFeeError] = useState('')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    loadSettings()
  }, [])

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
        setProMonthlyPrice(data.pro_monthly_price_usd?.toString() || '10.00')
        setStandardFee(((data.standard_platform_fee || 0.1) * 100).toString())
        setProFee(((data.pro_platform_fee || 0.02) * 100).toString())
        setStripeFeeHandling(data.pro_stripe_fee_handling || 'pass_through')
        setFreeTrialDays((data.pro_free_trial_days ?? 0).toString())
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

              <YStack gap="$2">
                <Text fontWeight="600" color={colors.gray[800]}>Pro Monthly Subscription Price</Text>
                <XStack alignItems="center" gap="$2">
                  <Text fontSize="$4" color={colors.gray[600]}>$</Text>
                  <Input
                    value={proMonthlyPrice}
                    onChangeText={setProMonthlyPrice}
                    keyboardType="numeric"
                    placeholder="10.00"
                    width={150}
                  />
                  <Text fontSize="$3" color={colors.gray[500]}>/ month</Text>
                </XStack>
              </YStack>

              {/* Standard Platform Fee */}
              <YStack gap="$2">
                <Text fontWeight="600" color={colors.gray[800]}>Standard Platform Fee (non-Pro sellers)</Text>
                <XStack alignItems="center" gap="$2">
                  <Input
                    value={standardFee}
                    onChangeText={setStandardFee}
                    keyboardType="numeric"
                    placeholder="10"
                    width={150}
                  />
                  <Text fontSize="$3" color={colors.gray[500]}>%</Text>
                </XStack>
                <Text fontSize="$2" color={colors.gray[500]}>Stripe processing fee is always absorbed by CasaGrown for standard sellers.</Text>
              </YStack>

              {/* Pro Platform Fee */}
              <YStack gap="$2">
                <Text fontWeight="600" color={colors.gray[800]}>Pro Platform Fee (Pro sellers)</Text>
                <XStack alignItems="center" gap="$2">
                  <Input
                    value={proFee}
                    onChangeText={setProFee}
                    keyboardType="numeric"
                    placeholder="2"
                    width={150}
                  />
                  <Text fontSize="$3" color={colors.gray[500]}>%</Text>
                </XStack>
              </YStack>

              {/* Stripe Fee Handling */}
              <YStack gap="$2">
                <Text fontWeight="600" color={colors.gray[800]}>Stripe Fee Handling (Pro sellers)</Text>
                <XStack gap="$4">
                  <XStack
                    alignItems="center" gap="$2" cursor="pointer"
                    onPress={() => setStripeFeeHandling('pass_through')}
                  >
                    <YStack
                      width={18} height={18} borderRadius={9}
                      borderWidth={2}
                      borderColor={stripeFeeHandling === 'pass_through' ? colors.green[600] : colors.gray[300]}
                      alignItems="center" justifyContent="center"
                    >
                      {stripeFeeHandling === 'pass_through' && (
                        <YStack width={10} height={10} borderRadius={5} backgroundColor={colors.green[600]} />
                      )}
                    </YStack>
                    <YStack>
                      <Text fontSize="$3" fontWeight="500">Pass-through</Text>
                      <Text fontSize="$2" color={colors.gray[500]}>Deducted from seller payout</Text>
                    </YStack>
                  </XStack>

                  <XStack
                    alignItems="center" gap="$2" cursor="pointer"
                    onPress={() => setStripeFeeHandling('absorb')}
                  >
                    <YStack
                      width={18} height={18} borderRadius={9}
                      borderWidth={2}
                      borderColor={stripeFeeHandling === 'absorb' ? colors.green[600] : colors.gray[300]}
                      alignItems="center" justifyContent="center"
                    >
                      {stripeFeeHandling === 'absorb' && (
                        <YStack width={10} height={10} borderRadius={5} backgroundColor={colors.green[600]} />
                      )}
                    </YStack>
                    <YStack>
                      <Text fontSize="$3" fontWeight="500">Absorb</Text>
                      <Text fontSize="$2" color={colors.gray[500]}>CasaGrown absorbs the Stripe fee</Text>
                    </YStack>
                  </XStack>
                </XStack>
              </YStack>

              {/* Free Trial Days */}
              <YStack gap="$2">
                <Text fontWeight="600" color={colors.gray[800]}>Pro Free Trial Days</Text>
                <XStack alignItems="center" gap="$2">
                  <Input
                    value={freeTrialDays}
                    onChangeText={setFreeTrialDays}
                    keyboardType="numeric"
                    placeholder="0"
                    width={150}
                  />
                  <Text fontSize="$3" color={colors.gray[500]}>days</Text>
                </XStack>
                <Text fontSize="$2" color={colors.gray[500]}>Set to 0 for no free trial. Users will see "Subscribe Now" instead of "Start Free Trial".</Text>
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
                        pro_monthly_price_usd: parseFloat(proMonthlyPrice),
                        standard_platform_fee: parseFloat(standardFee) / 100,
                        pro_platform_fee: parseFloat(proFee) / 100,
                        pro_stripe_fee_handling: stripeFeeHandling,
                        pro_free_trial_days: parseInt(freeTrialDays) || 0,
                        updated_at: new Date().toISOString(),
                      },
                      { eq: { id: settings.id } }
                    )
                    if (error) throw new Error(typeof error === 'string' ? error : JSON.stringify(error))

                    // Also append to platform_fees ledger for audit trail
                    const { error: feeErr } = await adminApi.insert('platform_fees', {
                      country_code: 'USA',
                      fees: parseFloat(standardFee) / 100,
                      free_fee_pct: parseFloat(standardFee),
                      pro_fee_pct: parseFloat(proFee),
                      pro_sub_price: parseFloat(proMonthlyPrice),
                      stripe_fee_handling: stripeFeeHandling,
                    })
                    if (feeErr) {
                      setToast('Settings saved, but fee ledger entry failed: ' + feeErr)
                      setToastType('error')
                    } else {
                      setToast('Settings saved successfully!')
                      setToastType('success')
                    }
                    refreshFees()
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

      {/* Platform Fees Section */}
      <YStack gap="$4">
        <XStack justifyContent="space-between" alignItems="center">
          <XStack alignItems="center" gap="$2">
            <Percent size={24} color={colors.blue[700]} />
            <YStack>
              <Text fontSize="$6" fontWeight="700" color={colors.gray[900]}>Platform Fees Ledger</Text>
              <Text fontSize="$3" color={colors.gray[600]}>Historical log of fee rates per country</Text>
            </YStack>
          </XStack>
          {!isAddingFee && (
            <Button 
              backgroundColor={colors.blue[600]} 
              icon={<Plus size={16} color="white" />} 
              onPress={() => setIsAddingFee(true)}
            >
              <Text color="white" fontWeight="600">Update Fee</Text>
            </Button>
          )}
        </XStack>

        {isAddingFee && (
          <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$4" backgroundColor="white" borderRadius="$4" elevation="$1">
            <YStack gap="$4">
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Set New Fee Rate</Text>
              <Text fontSize="$3" color={colors.gray[600]}>
                New fees append to the ledger. The most recent entry per country becomes active.
              </Text>

              {feeError ? (
                <YStack backgroundColor={colors.red[50]} padding="$2" borderRadius="$2" borderWidth={1} borderColor={colors.red[200]}>
                  <Text color={colors.red[800]} fontSize="$3">{feeError}</Text>
                </YStack>
              ) : null}

              {/* Country - fixed to USA */}
              <YStack gap="$1">
                <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Country</Text>
                <XStack alignItems="center" gap="$2">
                  <XStack backgroundColor={colors.blue[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2">
                    <Text fontSize="$3" fontWeight="600" color={colors.blue[700]}>United States (USA)</Text>
                  </XStack>
                </XStack>
              </YStack>

              {/* Standard (Free) Fee Percentage */}
              <YStack gap="$1">
                <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Standard Fee (non-Pro sellers)</Text>
                <XStack alignItems="center" gap="$2">
                  <Input
                    value={feePercentage}
                    onChangeText={setFeePercentage}
                    placeholder="e.g. 10"
                    keyboardType="numeric"
                    width={150}
                  />
                  <Text fontSize="$3" color={colors.gray[500]}>%</Text>
                </XStack>
              </YStack>

              {/* Pro Fee Percentage */}
              <YStack gap="$1">
                <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Pro Fee (Pro sellers)</Text>
                <XStack alignItems="center" gap="$2">
                  <Input
                    value={feeProPercentage}
                    onChangeText={setFeeProPercentage}
                    placeholder="e.g. 2"
                    keyboardType="numeric"
                    width={150}
                  />
                  <Text fontSize="$3" color={colors.gray[500]}>%</Text>
                </XStack>
              </YStack>

              {/* Pro Subscription Price */}
              <YStack gap="$1">
                <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Pro Subscription Price</Text>
                <XStack alignItems="center" gap="$2">
                  <Text fontSize="$3" color={colors.gray[600]}>$</Text>
                  <Input
                    value={feeSubPrice}
                    onChangeText={setFeeSubPrice}
                    placeholder="e.g. 10"
                    keyboardType="numeric"
                    width={150}
                  />
                  <Text fontSize="$3" color={colors.gray[500]}>/ month</Text>
                </XStack>
              </YStack>

              {/* Stripe Fee Handling */}
              <YStack gap="$1">
                <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Stripe Fee Handling (Pro)</Text>
                <XStack gap="$4">
                  <XStack alignItems="center" gap="$2" cursor="pointer" onPress={() => setFeeStripeHandling('pass_through')}>
                    <YStack width={16} height={16} borderRadius={8} borderWidth={2}
                      borderColor={feeStripeHandling === 'pass_through' ? colors.blue[600] : colors.gray[300]}
                      alignItems="center" justifyContent="center"
                    >
                      {feeStripeHandling === 'pass_through' && <YStack width={8} height={8} borderRadius={4} backgroundColor={colors.blue[600]} />}
                    </YStack>
                    <Text fontSize="$3" fontWeight="500">Pass-through</Text>
                  </XStack>
                  <XStack alignItems="center" gap="$2" cursor="pointer" onPress={() => setFeeStripeHandling('absorb')}>
                    <YStack width={16} height={16} borderRadius={8} borderWidth={2}
                      borderColor={feeStripeHandling === 'absorb' ? colors.blue[600] : colors.gray[300]}
                      alignItems="center" justifyContent="center"
                    >
                      {feeStripeHandling === 'absorb' && <YStack width={8} height={8} borderRadius={4} backgroundColor={colors.blue[600]} />}
                    </YStack>
                    <Text fontSize="$3" fontWeight="500">Absorb</Text>
                  </XStack>
                </XStack>
              </YStack>

              <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
                <Button chromeless onPress={() => { setIsAddingFee(false); setFeePercentage(''); setFeeProPercentage(''); setFeeSubPrice(''); setFeeStripeHandling('pass_through'); setFeeError('') }}>Cancel</Button>
                <Button backgroundColor={colors.blue[600]} onPress={handleCreateFee} disabled={submittingFee}>
                  <Text color="white" fontWeight="600">{submittingFee ? 'Applying...' : 'Apply New Rate'}</Text>
                </Button>
              </XStack>
            </YStack>
          </YStack>
        )}

        <AdminDataGrid 
          data={feesData} 
          columns={feeColumns} 
          isLoading={feesLoading}
          page={page}
          hasMore={hasMore}
          hasPrev={hasPrev}
          onNextPage={next}
          onPrevPage={prev}
          emptyMessage="No fee records found."
        />
      </YStack>
    </YStack>
  )
}
