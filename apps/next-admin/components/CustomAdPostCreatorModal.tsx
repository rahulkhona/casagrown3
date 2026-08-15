'use client'

import { useState, useEffect } from 'react'
import MetaSettingsModal from './MetaSettingsModal'
import { EXHAUSTIVE_INTERESTS_CATALOG } from '../../next-market/lib/interestCatalog'

export interface CustomModalContext {
  isOpen: boolean
  initialPublishType?: 'paid_ad' | 'organic_post'
  initialPrompt?: string
}

const TONE_PRESETS = [
  { id: 'announcement', label: '📢 Announcement & Events', emoji: '📢' },
  { id: 'community', label: '🏡 Community & Milestone', emoji: '🏡' },
  { id: 'harvest', label: '🍋 Seasonal Harvest & Food', emoji: '🍋' },
  { id: 'gardening', label: '🌱 Gardening & Tree Care Tips', emoji: '🌱' },
  { id: 'games', label: '🎮 Daily Game & Puzzle Challenge', emoji: '🎮' },
  { id: 'promo', label: '🎁 Special Offer & Free Sign-up', emoji: '🎁' },
]

const SUGGESTED_META_INTERESTS = [
  'Gardeners',
  'Gardening',
  'Organic Farming',
  'Vegetable Gardening',
  'Fruit Trees',
  'Urban Agriculture',
  'Home Gardening',
  'Permaculture',
  'Plant Care',
  'Farmers Market',
  'Organic Food',
  'Local Food',
  'Healthy Eating',
  'Health & Wellness',
  'Wordle',
  'Brain Games',
  'Sudoku',
  'Crossword Puzzles',
  'Casual Gaming',
  'Retirement & Leisure',
]

