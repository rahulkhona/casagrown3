'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input, Card, Spinner } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Search, Upload, CheckCircle, AlertCircle } from '@tamagui/lucide-icons'
import { EXHAUSTIVE_INTERESTS_CATALOG } from '../../../../next-market/lib/interestCatalog'
import type { InterestCatalogItem } from '../../../../next-market/lib/interestCatalog'

const MARKET_ORIGIN = 'http://localhost:3001'

function resolveImageUrl(url?: string): string {
  if (!url) return `${MARKET_ORIGIN}/images/produce_placeholder.jpg`
  if (url.startsWith('/')) {
    return `${MARKET_ORIGIN}${url}`
  }
  return url
}

export default function AdminInterestsCatalogPage() {
  const [items, setItems] = useState<InterestCatalogItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ id: string; text: string; type: 'success' | 'error' } | null>(null)
  const [activeCameraItem, setActiveCameraItem] = useState<InterestCatalogItem | null>(null)

  const [originalMap] = useState(() => {
    const map = new Map<string, string>()
    EXHAUSTIVE_INTERESTS_CATALOG.forEach((i) => map.set(i.id, i.image))
    return map
  })

  useEffect(() => {
    setItems(EXHAUSTIVE_INTERESTS_CATALOG)
  }, [])

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory
    return matchesSearch && matchesCategory
  })

  const handleUploadImage = async (item: InterestCatalogItem, file: File) => {
    if (!file) return
    setUploadingId(item.id)
    setStatusMessage(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('itemId', item.id)

      const res = await fetch('/api/upload-interest-image', {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        if (data.publicUrl) {
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, image: data.publicUrl } : i)))
          setStatusMessage({ id: item.id, text: 'Replacement image uploaded successfully!', type: 'success' })
          return
        }
      }

      // Local preview fallback
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, image: dataUrl } : i)))
        setStatusMessage({ id: item.id, text: 'Replacement image updated locally!', type: 'success' })
      }
      reader.readAsDataURL(file)
    } catch (err: any) {
      setStatusMessage({ id: item.id, text: err?.message || 'Upload failed', type: 'error' })
    } finally {
      setUploadingId(null)
    }
  }

  const handleRevertToOriginal = (item: InterestCatalogItem) => {
    const orig = originalMap.get(item.id)
    if (orig) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, image: orig } : i)))
      setStatusMessage({ id: item.id, text: 'Reverted to original catalog image!', type: 'success' })
    }
  }

  const CATEGORIES = ['all', 'produce', 'flowers', 'herbs', 'honey', 'eggs', 'plants']

  return (
    <YStack flex={1} padding="$4" gap="$4" backgroundColor={colors.white}>
      {/* Header */}
      <YStack gap="$2">
        <Text fontSize="$8" fontWeight="bold" color={colors.gray[800]}>
          Interests Catalog &amp; Image Management
        </Text>
        <Text fontSize="$4" color={colors.gray[500]}>
          View interest photos mirroring the marketplace and upload replacement images.
        </Text>
      </YStack>

      {/* Controls Bar */}
      <XStack gap="$3" alignSelf="stretch" flexWrap="wrap">
        <XStack flex={1} minWidth={250} backgroundColor="$gray3" borderRadius="$4" paddingHorizontal="$3" alignItems="center">
          <Search size={18} color={colors.gray[500]} />
          <Input
            flex={1}
            borderWidth={0}
            backgroundColor="transparent"
            placeholder="Search interest name or ID..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </XStack>

        <XStack gap="$2" flexWrap="wrap">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              size="$3"
              backgroundColor={filterCategory === cat ? colors.green[600] : colors.gray[100]}
              onPress={() => setFilterCategory(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Button>
          ))}
        </XStack>
      </XStack>

      {/* Interests Grid */}
      <YStack gap="$3">
        <Text fontSize="$3" color={colors.gray[500]}>
          Showing {filteredItems.length} of {items.length} items
        </Text>

        <XStack flexWrap="wrap" gap="$4">
          {filteredItems.map((item) => {
            const isUploading = uploadingId === item.id
            const msg = statusMessage?.id === item.id ? statusMessage : null
            const resolvedUrl = resolveImageUrl(item.image)
            const origImage = originalMap.get(item.id)
            const isModified = origImage && item.image !== origImage

            return (
              <Card
                key={item.id}
                width={300}
                borderWidth={1}
                borderColor={colors.border}
                borderRadius="$4"
                padding="$3"
                elevation={1}
                backgroundColor={colors.white}
              >
                <YStack gap="$3">
                  {/* Image Preview — clean mirror of /interest page without text overlay */}
                  <YStack
                    height={180}
                    backgroundColor="$gray2"
                    borderRadius="$3"
                    overflow="hidden"
                    justifyContent="center"
                    alignItems="center"
                    position="relative"
                  >
                    <img
                      src={resolvedUrl}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement
                        target.onerror = null // Prevent infinite retry loops
                        target.src = `${MARKET_ORIGIN}/images/produce_placeholder.jpg`
                      }}
                    />

                    {/* Revert overlay badge when modified */}
                    {isModified && (
                      <button
                        type="button"
                        title="Revert to original catalog image"
                        onClick={() => handleRevertToOriginal(item)}
                        style={{
                          position: 'absolute',
                          top: '8px',
                          left: '8px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        }}
                      >
                        <span>✕ Revert</span>
                      </button>
                    )}
                  </YStack>

                  {/* Title & Info */}
                  <YStack gap="$1">
                    <Text fontWeight="bold" fontSize="$5" color={colors.gray[800]}>
                      {item.name}
                    </Text>
                    <Text fontSize="$2" color={colors.gray[500]}>
                      ID: {item.id} • Unit: {item.unit || 'item'}
                    </Text>
                  </YStack>

                  {/* Status Toast */}
                  {msg && (
                    <XStack
                      gap="$2"
                      alignItems="center"
                      backgroundColor={msg.type === 'success' ? '$green2' : '$red2'}
                      padding="$2"
                      borderRadius="$2"
                    >
                      {msg.type === 'success'
                        ? <CheckCircle size={14} color="green" />
                        : <AlertCircle size={14} color="red" />}
                      <Text fontSize="$2" color={msg.type === 'success' ? colors.green[700] : colors.red[700]} flex={1}>
                        {msg.text}
                      </Text>
                    </XStack>
                  )}

                  {/* Upload or Take Photo Buttons */}
                  <XStack gap="$2">
                    <label
                      htmlFor={`upload-image-input-${item.id}`}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 10px',
                        backgroundColor: isUploading ? colors.gray[100] : colors.green[600],
                        borderRadius: '8px',
                        color: isUploading ? colors.gray[500] : colors.white,
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: isUploading ? 'not-allowed' : 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      {isUploading ? <Spinner size="small" color="gray" /> : <Upload size={12} color="white" />}
                      <span>📁 Upload</span>
                    </label>
                    <input
                      id={`upload-image-input-${item.id}`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      disabled={isUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUploadImage(item, file)
                      }}
                    />

                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => {
                        if (typeof window !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
                          setActiveCameraItem(item)
                        } else {
                          document.getElementById(`camera-image-input-${item.id}`)?.click()
                        }
                      }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 10px',
                        backgroundColor: isUploading ? colors.gray[100] : colors.gray[800],
                        borderRadius: '8px',
                        color: isUploading ? colors.gray[500] : colors.white,
                        border: 'none',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: isUploading ? 'not-allowed' : 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <span>📷 Camera</span>
                    </button>
                    <input
                      id={`camera-image-input-${item.id}`}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      disabled={isUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUploadImage(item, file)
                      }}
                    />
                  </XStack>

                  {/* Revert to Original Image Action Button */}
                  {isModified && (
                    <Button
                      size="$2"
                      backgroundColor="#fee2e2"
                      onPress={() => handleRevertToOriginal(item)}
                    >
                      <Text color="#b91c1c" fontSize="$2" fontWeight="600">
                        🗑️ Revert to Original Image
                      </Text>
                    </Button>
                  )}
                </YStack>
              </Card>
            )
          })}
        </XStack>
      </YStack>

      {/* Live Admin Webcam Capture Modal */}
      {activeCameraItem && (
        <AdminWebCameraModal
          item={activeCameraItem}
          onCapture={(file) => {
            const itemToUpdate = activeCameraItem
            setActiveCameraItem(null)
            handleUploadImage(itemToUpdate, file)
          }}
          onClose={() => setActiveCameraItem(null)}
        />
      )}
    </YStack>
  )
}

