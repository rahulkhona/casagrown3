'use client'

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { YStack, XStack, Text, Button, Card } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Tag, GripVertical } from '@tamagui/lucide-icons'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { AdminDataGrid, ColumnDef } from '../../../../../packages/app/features/admin/components/AdminDataGrid'
import { AdminDataForm, FormFieldDef } from '../../../../../packages/app/features/admin/components/AdminDataForm'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../lib/adminApi'

export default function SalesCategoriesPage() {
  const { data, loading, next, prev, hasMore, hasPrev, page, refresh } = useAdminQuery({ 
    table: 'sales_categories',
    defaultSortParams: { column: 'display_order', ascending: true }
  })

  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [orderedData, setOrderedData] = useState<any[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Sync upstream data to local sorted drag state
  React.useEffect(() => {
    if (data && data.length > 0) {
      setOrderedData([...data].sort((a, b) => a.display_order - b.display_order))
      setIsDirty(false)
    }
  }, [data])

  const handleDragEnd = (result: any) => {
    if (!result.destination) return

    const items = Array.from(orderedData)
    const [reorderedItem] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reorderedItem)

    setOrderedData(items)
    setIsDirty(true)
  }

  const saveOrder = async () => {
    setSubmitting(true)
    try {
      // Bulk update the new physical order mapping it to the 1-indexed integers
      const updates = orderedData.map((item, index) => ({
        name: item.name,
        display_order: index + 1,
        // Because bulk upsert requires the rest of the table's required values, 
        // we use a series of minimal separate requests rather than one complex RPC or array upsert 
        // since categories count is very small < 15.
      }))

      // --- MCO Phase 3: Parallelized Network Saving ---
      // Replaced sequential for-loop with parallel Promise.all matrix
      await Promise.all(
        updates.map(map => 
          adminApi.update('sales_categories', { display_order: map.display_order }, { eq: { name: map.name } })
        )
      )

      refresh()
      setIsDirty(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  const columns: ColumnDef<any>[] = [
    {
      header: 'Category Name',
      accessorKey: 'name',
      flex: 2,
    },
    {
      header: 'Display Order',
      accessorKey: 'display_order',
      flex: 1,
    },
    {
      header: 'Created',
      accessorKey: 'created_at',
      flex: 1,
      cell: (item) => <Text>{new Date(item.created_at).toLocaleDateString()}</Text>
    },
    {
      header: 'Actions',
      accessorKey: 'name',
      width: 100,
      cell: (item) => (
        <Button 
          size="$2" 
          chromeless 
          icon={<Trash2 size={16} color={colors.red[500]} />} 
          onPress={async () => {
            const { error } = await adminApi.delete('sales_categories', { eq: { name: item.name } })
            if (error) console.error(error)
            refresh()
          }} 
        />
      )
    }
  ]

  const formFields: FormFieldDef[] = [
    { name: 'name', label: 'Category Name (e.g., fruits, garden_tools)', type: 'text', required: true }
  ]

  const handleCreate = async (values: any) => {
    setSubmitting(true)
    setErrorMessage('')
    try {
      const nextOrder = data && data.length > 0 ? Math.max(...data.map((d: any) => d.display_order)) + 1 : 1
      const { error } = await adminApi.insert('sales_categories', {
        name: values.name.toLowerCase().replace(/\s+/g, '_'),
        display_order: nextOrder
      })
      if (error) {
        console.error(error)
        setErrorMessage(`Failed to create category: ${error}`)
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
          <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Sales Categories</Text>
          <Text fontSize="$3" color={colors.gray[600]}>Manage product categories</Text>
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
            <Text color="white" fontWeight="600">Add Category</Text>
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
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Create Sales Category</Text>
            </XStack>
            <AdminDataForm 
              fields={formFields} 
              onSubmit={handleCreate} 
              onCancel={() => setIsAdding(false)}
              isSubmitting={submitting}
              submitLabel="Save Category"
            />
          </YStack>
        </Card>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <YStack
          backgroundColor="white"
          borderRadius="$4"
          borderWidth={1}
          borderColor={colors.gray[200]}
        >
          <Droppable droppableId="categories" direction="vertical">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {orderedData.map((item: any, index: number) => (
                  <Draggable key={item.name} draggableId={item.name} index={index}>
                    {(provided, snapshot) => {
                      const rowContent = (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          style={provided.draggableProps.style}
                        >
                          <XStack
                            padding="$4"
                            borderBottomWidth={index === orderedData.length - 1 ? 0 : 1}
                            borderColor={colors.gray[100]}
                            backgroundColor={snapshot.isDragging ? colors.gray[50] : 'white'}
                            alignItems="center"
                            elevation={snapshot.isDragging ? '$2' : '$0'}
                            gap="$4"
                          >
                            <GripVertical size={20} color={colors.gray[400]} />
                            
                            <YStack flex={1}>
                              <Text fontWeight="600" color={colors.gray[900]}>{item.name}</Text>
                              <Text fontSize="$2" color={colors.gray[500]}>Order: {index + 1}</Text>
                            </YStack>

                            <Button
                              size="$2"
                              chromeless
                              icon={<Trash2 size={16} color={colors.red[500]} />}
                              onPress={async () => {
                                setErrorMessage('')
                                const { error } = await adminApi.delete('sales_categories', { eq: { name: item.name } })
                                if (error) {
                                  console.error(error)
                                  setErrorMessage(`Cannot delete "${item.name}". It may be in use by active listings. (${error})`)
                                } else {
                                  refresh()
                                }
                              }}
                            />
                          </XStack>
                        </div>
                      )

                      if (snapshot.isDragging) {
                        return createPortal(rowContent, document.body)
                      }
                      return rowContent
                    }}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </YStack>
      </DragDropContext>

      {isDirty && (
        <XStack justifyContent="flex-end" paddingTop="$4">
          <Button
            backgroundColor={colors.green[600]}
            disabled={submitting}
            onPress={saveOrder}
          >
            <Text color="white" fontWeight="600">Save New Order</Text>
          </Button>
        </XStack>
      )}
    </YStack>
  )
}
