'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Card } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Shield } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../packages/app/features/admin/components/AdminDataGrid'
import { AdminDataForm, FormFieldDef } from '../../../../../packages/app/features/admin/components/AdminDataForm'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../lib/adminApi'

// Equivalent to tracking staff members
export default function UsersPage() {
  const { data, loading, next, prev, hasMore, hasPrev, page, refresh } = useAdminQuery({ 
    table: 'staff_members',
    defaultSortParams: { column: 'granted_at', ascending: false }
  })

  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const columns: ColumnDef<any>[] = [
    {
      header: 'Email',
      accessorKey: 'email',
      flex: 2,
    },
    {
      header: 'Roles',
      accessorKey: 'roles',
      flex: 2,
      cell: (item) => (
        <XStack gap="$1" flexWrap="wrap">
          {(item.roles || []).map((r: string) => (
            <XStack key={r} backgroundColor={colors.green[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2">
              <Text fontSize="$2" color={colors.green[800]} fontWeight="600">{r.toUpperCase()}</Text>
            </XStack>
          ))}
        </XStack>
      )
    },
    {
      header: 'Linked Status',
      accessorKey: 'user_id',
      flex: 1,
      cell: (item) => (
        <Text fontSize="$3" color={item.user_id ? colors.green[600] : colors.gray[400]} fontWeight="500">
          {item.user_id ? '● Linked' : '○ Pending'}
        </Text>
      )
    },
    {
      header: 'Actions',
      accessorKey: 'id',
      width: 100,
      cell: (item) => (
        <Button 
          size="$2" 
          chromeless 
          icon={<Trash2 size={16} color={colors.red[500]} />} 
          onPress={async () => {
            await adminApi.delete('staff_members', { eq: { id: item.id } })
            refresh()
          }} 
        />
      )
    }
  ]

  const formFields: FormFieldDef[] = [
    { name: 'email', label: 'Email Address', type: 'email', required: true },
    { 
      name: 'roles', 
      label: 'Admin Privileges', 
      type: 'checkbox_group', 
      description: 'Select one or more roles. Defaults to Support if left empty.',
      options: [
        { label: 'Admin (Superuser)', value: 'admin' },
        { label: 'Moderator', value: 'moderator' },
        { label: 'Support', value: 'support' },
        { label: 'Marketing', value: 'marketing' }
      ]
    }
  ]

  const handleCreate = async (values: any) => {
    setSubmitting(true)
    try {
      let roles = Array.isArray(values.roles) ? [...values.roles] : []
      if (roles.length === 0) roles.push('support') // ensure at least support

      const { error } = await adminApi.insert('staff_members', {
        email: values.email,
        roles
      })
      if (error) {
        console.error(error)
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
          <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Staff & User Management</Text>
          <Text fontSize="$3" color={colors.gray[600]}>Manage dashboard access and staff roles</Text>
        </YStack>
        {!isAdding && (
          <Button 
            backgroundColor={colors.green[600]} 
            icon={<Plus size={16} color="white" />} 
            onPress={() => setIsAdding(true)}
          >
            <Text color="white" fontWeight="600">Add Staff</Text>
          </Button>
        )}
      </XStack>

      {isAdding && (
        <Card borderWidth={1} borderColor={colors.gray[200]} padding="$4" backgroundColor="white" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2">
              <Shield size={20} color={colors.green[700]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Add New Staff Member</Text>
            </XStack>
            <AdminDataForm 
              fields={formFields} 
              onSubmit={handleCreate} 
              onCancel={() => setIsAdding(false)}
              isSubmitting={submitting}
              submitLabel="Add Member"
            />
          </YStack>
        </Card>
      )}

      <AdminDataGrid 
        data={data} 
        columns={columns} 
        isLoading={loading}
        page={page}
        hasMore={hasMore}
        hasPrev={hasPrev}
        onNextPage={next}
        onPrevPage={prev}
        emptyMessage="No staff members found."
      />
    </YStack>
  )
}
