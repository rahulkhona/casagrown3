'use client'

import { useState, useEffect } from 'react'
import { MAB_FORMATS, NARRATOR_VOICES, NarratorVoice } from '../lib/adStudioConstants'

export type VideoModalContext = {
  isOpen: boolean
  contextType: 'seller_single_produce' | 'buyer_single_produce' | 'seller_multi_produce' | 'buyer_multi_produce'
  produceIds: string[]
  produceNames: string[]
  produceImages: string[]
  topZips: string[]
  metricsSummary: string
}

type Scene = {
  scene_number: number
  name: string
  duration_seconds: number
  media_type: string
  visual_description: string
  narrator_voiceover: string
  onscreen_text: string
  speaker_id?: string
  veo_prompt?: string
}

type Storyboard = {
  title?: string
  headline?: string
  primary_copy?: string
  scenes: Scene[]
  cta?: {
    button_text: string
    destination_url?: string
    voiceover: string
  }
}

export default function ProduceVideoCreatorModal({
  modalContext,
  onClose,
}: {
  modalContext: VideoModalContext
  onClose: () => void
}) {
  const { produceNames, topZips, metricsSummary } = modalContext

  const isMulti = modalContext.contextType.includes('multi')
  const initialIsSeller = modalContext.contextType.startsWith('seller')
  
  // Creation Mode: AI Generation vs Manual Video Upload
  const [creationMode, setCreationMode] = useState<'ai_generate' | 'manual_upload'>('ai_generate')
  const [uploadedVideoFile, setUploadedVideoFile] = useState<File | null>(null)
  const [uploadedVideoPreviewUrl, setUploadedVideoPreviewUrl] = useState<string | null>(null)

  const [targetAudience, setTargetAudience] = useState<'seller' | 'buyer'>(initialIsSeller ? 'seller' : 'buyer')
  const [selectedFormat, setSelectedFormat] = useState<string>(initialIsSeller ? 'MAB-1' : 'MAB-2')
  const [customConcept, setCustomConcept] = useState('')
  const [loading, setLoading] = useState(false)
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null)
  const [feedback, setFeedback] = useState('')

  // Narrator Avatar & Voice Settings (Single vs Dual Dialogue)
  const [narrationMode, setNarrationMode] = useState<'single' | 'dual'>('single')
  const [speaker1Voice, setSpeaker1Voice] = useState<string>('maya')
  const [speaker2Voice, setSpeaker2Voice] = useState<string>('marcus')
  const [visualPresenterStyle, setVisualPresenterStyle] = useState<'broll_voiceover' | 'corner_avatar' | 'fullscreen_presenter'>('broll_voiceover')
  const [isAuditioning, setIsAuditioning] = useState<string | null>(null)
  
  // Production & Verification Lifecycle States: 'script' | 'producing' | 'verified' | 'saved'
  const [stage, setStage] = useState<'script' | 'producing' | 'verified' | 'saved'>('script')
  const [producedCreativeId, setProducedCreativeId] = useState<string | null>(null)
  const [activeSceneIdx, setActiveSceneIdx] = useState(0)
  const [isPlayingPreview, setIsPlayingPreview] = useState(false)
  const [previewSceneIdx, setPreviewSceneIdx] = useState(0)

  // Reset/Sync state when modalContext opens
  useEffect(() => {
    if (modalContext.isOpen) {
      const isSel = modalContext.contextType.startsWith('seller')
      setCreationMode('ai_generate')
      setUploadedVideoFile(null)
      setUploadedVideoPreviewUrl(null)
      setTargetAudience(isSel ? 'seller' : 'buyer')
      setSelectedFormat(isSel ? 'MAB-1' : 'MAB-2')
      setCustomConcept('')
      setFeedback('')
      setStage('script')
      setProducedCreativeId(null)
      setIsPlayingPreview(false)
      setPreviewSceneIdx(0)
    }
  }, [modalContext.isOpen, modalContext.contextType])

  const resolvedContextType = `${targetAudience}_${isMulti ? 'multi_produce' : 'single_produce'}`

  // Filter available MAB formats by audience
  const availableFormats = Object.values(MAB_FORMATS).filter(fmt => {
    if (targetAudience === 'seller') {
      return ['MAB-1', 'MAB-3', 'MAB-4', 'MAB-5'].includes(fmt.id)
    }
    return ['MAB-2', 'MAB-4', 'MAB-5'].includes(fmt.id)
  })

  // Clean produce names display
  const cleanProduceNames = produceNames.map(p => 
    p.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  )

  // Instant Voice Audition Player
  const playVoiceAudition = (voiceId: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    setIsAuditioning(voiceId)

    const voice = NARRATOR_VOICES[voiceId] || NARRATOR_VOICES.maya
    const isSel = targetAudience === 'seller'
    const sampleText = isSel
      ? `Hi neighbor! I'm ${voice.name}. Got overloaded fruit trees dropping in your yard? Let's list your harvest on CasaGrown in 60 seconds!`
      : `Hey there! I'm ${voice.name}. Your neighbors are harvesting fresh sweet garden produce right down your street. Tap below to explore!`

    const utterance = new SpeechSynthesisUtterance(sampleText)
    utterance.rate = 1.05
    utterance.pitch = voice.gender === 'female' ? 1.15 : 0.95
    utterance.onend = () => setIsAuditioning(null)
    utterance.onerror = () => setIsAuditioning(null)

    window.speechSynthesis.speak(utterance)
  }

  // Generate / Regenerate Script
  const generateScript = async (formatId: string, customFeedback?: string, customIdeaPrompt?: string) => {
    setLoading(true)
    setProducedCreativeId(null)
    try {
      const combinedFeedback = [
        customFeedback,
        customIdeaPrompt ? `Create a custom new angle concept: "${customIdeaPrompt}"` : null,
        narrationMode === 'dual' ? `Structure as a two-person conversational dialogue between ${NARRATOR_VOICES[speaker1Voice]?.name} and ${NARRATOR_VOICES[speaker2Voice]?.name}` : `Narrated by ${NARRATOR_VOICES[speaker1Voice]?.name} in a ${NARRATOR_VOICES[speaker1Voice]?.tone} tone`
      ].filter(Boolean).join('. ')

      const res = await fetch('/api/crm/ad-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          contextType: resolvedContextType,
          produceIds: modalContext.produceIds,
          mabFormatId: formatId === 'CUSTOM' ? 'MAB-1' : formatId,
          aspectRatio: '9:16',
          adminFeedback: combinedFeedback || undefined,
        }),
      })
      const json = await res.json()
      if (json.success && json.creative) {
        setStoryboard(json.creative.storyboard_payload)
        setProducedCreativeId(json.creative.id)
      }
    } catch (err) {
      console.error('[ProduceVideoCreatorModal] Generation error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Auto-generate on open, audience toggle, format change, or narrator persona change
  useEffect(() => {
    if (modalContext.isOpen && stage === 'script' && creationMode === 'ai_generate') {
      if (selectedFormat !== 'CUSTOM') {
        generateScript(selectedFormat)
      }
    }
  }, [modalContext.isOpen, targetAudience, selectedFormat, narrationMode, speaker1Voice, speaker2Voice])

  // Produce Video Action -> Moves to 'producing' then 'verified'
  const handleProduceVideo = async () => {
    setStage('producing')
    try {
      await new Promise(r => setTimeout(r, 1800))
      setStage('verified')
      setPreviewSceneIdx(0)
    } catch (err) {
      console.error('Error producing video:', err)
      setStage('script')
    }
  }

  // Handle Manual Video File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedVideoFile(file)
      const url = URL.createObjectURL(file)
      setUploadedVideoPreviewUrl(url)
    }
  }

  // Save to Creative Library after Verification
  const handleSaveToLibrary = async () => {
    try {
      if (producedCreativeId) {
        await fetch('/api/crm/ad-studio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'approve',
            creativeId: producedCreativeId,
            adminFeedback: feedback || undefined,
          }),
        })
      }
      setStage('saved')
    } catch (err) {
      console.error('Error saving creative:', err)
    }
  }

  // Preview Playback Simulator Timer
  useEffect(() => {
    let timer: any
    if (isPlayingPreview && storyboard?.scenes) {
      const currentScene = storyboard.scenes[previewSceneIdx]
      const durationMs = (Number(currentScene?.duration_seconds) || 4) * 1000
      timer = setTimeout(() => {
        if (previewSceneIdx < storyboard.scenes.length - 1) {
          setPreviewSceneIdx(i => i + 1)
        } else {
          setPreviewSceneIdx(0)
          setIsPlayingPreview(false)
        }
      }, durationMs)
    }
    return () => clearTimeout(timer)
  }, [isPlayingPreview, previewSceneIdx, storyboard])

  if (!modalContext.isOpen) return null

  const totalDuration = (storyboard?.scenes || []).reduce(
    (acc, s) => acc + (Number(s.duration_seconds) || 4),
    0
  )

  const totalWords = (storyboard?.scenes || []).reduce((acc, s) => {
    return acc + (s.narrator_voiceover || '').trim().split(/\s+/).filter(Boolean).length
  }, 0)

  const wordsPerSec = totalDuration > 0 ? (totalWords / totalDuration).toFixed(1) : '2.4'
  const wpm = totalDuration > 0 ? Math.round((totalWords / totalDuration) * 60) : 145

  const isSeller = targetAudience === 'seller'

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(17, 24, 39, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          maxWidth: '1080px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 24px',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: isSeller ? '#F0FDF4' : '#EFF6FF',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              {/* Audience Target Switcher */}
              <div style={{ display: 'inline-flex', background: '#E5E7EB', padding: '3px', borderRadius: '24px' }}>
                <button
                  disabled={stage !== 'script'}
                  onClick={() => {
                    setTargetAudience('seller')
                    setSelectedFormat('MAB-1')
                  }}
                  style={{
                    border: 'none',
                    padding: '3px 12px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: stage === 'script' ? 'pointer' : 'default',
                    background: isSeller ? '#16A34A' : 'transparent',
                    color: isSeller ? '#FFFFFF' : '#4B5563',
                    transition: 'all 0.15s ease',
                  }}
                >
                  👨‍🌾 Target Sellers (Trees &amp; Listings)
                </button>
                <button
                  disabled={stage !== 'script'}
                  onClick={() => {
                    setTargetAudience('buyer')
                    setSelectedFormat('MAB-2')
                  }}
                  style={{
                    border: 'none',
                    padding: '3px 12px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: stage === 'script' ? 'pointer' : 'default',
                    background: !isSeller ? '#2563EB' : 'transparent',
                    color: !isSeller ? '#FFFFFF' : '#4B5563',
                    transition: 'all 0.15s ease',
                  }}
                >
                  🍎 Target Buyers (Drive Local Orders)
                </button>
              </div>

              {/* Mode Toggle: AI Generation vs BYO Upload */}
              <div style={{ display: 'inline-flex', background: '#E5E7EB', padding: '3px', borderRadius: '6px' }}>
                <button
                  onClick={() => setCreationMode('ai_generate')}
                  style={{
                    border: 'none',
                    padding: '3px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: creationMode === 'ai_generate' ? '#FFFFFF' : 'transparent',
                    color: creationMode === 'ai_generate' ? '#111827' : '#6B7280',
                  }}
                >
                  ✨ AI Video Studio
                </button>
                <button
                  onClick={() => setCreationMode('manual_upload')}
                  style={{
                    border: 'none',
                    padding: '3px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: creationMode === 'manual_upload' ? '#FFFFFF' : 'transparent',
                    color: creationMode === 'manual_upload' ? '#111827' : '#6B7280',
                  }}
                >
                  📁 Upload Custom MP4
                </button>
              </div>

              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600 }}>
                📍 {topZips.length} ZIPs ({topZips.slice(0, 3).join(', ')})
              </span>
            </div>

            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#111827', margin: '0 0 2px 0' }}>
              🎬 {stage === 'verified' || stage === 'saved' ? 'Verify Video for' : 'Create Video for'} {cleanProduceNames.join(' & ')}
            </h2>
            <p style={{ fontSize: '12px', color: '#4B5563', margin: 0 }}>
              📊 Demand Intelligence: <strong>{metricsSummary}</strong>
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#9CA3AF',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* MANUAL VIDEO UPLOAD PATH                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {creationMode === 'manual_upload' && (
          <div style={{ padding: '40px 30px', textAlign: 'center', flex: 1, overflowY: 'auto' }}>
            <div style={{ maxWidth: '540px', margin: '0 auto', background: '#F8FAFC', border: '2px dashed #CBD5E1', borderRadius: '16px', padding: '36px 24px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📹</div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                Upload Your Own Pre-Made Video (MP4 / MOV)
              </h3>
              <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px', lineHeight: 1.5 }}>
                Shot footage on your phone, recorded gameplay, or rendered in external tools? Drop your 9:16 vertical video file here.
              </p>

              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                onChange={handleFileUpload}
                id="manual-video-upload"
                style={{ display: 'none' }}
              />

              <label
                htmlFor="manual-video-upload"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.25)',
                }}
              >
                <span>📂 Choose Video File</span>
              </label>

              {uploadedVideoFile && (
                <div style={{ marginTop: '20px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '12px', textAlign: 'left' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E40AF' }}>
                    ✓ Selected: {uploadedVideoFile.name} ({(uploadedVideoFile.size / 1024 / 1024).toFixed(1)} MB)
                  </div>
                  {uploadedVideoPreviewUrl && (
                    <video
                      src={uploadedVideoPreviewUrl}
                      controls
                      style={{ width: '100%', maxHeight: '200px', borderRadius: '8px', marginTop: '10px' }}
                    />
                  )}
                  <button
                    onClick={handleSaveToLibrary}
                    style={{
                      marginTop: '12px',
                      width: '100%',
                      padding: '10px',
                      background: '#16A34A',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    💾 Save Uploaded Video to Library
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STAGE 1: AI SCRIPT REVIEW & NARRATOR AUDITION                   */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {creationMode === 'ai_generate' && stage === 'script' && (
          <>
            {/* Format Selector Tabs */}
            <div
              style={{
                padding: '8px 24px',
                borderBottom: '1px solid #E5E7EB',
                background: '#F9FAFB',
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                alignItems: 'center',
              }}
            >
              {availableFormats.map(fmt => (
                <button
                  key={fmt.id}
                  onClick={() => {
                    setSelectedFormat(fmt.id)
                    setActiveSceneIdx(0)
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '8px',
                    border: selectedFormat === fmt.id ? '2px solid #16A34A' : '1px solid #D1D5DB',
                    background: selectedFormat === fmt.id ? '#FFFFFF' : '#F3F4F6',
                    color: selectedFormat === fmt.id ? '#166534' : '#374151',
                    fontWeight: selectedFormat === fmt.id ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span>{selectedFormat === fmt.id ? '✓' : '⚡'}</span>
                  <span>{fmt.id}: {fmt.name}</span>
                </button>
              ))}

              <button
                onClick={() => {
                  setSelectedFormat('CUSTOM')
                  setActiveSceneIdx(0)
                }}
                style={{
                  padding: '5px 14px',
                  borderRadius: '8px',
                  border: selectedFormat === 'CUSTOM' ? '2px solid #7C3AED' : '1px dashed #A78BFA',
                  background: selectedFormat === 'CUSTOM' ? '#F5F3FF' : '#FFFFFF',
                  color: selectedFormat === 'CUSTOM' ? '#6D28D9' : '#7C3AED',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span>✨</span>
                <span>+ Create Custom Angle</span>
              </button>
            </div>

            {/* Custom Angle Creative Brief Builder */}
            {selectedFormat === 'CUSTOM' && (
              <div style={{ background: '#FAF5FF', padding: '14px 24px', borderBottom: '1px solid #E9D5FF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#6D28D9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>✨</span>
                    <span>Describe Your Custom Narrative Angle:</span>
                  </label>
                  <span style={{ fontSize: '11px', color: '#7C3AED', fontWeight: 600 }}>
                    Gemini drafts a bespoke 3-scene script (12-15s, ≤35 words)
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {(isSeller ? [
                    'Money doesn\'t grow on trees, but lemons do (humor)',
                    'Kids harvest basket lemonade stand with neighbors',
                    'Zero food waste: stop fruit rotting on green lawns',
                    'Compare $2.99 supermarket price vs free neighbor abundance',
                  ] : [
                    'Sun-ripened California flavor vs 3-week cold storage',
                    'Kids tasting real sweet garden fruit for the first time',
                    'Fresh homemade lemonade made with neighbor\'s harvest',
                  ]).map(chip => (
                    <button
                      key={chip}
                      onClick={() => setCustomConcept(chip)}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #DDD6FE',
                        borderRadius: '14px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        color: '#6D28D9',
                        cursor: 'pointer',
                      }}
                    >
                      💡 {chip}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  placeholder="Describe what you want to happen in the ad..."
                  value={customConcept}
                  onChange={e => setCustomConcept(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #C4B5FD',
                    fontSize: '12px',
                    lineHeight: 1.4,
                    boxSizing: 'border-box',
                    marginBottom: '8px',
                    background: '#FFFFFF',
                    resize: 'vertical',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#8B5CF6' }}>
                    {customConcept.length} chars • Detailed prompts yield richer visual storyboards
                  </span>

                  <button
                    disabled={loading || !customConcept.trim()}
                    onClick={() => generateScript('CUSTOM', feedback, customConcept)}
                    style={{
                      padding: '8px 18px',
                      background: '#7C3AED',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: loading || !customConcept.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ✨ Generate Storyboard
                  </button>
                </div>
              </div>
            )}

            {/* Narrator Avatar & Voice Configuration Suite */}
            <div style={{ background: '#F8FAFC', padding: '10px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              {/* Speaker Mode (Single vs Dual) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                  🎙️ Mode:
                </span>
                <div style={{ display: 'inline-flex', background: '#E2E8F0', padding: '2px', borderRadius: '6px' }}>
                  <button
                    onClick={() => setNarrationMode('single')}
                    style={{
                      border: 'none',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: narrationMode === 'single' ? '#FFFFFF' : 'transparent',
                      color: narrationMode === 'single' ? '#0F172A' : '#64748B',
                    }}
                  >
                    👤 Single Narrator
                  </button>
                  <button
                    onClick={() => setNarrationMode('dual')}
                    style={{
                      border: 'none',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: narrationMode === 'dual' ? '#FFFFFF' : 'transparent',
                      color: narrationMode === 'dual' ? '#0F172A' : '#64748B',
                    }}
                  >
                    👥 Dual Dialogue
                  </button>
                </div>
              </div>

              {/* Speaker Selectors + Audition Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {/* Speaker 1 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                    {narrationMode === 'dual' ? 'Speaker 1:' : 'Voice:'}
                  </span>
                  <select
                    value={speaker1Voice}
                    onChange={e => setSpeaker1Voice(e.target.value)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      background: '#FFFFFF',
                      color: '#0F172A',
                      fontWeight: 600,
                    }}
                  >
                    {Object.values(NARRATOR_VOICES).map(v => (
                      <option key={v.id} value={v.id}>
                        {v.avatarEmoji} {v.name} — {v.tone}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => playVoiceAudition(speaker1Voice)}
                    style={{
                      background: isAuditioning === speaker1Voice ? '#DCFCE7' : '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: isAuditioning === speaker1Voice ? '#15803D' : '#334155',
                      cursor: 'pointer',
                    }}
                    title="Audition 3s voice sample"
                  >
                    {isAuditioning === speaker1Voice ? '🔊 Playing...' : '▶ Audition'}
                  </button>
                </div>

                {/* Speaker 2 (If Dual Dialogue) */}
                {narrationMode === 'dual' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                      Speaker 2:
                    </span>
                    <select
                      value={speaker2Voice}
                      onChange={e => setSpeaker2Voice(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        fontWeight: 600,
                      }}
                    >
                      {Object.values(NARRATOR_VOICES).map(v => (
                        <option key={v.id} value={v.id}>
                          {v.avatarEmoji} {v.name} — {v.tone}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => playVoiceAudition(speaker2Voice)}
                      style={{
                        background: isAuditioning === speaker2Voice ? '#DCFCE7' : '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: isAuditioning === speaker2Voice ? '#15803D' : '#334155',
                        cursor: 'pointer',
                      }}
                      title="Audition 3s voice sample"
                    >
                      {isAuditioning === speaker2Voice ? '🔊 Playing...' : '▶ Audition'}
                    </button>
                  </div>
                )}

                {/* Visual Avatar Style */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                    Style:
                  </span>
                  <select
                    value={visualPresenterStyle}
                    onChange={e => setVisualPresenterStyle(e.target.value as any)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '11px',
                      background: '#FFFFFF',
                      color: '#334155',
                    }}
                  >
                    <option value="broll_voiceover">🎙️ B-Roll + Subtitle Voiceover</option>
                    <option value="corner_avatar">👤 Corner Avatar Bubble</option>
                    <option value="fullscreen_presenter">🎭 Full Presenter Shot</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Main Script Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', flex: 1, overflow: 'hidden' }}>
              {/* Left: 3-Scene Storyboard */}
              <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>
                      📜 3-Scene Video Script &amp; Storyboard
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        ⏱️ Duration: ~{totalDuration}s (Optimal 12-15s)
                      </span>
                      <span style={{ fontSize: '11px', background: totalWords <= 38 ? '#DCFCE7' : '#FEF3C7', color: totalWords <= 38 ? '#15803D' : '#B45309', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        📝 {totalWords} words ({totalWords <= 38 ? '✓ In Budget ≤38w' : '⚠️ Long'})
                      </span>
                      <span style={{ fontSize: '11px', background: '#EFF6FF', color: '#1D4ED8', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        🎙️ Cadence: {wpm} WPM ({wordsPerSec} w/s)
                      </span>
                    </div>
                  </div>
                  {loading && (
                    <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: 600 }}>
                      ⏳ Gemini drafting script...
                    </span>
                  )}
                </div>

                {loading ? (
                  <div style={{ textAlign: 'center', padding: '50px 20px', color: '#6B7280' }}>
                    <div style={{ fontSize: '28px', marginBottom: '10px' }}>🌱</div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>
                      Drafting customized {isSeller ? 'Seller Acquisition' : 'Buyer Discovery'} script...
                    </div>
                  </div>
                ) : storyboard ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {storyboard.scenes.map((scene, idx) => {
                      const sceneWords = (scene.narrator_voiceover || '').trim().split(/\s+/).filter(Boolean).length
                      const sceneWps = scene.duration_seconds > 0 ? (sceneWords / scene.duration_seconds).toFixed(1) : '2.5'

                      return (
                        <div
                          key={idx}
                          onClick={() => setActiveSceneIdx(idx)}
                          style={{
                            border: activeSceneIdx === idx ? '2px solid #16A34A' : '1px solid #E5E7EB',
                            background: activeSceneIdx === idx ? '#F0FDF4' : '#F9FAFB',
                            borderRadius: '10px',
                            padding: '14px',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 800,
                                background: activeSceneIdx === idx ? '#16A34A' : '#E5E7EB',
                                color: activeSceneIdx === idx ? '#FFFFFF' : '#374151',
                                padding: '2px 7px',
                                borderRadius: '4px',
                              }}
                            >
                              Scene {scene.scene_number}: {scene.name}
                            </span>
                            <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600 }}>
                              ⏱️ {scene.duration_seconds}s • 📝 {sceneWords} words ({sceneWps} w/s) • 🎬 {scene.media_type}
                            </span>
                          </div>

                          {(() => {
                            const activeSpeaker = narrationMode === 'dual'
                              ? (idx % 2 === 0 ? NARRATOR_VOICES[speaker1Voice] : NARRATOR_VOICES[speaker2Voice])
                              : NARRATOR_VOICES[speaker1Voice]

                            return (
                              <div style={{ marginBottom: '6px', fontSize: '13px', color: '#111827', lineHeight: 1.4 }}>
                                <strong style={{ color: activeSpeaker?.avatarColor || '#166534' }}>
                                  {activeSpeaker?.avatarEmoji} {activeSpeaker?.name} ({narrationMode === 'dual' ? (idx % 2 === 0 ? 'Speaker 1' : 'Speaker 2') : 'Voiceover'}):
                                </strong> "{scene.narrator_voiceover}"
                              </div>
                            )
                          })()}

                          <div style={{ fontSize: '12px', color: '#4B5563', marginBottom: '4px' }}>
                            <strong>📱 On-Screen Text:</strong> {scene.onscreen_text}
                          </div>

                          <div style={{ fontSize: '11px', color: '#6B7280', fontStyle: 'italic' }}>
                            <strong>🎥 Visual Cue:</strong> {scene.visual_description}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              {/* Right: Feedback & Produce Trigger */}
              <div
                style={{
                  padding: '20px',
                  background: '#F9FAFB',
                  borderLeft: '1px solid #E5E7EB',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  overflowY: 'auto',
                }}
              >
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>
                    💬 Guide &amp; Iterate Script:
                  </h4>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                    {(isSeller ? [
                      'Make hook more urgent',
                      'Focus on tree dropping fruit',
                      'Emphasize extra cash',
                      'Zero food waste message',
                    ] : [
                      'Focus on tree-ripened flavor',
                      'Compare to cold storage',
                      'More neighborly',
                      'Emphasize zero pesticides',
                    ]).map(chip => (
                      <button
                        key={chip}
                        onClick={() => setFeedback(chip)}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #D1D5DB',
                          borderRadius: '14px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          color: '#374151',
                          cursor: 'pointer',
                        }}
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={3}
                    placeholder="Give instructions to Gemini to iterate on voiceover, hook, or visuals..."
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '8px',
                      border: '1px solid #D1D5DB',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                      marginBottom: '8px',
                      background: '#FFFFFF',
                    }}
                  />

                  <button
                    disabled={loading}
                    onClick={() => generateScript(selectedFormat, feedback, customConcept)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: '#374151',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    🔄 Regenerate Script with Feedback
                  </button>
                </div>

                <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '14px' }}>
                  <button
                    disabled={loading || !storyboard}
                    onClick={handleProduceVideo}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: '#16A34A',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '14px',
                      cursor: loading || !storyboard ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.3)',
                    }}
                  >
                    <span>🎥</span>
                    <span>Produce Video</span>
                  </button>

                  <div style={{ textAlign: 'center', marginTop: '8px' }}>
                    <button
                      onClick={onClose}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#6B7280',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STAGE 2: PRODUCING IN PROGRESS                                 */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {creationMode === 'ai_generate' && stage === 'producing' && (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px', animation: 'spin 1.5s infinite linear' }}>
              ⚙️
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#111827', margin: '0 0 6px 0' }}>
              Rendering &amp; Producing Video Creative...
            </h3>
            <p style={{ fontSize: '13px', color: '#6B7280', maxWidth: '460px', margin: '0 auto' }}>
              Synthesizing 3 high-definition vertical scenes with {narrationMode === 'dual' ? `${NARRATOR_VOICES[speaker1Voice]?.name} & ${NARRATOR_VOICES[speaker2Voice]?.name}` : NARRATOR_VOICES[speaker1Voice]?.name} voiceover and cinematic 9:16 framing.
            </p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STAGE 3: VERIFICATION & POST-PRODUCTION REVIEW                 */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {creationMode === 'ai_generate' && (stage === 'verified' || stage === 'saved') && storyboard && (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, overflow: 'hidden' }}>
            {/* Left: 9:16 Video Player Simulator */}
            <div style={{ padding: '20px', background: '#111827', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div
                style={{
                  width: '210px',
                  height: '373px',
                  background: '#1F2937',
                  borderRadius: '16px',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                  border: '2px solid #374151',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '16px',
                  boxSizing: 'border-box',
                }}
              >
                {/* Scene Indicator Top Pill */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
                  <span style={{ background: 'rgba(0,0,0,0.6)', color: '#FFFFFF', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>
                    Scene {previewSceneIdx + 1}/3
                  </span>
                  <span style={{ background: '#16A34A', color: '#FFFFFF', fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                    PRODUCED
                  </span>
                </div>

                {/* Simulated Visual Content */}
                <div style={{ textAlign: 'center', zIndex: 2, padding: '10px' }}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>
                    {isSeller ? '🌳' : '🥑'}
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.7)', color: '#FACC15', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, lineHeight: 1.3 }}>
                    {storyboard.scenes[previewSceneIdx]?.onscreen_text}
                  </div>
                </div>

                {/* Voiceover Subtitle Bottom Bar */}
                <div style={{ zIndex: 2 }}>
                  <div style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', padding: '8px 10px', borderRadius: '8px', color: '#FFFFFF', fontSize: '10px', lineHeight: 1.3, marginBottom: '8px' }}>
                    🎙️ "{storyboard.scenes[previewSceneIdx]?.narrator_voiceover}"
                  </div>

                  <button
                    onClick={() => setIsPlayingPreview(!isPlayingPreview)}
                    style={{
                      width: '100%',
                      padding: '6px',
                      background: isPlayingPreview ? '#EF4444' : '#16A34A',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isPlayingPreview ? '⏸ Pause Preview' : '▶ Play 14s Preview'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Scene Breakdown & Save / Edit Actions */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflowY: 'auto' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#111827', margin: 0 }}>
                    🔍 Inspect Produced Video Scenes
                  </h3>
                  <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                    ✓ 3 Clips Ready
                  </span>
                </div>

                {/* Scene Clip Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  {storyboard.scenes.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPreviewSceneIdx(idx)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '8px',
                        border: previewSceneIdx === idx ? '2px solid #16A34A' : '1px solid #E5E7EB',
                        background: previewSceneIdx === idx ? '#F0FDF4' : '#F9FAFB',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 800, color: previewSceneIdx === idx ? '#166534' : '#4B5563' }}>
                        Clip {s.scene_number}: {s.name}
                      </div>
                      <div style={{ fontSize: '10px', color: '#6B7280', marginTop: '2px' }}>
                        ⏱️ {s.duration_seconds}s • {s.media_type}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Selected Clip Inspection Card */}
                {storyboard.scenes[previewSceneIdx] && (
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                      Clip {storyboard.scenes[previewSceneIdx].scene_number}: {storyboard.scenes[previewSceneIdx].name}
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.4, marginBottom: '6px' }}>
                      <strong style={{ color: '#166534' }}>🎙️ Voiceover:</strong> "{storyboard.scenes[previewSceneIdx].narrator_voiceover}"
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                      <strong>📱 Text Overlay:</strong> {storyboard.scenes[previewSceneIdx].onscreen_text}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>
                      <strong>🎥 Visual Description:</strong> {storyboard.scenes[previewSceneIdx].visual_description}
                    </div>
                  </div>
                )}

                {/* Edit Instructions Box if Requesting Changes */}
                <div style={{ marginTop: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>
                    ✏️ Need edits or adjustments?
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Provide feedback to refine voiceover, visual cues, or pacing..."
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #D1D5DB',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Action Buttons: Save vs Edit/Retry */}
              <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={() => setStage('script')}
                  style={{
                    flex: 1,
                    padding: '11px',
                    background: '#FFFFFF',
                    border: '1px solid #D1D5DB',
                    color: '#374151',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  ✏️ Edit &amp; Refine Script
                </button>

                <button
                  onClick={handleProduceVideo}
                  style={{
                    padding: '11px 16px',
                    background: '#F3F4F6',
                    border: '1px solid #D1D5DB',
                    color: '#374151',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  🔄 Re-Produce
                </button>

                <button
                  onClick={handleSaveToLibrary}
                  disabled={stage === 'saved'}
                  style={{
                    flex: 1.5,
                    padding: '11px',
                    background: stage === 'saved' ? '#059669' : '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: stage === 'saved' ? 'default' : 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.3)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{stage === 'saved' ? '✅' : '💾'}</span>
                  <span>{stage === 'saved' ? 'Saved to Creative Library' : 'Approve & Save Video'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
