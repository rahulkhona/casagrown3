'use client'

import React, { useState } from 'react'
import { YStack, XStack, Text, Button, Card, Separator, ScrollView, Spinner } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Check, X, Edit3, ExternalLink, RefreshCw, RotateCcw } from '@tamagui/lucide-icons'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../lib/adminApi'

type TabKey = 'pending' | 'posted' | 'failed'

export default function FbPostModerationPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [publishing, setPublishing] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMessage, setEditMessage] = useState('')
  const [editPhotos, setEditPhotos] = useState<string[]>([])
  const [newPhotoUrl, setNewPhotoUrl] = useState('')


  // Convert URLs in text to clickable links
  const linkifyText = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = text.split(urlRegex)
    return parts.map((part, i) => {
      if (urlRegex.test(part)) {
        // Reset regex lastIndex
        urlRegex.lastIndex = 0
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            style={{ color: '#1877F2', textDecoration: 'none', wordBreak: 'break-all' }}
          >{part}</a>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  const { data: allPosts, loading, refresh } = useAdminQuery({
    table: 'fb_post_queue',
    defaultSortParams: { column: 'created_at', ascending: false },
  })

  // Client-side filter by tab
  const data = (allPosts || []).filter((p: any) => {
    if (activeTab === 'pending') return p.status === 'pending'
    if (activeTab === 'posted') return p.status === 'posted' || p.status === 'approved'
    if (activeTab === 'failed') return p.status === 'failed' || p.status === 'rejected'
    return true
  })

  const pendingCount = (allPosts || []).filter((p: any) => p.status === 'pending').length
  const postedCount = (allPosts || []).filter((p: any) => p.status === 'posted' || p.status === 'approved').length
  const failedCount = (allPosts || []).filter((p: any) => p.status === 'failed' || p.status === 'rejected').length

  const handleApprove = async (postId: string) => {
    setPublishing(postId)
    try {
      const { error: updateErr } = await adminApi.update('fb_post_queue', {
        status: 'approved',
        reviewed_at: new Date().toISOString(),
      }, { eq: { id: postId } })

      if (updateErr) {
        console.error('Approve error:', updateErr)
        return
      }

      // Trigger publish
      await fetch('/api/supabase-fn/publish-fb-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
    } finally {
      setPublishing(null)
      refresh()
    }
  }

  const handleReject = async (postId: string) => {
    const { error } = await adminApi.update('fb_post_queue', {
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
    }, { eq: { id: postId } })
    if (error) console.error(error)
    refresh()
  }

  const handleEditSave = async (postId: string) => {
    // Find the post to check its metadata type
    const post = (allPosts || []).find((p: any) => p.id === postId)
    const meta = post?.metadata || {}

    // Build updated metadata with new photos
    let updatedMetadata = { ...meta }
    if (meta.seller_photos) {
      // For welcome posts, we can't easily rebuild seller_photos from URLs
      // Just replace with product-style photos array
      updatedMetadata = { ...meta, seller_photos: meta.seller_photos }
      // If photos were edited, update seller_photos images
      if (editPhotos.length > 0) {
        const sellerPhotos = (meta.seller_photos || []).map((s: any, i: number) => ({
          ...s,
          photo: editPhotos[i] || s.photo,
          avatar: editPhotos[i] || s.avatar,
        }))
        // Add any extra photos as new entries
        for (let i = (meta.seller_photos || []).length; i < editPhotos.length; i++) {
          sellerPhotos.push({ name: `Seller ${i + 1}`, photo: editPhotos[i], avatar: null })
        }
        updatedMetadata.seller_photos = sellerPhotos
      }
    } else {
      updatedMetadata.photos = editPhotos
    }

    const { error } = await adminApi.update('fb_post_queue', {
      post_message: editMessage,
      post_photo_url: editPhotos[0] || post?.post_photo_url || null,
      metadata: updatedMetadata,
    }, { eq: { id: postId } })
    if (error) console.error(error)
    setEditingId(null)
    setNewPhotoUrl('')
    refresh()
  }

  const handleRetry = async (postId: string) => {
    setPublishing(postId)
    try {
      await adminApi.update('fb_post_queue', {
        status: 'approved',
        error_message: null,
      }, { eq: { id: postId } })

      await fetch('/api/supabase-fn/publish-fb-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
    } finally {
      setPublishing(null)
      refresh()
    }
  }

  const triggerLabels: Record<string, { emoji: string; label: string }> = {
    new_listing: { emoji: '🌱', label: 'Daily Digest' },
    manual: { emoji: '🎉', label: 'New Seller Welcome' },
    price_drop: { emoji: '🔥', label: 'Price Drop' },
    back_in_stock: { emoji: '📦', label: 'Back in Stock' },
    photo_update: { emoji: '📸', label: 'Photo Update' },
  }

  const tabStyle = (tab: TabKey, count: number) => ({
    padding: '10px 24px', borderRadius: 10, border: 'none',
    fontSize: 14, fontWeight: 600 as const, cursor: 'pointer' as const,
    background: activeTab === tab ? '#065f46' : '#f3f4f6',
    color: activeTab === tab ? 'white' : '#6b7280',
    transition: 'all 0.2s',
    display: 'flex', alignItems: 'center' as const, gap: 8,
  })

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <YStack flex={1} padding="$4" gap="$4">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize="$7" fontWeight="700" color={colors.green[900]}>📘 Facebook Post Queue</Text>
          <Text fontSize="$3" color={colors.gray[600]}>
            Review and approve auto-generated posts before they go live on CasaGrown's Facebook page
          </Text>
        </YStack>
        <Button
          backgroundColor={colors.gray[100]}
          icon={<RefreshCw size={14} color={colors.gray[600]} />}
          onPress={refresh}
          size="$3"
        >
          <Text fontSize="$2" color={colors.gray[600]}>Refresh</Text>
        </Button>
      </XStack>

      {/* Tabs */}
      <XStack gap="$2">
        <button style={tabStyle('pending', pendingCount)} onClick={() => setActiveTab('pending')}>
          ⏳ Pending Review
          {pendingCount > 0 && (
            <span style={{
              background: 'white', color: '#065f46', borderRadius: 99,
              padding: '1px 8px', fontSize: 12, fontWeight: 700,
              ...(activeTab !== 'pending' ? { background: '#fef9c3', color: '#92400e' } : {}),
            }}>{pendingCount}</span>
          )}
        </button>
        <button style={tabStyle('posted', postedCount)} onClick={() => setActiveTab('posted')}>
          ✅ Posted ({postedCount})
        </button>
        <button style={tabStyle('failed', failedCount)} onClick={() => setActiveTab('failed')}>
          ❌ Failed ({failedCount})
        </button>
      </XStack>

      {/* Loading */}
      {loading && (
        <YStack alignItems="center" padding="$8">
          <Spinner size="large" color={colors.green[600]} />
        </YStack>
      )}

      {/* Empty state */}
      {!loading && data.length === 0 && (
        <Card padding="$6" backgroundColor={colors.gray[50]} borderWidth={1} borderColor={colors.gray[200]}>
          <Text textAlign="center" color={colors.gray[500]} fontSize="$4">
            {activeTab === 'pending' ? 'No posts pending review' :
             activeTab === 'posted' ? 'No posts published yet' :
             'No failed posts'}
          </Text>
        </Card>
      )}

      {/* Post cards */}
      <YStack gap="$3">
        {data.map((post: any) => {
          const trigger = triggerLabels[post.trigger_type] || { emoji: '📝', label: post.trigger_type }
          const isEditing = editingId === post.id
          const isPublishing = publishing === post.id

          return (
            <Card
              key={post.id}
              padding={0}
              borderWidth={1}
              borderColor={post.status === 'pending' ? '#fcd34d' : colors.gray[200]}
              backgroundColor="white"
              borderRadius={12}
              overflow="hidden"
            >
              {/* Card header */}
              <XStack
                padding="$3"
                backgroundColor={post.status === 'pending' ? '#fffbeb' : '#f9fafb'}
                alignItems="center"
                justifyContent="space-between"
              >
                <XStack gap="$2" alignItems="center">
                  <span style={{ fontSize: 18 }}>{trigger.emoji}</span>
                  <YStack>
                    <Text fontSize={14} fontWeight="700" color={colors.gray[800]}>
                      {trigger.label}
                    </Text>
                    <Text fontSize={11} color={colors.gray[500]}>
                      {formatDate(post.created_at)}
                      {post.target === 'casagrown_page' ? ' • CasaGrown Page' : ' • Seller Page'}
                    </Text>
                  </YStack>
                </XStack>

                {/* Status badge */}
                <span style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  padding: '3px 10px', borderRadius: 6,
                  background: post.status === 'pending' ? '#fef9c3' :
                              post.status === 'approved' ? '#dbeafe' :
                              post.status === 'posted' ? '#dcfce7' :
                              '#fee2e2',
                  color: post.status === 'pending' ? '#92400e' :
                         post.status === 'approved' ? '#1d4ed8' :
                         post.status === 'posted' ? '#166534' :
                         '#dc2626',
                }}>
                  {post.status}
                </span>
              </XStack>

              <Separator />

              {/* Always show FB preview, switch to editor when editing */}
              {isEditing ? (
                /* Edit mode */
                <YStack padding="$3" gap="$2">
                  <Text fontSize={12} fontWeight="600" color={colors.gray[600]}>
                    Edit Post Message:
                  </Text>
                  <textarea
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: 260,
                      padding: 14,
                      fontSize: 14,
                      lineHeight: '1.6',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      border: '2px solid #3b82f6',
                      borderRadius: 10,
                      resize: 'vertical',
                      outline: 'none',
                      background: '#f8fafc',
                    }}
                  />
                  <XStack gap="$2">
                    <button
                      onClick={() => handleEditSave(post.id)}
                      style={{
                        padding: '8px 20px', fontSize: 13, fontWeight: 600,
                        background: '#059669', color: 'white', border: 'none',
                        borderRadius: 8, cursor: 'pointer',
                      }}
                    >
                      💾 Save Changes
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        padding: '8px 20px', fontSize: 13,
                        background: '#f3f4f6', border: '1px solid #d1d5db',
                        borderRadius: 8, cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </XStack>
                </YStack>
              ) : (
                /* Facebook preview — always shown */
                <div style={{ padding: 16 }}>
                  <div style={{
                    maxWidth: 500, margin: '0 auto',
                    border: '1px solid #dddfe2', borderRadius: 8,
                    background: 'white', overflow: 'hidden',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}>
                    {/* FB post header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 20, background: '#1877F2',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 700, fontSize: 18,
                      }}>C</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#050505' }}>CasaGrown</div>
                        <div style={{ fontSize: 12, color: '#65676B' }}>
                          {formatDate(post.created_at)} · 🌐
                        </div>
                      </div>
                    </div>

                    {/* FB post text with clickable links */}
                    <div style={{
                      padding: '0 16px 12px', fontSize: 15, lineHeight: '1.5',
                      color: '#050505', whiteSpace: 'pre-wrap',
                    }}>
                      {linkifyText(post.post_message?.replace(/\*\*/g, '') || '')}
                    </div>

                    {/* FB photo grid — matches how Facebook renders multi-photo posts */}
                    {(() => {
                      const meta = post.metadata || {}
                      const productPhotos = meta.photos as string[] | undefined
                      const sellerPhotos = meta.seller_photos as Array<{ name: string; photo: string | null; avatar: string | null }> | undefined

                      // Collect all photo URLs
                      let allPhotos: string[] = []
                      if (productPhotos && productPhotos.length > 0) {
                        allPhotos = productPhotos.filter((u: string) => u)
                      } else if (sellerPhotos && sellerPhotos.length > 0) {
                        allPhotos = sellerPhotos
                          .map((s: any) => s.photo || s.avatar)
                          .filter((u: any) => u)
                      } else if (post.post_photo_url) {
                        allPhotos = [post.post_photo_url]
                      }

                      if (allPhotos.length === 0) return null

                      const count = allPhotos.length
                      const extra = count > 5 ? count - 4 : 0
                      const shown = allPhotos.slice(0, extra > 0 ? 4 : count)

                      // 1 photo: full width
                      if (count === 1) {
                        return (
                          <img src={shown[0]} alt="" style={{
                            width: '100%', maxHeight: 400, objectFit: 'cover',
                          }} />
                        )
                      }

                      // 2 photos: side by side
                      if (count === 2) {
                        return (
                          <div style={{ display: 'flex', gap: 2 }}>
                            {shown.map((url, i) => (
                              <img key={i} src={url} alt="" style={{
                                width: '50%', height: 250, objectFit: 'cover',
                              }} />
                            ))}
                          </div>
                        )
                      }

                      // 3 photos: 1 large left, 2 stacked right
                      if (count === 3) {
                        return (
                          <div style={{ display: 'flex', gap: 2, height: 300 }}>
                            <img src={shown[0]} alt="" style={{
                              width: '60%', height: '100%', objectFit: 'cover',
                            }} />
                            <div style={{ width: '40%', display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <img src={shown[1]} alt="" style={{
                                width: '100%', height: '50%', objectFit: 'cover',
                              }} />
                              <img src={shown[2]} alt="" style={{
                                width: '100%', height: '50%', objectFit: 'cover',
                              }} />
                            </div>
                          </div>
                        )
                      }

                      // 4+ photos: 2x2 grid, with +N overlay on last if 5+
                      return (
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 1fr',
                          gap: 2,
                        }}>
                          {shown.map((url, i) => (
                            <div key={i} style={{ position: 'relative' }}>
                              <img src={url} alt="" style={{
                                width: '100%', height: 160, objectFit: 'cover',
                              }} />
                              {extra > 0 && i === 3 && (
                                <div style={{
                                  position: 'absolute', inset: 0,
                                  background: 'rgba(0,0,0,0.5)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: 'white', fontSize: 28, fontWeight: 700,
                                }}>
                                  +{extra}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {/* No link card — photo posts suppress it on real Facebook */}

                    {/* FB reactions bar */}
                    <div style={{
                      borderTop: '1px solid #dddfe2', padding: '8px 16px',
                      display: 'flex', justifyContent: 'space-between',
                      color: '#65676B', fontSize: 14, fontWeight: 600,
                    }}>
                      <span>👍 Like</span>
                      <span>💬 Comment</span>
                      <span>↗️ Share</span>
                    </div>
                  </div>

                  {/* Error message below preview */}
                  {post.error_message && (
                    <div style={{
                      maxWidth: 500, margin: '10px auto 0',
                      padding: '8px 12px', borderRadius: 8,
                      background: '#fef2f2', border: '1px solid #fecaca',
                      fontSize: 13, color: '#dc2626',
                    }}>
                      ⚠️ {post.error_message}
                    </div>
                  )}
                </div>
              )}

              {/* Card footer — actions */}
              {!isEditing && (
                <>
                  <Separator />
                  <XStack padding="$3" gap="$2" justifyContent="flex-end" backgroundColor="#fafafa">
                    {post.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(post.id)}
                          disabled={isPublishing}
                          style={{
                            padding: '8px 20px', fontSize: 13, fontWeight: 600,
                            background: isPublishing ? '#d1d5db' : '#059669',
                            color: 'white', border: 'none',
                            borderRadius: 8, cursor: isPublishing ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          {isPublishing ? '⏳ Publishing...' : '✅ Approve & Post'}
                        </button>
                        <button
                          onClick={() => { setEditingId(post.id); setEditMessage(post.post_message) }}
                          style={{
                            padding: '8px 20px', fontSize: 13, fontWeight: 600,
                            background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                            borderRadius: 8, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleReject(post.id)}
                          style={{
                            padding: '8px 20px', fontSize: 13, fontWeight: 600,
                            background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                            borderRadius: 8, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          ❌ Reject
                        </button>
                      </>
                    )}
                    {post.status === 'failed' && (
                      <button
                        onClick={() => handleRetry(post.id)}
                        disabled={isPublishing}
                        style={{
                          padding: '8px 20px', fontSize: 13, fontWeight: 600,
                          background: '#fef9c3', color: '#92400e', border: '1px solid #fcd34d',
                          borderRadius: 8, cursor: 'pointer',
                        }}
                      >
                        🔄 Retry
                      </button>
                    )}
                    {post.status === 'posted' && post.fb_post_id && (
                      <a
                        href={`https://facebook.com/${post.fb_post_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '8px 20px', fontSize: 13, fontWeight: 600,
                          background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                          borderRadius: 8, textDecoration: 'none',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        🔗 View on Facebook
                      </a>
                    )}
                  </XStack>
                </>
              )}
            </Card>
          )
        })}
      </YStack>
    </YStack>
  )
}
