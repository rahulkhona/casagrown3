'use client'

import React, { useState, useEffect, useCallback } from 'react'
// @ts-expect-error react-dom types
import { createPortal } from 'react-dom'
import { YStack, XStack, Text, Button, Card, Input, Label } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Edit3, GripVertical, FileVideo, Save, ArrowLeft } from '@tamagui/lucide-icons'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { adminApi } from '../../../../lib/adminApi'
import { supabase } from '@casagrown/app/utils/supabase'
import CampaignMessageEditor from '../../../../components/CampaignMessageEditor'

export default function TutorialsManagementPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const res = await adminApi.select('tutorial_sections', '*', undefined, {
        order: { column: 'sort_order', ascending: true }
      })
      if (res.error) {
        setErrorMessage(res.error)
      } else {
        setData(res.data || [])
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load tutorials')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const [isAdding, setIsAdding] = useState(false)
  const [editingItem, setEditingItem] = useState<any | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [orderedData, setOrderedData] = useState<any[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; title: string } | null>(null)

  // Form State
  const [formTitle, setFormTitle] = useState('')
  const [formVideoUrl, setFormVideoUrl] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formIsPublished, setFormIsPublished] = useState(true)

  // Sync upstream data to local sorted drag state
  useEffect(() => {
    if (data && data.length > 0) {
      setOrderedData([...data].sort((a, b) => a.sort_order - b.sort_order))
      setIsDirty(false)
    } else {
      setOrderedData([])
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
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const updates = orderedData.map((item, index) => ({
        id: item.id,
        sort_order: index + 1
      }))

      // Update in parallel
      await Promise.all(
        updates.map(up =>
          adminApi.update('tutorial_sections', { sort_order: up.sort_order }, { eq: { id: up.id } })
        )
      )

      setSuccessMessage('Sort order updated successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)
      refresh()
      setIsDirty(false)
    } catch (e: any) {
      setErrorMessage(`Failed to update sorting: ${e.message || e}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditInit = (item: any) => {
    setEditingItem(item)
    setFormTitle(item.title)
    setFormVideoUrl(item.video_url)
    setFormDescription(item.description)
    setFormIsPublished(item.is_published)
    setErrorMessage('')
  }

  const handleAddInit = () => {
    setIsAdding(true)
    setEditingItem(null)
    setFormTitle('')
    setFormVideoUrl('')
    setFormDescription('')
    setFormIsPublished(true)
    setErrorMessage('')
  }

  const resetFormState = () => {
    setIsAdding(false)
    setEditingItem(null)
    setFormTitle('')
    setFormVideoUrl('')
    setFormDescription('')
    setFormIsPublished(true)
    setErrorMessage('')
  }

  const handleSaveForm = async () => {
    if (!formTitle.trim()) {
      setErrorMessage('Please enter a tutorial title.')
      return
    }
    if (!formVideoUrl.trim()) {
      setErrorMessage('Please enter a video URL.')
      return
    }
    const isDescEmpty = !formDescription || formDescription.replace(/<[^>]*>/g, '').trim().length === 0;
    if (isDescEmpty) {
      setErrorMessage('Please enter a description.')
      return
    }

    console.log('[handleSaveForm] Inputs validated. Submitting state active. title:', formTitle, 'video_url:', formVideoUrl, 'desc_len:', formDescription.length);
    setSubmitting(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      console.log('[handleSaveForm] Sending data via adminApi. editingItem:', !!editingItem);
      if (editingItem) {
        // Update existing item
        const { error } = await adminApi.update(
          'tutorial_sections',
          {
            title: formTitle.trim(),
            video_url: formVideoUrl.trim(),
            description: formDescription,
            is_published: formIsPublished,
            updated_at: new Date().toISOString()
          },
          { eq: { id: editingItem.id } }
        )
        if (error) throw new Error(error)
        setSuccessMessage(`Tutorial "${formTitle.trim()}" updated successfully`)
      } else {
        // Insert new item
        const nextOrder = data && data.length > 0 ? Math.max(...data.map((d: any) => d.sort_order)) + 1 : 1
        const { error } = await adminApi.insert('tutorial_sections', {
          title: formTitle.trim(),
          video_url: formVideoUrl.trim(),
          description: formDescription,
          is_published: formIsPublished,
          sort_order: nextOrder
        })
        if (error) throw new Error(error)
        setSuccessMessage(`Tutorial "${formTitle.trim()}" created successfully`)
      }

      setTimeout(() => setSuccessMessage(''), 3000)
      resetFormState()
      refresh()
    } catch (e: any) {
      setErrorMessage(`Failed to save tutorial: ${e.message || e}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteInit = (id: string, title: string) => {
    setDeleteConfirmItem({ id, title })
  }

  const executeDelete = async () => {
    if (!deleteConfirmItem) return
    const { id, title } = deleteConfirmItem
    setDeleteConfirmItem(null)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const { error } = await adminApi.delete('tutorial_sections', { eq: { id } })
      if (error) throw new Error(error)
      setSuccessMessage(`Tutorial "${title}" deleted successfully`)
      setTimeout(() => setSuccessMessage(''), 3000)
      refresh()
    } catch (e: any) {
      setErrorMessage(`Failed to delete: ${e.message || e}`)
    }
  }

  const editorForm = {
    channel: 'email' as const,
    content_html: formDescription,
    content_text: '',
    subject: '',
    name: '',
    postmark_template_alias: '',
    test_emails: '',
  }
  
  const setEditorForm = (updater: any) => {
    if (typeof updater === 'function') {
      const nextVal = updater(editorForm)
      setFormDescription(nextVal.content_html)
    } else {
      setFormDescription(updater.content_html)
    }
  }

  const isFormOpen = isAdding || !!editingItem

  return (
    <YStack flex={1} padding="$4" gap="$4" position="relative">
      {/* Confirmation Modal Overlay */}
      {deleteConfirmItem && (
        <YStack position="absolute" top={0} left={0} right={0} bottom={0} backgroundColor="rgba(0,0,0,0.4)" zIndex={1000} justifyContent="center" alignItems="center">
          <YStack backgroundColor="white" padding="$5" borderRadius="$4" width={400} elevation="$4" gap="$4">
            <XStack gap="$3" alignItems="center">
              <FileVideo color={colors.red[600]} size={24} />
              <Text fontSize="$5" fontWeight="bold" color={colors.gray[900]}>Delete Tutorial</Text>
            </XStack>
            <Text color={colors.gray[600]}>
              Are you sure you want to delete the tutorial &quot;{deleteConfirmItem.title}&quot;? This action cannot be undone.
            </Text>
            <XStack justifyContent="flex-end" gap="$3" marginTop="$2">
              <Button chromeless onPress={() => setDeleteConfirmItem(null)}>
                <Text color={colors.gray[600]}>Cancel</Text>
              </Button>
              <Button backgroundColor={colors.red[600]} onPress={executeDelete}>
                <Text color="white" fontWeight="600">Yes, delete</Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      )}

      {/* HEADER SECTION */}
      <XStack justifyContent="space-between" alignItems="center" borderBottomWidth={1} borderColor={colors.gray[100]} paddingBottom="$4">
        <XStack alignItems="center" gap="$3">
          <FileVideo size={28} color={colors.green[700]} />
          <YStack>
            <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Tutorials Management</Text>
            <Text fontSize="$3" color={colors.gray[600]}>Create, organize, and reorder video tutorials for casagrown.com</Text>
          </YStack>
        </XStack>
        
        {!isFormOpen && (
          <XStack gap="$3">
            {isDirty && (
              <Button
                backgroundColor={colors.blue[600]}
                hoverStyle={{ backgroundColor: colors.blue[700] }}
                icon={<Save size={16} color="white" />}
                onPress={saveOrder}
                disabled={submitting}
              >
                <Text color="white" fontWeight="600">{submitting ? 'Saving...' : 'Save New Order'}</Text>
              </Button>
            )}
            <Button
              backgroundColor={colors.green[600]}
              hoverStyle={{ backgroundColor: colors.green[700] }}
              icon={<Plus size={16} color="white" />}
              onPress={handleAddInit}
            >
              <Text color="white" fontWeight="600">Add Tutorial</Text>
            </Button>
          </XStack>
        )}
      </XStack>

      {/* FEEDBACK BANNERS */}
      {errorMessage && (
        <YStack backgroundColor={colors.red[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.red[200]}>
          <Text color={colors.red[800]} fontWeight="600">{errorMessage}</Text>
        </YStack>
      )}

      {successMessage && (
        <YStack backgroundColor={colors.green[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.green[200]}>
          <Text color={colors.green[800]} fontWeight="600">{successMessage}</Text>
        </YStack>
      )}

      {loading && data.length === 0 ? (
        <YStack alignItems="center" padding="$8">
          <Text fontSize="$4" color={colors.gray[500]}>Loading tutorials...</Text>
        </YStack>
      ) : null}

      {/* FORM: CREATE OR EDIT */}
      {isFormOpen && (
        <Card borderWidth={1} borderColor={colors.gray[200]} padding="$4" backgroundColor="white" borderRadius="$4" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" justifyContent="space-between" borderBottomWidth={1} borderColor={(colors.gray as any)[150]} paddingBottom="$2">
              <XStack alignItems="center" gap="$2">
                <FileVideo size={20} color={colors.green[600]} />
                <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>
                  {editingItem ? `Edit Tutorial: ${editingItem.title}` : 'Add New Video Tutorial'}
                </Text>
              </XStack>
              <Button size="$2" icon={<ArrowLeft size={14} />} onPress={resetFormState} chromeless>
                Back to List
              </Button>
            </XStack>

            <YStack gap="$3">
              {/* Title */}
              <YStack gap="$1">
                <Label fontWeight="600" fontSize="$3" color={colors.gray[700]}>Tutorial Title *</Label>
                <Input
                  value={formTitle}
                  onChangeText={setFormTitle}
                  placeholder="e.g. Getting Started: Setting Up Your Produce Stand"
                  backgroundColor="white"
                  borderColor={colors.gray[300]}
                />
              </YStack>

              {/* Video URL */}
              <YStack gap="$1">
                <Label fontWeight="600" fontSize="$3" color={colors.gray[700]}>Video URL *</Label>
                <Input
                  value={formVideoUrl}
                  onChangeText={setFormVideoUrl}
                  placeholder="e.g. https://www.youtube.com/watch?v=XYZ or https://youtube.com/shorts/XYZ"
                  backgroundColor="white"
                  borderColor={colors.gray[300]}
                />
                <Text fontSize="$2" color={colors.gray[500]}>
                  YouTube videos (widescreen 16:9) and YouTube Shorts (vertical 9:16) are automatically formatted.
                </Text>
              </YStack>

              {/* Description */}
              <YStack gap="$1">
                <CampaignMessageEditor
                  form={editorForm}
                  setForm={setEditorForm as any}
                  templateMode={false}
                  setTemplateMode={() => {}}
                  dataSources={[]}
                  supabase={supabase}
                  toast={(msg: string) => {
                    setSuccessMessage(msg)
                    setTimeout(() => setSuccessMessage(''), 3000)
                  }}
                  showChannelSelector={false}
                  showTestAndDataFields={false}
                  showDesignModeSelector={false}
                  showVariablesSelector={false}
                  showSubjectAndPreheader={false}
                />
              </YStack>

              {/* Status */}
              <XStack alignItems="center" gap="$3" marginTop="$2">
                <input
                  type="checkbox"
                  id="formIsPublished"
                  checked={formIsPublished}
                  onChange={(e) => setFormIsPublished(e.target.checked)}
                  style={{
                    width: 18,
                    height: 18,
                    cursor: 'pointer',
                    accentColor: colors.green[600]
                  }}
                />
                <Label htmlFor="formIsPublished" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Publish Tutorial (visible immediately on casagrown.com)
                </Label>
              </XStack>
            </YStack>

            <XStack gap="$3" justifyContent="flex-end" marginTop="$2" borderTopWidth={1} borderColor={(colors.gray as any)[150]} paddingTop="$3">
              <Button chromeless onPress={resetFormState}>
                <Text color={colors.gray[600]}>Cancel</Text>
              </Button>
              <Button backgroundColor={colors.green[600]} onPress={handleSaveForm} disabled={submitting}>
                <Text color="white" fontWeight="600">{submitting ? 'Saving...' : 'Save Tutorial'}</Text>
              </Button>
            </XStack>
          </YStack>
        </Card>
      )}

      {/* DRAG AND DROP LIST OF SECTIONS */}
      {!isFormOpen && (
        <YStack gap="$2">
          {orderedData.length === 0 ? (
            <YStack padding="$8" alignItems="center" borderWidth={1} borderStyle="dashed" borderColor={colors.gray[300]} borderRadius="$4" backgroundColor="white">
              <Text fontSize="$4" color={(colors.gray as any)[450]}>No video tutorials created yet.</Text>
              <Button size="$3" backgroundColor={colors.green[600]} marginTop="$3" onPress={handleAddInit}>
                <Text color="white" fontWeight="600">Create First Tutorial</Text>
              </Button>
            </YStack>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="tutorials" direction="vertical">
                {(provided) => (
                  <YStack
                    {...provided.droppableProps}
                    ref={provided.innerRef as any}
                    backgroundColor="white"
                    borderRadius="$4"
                    borderWidth={1}
                    borderColor={colors.gray[200]}
                    overflow="hidden"
                  >
                    {orderedData.map((item: any, index: number) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
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
                                borderColor={(colors.gray as any)[150]}
                                backgroundColor={snapshot.isDragging ? colors.gray[50] : 'white'}
                                alignItems="center"
                                justifyContent="space-between"
                                elevation={snapshot.isDragging ? '$2' : '$0'}
                                gap="$4"
                              >
                                <XStack alignItems="center" gap="$3" flex={1}>
                                  <GripVertical size={20} color={colors.gray[400]} />
                                  <YStack flex={1} gap="$1">
                                    <XStack alignItems="center" gap="$2">
                                      <Text fontWeight="700" fontSize="$4" color={colors.gray[900]}>
                                        {item.title}
                                      </Text>
                                      {!item.is_published && (
                                        <XStack backgroundColor={colors.amber[100]} paddingHorizontal="$2" paddingVertical="$0.5" borderRadius="$2">
                                          <Text fontSize="$1" fontWeight="600" color={(colors.amber as any)[800]}>Draft</Text>
                                        </XStack>
                                      )}
                                    </XStack>
                                    <Text fontSize="$2" color={colors.gray[500]} numberOfLines={1}>
                                      {item.video_url}
                                    </Text>
                                  </YStack>
                                </XStack>

                                <XStack gap="$2">
                                  <Button
                                    size="$2"
                                    chromeless
                                    icon={<Edit3 size={16} color={colors.gray[600]} />}
                                    onPress={() => handleEditInit(item)}
                                    aria-label="Edit Tutorial"
                                    data-testid={`tutorial-edit-${item.id}`}
                                  />
                                  <Button
                                    size="$2"
                                    chromeless
                                    icon={<Trash2 size={16} color={colors.red[500]} />}
                                    onPress={() => handleDeleteInit(item.id, item.title)}
                                    aria-label="Delete Tutorial"
                                    data-testid={`tutorial-delete-${item.id}`}
                                  />
                                </XStack>
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
                  </YStack>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </YStack>
      )}
    </YStack>
  )
}
