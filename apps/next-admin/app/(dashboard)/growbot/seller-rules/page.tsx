'use client'

import React, { useState } from 'react'
import { YStack, XStack, Text, Button, Card } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Tag, Edit3 } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../../packages/app/features/admin/components/AdminDataGrid'
import { AdminDataForm, FormFieldDef } from '../../../../../../packages/app/features/admin/components/AdminDataForm'
import { useAdminQuery } from '../../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../../lib/adminApi'

export default function SellerRulesPage() {
  const { data, loading, next, prev, hasMore, hasPrev, page, refresh } = useAdminQuery({ 
    table: 'growbot_seller_rules',
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
            onClick={async (e) => {
              e.stopPropagation()
              if (!confirm('Delete this seller bot rule?')) return
              const { error } = await adminApi.delete('growbot_seller_rules', { eq: { id: item.id } })
              if (error) console.error(error)
              refresh()
            }}
            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >🗑 Delete</button>
          <button
            onClick={async (e) => {
              e.stopPropagation()
              const { error } = await adminApi.update('growbot_seller_rules', { is_active: !item.is_active }, { eq: { id: item.id } })
              if (error) console.error(error)
              refresh()
            }}
            style={{
              padding: '4px 10px', fontSize: 12, fontWeight: 600,
              background: item.is_active ? '#fef9c3' : '#f0fdf4',
              color: item.is_active ? '#92400e' : '#166534',
              border: `1px solid ${item.is_active ? '#fcd34d' : '#86efac'}`,
              borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >{item.is_active ? '⏸ Disable' : '▶ Enable'}</button>
        </div>
      )
    }
  ]

  const formFields: FormFieldDef[] = [
    { name: 'rule_text', label: 'Rule Instruction', type: 'textarea', required: true, placeholder: 'e.g. Always respond in a friendly, helpful tone. Keep answers under 3 sentences. Never discuss competitor prices.' }
  ]

  const handleCreate = async (values: any) => {
    setSubmitting(true)
    setErrorMessage('')
    try {
      const { error } = await adminApi.insert('growbot_seller_rules', {
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
      const { error } = await adminApi.update('growbot_seller_rules', {
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
          <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>🤖 Seller Bot Rules</Text>
          <Text fontSize="$3" color={colors.gray[600]}>
            Universal rules for seller-facing GrowBot (Messenger, DMs, order chats, widget). Separate from buyer GrowBot rules.
          </Text>
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

      {/* Info banner */}
      <Card backgroundColor="#f0fdf4" borderWidth={1} borderColor="#86efac" padding="$3">
        <Text fontSize="$2" color="#166534" lineHeight={20}>
          These rules are injected into every seller-facing GrowBot prompt. They apply universally across all sellers — 
          individual sellers can add per-booth custom instructions via their booth settings. 
          Changes take effect immediately on the next bot response.
        </Text>
      </Card>

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
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Create New Seller Rule</Text>
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
        <Card borderWidth={1} borderColor={colors.blue[200]} padding="$4" backgroundColor="white" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2">
              <Edit3 size={20} color={colors.blue[600]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Edit Seller Rule</Text>
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
