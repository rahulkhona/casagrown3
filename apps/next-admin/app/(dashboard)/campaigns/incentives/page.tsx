'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Separator, Spinner, Input, Label } from 'tamagui'
import { Plus, X, AlertCircle } from '@tamagui/lucide-icons'
import { adminApi } from '../../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

type UserIncentive = {
  id: string
  user_id: string
  user_name: string
  user_email: string
  amount_usd: number
  credit_type: string
  cap_type: string
  cap_value: number
  expiration_frequency: string
  start_date: string
  stop_date: string | null
  is_active: boolean
  created_at: string
}

type UserSearchProfile = {
  id: string
  full_name: string
  email: string
}

export default function IncentivesPage() {
  const [incentives, setIncentives] = useState<UserIncentive[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Form state
  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // User Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchProfile[]>([])
  const [selectedUser, setSelectedUser] = useState<UserSearchProfile | null>(null)

  const [formAmount, setFormAmount] = useState('')
  const [formCreditType, setFormCreditType] = useState('universal') // Default to universal based on feedback
  const [formCapType, setFormCapType] = useState('percentage')
  const [formCapValue, setFormCapValue] = useState('')
  const [formFrequency, setFormFrequency] = useState('monthly')
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split('T')[0])
  const [formStopDate, setFormStopDate] = useState('')
  const [formPeriods, setFormPeriods] = useState('1') // Default to 1 period

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{ type: 'stop' | 'restart', id: string } | null>(null)

  const fetchIncentives = async () => {
    setLoading(true)
    const { data, error } = await adminApi.rpc('admin_get_user_incentives')
    if (!error && data) {
      setIncentives(data as UserIncentive[])
    }
    setLoading(false)
  }

  useEffect(() => { fetchIncentives() }, [])

  // User search logic
  useEffect(() => {
    if (!searchQuery || selectedUser) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      // Query profiles by email or name
      const { data, error } = await adminApi.select('profiles', 'id, full_name, email', {
        or: `email.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`,
        limit: 5
      })
      if (!error && data) {
        setSearchResults(data as UserSearchProfile[])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, selectedUser])

  const executeAction = async () => {
    if (!confirmDialog) return
    const { id, type } = confirmDialog
    
    setConfirmDialog(null)
    
    const isActive = type === 'restart'
    const stopDate = isActive ? null : new Date().toISOString()
    
    // Optimistic update
    setIncentives(prev => prev.map(c => c.id === id ? { ...c, is_active: isActive } : c))
    
    const { error } = await adminApi.rpc('admin_update_user_incentive', {
      p_id: id,
      p_is_active: isActive,
      p_stop_date: stopDate
    })
    
    if (error) {
      setErrorMessage(`Failed to ${type} incentive: ${error}`)
      // Revert on error
      fetchIncentives()
    } else {
      setSuccessMessage(`Incentive ${isActive ? 'restarted' : 'stopped'}.`)
      setTimeout(() => setSuccessMessage(''), 3000)
    }
  }

  const handleCreate = async () => {
    if (!selectedUser) { setErrorMessage('Please select a user.'); return }
    if (!formAmount || isNaN(Number(formAmount))) { setErrorMessage('Valid amount required.'); return }
    if (!formCapValue || isNaN(Number(formCapValue))) { setErrorMessage('Valid cap value required.'); return }
    if (!formStartDate) { setErrorMessage('Start date required.'); return }

    setSubmitting(true)
    setErrorMessage('')
    
    let finalStopDate = formStopDate ? new Date(formStopDate) : null;
    if (formFrequency !== 'onetime' && formPeriods) {
      const periods = parseInt(formPeriods, 10);
      const start = new Date(formStartDate);
      if (!isNaN(periods)) {
        if (formFrequency === 'weekly') start.setDate(start.getDate() + 7 * periods);
        else if (formFrequency === 'monthly') start.setMonth(start.getMonth() + periods);
        else if (formFrequency === 'quarterly') start.setMonth(start.getMonth() + 3 * periods);
        else if (formFrequency === 'halfyearly') start.setMonth(start.getMonth() + 6 * periods);
        else if (formFrequency === 'yearly') start.setFullYear(start.getFullYear() + periods);
        finalStopDate = start;
      }
    }
    
    const { error } = await adminApi.rpc('admin_create_user_incentive', {
      p_user_id: selectedUser.id,
      p_amount_usd: Number(formAmount),
      p_credit_type: formCreditType,
      p_cap_type: formCapType,
      p_cap_value: Number(formCapValue),
      p_expiration_frequency: formFrequency,
      p_start_date: new Date(formStartDate).toISOString(),
      p_stop_date: finalStopDate ? finalStopDate.toISOString() : null
    })

    if (error) {
      setErrorMessage(`Failed to create incentive: ${error}`)
    } else {
      setSuccessMessage(`Incentive created for ${selectedUser.full_name}`)
      setTimeout(() => setSuccessMessage(''), 3000)
      setIsAdding(false)
      resetForm()
      fetchIncentives()
    }
    setSubmitting(false)
  }

  const resetForm = () => {
    setSelectedUser(null)
    setSearchQuery('')
    setFormAmount('')
    setFormCreditType('universal')
    setFormCapType('percentage')
    setFormCapValue('')
    setFormFrequency('monthly')
    setFormStartDate(new Date().toISOString().split('T')[0])
    setFormStopDate('')
    setFormPeriods('1')
    setErrorMessage('')
  }

  return (
    <YStack flex={1} padding="$6" gap="$5" maxWidth={1000} position="relative">
      
      {/* Confirmation Modal Overlay */}
      {confirmDialog && (
        <YStack position="absolute" top={0} left={0} right={0} bottom={0} backgroundColor="rgba(0,0,0,0.4)" zIndex={1000} justifyContent="center" alignItems="center">
          <YStack backgroundColor="white" padding="$5" borderRadius="$4" width={400} elevation="$4" gap="$4">
            <XStack gap="$3" alignItems="center">
              <AlertCircle color={confirmDialog.type === 'stop' ? colors.red[600] : colors.green[600]} size={24} />
              <Text fontSize="$5" fontWeight="bold" color={colors.gray[900]}>
                {confirmDialog.type === 'stop' ? 'Stop Incentive' : 'Restart Incentive'}
              </Text>
            </XStack>
            <Text color={colors.gray[600]}>
              Are you sure you want to {confirmDialog.type} this incentive?
              {confirmDialog.type === 'stop' ? ' It will immediately cease generating new credits.' : ' It will begin generating credits on its schedule again.'}
            </Text>
            <XStack justifyContent="flex-end" gap="$3" marginTop="$2">
              <Button chromeless onPress={() => setConfirmDialog(null)}>
                <Text color={colors.gray[600]}>Cancel</Text>
              </Button>
              <Button backgroundColor={confirmDialog.type === 'stop' ? colors.red[600] : colors.green[600]} onPress={executeAction}>
                <Text color="white" fontWeight="600">Yes, {confirmDialog.type}</Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      )}

      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize="$8" fontWeight="bold" color={colors.green[900]}>Recurring User Incentives</Text>
          <Text color={colors.gray[600]}>Schedule automated store credits for selected users.</Text>
        </YStack>
        {!isAdding && (
          <Button icon={Plus} backgroundColor={colors.green[600]} onPress={() => { resetForm(); setIsAdding(true) }}>
            <Text color="white" fontWeight="600">New Incentive</Text>
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

      {/* CREATE FORM */}
      {isAdding && (
        <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$5" backgroundColor="white" borderRadius="$4" elevation="$1">
          <YStack gap="$4">
            <Text fontSize="$5" fontWeight="600" color={colors.gray[800]} borderBottomWidth={1} borderColor={colors.gray[200]} paddingBottom="$3">
              Configure Recurring Incentive
            </Text>

            <YStack gap="$3">
              <YStack gap="$1" position="relative" zIndex={10}>
                <Label>Target User *</Label>
                {selectedUser ? (
                  <XStack backgroundColor={colors.green[50]} padding="$3" borderRadius="$2" justifyContent="space-between" alignItems="center" borderWidth={1} borderColor={colors.green[200]}>
                    <YStack>
                      <Text fontWeight="600" color={colors.green[900]}>{selectedUser.full_name}</Text>
                      <Text fontSize={12} color={colors.green[700]}>{selectedUser.email}</Text>
                    </YStack>
                    <Button size="$2" chromeless icon={<X size={16} color={colors.gray[500]} />} onPress={() => { setSelectedUser(null); setSearchQuery('') }} />
                  </XStack>
                ) : (
                  <YStack>
                    <Input 
                      value={searchQuery} 
                      onChangeText={setSearchQuery} 
                      placeholder="Search by email or name..." 
                    />
                    {searchResults.length > 0 && (
                      <YStack position="absolute" top="100%" left={0} right={0} backgroundColor="white" borderWidth={1} borderColor={colors.gray[200]} borderRadius="$2" elevation="$2" marginTop="$1" maxHeight={200} overflow="hidden">
                        <ScrollView>
                          {searchResults.map(user => (
                            <XStack key={user.id} padding="$2" paddingHorizontal="$3" hoverStyle={{ backgroundColor: colors.gray[100] }} cursor="pointer" onPress={() => setSelectedUser(user)}>
                              <YStack>
                                <Text fontWeight="600" color={colors.gray[900]}>{user.full_name}</Text>
                                <Text fontSize={12} color={colors.gray[600]}>{user.email}</Text>
                              </YStack>
                            </XStack>
                          ))}
                        </ScrollView>
                      </YStack>
                    )}
                  </YStack>
                )}
              </YStack>

              <XStack gap="$3">
                <YStack gap="$1" flex={1}>
                  <Label>Credit Amount ($) *</Label>
                  <Input value={formAmount} onChangeText={setFormAmount} placeholder="e.g. 20" keyboardType="numeric" />
                </YStack>
                <YStack gap="$1" flex={1}>
                  <Label>Credit Type *</Label>
                  <select value={formCreditType} onChange={e => setFormCreditType(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.gray[300]}`, borderRadius: 8, backgroundColor: 'white', fontSize: 14 }}>
                    <option value="universal">Universal (Flexible)</option>
                    <option value="purchase">Purchase Credit</option>
                    <option value="platform_fee">Platform Fee Credit</option>
                  </select>
                </YStack>
              </XStack>

              <XStack gap="$3">
                <YStack gap="$1" flex={1}>
                  <Label>Cap Type *</Label>
                  <select value={formCapType} onChange={e => setFormCapType(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.gray[300]}`, borderRadius: 8, backgroundColor: 'white', fontSize: 14 }}>
                    <option value="percentage">Percentage per txn</option>
                    <option value="flat_amount">Flat $ per txn</option>
                  </select>
                </YStack>
                <YStack gap="$1" flex={1}>
                  <Label>Cap Value ({formCapType === 'percentage' ? '%' : '$'}) *</Label>
                  <Input value={formCapValue} onChangeText={setFormCapValue} placeholder={formCapType === 'percentage' ? "e.g. 100" : "e.g. 5"} keyboardType="numeric" />
                </YStack>
              </XStack>

              <XStack gap="$3">
                <YStack gap="$1" flex={1}>
                  <Label>Frequency *</Label>
                  <select value={formFrequency} onChange={e => setFormFrequency(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.gray[300]}`, borderRadius: 8, backgroundColor: 'white', fontSize: 14 }}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="halfyearly">Half-Yearly</option>
                    <option value="yearly">Yearly</option>
                    <option value="onetime">One-Time</option>
                  </select>
                </YStack>
              </XStack>

              <XStack gap="$3">
                <YStack gap="$1" flex={1}>
                  <Label>Start Date *</Label>
                  <Input value={formStartDate} onChangeText={setFormStartDate} type="date" />
                </YStack>
                <YStack gap="$1" flex={1}>
                  {formFrequency === 'onetime' ? (
                    <>
                      <Label>End Date (Optional)</Label>
                      <Input value={formStopDate} onChangeText={setFormStopDate} type="date" />
                    </>
                  ) : (
                    <>
                      <Label>Number of Periods (Optional)</Label>
                      <Input value={formPeriods} onChangeText={setFormPeriods} placeholder="e.g. 1 (Blank = Indefinite)" keyboardType="numeric" />
                    </>
                  )}
                </YStack>
              </XStack>

            </YStack>

            <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
              <Button chromeless onPress={() => { setIsAdding(false); resetForm() }}>
                <Text color={colors.gray[600]}>Cancel</Text>
              </Button>
              <Button backgroundColor={colors.green[600]} onPress={handleCreate} disabled={submitting}>
                <Text color="white" fontWeight="600">{submitting ? 'Creating...' : 'Create Incentive'}</Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      )}

      {/* TABLE */}
      <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
        <XStack backgroundColor={colors.gray[50]} padding="$3" borderBottomWidth={1} borderColor={colors.gray[200]}>
          <Text flex={2} fontWeight="600" color={colors.gray[600]} fontSize={14}>User</Text>
          <Text flex={2} fontWeight="600" color={colors.gray[600]} fontSize={14}>Credit Rules</Text>
          <Text flex={1} fontWeight="600" color={colors.gray[600]} fontSize={14}>Schedule</Text>
          <Text width={120} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="right" paddingRight="$2">Actions</Text>
        </XStack>
        
        {loading ? (
          <YStack padding="$6" alignItems="center"><Spinner size="large" color={colors.green[600]} /></YStack>
        ) : incentives.length === 0 ? (
          <YStack padding="$6" alignItems="center">
            <Text color={colors.gray[500]}>No active user incentives found.</Text>
          </YStack>
        ) : (
          <ScrollView>
            {incentives.map((inc, idx) => (
              <YStack key={inc.id}>
                {idx > 0 && <Separator />}
                <XStack padding="$3" paddingVertical="$4" alignItems="center" hoverStyle={{ backgroundColor: colors.gray[50] }}>
                  <YStack flex={2} paddingRight="$2">
                    <Text fontWeight="600" color={colors.gray[900]}>{inc.user_name}</Text>
                    <Text fontSize={12} color={colors.gray[500]}>{inc.user_email}</Text>
                  </YStack>
                  <YStack flex={2}>
                    <XStack alignItems="center" gap="$2">
                      <Text fontWeight="600" color={colors.green[700]}>${inc.amount_usd}</Text>
                      <XStack backgroundColor={colors.green[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2">
                        <Text fontSize={10} fontWeight="600" color={colors.green[800]}>{inc.credit_type.toUpperCase()}</Text>
                      </XStack>
                    </XStack>
                    <Text fontSize={12} color={colors.gray[600]} marginTop="$1">Cap: {inc.cap_type === 'flat_amount' ? '$' : ''}{inc.cap_value}{inc.cap_type === 'percentage' ? '%' : ''}</Text>
                  </YStack>
                  <YStack flex={1}>
                    <XStack backgroundColor={colors.blue[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignSelf="flex-start">
                      <Text fontSize={11} fontWeight="600" color={colors.blue[700]}>{inc.expiration_frequency}</Text>
                    </XStack>
                    <Text fontSize={11} color={colors.gray[500]} marginTop="$1">From: {new Date(inc.start_date).toLocaleDateString()}</Text>
                    {inc.stop_date && <Text fontSize={11} color={colors.gray[500]}>Until: {new Date(inc.stop_date).toLocaleDateString()}</Text>}
                  </YStack>
                  <XStack width={120} justifyContent="flex-end">
                    {inc.is_active ? (
                      <Button size="$2" backgroundColor={colors.red[50]} color={colors.red[700]} borderColor={colors.red[200]} borderWidth={1} onPress={() => setConfirmDialog({ type: 'stop', id: inc.id })}>
                        Stop
                      </Button>
                    ) : (
                      <Button size="$2" backgroundColor={colors.green[50]} color={colors.green[700]} borderColor={colors.green[200]} borderWidth={1} onPress={() => setConfirmDialog({ type: 'restart', id: inc.id })}>
                        Restart
                      </Button>
                    )}
                  </XStack>
                </XStack>
              </YStack>
            ))}
          </ScrollView>
        )}
      </YStack>
    </YStack>
  )
}
