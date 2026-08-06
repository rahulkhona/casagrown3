'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input, Card, Spinner, Image } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Search, RefreshCw, Upload, CheckCircle, AlertCircle, Image as ImageIcon } from '@tamagui/lucide-icons'
import { EXHAUSTIVE_US_PRODUCE, ProduceItem } from '../../../../next-market/lib/produceCatalog'

export default function AdminProduceCatalogPage() {
  const [items, setItems] = useState<ProduceItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ id: string; text: string; type: 'success' | 'error' } | null>(null)
  const [editingImageUrl, setEditingImageUrl] = useState<{ id: string; url: string } | null>(null)

  useEffect(() => {
    // Combine predefined items with any custom items
    setItems(EXHAUSTIVE_US_PRODUCE)
  }, [])

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.id.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory
    return matchesSearch && matchesCategory
  })

  // Trigger Gemini Vision AI re-search for an item
  const handleAiReSearch = async (item: ProduceItem) => {
    setProcessingId(item.id)
    setStatusMessage(null)

    try {
      const res = await fetch('/api/interest/resolve-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: item.name })
      })
      const data = await res.json()

      if (res.ok && data.success && data.image) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, image: data.image } : i))
        )
        setStatusMessage({ id: item.id, text: 'Image successfully verified & updated by Gemini Vision!', type: 'success' })
      } else {
        setStatusMessage({ id: item.id, text: data.message || 'AI could not find a higher-quality photo.', type: 'error' })
      }
    } catch (err: any) {
      setStatusMessage({ id: item.id, text: err?.message || 'Re-search failed', type: 'error' })
    } finally {
      setProcessingId(null)
    }
  }

  // Update image URL manually
  const handleSaveCustomUrl = (id: string, newUrl: string) => {
    if (!newUrl.trim()) return
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, image: newUrl.trim() } : i))
    )
    setEditingImageUrl(null)
    setStatusMessage({ id, text: 'Custom image URL updated!', type: 'success' })
  }

  return (
    <YStack f={1} p="$4" space="$4" backgroundColor={colors.white}>
      {/* Header */}
      <YStack space="$2">
        <Text fontSize="$8" fontWeight="bold" color={colors.charcoal}>
          Produce Catalog & Image Management
        </Text>
        <Text fontSize="$4" color={colors.charcoalLight}>
          Audit, AI-verify, and manage produce photos across the marketplace and custom user interests.
        </Text>
      </YStack>

      {/* Controls Bar */}
      <XStack space="$3" alignSelf="stretch" flexWrap="wrap">
        <XStack f={1} minWidth={250} backgroundColor="$gray3" borderRadius="$4" px="$3" alignItems="center">
          <Search size={18} color={colors.charcoalLight} />
          <Input
            f={1}
            borderWidth={0}
            backgroundColor="transparent"
            placeholder="Search produce name or ID..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </XStack>

        <XStack space="$2">
          {['all', 'produce', 'flowers', 'herbs', 'honey', 'eggs', 'seedlings'].map((cat) => (
            <Button
              key={cat}
              size="$3"
              theme={filterCategory === cat ? 'active' : 'alt1'}
              onPress={() => setFilterCategory(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Button>
          ))}
        </XStack>
      </XStack>

      {/* Produce Grid */}
      <YStack space="$3">
        <Text fontSize="$3" color={colors.charcoalLight}>
          Showing {filteredItems.length} items
        </Text>

        <XStack flexWrap="wrap" gap="$4">
          {filteredItems.map((item) => {
            const isProcessing = processingId === item.id
            const isEditing = editingImageUrl?.id === item.id
            const msg = statusMessage?.id === item.id ? statusMessage : null

            return (
              <Card
                key={item.id}
                width={300}
                borderWidth={1}
                borderColor={colors.sageLight}
                borderRadius="$4"
                padding="$3"
                elevation={1}
                backgroundColor={colors.white}
              >
                <YStack space="$3">
                  {/* Image Preview */}
                  <YStack height={140} backgroundColor="$gray2" borderRadius="$3" overflow="hidden" position="relative" justifyContent="center" alignItems="center">
                    <img
                      src={item.image || '/images/produce_placeholder.jpg'}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement
                        target.src = '/images/produce_placeholder.jpg'
                      }}
                    />
                    <Text
                      position="absolute"
                      top={8}
                      right={8}
                      backgroundColor="rgba(0,0,0,0.6)"
                      color="white"
                      px="$2"
                      py="$1"
                      borderRadius="$2"
                      fontSize="$1"
                    >
                      {item.displayCategory}
                    </Text>
                  </YStack>

                  {/* Title & Info */}
                  <YStack space="$1">
                    <Text fontWeight="bold" fontSize="$5" color={colors.charcoal}>
                      {item.name}
                    </Text>
                    <Text fontSize="$2" color={colors.charcoalLight}>
                      ID: {item.id} • Unit: {item.unit}
                    </Text>
                  </YStack>

                  {/* Status Toast */}
                  {msg && (
                    <XStack
                      space="$2"
                      alignItems="center"
                      backgroundColor={msg.type === 'success' ? '$green2' : '$red2'}
                      p="$2"
                      borderRadius="$2"
                    >
                      {msg.type === 'success' ? <CheckCircle size={14} color="green" /> : <AlertCircle size={14} color="red" />}
                      <Text fontSize="$2" color={msg.type === 'success' ? 'green' : 'red'} f={1}>
                        {msg.text}
                      </Text>
                    </XStack>
                  )}

                  {/* Edit Custom URL Input */}
                  {isEditing ? (
                    <YStack space="$2">
                      <Input
                        size="$2"
                        placeholder="Paste image URL..."
                        value={editingImageUrl.url}
                        onChangeText={(t) => setEditingImageUrl({ id: item.id, url: t })}
                      />
                      <XStack space="$2">
                        <Button size="$2" theme="active" f={1} onPress={() => handleSaveCustomUrl(item.id, editingImageUrl.url)}>
                          Save
                        </Button>
                        <Button size="$2" theme="alt2" onPress={() => setEditingImageUrl(null)}>
                          Cancel
                        </Button>
                      </XStack>
                    </YStack>
                  ) : (
                    /* Action Buttons */
                    <XStack space="$2">
                      <Button
                        size="$2"
                        f={1}
                        theme="active"
                        disabled={isProcessing}
                        onPress={() => handleAiReSearch(item)}
                        icon={isProcessing ? <Spinner size="small" color="white" /> : <RefreshCw size={14} />}
                      >
                        {isProcessing ? 'AI Auditing...' : 'AI Re-Search'}
                      </Button>
                      <Button
                        size="$2"
                        theme="alt1"
                        onPress={() => setEditingImageUrl({ id: item.id, url: item.image })}
                        icon={<Upload size={14} />}
                      >
                        Edit URL
                      </Button>
                    </XStack>
                  )}
                </YStack>
              </Card>
            )
          })}
        </XStack>
      </YStack>
    </YStack>
  )
}
