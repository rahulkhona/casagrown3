'use client'

import React, { useState } from 'react'
import { YStack, XStack, Text, Button, Input, Label } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, FileText, ChevronDown } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../packages/app/features/admin/components/AdminDataGrid'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../lib/adminApi'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY'
]

export default function ReceiptFootersPage() {
  const { data, loading, page, next, prev, hasMore, hasPrev, refresh } = useAdminQuery({
    table: 'receipt_footers',
    defaultSortParams: { column: 'state_code', ascending: true }
  })

  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Form state
  const [formStateCode, setFormStateCode] = useState('')
  const [formFooterText, setFormFooterText] = useState('')
  const [formFontSize, setFormFontSize] = useState('10')

  const columns: ColumnDef<any>[] = [
    {
      header: 'State',
      accessorKey: 'state_code',
      width: 80,
      cell: (item) => (
        <XStack backgroundColor={colors.blue[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignSelf="flex-start">
          <Text fontSize="$3" fontWeight="700" color={colors.blue[700]}>{item.state_code}</Text>
        </XStack>
      ),
    },
    {
      header: 'Footer Text',
      accessorKey: 'footer_text',
      flex: 3,
      cell: (item) => (
        <Text fontSize="$3" color={colors.gray[700]} numberOfLines={2}>{item.footer_text}</Text>
      ),
    },
    {
      header: 'Font Size',
      accessorKey: 'font_size_pt',
      width: 80,
      cell: (item) => <Text fontSize="$3" color={colors.gray[600]}>{item.font_size_pt}pt</Text>,
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
            const { error } = await adminApi.delete('receipt_footers', { eq: { id: item.id } })
            if (error) {
              setErrorMessage(`Failed to delete: ${error}`)
            } else {
              refresh()
            }
          }}
        />
      ),
    },
  ]

  const resetForm = () => {
    setFormStateCode('')
    setFormFooterText('')
    setFormFontSize('10')
    setErrorMessage('')
  }

  const handleCreate = async () => {
    if (!formStateCode) {
      setErrorMessage('Please select a state.')
      return
    }
    if (!formFooterText.trim()) {
      setErrorMessage('Please enter footer text.')
      return
    }
    const fontSize = parseInt(formFontSize)
    if (isNaN(fontSize) || fontSize < 6 || fontSize > 24) {
      setErrorMessage('Font size must be between 6 and 24.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')
    try {
      const { error } = await adminApi.insert('receipt_footers', {
        country_iso_3: 'USA',
        state_code: formStateCode,
        footer_text: formFooterText.trim(),
        font_size_pt: fontSize,
      })
      if (error) throw new Error(error)

      setIsAdding(false)
      resetForm()
      setSuccessMessage(`Footer for ${formStateCode} created successfully`)
      setTimeout(() => setSuccessMessage(''), 3000)
      refresh()
    } catch (e: any) {
      setErrorMessage(`Failed to create footer: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <YStack flex={1} padding="$4" gap="$4">
      <XStack justifyContent="space-between" alignItems="center">
        <XStack alignItems="center" gap="$2">
          <FileText size={24} color={colors.green[800]} />
          <YStack>
            <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Receipt Footers</Text>
            <Text fontSize="$3" color={colors.gray[600]}>State-specific legal text printed on market receipts (e.g. cottage food disclaimers).</Text>
          </YStack>
        </XStack>
        {!isAdding && (
          <Button
            backgroundColor={colors.green[600]}
            icon={<Plus size={16} color="white" />}
            onPress={() => { resetForm(); setIsAdding(true) }}
          >
            <Text color="white" fontWeight="600">Add Footer</Text>
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
              <FileText size={20} color={colors.green[700]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Add Receipt Footer</Text>
            </XStack>

            <YStack gap="$3">
              {/* State Dropdown */}
              <YStack gap="$1">
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
                      appearance: 'none',
                      WebkitAppearance: 'none',
                    }}
                  >
                    <option value="">Select state...</option>
                    {US_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <XStack position="absolute" right={12} top={0} bottom={0} alignItems="center" pointerEvents="none">
                    <ChevronDown size={16} color={colors.gray[400]} />
                  </XStack>
                </XStack>
              </YStack>

              {/* Footer Text */}
              <YStack gap="$1">
                <Label>Footer Text *</Label>
                <textarea
                  value={formFooterText}
                  onChange={(e) => setFormFooterText(e.target.value)}
                  placeholder="e.g. MADE IN A COTTAGE FOOD OPERATION THAT IS NOT SUBJECT TO FLORIDA'S FOOD SAFETY REGULATIONS."
                  rows={3}
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
                  This text appears at the bottom of digital receipts for sellers in this state.
                </Text>
              </YStack>

              {/* Font Size */}
              <YStack gap="$1">
                <Label>Font Size (pt)</Label>
                <XStack alignItems="center" gap="$2">
                  <Input
                    value={formFontSize}
                    onChangeText={setFormFontSize}
                    keyboardType="numeric"
                    width={80}
                    textAlign="center"
                  />
                  <Text fontSize="$3" color={colors.gray[500]}>pt (6–24)</Text>
                </XStack>
              </YStack>
            </YStack>

            <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
              <Button chromeless onPress={() => { setIsAdding(false); resetForm() }}>
                <Text color={colors.gray[600]}>Cancel</Text>
              </Button>
              <Button backgroundColor={colors.green[600]} onPress={handleCreate} disabled={submitting}>
                <Text color="white" fontWeight="600">{submitting ? 'Creating...' : 'Create Footer'}</Text>
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
        emptyMessage="No receipt footers configured. Add one for states that require cottage food or compliance disclaimers."
      />

      {/* Info Box */}
      <YStack backgroundColor="#f0fdf4" padding="$4" borderRadius="$4" borderWidth={1} borderColor={colors.green[200]}>
        <Text fontWeight="bold" color={colors.green[800]}>How Receipt Footers Work</Text>
        <Text fontSize={13} color={colors.green[700]} marginTop="$2">
          When a buyer views a receipt, the market app looks up the seller's state and displays the corresponding footer text at the bottom of the receipt.
        </Text>
        <Text fontSize={13} color={colors.green[700]} marginTop="$1">
          <Text fontWeight="bold">Common use cases:</Text> Cottage food disclaimers (FL, CA, TX), tax-exempt notices, or regulatory compliance text required by state law.
        </Text>
      </YStack>
    </YStack>
  )
}
