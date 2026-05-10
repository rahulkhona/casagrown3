'use client'

import React, { useState } from 'react'
import { YStack, XStack, Text, Button, Card } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Tag, Edit2 } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../../packages/app/features/admin/components/AdminDataGrid'
import { AdminDataForm, FormFieldDef } from '../../../../../../packages/app/features/admin/components/AdminDataForm'
import { useAdminQuery } from '../../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../../lib/adminApi'

export default function RulesPage() {
  const { data, loading, next, prev, hasMore, hasPrev, page, refresh } = useAdminQuery({ 
    table: 'growbot_rules',
    defaultSortParams: { column: 'created_at', ascending: true }
  })

  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const columns: ColumnDef<any>[] = [
    {
      header: 'Rule Text',
      accessorKey: 'rule_text',
      flex: 3,
    },
    {
      header: 'Active',
      accessorKey: 'is_active',
      flex: 1,
      cell: (item) => <Text>{item.is_active ? 'Yes' : 'No'}</Text>
    },
    {
      header: 'Actions',
      accessorKey: 'id',
      width: 100,
      cell: (item) => (
        <XStack gap="$2">
          <Button 
            size="$2" 
            chromeless 
            icon={<Trash2 size={16} color={colors.red[500]} />} 
            onPress={async () => {
              const { error } = await adminApi.delete('growbot_rules', { eq: { id: item.id } })
              if (error) console.error(error)
              refresh()
            }} 
          />
        </XStack>
      )
    }
  ]

  const formFields: FormFieldDef[] = [
    { name: 'rule_text', label: 'Rule Instruction', type: 'text', required: true }
  ]

  const handleCreate = async (values: any) => {
    setSubmitting(true)
    setErrorMessage('')
    try {
      const { error } = await adminApi.insert('growbot_rules', {
        rule_text: values.rule_text,
        is_active: true
      })
      if (error) {
        console.error(error)
        setErrorMessage(`Failed to create rule: ${error}`)
      } else {
        setIsAdding(false)
        refresh()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <YStack flex={1} padding="$4" gap="$4">
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>GrowBot Global Rules</Text>
          <Text fontSize="$3" color={colors.gray[600]}>Manage AI system instructions</Text>
        </YStack>
        {!isAdding && (
          <Button 
            backgroundColor={colors.green[600]} 
            icon={<Plus size={16} color="white" />} 
            onPress={() => {
              setErrorMessage('')
              setIsAdding(true)
            }}
          >
            <Text color="white" fontWeight="600">Add Rule</Text>
          </Button>
        )}
      </XStack>

      {errorMessage ? (
        <YStack 
          backgroundColor={colors.red[50]} 
          padding="$3" 
          borderRadius="$2" 
          borderWidth={1} 
          borderColor={colors.red[200]}
        >
          <Text color={colors.red[800]} fontWeight="600">{errorMessage}</Text>
        </YStack>
      ) : null}

      {isAdding && (
        <Card borderWidth={1} borderColor={colors.gray[200]} padding="$4" backgroundColor="white" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2">
              <Tag size={20} color={colors.green[700]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Create New Rule</Text>
            </XStack>
            <AdminDataForm 
              fields={formFields} 
              onSubmit={handleCreate} 
              onCancel={() => setIsAdding(false)}
              isSubmitting={submitting}
              submitLabel="Save Rule"
            />
          </YStack>
        </Card>
      )}

      <AdminDataGrid
        data={data || []}
        columns={columns}
        loading={loading}
        onNext={next}
        onPrev={prev}
        hasNext={hasMore}
        hasPrev={hasPrev}
        page={page}
      />
    </YStack>
  )
}
