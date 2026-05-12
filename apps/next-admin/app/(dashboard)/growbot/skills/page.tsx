'use client'

import React, { useState } from 'react'
import { YStack, XStack, Text, Button, Card } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Tag, SquarePen, Eye, EyeOff } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../../packages/app/features/admin/components/AdminDataGrid'
import { AdminDataForm, FormFieldDef } from '../../../../../../packages/app/features/admin/components/AdminDataForm'
import { useAdminQuery } from '../../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../../lib/adminApi'

export default function SkillsPage() {
  const { data, loading, next, prev, hasMore, hasPrev, page, refresh } = useAdminQuery({ 
    table: 'growbot_skills',
    defaultSortParams: { column: 'name', ascending: true }
  })

  const [isAdding, setIsAdding] = useState(false)
  const [editingSkill, setEditingSkill] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const columns: ColumnDef<any>[] = [
    {
      header: 'Tool Name',
      accessorKey: 'name',
      flex: 1,
    },
    {
      header: 'Description (Trigger Rules)',
      accessorKey: 'trigger_rules',
      flex: 2,
      cell: (item) => (
        <Text numberOfLines={2} fontSize="$2" color={colors.gray[700]}>
          {item.trigger_rules}
        </Text>
      )
    },
    {
      header: 'Backend RPC',
      accessorKey: 'backend_function',
      flex: 1,
      cell: (item) => (
        <Text fontSize="$2" color={item.backend_function ? colors.green[700] : colors.gray[400]} fontFamily="$mono">
          {item.backend_function || '—'}
        </Text>
      )
    },
    {
      header: 'Active',
      accessorKey: 'is_active',
      width: 80,
      cell: (item) => (
        <Button
          size="$2"
          chromeless
          icon={item.is_active ? <Eye size={16} color={colors.green[600]} /> : <EyeOff size={16} color={colors.gray[400]} />}
          onPress={async () => {
            const { error } = await adminApi.update('growbot_skills', { is_active: !item.is_active }, { eq: { id: item.id } })
            if (error) console.error(error)
            refresh()
          }}
        />
      )
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
            icon={<SquarePen size={16} color={colors.blue[600]} />} 
            onPress={() => {
              setErrorMessage('')
              setIsAdding(false)
              setEditingSkill(item)
            }} 
          />
          <Button 
            size="$2" 
            chromeless 
            icon={<Trash2 size={16} color={colors.red[500]} />} 
            onPress={async () => {
              const { error } = await adminApi.delete('growbot_skills', { eq: { id: item.id } })
              if (error) console.error(error)
              refresh()
            }} 
          />
        </XStack>
      )
    }
  ]

  const formFields: FormFieldDef[] = [
    { 
      name: 'name', 
      label: 'Tool Name', 
      type: 'text', 
      required: true,
      placeholder: 'e.g. SearchMarketProducts, DiagnosePlant',
      description: 'This becomes the function name the LLM calls. Use PascalCase, no spaces.'
    },
    { 
      name: 'trigger_rules', 
      label: 'Tool Description (for the LLM)', 
      type: 'textarea', 
      required: true,
      placeholder: 'e.g. Use this tool when the user wants to search for produce, plants, or goods available on the local CasaGrown marketplace.',
      description: 'This text tells the AI when and why to use this tool. Be specific and detailed.'
    },
    { 
      name: 'schema_properties', 
      label: 'Schema Properties (JSON)', 
      type: 'textarea', 
      required: false,
      placeholder: '[{"name": "search_query", "type": "string", "description": "The search term"}, {"name": "category", "type": "string", "description": "Product category"}]',
      description: 'JSON array defining the parameters the LLM should extract. Each entry needs: name, type (string|array|object_array), description. Optional: required (boolean).'
    },
    { 
      name: 'backend_function', 
      label: 'Backend RPC Function', 
      type: 'text', 
      required: false,
      placeholder: 'e.g. search_market_products',
      description: 'The Postgres RPC function to execute when this tool is called. Leave blank if the tool only collects data (like UserMemoryCard).'
    },
    { 
      name: 'template', 
      label: 'UI Render Template', 
      type: 'textarea', 
      required: false,
      placeholder: 'e.g. **Results for {{search_query}}:**\n{{backend_results}}',
      description: 'Optional template for rendering results in the chat UI. Use {{field_name}} placeholders. If blank, the frontend uses its default card renderer.'
    },
  ]

  const handleCreate = async (values: any) => {
    setSubmitting(true)
    setErrorMessage('')
    try {
      let schemaProps = values.schema_properties
      if (typeof schemaProps === 'string' && schemaProps.trim()) {
        schemaProps = JSON.parse(schemaProps)
      } else if (!schemaProps) {
        schemaProps = []
      }

      const { error } = await adminApi.insert('growbot_skills', {
        name: values.name,
        trigger_rules: values.trigger_rules,
        schema_properties: schemaProps,
        backend_function: values.backend_function || null,
        template: values.template || null,
        is_active: true
      })
      if (error) {
        console.error(error)
        setErrorMessage(`Failed to create skill: ${error}`)
      } else {
        setIsAdding(false)
        refresh()
      }
    } catch(e: any) {
      setErrorMessage(`Failed to parse Schema Properties JSON: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (values: any) => {
    if (!editingSkill) return
    setSubmitting(true)
    setErrorMessage('')
    try {
      let schemaProps = values.schema_properties
      if (typeof schemaProps === 'string' && schemaProps.trim()) {
        schemaProps = JSON.parse(schemaProps)
      } else if (!schemaProps) {
        schemaProps = []
      }

      const { error } = await adminApi.update('growbot_skills', {
        name: values.name,
        trigger_rules: values.trigger_rules,
        schema_properties: schemaProps,
        backend_function: values.backend_function || null,
        template: values.template || null,
      }, { eq: { id: editingSkill.id } })
      if (error) {
        console.error(error)
        setErrorMessage(`Failed to update skill: ${error}`)
      } else {
        setEditingSkill(null)
        refresh()
      }
    } catch(e: any) {
      setErrorMessage(`Failed to parse Schema Properties JSON: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Prepare initial values for edit form — stringify JSON fields
  const editInitialValues = editingSkill ? {
    ...editingSkill,
    schema_properties: editingSkill.schema_properties 
      ? JSON.stringify(editingSkill.schema_properties, null, 2)
      : '',
    backend_function: editingSkill.backend_function || '',
    template: editingSkill.template || '',
  } : undefined

  return (
    <YStack flex={1} padding="$4" gap="$4">
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>GrowBot Tools</Text>
          <Text fontSize="$3" color={colors.gray[600]}>Define the suite of tools the AI can use. Each tool becomes a native function the LLM can call.</Text>
        </YStack>
        {!isAdding && !editingSkill && (
          <Button 
            backgroundColor={colors.green[600]} 
            icon={<Plus size={16} color="white" />} 
            onPress={() => {
              setErrorMessage('')
              setEditingSkill(null)
              setIsAdding(true)
            }}
          >
            <Text color="white" fontWeight="600">Add Tool</Text>
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
        <Card borderWidth={1} borderColor={colors.green[200]} padding="$4" backgroundColor="white" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2">
              <Tag size={20} color={colors.green[700]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Create New Tool</Text>
            </XStack>
            <AdminDataForm 
              fields={formFields} 
              onSubmit={handleCreate} 
              onCancel={() => setIsAdding(false)}
              isSubmitting={submitting}
              submitLabel="Save Tool"
            />
          </YStack>
        </Card>
      )}

      {editingSkill && (
        <Card borderWidth={1} borderColor={colors.blue[200]} padding="$4" backgroundColor="white" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2">
              <SquarePen size={20} color={colors.blue[600]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Edit Tool: {editingSkill.name}</Text>
            </XStack>
            <AdminDataForm 
              fields={formFields} 
              initialValues={editInitialValues}
              onSubmit={handleUpdate} 
              onCancel={() => setEditingSkill(null)}
              isSubmitting={submitting}
              submitLabel="Update Tool"
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
