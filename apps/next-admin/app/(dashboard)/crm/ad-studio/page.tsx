'use client'

import React, { useState, useEffect, useCallback } from 'react'
import ProduceAdPostCreatorModal, { ProduceAdPostModalContext } from '../../../../components/ProduceAdPostCreatorModal'
import GameAdPostCreatorModal, { GameAdPostModalContext } from '../../../../components/GameAdPostCreatorModal'
import CustomAdPostCreatorModal, { CustomModalContext } from '../../../../components/CustomAdPostCreatorModal'

interface CreativeRecord {
  id: string
  title: string
  context_type: string
  produce_ids: string[]
  game_id: string | null
  mab_format_id: string
  mab_format_name: string
  aspect_ratio: string
  video_storage_path: string | null
  preview_video_url: string | null
  duration_seconds: number
  storyboard_payload: any
  approval_status: 'draft_generated' | 'approved' | 'rejected' | 'posted'
  admin_feedback: string | null
  qa_validation_log: any
  meta_ad_id: string | null
  impressions: number
  clicks: number
  conversions: number
  spend: number
  bandit_weight: number
  created_at: string
  updated_at: string
}

export default function AdStudioCreativeLibraryPage() {
  const [creatives, setCreatives] = useState<CreativeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterContext, setFilterContext] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Modals for Re-Launching / Creating
  const [produceModalContext, setProduceModalContext] = useState<ProduceAdPostModalContext>({
    isOpen: false,
    initialPublishType: 'paid_ad',
  })
  const [gameModalContext, setGameModalContext] = useState<GameAdPostModalContext>({
    isOpen: false,
    initialPublishType: 'paid_ad',
  })
  const [customModalContext, setCustomModalContext] = useState<CustomModalContext>({
    isOpen: false,
    initialPublishType: 'organic_post',
  })

  // Fetch Creatives Library
  const fetchCreatives = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filterContext !== 'all') params.set('context_type', filterContext)
      if (filterStatus !== 'all') params.set('approval_status', filterStatus)
      
      const res = await fetch(`/api/crm/ad-studio?${params.toString()}`)
      const data = await res.json()
      if (data.creatives) {
        setCreatives(data.creatives)
      } else {
        setCreatives([])
      }
    } catch (err: any) {
      console.error('Failed to fetch creatives:', err)
      setError('Failed to load creatives library')
    } finally {
      setLoading(false)
    }
  }, [filterContext, filterStatus])

  useEffect(() => {
    fetchCreatives()
  }, [fetchCreatives])

  // Filtered creatives by search query
  const filteredCreatives = creatives.filter(c => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const titleMatch = (c.title || '').toLowerCase().includes(q)
    const headlineMatch = (c.storyboard_payload?.headline || '').toLowerCase().includes(q)
    const copyMatch = (c.storyboard_payload?.primary_copy || '').toLowerCase().includes(q)
    const produceMatch = (c.produce_ids || []).some(p => p.toLowerCase().includes(q))
    const gameMatch = (c.game_id || '').toLowerCase().includes(q)
    return titleMatch || headlineMatch || copyMatch || produceMatch || gameMatch
  })

  // Approve / Reject Creative Status
  const handleUpdateStatus = async (creativeId: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch('/api/crm/ad-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, creativeId }),
      })
      if (res.ok) {
        setCreatives(prev =>
          prev.map(c =>
            c.id === creativeId ? { ...c, approval_status: action === 'approve' ? 'approved' : 'rejected' } : c
          )
        )
      }
    } catch (err) {
      console.error(`Failed to ${action} creative:`, err)
    }
  }

  // Copy Caption to Clipboard
  const handleCopyCaption = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Re-Launch / Open in Modal
  const handleReLaunchCreative = (creative: CreativeRecord) => {
    const isGame = creative.context_type === 'game_promo' || Boolean(creative.game_id)
    if (isGame) {
      setGameModalContext({
        isOpen: true,
        gameId: creative.game_id || 'garden_spell',
        initialPublishType: 'organic_post',
      })
    } else {
      setProduceModalContext({
        isOpen: true,
        produceNames: creative.produce_ids || [],
        targetAudience: creative.context_type.includes('seller') ? 'seller' : 'buyer',
        initialPublishType: 'paid_ad',
      })
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            🎬 Creative Studio &amp; Ad Library
          </h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
            Central repository of video creatives, MAB angles, social posts, and ad campaigns.
          </p>
        </div>

        {/* Quick Launch Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setProduceModalContext({ isOpen: true, targetAudience: 'seller', initialPublishType: 'paid_ad' })}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#16A34A',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)',
            }}
          >
            📢 + New Produce Ad / Post
          </button>
          <button
            onClick={() => setGameModalContext({ isOpen: true, gameId: 'garden_spell', initialPublishType: 'organic_post' })}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#7C3AED',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(124, 58, 237, 0.2)',
            }}
          >
            🎮 + New Game Video Post
          </button>
          <button
            onClick={() => setCustomModalContext({ isOpen: true, initialPublishType: 'organic_post' })}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
            }}
          >
            ✨ + Custom AI Post / Ad
          </button>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', width: '280px' }}>
            <input
              type="text"
              placeholder="🔍 Search headline, copy, produce..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Context Filter */}
          <select
            value={filterContext}
            onChange={e => setFilterContext(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              background: '#FFFFFF',
              color: '#334155',
              fontWeight: 600,
            }}
          >
            <option value="all">All Channels &amp; Contexts</option>
            <option value="seller_single_produce">Seller Sourcing (Produce)</option>
            <option value="buyer_single_produce">Buyer Demand (Produce)</option>
            <option value="game_promo">Games Marketing</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              background: '#FFFFFF',
              color: '#334155',
              fontWeight: 600,
            }}
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="draft_generated">Draft Generated</option>
            <option value="posted">Posted to Facebook</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Refresh Count */}
        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
          {loading ? 'Loading...' : `Showing ${filteredCreatives.length} creative${filteredCreatives.length === 1 ? '' : 's'}`}
        </div>
      </div>

      {/* Main Grid View */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔄</div>
          <div>Loading Creative Studio assets...</div>
        </div>
      ) : error ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444', background: '#FEF2F2', borderRadius: '12px' }}>
          {error}
        </div>
      ) : filteredCreatives.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', background: '#F8FAFC', border: '2px dashed #E2E8F0', borderRadius: '16px' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>📦</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>No Creatives Found</div>
          <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '400px', margin: '0 auto 16px auto' }}>
            Create your first produce demand ad or game video post to start building your creative catalog.
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={() => setProduceModalContext({ isOpen: true, targetAudience: 'seller', initialPublishType: 'paid_ad' })}
              style={{ padding: '8px 14px', borderRadius: '6px', background: '#16A34A', color: '#FFFFFF', border: 'none', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
            >
              + Create Produce Ad
            </button>
            <button
              onClick={() => setGameModalContext({ isOpen: true, gameId: 'garden_spell', initialPublishType: 'organic_post' })}
              style={{ padding: '8px 14px', borderRadius: '6px', background: '#7C3AED', color: '#FFFFFF', border: 'none', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
            >
              + Create Game Post
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {filteredCreatives.map(c => {
            const isGame = c.context_type === 'game_promo' || Boolean(c.game_id)
            const headline = c.storyboard_payload?.headline || c.headline || c.title
            const primaryCopy = c.storyboard_payload?.primary_copy || c.primary_copy || ''
            const videoUrl = c.preview_video_url || c.storyboard_payload?.media?.video_url || c.storyboard_payload?.preview_video_url
            const photoUrls = c.storyboard_payload?.media?.photos || []
            const destinationUrl = c.storyboard_payload?.cta?.destination_url || c.storyboard_payload?.short_url || 'https://casagrown.com'
            const liveFbPostUrl = c.storyboard_payload?.liveFbPostUrl

            return (
              <div
                key={c.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {/* Media Preview Player */}
                <div style={{ position: 'relative', height: '220px', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {videoUrl ? (
                    <video
                      src={videoUrl}
                      controls
                      loop
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : photoUrls.length > 0 ? (
                    <img
                      src={photoUrls[0]}
                      alt="Creative Preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                      <div style={{ fontSize: '32px', marginBottom: '4px' }}>{isGame ? '🎮' : '🌱'}</div>
                      <div style={{ fontSize: '11px', fontWeight: 600 }}>{c.title}</div>
                      <div style={{ fontSize: '10px', color: '#64748B' }}>{c.aspect_ratio || '9:16'} Visual Asset</div>
                    </div>
                  )}

                  {/* Channel Tag Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      padding: '4px 9px',
                      borderRadius: '5px',
                      background: isGame ? '#6D28D9' : c.context_type.includes('seller') ? '#15803D' : '#1D4ED8',
                      color: '#FFFFFF',
                      fontSize: '10px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
                    }}
                  >
                    {isGame ? '🎮 Game Promo' : c.context_type.includes('seller') ? '🏡 Seller Sourcing (Gardeners)' : '🛒 Buyer Demand (Shoppers)'}
                  </div>

                  {/* Approval Status Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: c.approval_status === 'approved' ? '#DCFCE7' : c.approval_status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                      color: c.approval_status === 'approved' ? '#166534' : c.approval_status === 'rejected' ? '#991B1B' : '#92400E',
                      fontSize: '10px',
                      fontWeight: 800,
                      textTransform: 'capitalize',
                      border: '1px solid rgba(0,0,0,0.05)',
                    }}
                  >
                    {c.approval_status === 'draft_generated' ? '📝 Draft' : c.approval_status === 'approved' ? '✓ Approved' : c.approval_status}
                  </div>
                </div>

                {/* Card Body */}
                <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    {/* Title & Date */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.3 }}>
                        {c.title}
                      </h3>
                      <span style={{ fontSize: '10px', color: '#94A3B8', whiteSpace: 'nowrap', marginLeft: '6px' }}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Headline Hook */}
                    {headline && (
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', lineHeight: 1.35 }}>
                        {headline}
                      </div>
                    )}

                    {/* Primary Text Snippet */}
                    {primaryCopy && (
                      <div style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.4, marginBottom: '10px', maxHeight: '54px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                        {primaryCopy}
                      </div>
                    )}

                    {/* Tags & Metadata */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      {!isGame && c.produce_ids?.map((p: string) => (
                        <span key={p} style={{ padding: '2px 6px', borderRadius: '4px', background: '#F1F5F9', color: '#475569', fontSize: '10px', fontWeight: 600 }}>
                          🌱 {p}
                        </span>
                      ))}
                      {isGame && (
                        <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#EDE9FE', color: '#6D28D9', fontSize: '10px', fontWeight: 600 }}>
                          🎮 {c.game_id || 'Garden Spell'}
                        </span>
                      )}
                      <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B', fontSize: '10px', fontWeight: 600 }}>
                        📐 {c.aspect_ratio || '9:16'}
                      </span>
                    </div>
                  </div>

                  {/* Actions & Footer */}
                  <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '6px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'space-between' }}>
                      {/* Re-Launch in Creator Modal */}
                      <button
                        onClick={() => handleReLaunchCreative(c)}
                        style={{
                          flex: 1,
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: isGame ? '#7C3AED' : '#2563EB',
                          color: '#FFFFFF',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                        }}
                      >
                        🚀 Re-Launch / Post
                      </button>

                      {/* Copy Caption */}
                      <button
                        onClick={() => handleCopyCaption(c.id, `${headline ? headline + '\n\n' : ''}${primaryCopy}\n\n👉 ${destinationUrl}`)}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          background: '#FFFFFF',
                          color: copiedId === c.id ? '#16A34A' : '#475569',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {copiedId === c.id ? '✓ Copied' : '📋 Copy'}
                      </button>

                      {/* View on Facebook if posted */}
                      {liveFbPostUrl && (
                        <a
                          href={liveFbPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: '7px 10px',
                            borderRadius: '6px',
                            border: '1px solid #1877F2',
                            background: '#EFF6FF',
                            color: '#1877F2',
                            fontSize: '11px',
                            fontWeight: 700,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          FB ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Dialogs */}
      <ProduceAdPostCreatorModal
        modalContext={produceModalContext}
        onClose={() => {
          setProduceModalContext(prev => ({ ...prev, isOpen: false }))
          fetchCreatives()
        }}
      />

      <GameAdPostCreatorModal
        modalContext={gameModalContext}
        onClose={() => {
          setGameModalContext(prev => ({ ...prev, isOpen: false }))
          fetchCreatives()
        }}
      />

      <CustomAdPostCreatorModal
        modalContext={customModalContext}
        onClose={() => {
          setCustomModalContext(prev => ({ ...prev, isOpen: false }))
          fetchCreatives()
        }}
      />
    </div>
  )
}