function AdminWebCameraModal({
  item,
  onCapture,
  onClose,
}: {
  item: InterestCatalogItem
  onCapture: (file: File) => void
  onClose: () => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [stream, setStream] = React.useState<MediaStream | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    async function initCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (!active) {
          mediaStream.getTracks().forEach((t) => t.stop())
          return
        }
        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          videoRef.current.play()
        }
      } catch (err: any) {
        if (active) setError(err?.message || 'Camera permission denied or unavailable.')
      }
    }
    initCamera()
    return () => {
      active = false
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const handleTakePhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `studio_${item.id}.jpg`, { type: 'image/jpeg' })
        onCapture(file)
      }
    }, 'image/jpeg', 0.9)
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#1f2937', borderRadius: '20px', overflow: 'hidden', maxWidth: '520px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #374151' }}>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '16px' }}>📷 Take Replacement Photo: {item.name}</span>
          <button type="button" onClick={() => { if (stream) stream.getTracks().forEach(t => t.stop()); onClose() }} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ width: '100%', height: '320px', backgroundColor: 'black', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error ? (
            <div style={{ color: '#ef4444', padding: '20px', textAlign: 'center', fontSize: '14px' }}>{error}</div>
          ) : (
            <video ref={videoRef} playsInline autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div style={{ padding: '16px', display: 'flex', gap: '12px', width: '100%', justifyContent: 'center' }}>
          <button type="button" onClick={() => { if (stream) stream.getTracks().forEach(t => t.stop()); onClose() }} style={{ padding: '10px 20px', borderRadius: '12px', border: '1px solid #4b5563', backgroundColor: '#374151', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={handleTakePhoto} disabled={!stream} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#22c55e', color: 'white', fontWeight: 700, cursor: stream ? 'pointer' : 'not-allowed' }}>📸 Snap Replacement Photo</button>
        </div>
      </div>
    </div>
  )
}