export default function CustomAdPostCreatorModal({
  modalContext,
  context,
  onClose,
}: {
  modalContext?: CustomModalContext
  context?: any
  onClose: () => void
}) {
  const ctx = modalContext || context || {}
  const [publishType, setPublishType] = useState<'paid_ad' | 'organic_post'>(ctx.initialPublishType || 'organic_post')
  
  // Custom Prompt & Tone
  const [customPrompt, setCustomPrompt] = useState(ctx.initialPrompt || '')
  const [selectedTone, setSelectedTone] = useState('announcement')
  const [generatingCopy, setGeneratingCopy] = useState(false)

  // Copywriting State
  const [headline, setHeadline] = useState('')
  const [primaryText, setPrimaryText] = useState('')
  const [callToAction, setCallToAction] = useState('Learn More')
  const [copyVariations, setCopyVariations] = useState<{ headline: string; text: string; cta: string }[]>([])

  // Media Creative State
  const [mediaMode, setMediaMode] = useState<'video' | 'photos'>('photos')
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([])
  const [showPhotoGallery, setShowPhotoGallery] = useState(false)
  const [videoSourceMode, setVideoSourceMode] = useState<'upload' | 'saved_library'>('upload')
  const [uploadedVideoFile, setUploadedVideoFile] = useState<File | null>(null)
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null)
  const [selectedSavedVideoTitle, setSelectedSavedVideoTitle] = useState<string>('')
  const [savedVideos, setSavedVideos] = useState<Array<{ id: string; title: string; preview_video_url: string; aspect_ratio?: string }>>([])
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16')

  // Destination & Short URL
  const [urlPreset, setUrlPreset] = useState<string>('https://casagrown.com')
  const [customUrl, setCustomUrl] = useState('')
  const [utmSource, setUtmSource] = useState('facebook')
  const [utmMedium, setUtmMedium] = useState(ctx.initialPublishType === 'paid_ad' ? 'paid_ad' : 'facebook_post')
  const [utmCampaign, setUtmCampaign] = useState('custom_community_post')
  const [shortUrl, setShortUrl] = useState('')
  const [generatingShortLink, setGeneratingShortLink] = useState(false)

  // Demographics & Targeting
  const [targetZips, setTargetZips] = useState<string>('95120, 95125, 95118')
  const [targetRadius, setTargetRadius] = useState<string>('15')
  const [ageMin, setAgeMin] = useState<number>(25)
  const [ageMax, setAgeMax] = useState<string>('65+')
  const [targetGender, setTargetGender] = useState<'all' | 'women' | 'men'>('all')
  const [selectedInterests, setSelectedInterests] = useState<string[]>(['Gardening', 'Organic Food'])
  const [customInterestInput, setCustomInterestInput] = useState('')
  const [showNarrowAudience, setShowNarrowAudience] = useState(false)
  const [narrowInterests, setNarrowInterests] = useState<string[]>([])
  const [customNarrowInterestInput, setCustomNarrowInterestInput] = useState('')

  // Budget & Placements
  const [budgetType, setBudgetType] = useState<'daily' | 'lifetime'>('daily')
  const [budgetAmount, setBudgetAmount] = useState<number>(10)
  const [adDurationDays, setAdDurationDays] = useState<string>('7')
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>(['fb_feed', 'ig_feed', 'ig_reels'])

  // UI Flow State
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [livePostUrl, setLivePostUrl] = useState<string | null>(null)
  const [metaResult, setMetaResult] = useState<any>(null)
  const [showMetaSettings, setShowMetaSettings] = useState(false)

  // Fetch saved video library on modal open
  useEffect(() => {
    if (ctx.isOpen) {
      fetch('/api/crm/ad-studio')
        .then(res => res.json())
        .then(data => {
          if (data.creatives) {
            const vids = data.creatives.filter((c: any) => Boolean(c.preview_video_url))
            setSavedVideos(vids)
          }
        })
        .catch(() => {})

      // Preload initial sample photos if empty
      if (selectedPhotos.length === 0 && EXHAUSTIVE_INTERESTS_CATALOG.length > 0) {
        setSelectedPhotos([
          EXHAUSTIVE_INTERESTS_CATALOG[0].image,
          EXHAUSTIVE_INTERESTS_CATALOG[1]?.image || EXHAUSTIVE_INTERESTS_CATALOG[0].image,
        ])
      }
    }
  }, [ctx.isOpen])

  // Destination URL builder
  const fullTrackingUrl = (() => {
    const base = customUrl || urlPreset || 'https://casagrown.com'
    try {
      const u = new URL(base)
      u.searchParams.set('utm_source', utmSource)
      u.searchParams.set('utm_medium', utmMedium)
      u.searchParams.set('utm_campaign', utmCampaign || 'custom_ad')
      return u.toString()
    } catch {
      return base
    }
  })()

  // Generate AI Copy from user prompt
  const handleGenerateAiCopy = () => {
    if (!customPrompt.trim()) return
    setGeneratingCopy(true)

    const promptText = customPrompt.trim()

    let variations = [
      {
        headline: `🌟 ${promptText.split('.')[0].slice(0, 50)}`,
        text: `${promptText}\n\n🌱 Join our hyper-local neighborhood network\n🤝 Connect directly with nearby families\n🍋 100% free and community-driven`,
        cta: 'Join the Community',
      },
      {
        headline: `Notice for Neighbors: ${promptText.slice(0, 45)}... 🏡`,
        text: `Hey neighbors! Quick community update:\n\n${promptText}\n\n✨ Tap below to get full details and connect with local growers near you!`,
        cta: 'Learn More',
      },
      {
        headline: `Exciting Update in Our Neighborhood! 🍋`,
        text: `${promptText}\n\nDon't miss out — check out what's happening right on your block today.`,
        cta: 'Check It Out',
      },
    ]

    setCopyVariations(variations)
    setHeadline(variations[0].headline)
    setPrimaryText(variations[0].text)
    setCallToAction(variations[0].cta)
    setGeneratingCopy(false)
  }

  // Short link generator
  const handleGenerateShortLink = async () => {
    setGeneratingShortLink(true)
    try {
      const res = await fetch('/api/crm/short-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_url: fullTrackingUrl,
          target_url: fullTrackingUrl,
          label: `Custom: ${headline || 'Post'}`,
        }),
      })
      const json = await res.json()
      if (json.short_url) {
        setShortUrl(json.short_url)
        setCustomUrl(json.short_url)
        if (publishType === 'organic_post') {
          setPrimaryText(prev => {
            const cleaned = prev.replace(/\n*👉.*$/gi, '').trim()
            return `${cleaned}\n\n👉 ${json.short_url}`
          })
        }
      } else {
        setShortUrl(fullTrackingUrl)
        setCustomUrl(fullTrackingUrl)
      }
    } catch {
      setShortUrl(fullTrackingUrl)
      setCustomUrl(fullTrackingUrl)
    } finally {
      setGeneratingShortLink(false)
    }
  }

  // Video Upload Handler
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedVideoFile(file)
    const localUrl = URL.createObjectURL(file)
    setUploadedVideoUrl(localUrl)

    const videoEl = document.createElement('video')
    videoEl.preload = 'metadata'
    videoEl.onloadedmetadata = () => {
      window.URL.revokeObjectURL(videoEl.src)
      const isVertical = videoEl.videoHeight > videoEl.videoWidth
      setDetectedAspectRatio(isVertical ? '9:16' : '16:9')
    }
    videoEl.src = localUrl
  }

  // Photo Upload Handler
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const newUrls: string[] = []
    for (let i = 0; i < files.length; i++) {
      newUrls.push(URL.createObjectURL(files[i]))
    }
    setSelectedPhotos(prev => [...prev, ...newUrls].slice(0, 4))
  }

  // Toggle Interest Tag
  const toggleInterest = (tag: string) => {
    setSelectedInterests(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  const handleAddCustomInterest = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = customInterestInput.trim()
    if (!trimmed) return
    if (!selectedInterests.includes(trimmed)) {
      setSelectedInterests(prev => [...prev, trimmed])
    }
    setCustomInterestInput('')
  }

  // Toggle Narrow Interest Tag
  const toggleNarrowInterest = (tag: string) => {
    setNarrowInterests(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  const handleAddCustomNarrowInterest = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = customNarrowInterestInput.trim()
    if (!trimmed) return
    if (!narrowInterests.includes(trimmed)) {
      setNarrowInterests(prev => [...prev, trimmed])
    }
    setCustomNarrowInterestInput('')
  }

  // Save / Publish Campaign
  const handleSaveCampaign = async (status: 'active' | 'scheduled' | 'draft') => {
    setIsSaving(true)
    try {
      const payload = {
        title: headline || 'Custom Community Post',
        context_type: 'custom_post',
        publish_type: publishType,
        target_audience: 'general_community',
        prompt: customPrompt,
        headline,
        primary_text: primaryText,
        call_to_action: callToAction,
        destination_url: fullTrackingUrl,
        short_url: shortUrl || undefined,
        media_mode: mediaMode,
        photo_urls: mediaMode === 'photos' ? selectedPhotos : undefined,
        video_name: mediaMode === 'video' ? (uploadedVideoFile?.name || selectedSavedVideoTitle || 'custom_video.mp4') : undefined,
        preview_video_url: mediaMode === 'video' ? (uploadedVideoUrl || undefined) : undefined,
        target_zips: targetZips ? targetZips.split(',').map(z => z.trim()).filter(Boolean) : [],
        target_radius_miles: Number(targetRadius),
        demographics: {
          age_min: ageMin,
          age_max: ageMax,
          gender: targetGender,
          interests: selectedInterests,
          narrow_interests: showNarrowAudience && narrowInterests.length > 0 ? narrowInterests : undefined,
        },
        budget: publishType === 'paid_ad' ? {
          type: budgetType,
          amount_usd: budgetAmount,
          duration_days: adDurationDays,
          placements: selectedPlacements,
        } : undefined,
        schedule: {
          type: 'immediate',
          scheduled_at: new Date().toISOString(),
          status,
        },
      }

      // 1. Save to CRM database & upload video if present
      const formData = new FormData()
      formData.append('action', 'create_campaign_post')
      formData.append('campaignPayload', JSON.stringify(payload))
      if (uploadedVideoFile && mediaMode === 'video') {
        formData.append('videoFile', uploadedVideoFile)
      }

      const res = await fetch('/api/crm/ad-studio', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (data.liveFbPostUrl) {
        setLivePostUrl(data.liveFbPostUrl)
      }

      // 2. If Paid Ad, call Meta Marketing API
      if (publishType === 'paid_ad') {
        const metaRes = await fetch('/api/crm/meta-ads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign: payload }),
        })
        const metaData = await metaRes.json()
        setMetaResult(metaData)
      }

      setSaveSuccess(true)
    } catch (err) {
      console.error('Error saving custom campaign:', err)
    } finally {
      setIsSaving(false)
    }
  }

  if (!ctx.isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1280px',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* Modal Top Header Bar */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#FAF5FF',
                color: '#7C3AED',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
              }}
            >
              ✨
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7C3AED' }}>
                  Custom AI Campaign Studio
                </span>
                <span style={{ color: '#CBD5E1' }}>•</span>
                
                {/* Publish Type Toggle */}
                <div style={{ display: 'inline-flex', background: '#E2E8F0', padding: '2px', borderRadius: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setPublishType('paid_ad')
                      setUtmMedium('paid_ad')
                    }}
                    style={{
                      border: 'none',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: publishType === 'paid_ad' ? '#FFFFFF' : 'transparent',
                      color: publishType === 'paid_ad' ? '#0F172A' : '#64748B',
                    }}
                  >
                    📢 Paid Meta Ad (FB &amp; IG)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPublishType('organic_post')
                      setUtmMedium('facebook_post')
                    }}
                    style={{
                      border: 'none',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: publishType === 'organic_post' ? '#FFFFFF' : 'transparent',
                      color: publishType === 'organic_post' ? '#0F172A' : '#64748B',
                    }}
                  >
                    📘 Facebook Organic Post
                  </button>
                </div>
              </div>

              <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {publishType === 'paid_ad' ? 'Launch Custom Meta Ad' : 'Publish Custom Facebook Post'} from Prompt
              </h2>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowMetaSettings(true)}
              style={{
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>⚙️</span>
              <span>Meta API Settings</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '22px',
                cursor: 'pointer',
                color: '#64748B',
                padding: '4px',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Save & Publish Confirmation Banner */}
        {saveSuccess && (
          <div
            style={{
              background: livePostUrl ? '#F0FDF4' : (metaResult?.mode === 'sandbox' ? '#FEF3C7' : '#EFF6FF'),
              borderBottom: '1px solid #E2E8F0',
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>
                {livePostUrl ? '🎉' : (metaResult?.mode === 'sandbox' ? '🧪' : '🚀')}
              </span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                  {livePostUrl 
                    ? 'Published Live to CasaGrown Facebook Page!'
                    : (metaResult?.mode === 'sandbox' 
                        ? 'Campaign Validated in Sandbox Mode ($0 Spend)'
                        : 'Live Meta Ad Campaign & Ad Set Created!')}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                  {livePostUrl 
                    ? 'Your post and visual media are live on Facebook for followers and visitors.'
                    : (metaResult?.mode === 'sandbox'
                        ? 'All targeting, budget, and creative specs were verified. To spend real budget, add your Meta Ad Account ID in ⚙️ Settings.'
                        : `Campaign ID: ${metaResult?.meta_objects?.campaign?.id || 'Active in Ads Manager'}`)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {livePostUrl && (
                <a
                  href={livePostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    background: '#1877F2',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>View on Facebook ↗</span>
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#0F172A',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Done / Close
              </button>
            </div>
          </div>
        )}

        {/* Modal 2-Column Body */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', flex: 1, overflow: 'hidden' }}>
          {/* Left Column: Form Configuration */}
          <div style={{ padding: '24px', overflowY: 'auto', borderRight: '1px solid #E2E8F0' }}>
            
            {/* SECTION 1: CUSTOM PROMPT & TOPIC */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  1. Describe Your Post / Ad Prompt
                </span>
                <span style={{ fontSize: '11px', color: '#7C3AED', fontWeight: 700 }}>
                  ✨ AI Copy Engine
                </span>
              </div>

              <textarea
                rows={3}
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder="What do you want to post or advertise? (e.g. 'We just reached 25 neighborhood harvest stands in Campbell! Announce our weekend backyard fruit stand tour and invite local families to pick up fresh tree-ripened peaches, figs, and plums.')"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                  marginBottom: '10px',
                  fontFamily: 'inherit',
                }}
              />

              {/* Tone / Theme Presets */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {TONE_PRESETS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTone(t.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '16px',
                      border: selectedTone === t.id ? '1px solid #7C3AED' : '1px solid #CBD5E1',
                      background: selectedTone === t.id ? '#FAF5FF' : '#FFFFFF',
                      color: selectedTone === t.id ? '#6D28D9' : '#64748B',
                      fontSize: '11px',
                      fontWeight: selectedTone === t.id ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleGenerateAiCopy}
                disabled={generatingCopy || !customPrompt.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: customPrompt.trim() ? '#7C3AED' : '#CBD5E1',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: customPrompt.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>✨</span>
                <span>{generatingCopy ? 'Drafting Variations...' : 'Generate AI Copy & Headlines'}</span>
              </button>
            </div>

            {/* SECTION 2: HEADLINE & CAPTION */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  2. Headline &amp; Post Caption
                </span>
              </div>

              {/* Variations Carousel */}
              {copyVariations.length > 1 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {copyVariations.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setHeadline(v.headline)
                        setPrimaryText(v.text)
                        setCallToAction(v.cta)
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: headline === v.headline ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                        background: headline === v.headline ? '#FAF5FF' : '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Option {i + 1}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                  Headline / Hook:
                </label>
                <input
                  type="text"
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder="e.g. Weekend Lemon Exchange in San Jose! 🍋"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                  Primary Caption Text:
                </label>
                <textarea
                  rows={5}
                  value={primaryText}
                  onChange={e => setPrimaryText(e.target.value)}
                  placeholder="Write or edit your full social post caption..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            {/* SECTION 3: VISUAL MEDIA ASSET */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  3. Visual Media Creative
                </span>
                
                {/* Media Mode Toggle */}
                <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '2px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <button
                    type="button"
                    onClick={() => setMediaMode('photos')}
                    style={{
                      border: 'none',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: mediaMode === 'photos' ? '#FFFFFF' : 'transparent',
                      color: mediaMode === 'photos' ? '#0F172A' : '#64748B',
                    }}
                  >
                    📸 Photos ({selectedPhotos.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaMode('video')}
                    style={{
                      border: 'none',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: mediaMode === 'video' ? '#FFFFFF' : 'transparent',
                      color: mediaMode === 'video' ? '#0F172A' : '#64748B',
                    }}
                  >
                    📹 Video MP4
                  </button>
                </div>
              </div>

              {mediaMode === 'photos' ? (
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {selectedPhotos.map((url, idx) => (
                      <div key={idx} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                        <img src={url} alt={`Media ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          type="button"
                          onClick={() => setSelectedPhotos(prev => prev.filter((_, i) => i !== idx))}
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            background: 'rgba(0,0,0,0.6)',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    <label
                      style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '8px',
                        border: '2px dashed #94A3B8',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        background: '#F8FAFC',
                        color: '#64748B',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}
                    >
                      <span>+ Upload</span>
                      <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} style={{ display: 'none' }} />
                    </label>

                    <button
                      type="button"
                      onClick={() => setShowPhotoGallery(!showPhotoGallery)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        background: showPhotoGallery ? '#FAF5FF' : '#FFFFFF',
                        color: showPhotoGallery ? '#7C3AED' : '#475569',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>🖼️</span>
                      <span>{showPhotoGallery ? 'Hide Photo Gallery' : 'Browse Catalog & Saved Photos'}</span>
                    </button>
                  </div>

                  {/* Photo Gallery Picker Drawer */}
                  {showPhotoGallery && (
                    <div style={{ marginTop: '12px', padding: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                        Click any photo below to add it to your post:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '8px', maxHeight: '180px', overflowY: 'auto', padding: '2px' }}>
                        {EXHAUSTIVE_INTERESTS_CATALOG.filter(c => Boolean(c.image)).map((item) => {
                          const isAlreadySelected = selectedPhotos.includes(item.image)
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (isAlreadySelected) {
                                  setSelectedPhotos(prev => prev.filter(p => p !== item.image))
                                } else {
                                  setSelectedPhotos(prev => [...prev, item.image].slice(0, 4))
                                }
                              }}
                              style={{
                                position: 'relative',
                                height: '64px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                border: isAlreadySelected ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                                opacity: isAlreadySelected ? 0.9 : 1,
                              }}
                              title={item.name}
                            >
                              <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: '#FFFFFF', fontSize: '8px', padding: '2px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.name}
                              </div>
                              {isAlreadySelected && (
                                <div style={{ position: 'absolute', top: '2px', right: '2px', background: '#7C3AED', color: '#FFFFFF', borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                                  ✓
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {/* Video Source Switcher */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setVideoSourceMode('upload')}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: videoSourceMode === 'upload' ? '1px solid #7C3AED' : '1px solid #CBD5E1',
                        background: videoSourceMode === 'upload' ? '#F5F3FF' : '#FFFFFF',
                        color: videoSourceMode === 'upload' ? '#6D28D9' : '#64748B',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      📁 Upload Video File
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoSourceMode('saved_library')}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: videoSourceMode === 'saved_library' ? '1px solid #7C3AED' : '1px solid #CBD5E1',
                        background: videoSourceMode === 'saved_library' ? '#F5F3FF' : '#FFFFFF',
                        color: videoSourceMode === 'saved_library' ? '#6D28D9' : '#64748B',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>🎬 Choose from Saved Videos</span>
                      <span style={{ padding: '1px 5px', borderRadius: '10px', background: '#DDD6FE', color: '#5B21B6', fontSize: '10px', fontWeight: 800 }}>
                        {savedVideos.length}
                      </span>
                    </button>
                  </div>

                  <div style={{ border: '2px dashed #CBD5E1', borderRadius: '10px', padding: '14px', textAlign: 'center', background: '#F8FAFC' }}>
                    {uploadedVideoUrl ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '10px 14px', borderRadius: '8px' }}>
                        <div style={{ textAlign: 'left' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534' }}>
                            ✓ Video Selected: {uploadedVideoFile ? uploadedVideoFile.name : selectedSavedVideoTitle || 'Saved Video'}
                          </span>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                            {uploadedVideoFile ? `${(uploadedVideoFile.size / 1024 / 1024).toFixed(1)} MB • ` : 'Cloud Hosted • '}
                            {detectedAspectRatio === '9:16' ? '📱 9:16 Vertical Reel Ready' : '🖥️ Standard Feed Video'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedVideoFile(null)
                            setUploadedVideoUrl(null)
                            setSelectedSavedVideoTitle('')
                          }}
                          style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: '#DC2626', cursor: 'pointer' }}
                        >
                          Change / Remove
                        </button>
                      </div>
                    ) : videoSourceMode === 'upload' ? (
                      <div>
                        <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={handleVideoUpload} id="custom-video-upload" style={{ display: 'none' }} />
                        <label htmlFor="custom-video-upload" style={{ cursor: 'pointer', display: 'block', padding: '8px' }}>
                          <div style={{ fontSize: '28px', marginBottom: '4px' }}>🎬</div>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED' }}>
                            Click to upload MP4 / MOV Video Clip
                          </span>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                            Optimal: 10–20s vertical or feed video
                          </div>
                        </label>
                      </div>
                    ) : (
                      <div>
                        {savedVideos.length === 0 ? (
                          <div style={{ padding: '16px', color: '#64748B', fontSize: '12px' }}>
                            No saved videos found in the library. Use "Upload Video File" to upload your first clip.
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', maxHeight: '200px', overflowY: 'auto', textAlign: 'left', padding: '4px' }}>
                            {savedVideos.map(vid => (
                              <div
                                key={vid.id}
                                onClick={() => {
                                  setUploadedVideoUrl(vid.preview_video_url)
                                  setSelectedSavedVideoTitle(vid.title)
                                  setUploadedVideoFile(null)
                                  setDetectedAspectRatio((vid.aspect_ratio as any) || '9:16')
                                }}
                                style={{
                                  border: '1px solid #E2E8F0',
                                  borderRadius: '8px',
                                  padding: '8px',
                                  background: '#FFFFFF',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                }}
                              >
                                <div style={{ position: 'relative', height: '80px', background: '#0F172A', borderRadius: '6px', overflow: 'hidden' }}>
                                  <video src={vid.preview_video_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {vid.title}
                                </div>
                                <button
                                  type="button"
                                  style={{
                                    width: '100%',
                                    padding: '3px',
                                    background: '#7C3AED',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                  }}
                                >
                                  ✓ Use This Video
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 4: DESTINATION & SHORT LINK */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  4. Destination URL &amp; Short Link
                </span>
                <button
                  type="button"
                  onClick={handleGenerateShortLink}
                  disabled={generatingShortLink}
                  style={{
                    background: '#FAF5FF',
                    border: '1px solid #DDD6FE',
                    color: '#7C3AED',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {generatingShortLink ? 'Shortening...' : '🔗 Generate Short Link'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                    Destination Link:
                  </label>
                  <input
                    type="text"
                    value={customUrl || urlPreset}
                    onChange={e => setCustomUrl(e.target.value)}
                    placeholder="https://casagrown.com"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                    Call-to-Action Button:
                  </label>
                  <select
                    value={callToAction}
                    onChange={e => setCallToAction(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', background: '#FFFFFF' }}
                  >
                    <option value="Learn More">Learn More</option>
                    <option value="Join Community">Join Community</option>
                    <option value="Shop Local Harvest">Shop Local Harvest</option>
                    <option value="List Your Harvest">List Your Harvest</option>
                    <option value="Play Today's Game">Play Today's Game</option>
                    <option value="Sign Up Free">Sign Up Free</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 5: DEMOGRAPHICS & BUDGET (FOR PAID ADS) */}
            {publishType === 'paid_ad' && (
              <div style={{ marginBottom: '22px', padding: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '12px' }}>
                  5. Meta Ad Targeting &amp; Budget
                </span>

                {/* Target ZIPs & Radius */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Target ZIP Codes:</label>
                    <input
                      type="text"
                      value={targetZips}
                      onChange={e => setTargetZips(e.target.value)}
                      placeholder="95120, 95125..."
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Radius:</label>
                    <select value={targetRadius} onChange={e => setTargetRadius(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', background: '#FFFFFF' }}>
                      <option value="5">5 miles</option>
                      <option value="10">10 miles</option>
                      <option value="15">15 miles</option>
                      <option value="25">25 miles</option>
                    </select>
                  </div>
                </div>

                {/* Meta Interests Targeting */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Target Meta Interests ({selectedInterests.length} selected):
                  </label>

                  {/* Active Selected Interest Pills */}
                  {selectedInterests.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', padding: '6px', background: '#FAF5FF', border: '1px solid #DDD6FE', borderRadius: '6px' }}>
                      {selectedInterests.map(tag => (
                        <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', borderRadius: '10px', background: '#7C3AED', color: '#FFFFFF', fontSize: '10px', fontWeight: 700 }}>
                          <span>✓ {tag}</span>
                          <button type="button" onClick={() => toggleInterest(tag)} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '10px', cursor: 'pointer', padding: '0', lineHeight: 1 }}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Custom Interest Input Bar */}
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder="Type custom Meta interest (e.g. Gardeners, Permaculture)..."
                      value={customInterestInput}
                      onChange={e => setCustomInterestInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddCustomInterest()
                        }
                      }}
                      style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px' }}
                    />
                    <button type="button" onClick={() => handleAddCustomInterest()} style={{ padding: '5px 10px', borderRadius: '6px', background: '#7C3AED', color: '#FFFFFF', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
                  </div>

                  {/* Suggestions */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {SUGGESTED_META_INTERESTS.slice(0, 10).map(tag => {
                      const isSelected = selectedInterests.includes(tag)
                      return (
                        <button key={tag} type="button" onClick={() => toggleInterest(tag)} style={{ padding: '2px 7px', borderRadius: '10px', border: isSelected ? '1px solid #7C3AED' : '1px solid #CBD5E1', background: isSelected ? '#FAF5FF' : '#FFFFFF', color: isSelected ? '#6D28D9' : '#64748B', fontSize: '10px', fontWeight: isSelected ? 700 : 500, cursor: 'pointer' }}>
                          {isSelected ? '✓ ' : '+ '}{tag}
                        </button>
                      )
                    })}
                  </div>

                  {/* Narrow Audience Button & Card */}
                  {!showNarrowAudience ? (
                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setShowNarrowAudience(true)}
                        style={{
                          background: '#FAF5FF',
                          border: '1px dashed #7C3AED',
                          color: '#7C3AED',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>+ Narrow Audience (AND Must Also Match...)</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: '10px', padding: '10px', background: '#F5F3FF', border: '1px solid #C4B5FD', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#6D28D9' }}>🔗 AND MUST ALSO MATCH:</span>
                        <button type="button" onClick={() => { setShowNarrowAudience(false); setNarrowInterests([]) }} style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '10px', cursor: 'pointer' }}>✕ Remove</button>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                        <input
                          type="text"
                          placeholder="Type narrowing interest (e.g. Gardeners)..."
                          value={customNarrowInterestInput}
                          onChange={e => setCustomNarrowInterestInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddCustomNarrowInterest()
                            }
                          }}
                          style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', background: '#FFFFFF' }}
                        />
                        <button type="button" onClick={() => handleAddCustomNarrowInterest()} style={{ padding: '5px 10px', borderRadius: '6px', background: '#6D28D9', color: '#FFFFFF', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Budget */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Daily Budget: $</span>
                  <input
                    type="number"
                    min={1}
                    value={budgetAmount}
                    onChange={e => setBudgetAmount(Number(e.target.value))}
                    style={{ width: '60px', padding: '5px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px' }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748B' }}>/ Day ({adDurationDays} days)</span>
                </div>
              </div>
            )}

            {/* Launch / Publish Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveCampaign('active')}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '8px',
                  background: publishType === 'paid_ad' ? '#7C3AED' : '#1877F2',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {isSaving ? 'Publishing...' : (publishType === 'paid_ad' ? `🚀 Launch Ad ($${budgetAmount}/day)` : '📘 Publish to Facebook Page')}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveCampaign('draft')}
                style={{
                  padding: '12px 18px',
                  borderRadius: '8px',
                  background: '#F1F5F9',
                  color: '#334155',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                💾 Save Draft
              </button>
            </div>
          </div>

          {/* Right Column: Live Phone / Feed Preview */}
          <div style={{ background: '#F8FAFC', padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
              📱 Live Device Mockup Preview
            </span>

            {/* Feed Post Mockup Card */}
            <div style={{ width: '100%', maxWidth: '340px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              {/* Post Header */}
              <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#16A34A', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🌱</div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>CasaGrown</div>
                  <div style={{ fontSize: '10px', color: '#64748B' }}>{publishType === 'paid_ad' ? 'Sponsored • Paid Ad' : 'Organic Post • Just now'}</div>
                </div>
              </div>

              {/* Caption Text */}
              <div style={{ padding: '0 12px 8px 12px', fontSize: '11px', color: '#1E293B', whiteSpace: 'pre-line' }}>
                {headline && <div style={{ fontWeight: 800, marginBottom: '4px' }}>{headline}</div>}
                <div>{primaryText || 'Your custom AI post caption will appear here...'}</div>
              </div>

              {/* Visual Media Preview */}
              <div style={{ height: '220px', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {mediaMode === 'video' && uploadedVideoUrl ? (
                  <video src={uploadedVideoUrl} controls loop style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : mediaMode === 'photos' && selectedPhotos.length > 0 ? (
                  <img src={selectedPhotos[0]} alt="Post Visual" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                    <div style={{ fontSize: '32px', marginBottom: '4px' }}>✨</div>
                    <div style={{ fontSize: '11px' }}>Media Asset Preview</div>
                  </div>
                )}
              </div>

              {/* CTA Link Footer */}
              <div style={{ padding: '10px 12px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase' }}>casagrown.com</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A' }}>{headline || 'CasaGrown Community'}</div>
                </div>
                <button
                  type="button"
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    background: '#E2E8F0',
                    color: '#0F172A',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {callToAction}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meta Settings Modal Popup */}
      <MetaSettingsModal
        isOpen={showMetaSettings}
        onClose={() => setShowMetaSettings(false)}
      />
    </div>
  )
}
