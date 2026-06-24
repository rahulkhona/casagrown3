'use client'

import React, { useState } from 'react'
import { YStack, XStack, Text, Button, Card } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Tag, Edit3 } from '@tamagui/lucide-icons'
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
  const [editingRule, setEditingRule] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const columns: ColumnDef<any>[] = [
    {
      header: 'Rule Text',
      accessorKey: 'rule_text',
      width: '75%',
    },
    {
      header: 'Active',
      accessorKey: 'is_active',
      width: 80,
      cell: (item) => (
        <span style={{ fontSize: 13, color: item.is_active ? '#166534' : '#6b7280', fontWeight: 600 }}>
          {item.is_active ? '● Yes' : '○ No'}
        </span>
      )
    },
    {
      header: 'Actions',
      accessorKey: 'id',
      width: 150,
      sticky: 'right',
      cell: (item) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setErrorMessage(''); setIsAdding(false); setEditingRule(item) }}
            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >✏️ Edit</button>
          <button
            onClick={async (e) => { e.stopPropagation(); const { error } = await adminApi.delete('growbot_rules', { eq: { id: item.id } }); if (error) console.error(error); refresh() }}
            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >🗑 Delete</button>
        </div>
      )
    }
  ]

  const formFields: FormFieldDef[] = [
    { name: 'rule_text', label: 'Rule Instruction', type: 'textarea', required: true, placeholder: 'e.g. Always respond in a friendly, helpful tone. Never make up product prices.' }
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

  const handleUpdate = async (values: any) => {
    if (!editingRule) return
    setSubmitting(true)
    setErrorMessage('')
    try {
      const { error } = await adminApi.update('growbot_rules', {
        rule_text: values.rule_text,
      }, { eq: { id: editingRule.id } })
      if (error) {
        console.error(error)
        setErrorMessage(`Failed to update rule: ${error}`)
      } else {
        setEditingRule(null)
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
        {!isAdding && !editingRule && (
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

      {editingRule && (
        <Card borderWidth={1} borderColor={(colors.blue as any)[200]} padding="$4" backgroundColor="white" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2">
              <Edit3 size={20} color={colors.blue[600]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Edit Rule</Text>
            </XStack>
            <AdminDataForm 
              fields={formFields}
              initialValues={{ rule_text: editingRule.rule_text }}
              onSubmit={handleUpdate} 
              onCancel={() => setEditingRule(null)}
              isSubmitting={submitting}
              submitLabel="Update Rule"
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
