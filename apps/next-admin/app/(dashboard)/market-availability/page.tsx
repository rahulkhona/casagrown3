'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Label } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Shield, ChevronDown } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../packages/app/features/admin/components/AdminDataGrid'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminSupabase } from '../../../lib/adminSupabase'

export default function MarketAvailabilityPage() {
  const { data, loading, page, next, prev, hasMore, hasPrev, refresh } = useAdminQuery({
    table: 'market_state_blocks',
    select: '*, states!inner(code, name)',
    defaultSortParams: { column: 'created_at', ascending: false }
  })

  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Form state
  const [formStateId, setFormStateId] = useState('')
  const [formReason, setFormReason] = useState('')

  // Available states from DB
  const [states, setStates] = useState<{ id: string; code: string; name: string }[]>([])

  useEffect(() => {
    adminSupabase
      .from('states')
      .select('id, code, name')
      .eq('country_iso_3', 'USA')
      .order('code')
      .then(({ data }) => {
        if (data) setStates(data)
      })
  }, [])

  const columns: ColumnDef<any>[] = [
    {
      header: 'State',
      accessorKey: 'states.code',
      width: 100,
      cell: (item) => (
        <XStack backgroundColor={colors.red[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignSelf="flex-start">
          <Text fontSize="$3" fontWeight="700" color={colors.red[700]}>
            {item.states?.code || '??'}
          </Text>
        </XStack>
      ),
    },
    {
      header: 'State Name',
      accessorKey: 'states.name',
      flex: 1,
      cell: (item) => (
        <Text fontSize="$3" color={colors.gray[700]}>{item.states?.name || 'Unknown'}</Text>
      ),
    },
    {
      header: 'Reason',
      accessorKey: 'reason',
      flex: 2,
      cell: (item) => (
        <Text fontSize="$3" color={colors.gray[600]} numberOfLines={2}>
          {item.reason || 'No reason specified'}
        </Text>
      ),
    },
    {
      header: 'Added',
      accessorKey: 'created_at',
      width: 120,
      cell: (item) => (
        <Text fontSize="$2" color={colors.gray[500]}>
          {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>
      ),
    },
    {
      header: 'Actions',
      accessorKey: 'id',
      width: 80,
      cell: (item) => (
        <Button
          size="$2"
          chromeless
          icon={<Trash2 size={16} color={colors.red[500]} />}
          onPress={async () => {
            const { error } = await adminSupabase.from('market_state_blocks').delete().eq('id', item.id)
            if (error) {
              setErrorMessage(`Failed to remove: ${error.message}`)
            } else {
              setSuccessMessage(`Removed ${item.states?.code || 'state'} from blocked list`)
              setTimeout(() => setSuccessMessage(''), 3000)
              refresh()
            }
          }}
        />
      ),
    },
  ]

  const resetForm = () => {
    setFormStateId('')
    setFormReason('')
    setErrorMessage('')
  }

  const handleCreate = async () => {
    if (!formStateId) {
      setErrorMessage('Please select a state.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')
    try {
      const { error } = await adminSupabase.from('market_state_blocks').insert({
        state_id: formStateId,
        reason: formReason.trim() || null,
      })
      if (error) throw error

      const st = states.find(s => s.id === formStateId)
      setIsAdding(false)
      resetForm()
      setSuccessMessage(`${st?.code || 'State'} added to free-only list`)
      setTimeout(() => setSuccessMessage(''), 3000)
      refresh()
    } catch (e: any) {
      setErrorMessage(e.message?.includes('duplicate')
        ? 'This state is already in the blocked list.'
        : `Failed to add state: ${e.message}`
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <YStack flex={1} padding="$4" gap="$4">
      <XStack justifyContent="space-between" alignItems="center">
        <XStack alignItems="center" gap="$2">
          <Shield size={24} color={colors.green[800]} />
          <YStack>
            <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Market Availability</Text>
            <Text fontSize="$3" color={colors.gray[600]}>
              States where only free produce sharing is allowed (no paid transactions).
            </Text>
          </YStack>
        </XStack>
        {!isAdding && (
          <Button
            backgroundColor={colors.green[600]}
            icon={<Plus size={16} color="white" />}
            onPress={() => { resetForm(); setIsAdding(true) }}
          >
            <Text color="white" fontWeight="600">Block State</Text>
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
        <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$4" backgroundColor="white" borderRadius="$4" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2" borderBottomWidth={1} borderColor={colors.gray[200]} paddingBottom="$3">
              <Shield size={20} color={colors.green[700]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Add State Restriction</Text>
            </XStack>

            <YStack gap="$3">
              {/* State Dropdown */}
              <YStack gap="$1">
                <Label>State *</Label>
                <XStack borderWidth={1} borderColor={colors.gray[300]} borderRadius="$3" overflow="hidden">
                  <select
                    value={formStateId}
                    onChange={(e) => setFormStateId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      fontSize: 14,
                      color: formStateId ? '#1a1a1a' : '#9ca3af',
                      cursor: 'pointer',
                      outline: 'none',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                    }}
                  >
                    <option value="">Select state to restrict...</option>
                    {states.map(s => (
                      <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                    ))}
                  </select>
                  <XStack position="absolute" right={12} top={0} bottom={0} alignItems="center" pointerEvents="none">
                    <ChevronDown size={16} color={colors.gray[400]} />
                  </XStack>
                </XStack>
              </YStack>

              {/* Reason */}
              <YStack gap="$1">
                <Label>Reason (optional)</Label>
                <textarea
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="e.g. Agent of payee not recognized under state law"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: `1px solid ${colors.gray[300]}`,
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
                <Text fontSize="$2" color={colors.gray[500]}>
                  Internal reference — not shown to users. Displayed messaging is managed in the market app.
                </Text>
              </YStack>
            </YStack>

            <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
              <Button chromeless onPress={() => { setIsAdding(false); resetForm() }}>
                <Text color={colors.gray[600]}>Cancel</Text>
              </Button>
              <Button backgroundColor={colors.green[600]} onPress={handleCreate} disabled={submitting}>
                <Text color="white" fontWeight="600">{submitting ? 'Adding...' : 'Add Restriction'}</Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      )}

      {/* DATA GRID */}
      <AdminDataGrid
        data={data}
        columns={columns}
        isLoading={loading}
        page={page}
        hasMore={hasMore}
        hasPrev={hasPrev}
        onNextPage={next}
        onPrevPage={prev}
        emptyMessage="No states are restricted. All states allow paid transactions."
      />

      {/* Info Box */}
      <YStack backgroundColor="#eff6ff" padding="$4" borderRadius="$4" borderWidth={1} borderColor="#bfdbfe">
        <Text fontWeight="bold" color="#1e40af">How Market Availability Works</Text>
        <Text fontSize={13} color="#3b82f6" marginTop="$2">
          When a state is added here, sellers in that state can only list products at $0 (free). The database trigger enforces this automatically.
        </Text>
        <Text fontSize={13} color="#3b82f6" marginTop="$1">
          <Text fontWeight="bold">State Isolation:</Text> Buyers only see booths from sellers in their own state, preventing interstate transaction complications.
        </Text>
        <Text fontSize={13} color="#3b82f6" marginTop="$1">
          <Text fontWeight="bold">Removing a state</Text> re-enables paid transactions for that state's sellers immediately.
        </Text>
      </YStack>
    </YStack>
  )
}
