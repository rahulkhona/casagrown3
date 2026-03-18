'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Settings, Percent } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../packages/app/features/admin/components/AdminDataGrid'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { supabase } from '@casagrown/app/utils/supabase'
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

  const [isAddingFee, setIsAddingFee] = useState(false)
  const [submittingFee, setSubmittingFee] = useState(false)
  const [feePercentage, setFeePercentage] = useState('')
  const [feeError, setFeeError] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setSettingsLoading(true)
    const { data } = await supabase.from('platform_settings').select('*').limit(1).single()
    if (data) {
      setSettings(data)
      setGracePeriod((data.provider_grace_period_ms / 60000).toString()) // convert to minutes
    }
    setSettingsLoading(false)
  }

  const handleSaveSettings = async () => {
    if (!settings) return
    setSavingSettings(true)
    const ms = parseInt(gracePeriod) * 60000
    const { error } = await adminApi.update('platform_settings', {
      provider_grace_period_ms: ms,
      updated_at: new Date().toISOString()
    }, { eq: { id: settings.id } })
    
    if (error) console.error(error)
    else console.log('Platform settings updated successfully!')
    setSavingSettings(false)
  }

  const handleCreateFee = async () => {
    if (!feePercentage.trim() || isNaN(parseFloat(feePercentage))) {
      setFeeError('Please enter a valid fee percentage.')
      return
    }
    setSubmittingFee(true)
    setFeeError('')
    try {
      const { error } = await adminApi.insert('platform_fees', {
        country_code: 'USA',
        fees: parseFloat(feePercentage) / 100
      })
      if (error) throw new Error(error)
      setIsAddingFee(false)
      setFeePercentage('')
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
      flex: 1,
    },
    {
      header: 'Fee Rate',
      accessorKey: 'fees',
      flex: 1,
      cell: (item) => <Text>{(item.fees * 100).toFixed(1)}%</Text>
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
                onPress={handleSaveSettings}
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

              {/* Fee Percentage */}
              <YStack gap="$1">
                <Text fontWeight="600" fontSize="$3" color={colors.gray[700]}>Fee Percentage</Text>
                <XStack alignItems="center" gap="$2">
                  <Input
                    value={feePercentage}
                    onChangeText={setFeePercentage}
                    placeholder="e.g. 10 for 10%"
                    keyboardType="numeric"
                    width={200}
                  />
                  <Text fontSize="$3" color={colors.gray[500]}>%</Text>
                </XStack>
              </YStack>

              <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
                <Button chromeless onPress={() => { setIsAddingFee(false); setFeePercentage(''); setFeeError('') }}>Cancel</Button>
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
