'use client'

import { useState, useEffect } from 'react'
import MetaSettingsModal from './MetaSettingsModal'
import { getZipTimezone, getOptimalSlotsForDay, computeSlotDateTime } from '../lib/socialPostingSlots'
import { resolveSmartAdSet, MetaAdSetRecord, MatchResult } from '../lib/adSetMatching'

export interface GameInfo {
  id: string
  name: string
  category: string
  icon: string
  subtitle: string
  path: string
  defaultInterests: string[]
}

export const CASAGROWN_GAMES: GameInfo[] = [
  {
    id: 'garden_spell',
    name: 'Garden Spell (Wordle Garden)',
    category: 'Word Puzzle',
    icon: '🌱',
    subtitle: 'Guess today\'s 5-letter garden crop in 6 tries with color clues',
    path: 'https://casagrown.com/games?game=garden_spell',
    defaultInterests: ['Wordle', 'New York Times Games', 'Word Games', 'Crossword Puzzles', 'Brain Games', 'Gardening'],
  },
  {
    id: 'garden_plots',
    name: 'Garden Plots (Queens Grid Logic)',
    category: 'Logic Puzzle',
    icon: '🌻',
    subtitle: 'Plant 1 crop in each row, column, and colored plot without collisions',
    path: 'https://casagrown.com/games?game=garden_plots',
    defaultInterests: ['Sudoku', 'Brain Games', 'Logic Puzzles', 'Chess', 'New York Times Games', 'Casual Gaming'],
  },
  {
    id: 'jigsaw',
    name: 'Harvest Jigsaw',
    category: 'Visual Puzzle',
    icon: '🧩',
    subtitle: 'Assemble high-resolution picture tiles into fresh seasonal harvests',
    path: 'https://casagrown.com/games?game=jigsaw',
    defaultInterests: ['Jigsaw Puzzles', 'Puzzles', 'Casual Gaming', 'Gardening', 'Brain Games', 'Organic Food'],
  },
  {
    id: 'math',
    name: 'Harvest Nutri-Calc',
    category: 'Math & Nutrition',
    icon: '🥑',
    subtitle: 'Solve daily dietary fiber, vitamin, and antioxidant produce equations',
    path: 'https://casagrown.com/games?game=math',
    defaultInterests: ['Brain Games', 'Math Puzzles', 'Trivia Games', 'Nutrition', 'Health & Wellness', 'Education'],
  },
  {
    id: 'memory_match',
    name: 'Garden Memory Match',
    category: 'Memory Game',
    icon: '🧠',
    subtitle: 'Flip and match fresh produce with local stand prices & nutrition facts',
    path: 'https://casagrown.com/games?game=memory_match',
    defaultInterests: ['Brain Games', 'Memory Games', 'Casual Gaming', 'Gardening', 'Healthy Eating'],
  },
  {
    id: 'anagram',
    name: 'Crop Anagram',
    category: 'Anagram Scramble',
    icon: '🔤',
    subtitle: 'Unscramble letters to reveal today\'s featured harvest crop',
    path: 'https://casagrown.com/games?game=anagram',
    defaultInterests: ['Word Games', 'Anagrams', 'Scrabble', 'Crossword Puzzles', 'Brain Games', 'Wordle'],
  },
  {
    id: 'all_games',
    name: 'All Daily Games Hub',
    category: 'Games Collection',
    icon: '🎮',
    subtitle: 'Play all 6 free date-seeded brain games with daily streaks and points',
    path: 'https://casagrown.com/games',
    defaultInterests: ['Wordle', 'New York Times Games', 'Brain Games', 'Puzzles', 'Gardening', 'Trivia Games'],
  },
]

const SUGGESTED_META_INTERESTS = [
  // Gardeners & Agriculture
  'Gardeners',
  'Gardening',
  'Organic Farming',
  'Vegetable Gardening',
  'Fruit Trees',
  'Urban Agriculture',
  'Home Gardening',
  'Permaculture',
  'Plant Care',
  // Food & Healthy Living
  'Farmers Market',
  'Organic Food',
  'Local Food',
  'Healthy Eating',
  'Health & Wellness',
  // Games & Puzzles
  'Wordle',
  'New York Times Games',
  'Crossword Puzzles',
  'Brain Games',
  'Sudoku',
  'Word Games',
  'Puzzles',
  'Trivia Games',
  'Casual Gaming',
  'Retirement & Leisure',
]

export interface GameModalContext {
  isOpen: boolean
  initialPublishType?: 'paid_ad' | 'organic_post'
  gameId: string
}

export default function GameAdPostCreatorModal({
  modalContext,
  context,
  onClose,
}: {
  modalContext?: GameModalContext
  context?: any
  onClose: () => void
}) {
  const ctx = modalContext || context || {}
  const [selectedGameId, setSelectedGameId] = useState<string>(ctx.gameId || 'garden_spell')
  const [publishType, setPublishType] = useState<'paid_ad' | 'organic_post'>(ctx.initialPublishType || 'paid_ad')

  // Video Media State (Video-Only for Games)
  const [videoSourceMode, setVideoSourceMode] = useState<'upload' | 'saved_library'>('upload')
  const [uploadedVideoFile, setUploadedVideoFile] = useState<File | null>(null)
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null)
  const [selectedSavedVideoTitle, setSelectedSavedVideoTitle] = useState<string>('')
  const [savedVideos, setSavedVideos] = useState<Array<{ id: string; title: string; preview_video_url: string; aspect_ratio?: string; created_at?: string }>>([])

  // Copywriting State
  const [headline, setHeadline] = useState('')
  const [primaryText, setPrimaryText] = useState('')
  const [callToAction, setCallToAction] = useState('Play Today\'s Game')
  const [generatingCopy, setGeneratingCopy] = useState(false)
  const [copyVariations, setCopyVariations] = useState<{ headline: string; text: string; cta: string }[]>([])

  // Destination URL & Tracking
  const [urlPreset, setUrlPreset] = useState<string>('https://casagrown.com/games')
  const [customUrl, setCustomUrl] = useState('')
  const [utmSource, setUtmSource] = useState('facebook')
  const [utmMedium, setUtmMedium] = useState(ctx.initialPublishType === 'organic_post' ? 'facebook_post' : 'paid_ad')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [utmContent, setUtmContent] = useState('video_reels_9x16')
  const [showUtmBuilder, setShowUtmBuilder] = useState(false)
  const [shortUrl, setShortUrl] = useState('')
  const [generatingShortLink, setGeneratingShortLink] = useState(false)

  // Demographics & Targeting
  const [targetZips, setTargetZips] = useState<string>('')
  const [targetRadius, setTargetRadius] = useState<string>('15')
  const [ageMin, setAgeMin] = useState<number>(25)
  const [ageMax, setAgeMax] = useState<string>('65+')
  const [targetGender, setTargetGender] = useState<'all' | 'women' | 'men'>('all')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [customInterestInput, setCustomInterestInput] = useState('')
  const [showNarrowAudience, setShowNarrowAudience] = useState(false)
  const [narrowInterests, setNarrowInterests] = useState<string[]>([])
  const [customNarrowInterestInput, setCustomNarrowInterestInput] = useState('')

  // Budget & Scheduling
  const [scheduleType, setScheduleType] = useState<'immediate' | 'scheduled'>('immediate')
  const [scheduledDateTime, setScheduledDateTime] = useState('')
  const [scheduleDayOffset, setScheduleDayOffset] = useState<number>(0)
  const [budgetType, setBudgetType] = useState<'daily' | 'lifetime'>('daily')
  const [budgetAmount, setBudgetAmount] = useState<number>(10)
  const [adDurationDays, setAdDurationDays] = useState<string>('7')
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>([
    'fb_feed',
    'ig_feed',
    'ig_reels',
    'ig_stories',
  ])

  // UI state - Default to Reels (9:16 Fullscreen Vertical Video)
  const [previewTab, setPreviewTab] = useState<'feed' | 'story'>('story')
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16')
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [livePostUrl, setLivePostUrl] = useState<string | null>(null)
  const [showMetaSettings, setShowMetaSettings] = useState(false)
  const [campaignMode, setCampaignMode] = useState<'new' | 'existing'>('new')
  const [campaignName, setCampaignName] = useState('')
  const [existingCampaignId, setExistingCampaignId] = useState('')
  const [adSetSelectionType, setAdSetSelectionType] = useState<'auto' | 'new' | 'existing'>('auto')
  const [adSetMode, setAdSetMode] = useState<'new' | 'existing'>('new')
  const [adSetName, setAdSetName] = useState('')
  const [existingAdSetId, setExistingAdSetId] = useState('')
  const [smartMatchResult, setSmartMatchResult] = useState<MatchResult | null>(null)
  const [availableCampaigns, setAvailableCampaigns] = useState<Array<{ id: string; name: string }>>([])
  const [availableAdSets, setAvailableAdSets] = useState<MetaAdSetRecord[]>([])
  const [metaResult, setMetaResult] = useState<any>(null)

  const selectedGame = CASAGROWN_GAMES.find(g => g.id === selectedGameId) || CASAGROWN_GAMES[0]
  const gameInterestsKey = selectedInterests.join(',')
  const gameAdSetsCount = availableAdSets.length

  // Dynamic Smart Ad Set Matcher (Guarantees Game & Budget Isolation)
  useEffect(() => {
    if (!ctx.isOpen) return
    if (adSetSelectionType === 'auto') {
      const criteria = {
        audienceIntent: 'game' as const,
        items: [selectedGame.id],
        zips: targetZips.split(',').map(z => z.trim()).filter(Boolean),
        ageMin,
        ageMax: ageMax === '65+' ? 65 : Number(ageMax),
        gender: targetGender,
        interests: selectedInterests,
        campaignId: campaignMode === 'existing' ? existingCampaignId : undefined,
      }
      const res = resolveSmartAdSet(criteria, availableAdSets, `Game_${selectedGame.id}`)
      setSmartMatchResult(res)
      if (res.mode === 'existing' && res.matchedAdSet) {
        setAdSetMode('existing')
        setExistingAdSetId(res.matchedAdSet.id)
      } else {
        setAdSetMode('new')
        setAdSetName(res.suggestedName)
      }
    }
  }, [ctx.isOpen, adSetSelectionType, selectedGame.id, targetZips, ageMin, ageMax, targetGender, gameInterestsKey, gameAdSetsCount, campaignMode, existingCampaignId])

  // Sync state on open
  useEffect(() => {
    if (ctx.isOpen) {
      const gId = ctx.gameId || 'garden_spell'
      const initMode = ctx.initialPublishType || 'paid_ad'
      setSelectedGameId(gId)
      setPublishType(initMode)
      setUtmMedium(initMode === 'organic_post' ? 'facebook_post' : 'paid_ad')
      
      const gameObj = CASAGROWN_GAMES.find(g => g.id === gId) || CASAGROWN_GAMES[0]
      setSelectedInterests(gameObj.defaultInterests)
      setUtmCampaign(`game_${gameObj.id}`)
      setUrlPreset(gameObj.path)
      setCampaignName(`[CasaGrown] Games - ${gameObj.name.split('(')[0].trim()} (Daily Streak)`)
      setAdSetName(`AdSet_Game_${gameObj.id}_Wordle_Puzzles_Age25-65`)

      // Fetch existing campaigns and ad sets for dropdown
      fetch('/api/crm/meta-ads')
        .then(res => res.json())
        .then(data => {
          if (data.campaigns) {
            setAvailableCampaigns(data.campaigns)
            if (data.campaigns.length > 0) setExistingCampaignId(data.campaigns[0].id)
          }
          if (data.adsets) {
            setAvailableAdSets(data.adsets)
            if (data.adsets.length > 0) setExistingAdSetId(data.adsets[0].id)
          }
        })
        .catch(() => {})

      // Fetch saved videos library
      fetch('/api/crm/ad-studio')
        .then(res => res.json())
        .then(data => {
          if (data.creatives) {
            const vids = data.creatives.filter((c: any) => Boolean(c.preview_video_url))
            setSavedVideos(vids)
          }
        })
        .catch(() => {})

      generateGameAiCopy(gameObj)
    }
  }, [ctx.isOpen, ctx.gameId, ctx.initialPublishType])

  // Generate Game AI Copy
  const generateGameAiCopy = (game: GameInfo) => {
    setGeneratingCopy(true)
    const gName = game.name.replace(/\(.*\)/, '').trim()
    
    let variations = [
      {
        headline: `Can you solve today's ${gName} puzzle? 🧠🌱`,
        text: `Daily 3-minute brain game inspired by fresh gardens and local harvests. New puzzle drops every morning at 6 AM!\n\n🎮 100% free to play with zero ads\n🔥 Build and track your daily streak\n🏆 Compare your solve time with neighbors`,
        cta: "Play Today's Puzzle",
      },
      {
        headline: `Your new favorite morning coffee brain game! ☕🌿`,
        text: `Skip the paywalls and ads. Enjoy clean, relaxing daily puzzles designed to keep your mind sharp.\n\nPlay today's date-seeded ${gName} free on CasaGrown and start your streak today!`,
        cta: 'Play Free Now',
      },
      {
        headline: `91% of players took more than 4 tries on today's ${gName}! 🧩`,
        text: `Sharpen your mind with CasaGrown's daily collection of garden brain games. Free to play in your browser with no app download required.\n\nCan you beat today's puzzle?`,
        cta: 'Try Daily Puzzle',
      }
    ]

    if (game.id === 'garden_spell') {
      variations = [
        {
          headline: `Guess today's 5-letter garden crop in 6 tries! 🌱`,
          text: `Love Wordle? Try Garden Spell — the daily 5-letter word puzzle featuring fresh crops, herbs, and garden vocabulary.\n\n🌿 100% free to play with zero ads\n🔥 Track your daily solve streak\n🏆 Share results with emoji scorecards`,
          cta: 'Play Garden Spell Free',
        },
        {
          headline: `Can you guess today's secret garden word? 🌿`,
          text: `Fresh puzzle drops every morning at 6:00 AM. 6 guesses to find the secret harvest word with instant color feedback!\n\nStart your morning with a quick brain workout on CasaGrown.`,
          cta: 'Play Today\'s Word',
        },
        {
          headline: `The relaxing daily word puzzle for garden lovers! ☀️`,
          text: `Keep your mind sharp with daily gardening vocabulary and produce terms. Play free on any phone or desktop with no signup required!`,
          cta: 'Solve Today\'s Puzzle',
        }
      ]
    } else if (game.id === 'garden_plots') {
      variations = [
        {
          headline: `Plant 1 crop per plot without collisions! 🌻`,
          text: `Love Queens and Sudoku? Try Garden Plots — our addictive daily grid logic puzzle. Plant your crops across colored plot regions with zero row or column conflicts.\n\n🧩 100% free daily logic puzzle\n⏱️ Timed solve with zero ad interruptions\n🌱 Daily seed drops every morning at 6 AM`,
          cta: 'Play Garden Plots',
        },
        {
          headline: `Can you solve today's Garden Plots logic grid? 🧠`,
          text: `A fresh brain workout every morning. Place your crop icons so that no two share the same row, column, or color zone!\n\nPlay free in 3 minutes on CasaGrown.`,
          cta: 'Play Free Logic Grid',
        },
        {
          headline: `The daily logic puzzle taking over morning routines! ☕`,
          text: `Sharpen your problem-solving skills with date-seeded grid puzzles. Free, elegant, and completely ad-free.`,
          cta: 'Try Today\'s Grid',
        }
      ]
    }

    setCopyVariations(variations)
    setHeadline(variations[0].headline)
    setPrimaryText(variations[0].text)
    setCallToAction(variations[0].cta)
    setGeneratingCopy(false)
  }

  // Handle Video Upload & Auto-Detect Aspect Ratio
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedVideoFile(file)
      const blobUrl = URL.createObjectURL(file)
      setUploadedVideoUrl(blobUrl)

      // Automatically inspect video dimensions
      const vid = document.createElement('video')
      vid.src = blobUrl
      vid.onloadedmetadata = () => {
        const isVertical = vid.videoHeight > vid.videoWidth
        setPreviewTab(isVertical ? 'story' : 'feed')
        setDetectedAspectRatio(isVertical ? '9:16' : '16:9')
      }
    }
  }

  // Full Tracking URL
  const baseDestination = customUrl.trim() || urlPreset
  const buildFullTrackingUrl = () => {
    try {
      const url = new URL(baseDestination.startsWith('http') ? baseDestination : `https://${baseDestination}`)
      if (utmSource) url.searchParams.set('utm_source', utmSource)
      if (utmMedium) url.searchParams.set('utm_medium', utmMedium)
      if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign)
      if (utmContent) url.searchParams.set('utm_content', utmContent)
      return url.toString()
    } catch {
      const glue = baseDestination.includes('?') ? '&' : '?'
      return `${baseDestination}${glue}utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(utmMedium)}&utm_campaign=${encodeURIComponent(utmCampaign || `game_${selectedGame.id}`)}&utm_content=${encodeURIComponent(utmContent || 'video_reels_9x16')}`
    }
  }
  const fullTrackingUrl = buildFullTrackingUrl()
  const effectiveLink = shortUrl || fullTrackingUrl

  // Generate Short Link & Insert into Active Destination URL
  const handleGenerateShortLink = async () => {
    setGeneratingShortLink(true)
    try {
      const res = await fetch('/api/crm/short-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_url: fullTrackingUrl,
          target_url: fullTrackingUrl,
          label: `Game Ad: ${selectedGame.name}`,
          campaign: utmCampaign,
        }),
      })
      const json = await res.json()
      if (json.short_url) {
        setShortUrl(json.short_url)
        setCustomUrl(json.short_url) // Directly insert shortened URL into field
        if (publishType === 'organic_post') {
          setPrimaryText(prev => {
            const cleaned = prev.replace(/\n*👉.*$/gi, '').trim()
            return `${cleaned}\n\n👉 Play now: ${json.short_url}`
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

  // Helper: Append short link to post caption
  const handleAppendLinkToCaption = () => {
    const link = shortUrl || fullTrackingUrl
    setPrimaryText(prev => {
      const cleaned = prev.replace(/\n*👉.*$/gi, '').trim()
      return `${cleaned}\n\n👉 Play now: ${link}`
    })
  }

  // Toggle Interest Tag
  const toggleInterest = (tag: string) => {
    setSelectedInterests(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  // Add Custom Interest Tag
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

  // Add Custom Narrow Interest Tag
  const handleAddCustomNarrowInterest = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = customNarrowInterestInput.trim()
    if (!trimmed) return
    if (!narrowInterests.includes(trimmed)) {
      setNarrowInterests(prev => [...prev, trimmed])
    }
    setCustomNarrowInterestInput('')
  }

  // Toggle Placement
  const togglePlacement = (placement: string) => {
    setSelectedPlacements(prev => 
      prev.includes(placement) ? prev.filter(p => p !== placement) : [...prev, placement]
    )
  }

  // Save Campaign
  const handleSaveCampaign = async (status: 'active' | 'scheduled' | 'draft') => {
    setIsSaving(true)
    try {
      const payload = {
        title: `${selectedGame.name} ${publishType === 'paid_ad' ? 'Paid Video Ad' : 'Organic Video Post'}`,
        campaign_mode: campaignMode,
        campaign_name: campaignMode === 'new' ? campaignName : availableCampaigns.find(c => c.id === existingCampaignId)?.name,
        existing_campaign_id: campaignMode === 'existing' ? existingCampaignId : undefined,
        ad_set_mode: adSetMode,
        ad_set_name: adSetMode === 'new' ? adSetName : availableAdSets.find(a => a.id === existingAdSetId)?.name,
        existing_ad_set_id: adSetMode === 'existing' ? existingAdSetId : undefined,
        publish_type: publishType,
        target_audience: 'game_player',
        produce_names: [selectedGame.name],
        headline,
        primary_text: primaryText,
        call_to_action: callToAction,
        destination_url: fullTrackingUrl,
        short_url: shortUrl || undefined,
        media_mode: 'video',
        video_name: uploadedVideoFile?.name || 'gameplay_recording.mp4',
        preview_video_url: uploadedVideoUrl || undefined,
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
          type: scheduleType,
          scheduled_at: scheduleType === 'scheduled' ? scheduledDateTime : new Date().toISOString(),
          status,
        },
      }

      // 1. Save to CRM database & upload video
      const formData = new FormData()
      formData.append('action', 'create_campaign_post')
      formData.append('campaignPayload', JSON.stringify(payload))
      if (uploadedVideoFile) {
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

      // 2. If Paid Video Ad, call Meta Marketing API
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
      console.error('Error saving game campaign:', err)
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
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1120px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Modal Top Navigation */}
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
            <span style={{ fontSize: '28px' }}>{selectedGame.icon}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                {/* Publish Mode Toggle */}
                <div style={{ display: 'inline-flex', background: '#E2E8F0', padding: '2px', borderRadius: '6px' }}>
                  <button
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
                    📢 Paid Meta Video Ad (FB &amp; IG)
                  </button>
                  <button
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
                    📘 Facebook Organic Video Post
                  </button>
                </div>
              </div>

              <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {publishType === 'paid_ad' ? 'Launch Meta Video Ad' : 'Publish Facebook Video Post'} for {selectedGame.name}
              </h2>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
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
                    ? 'Your video Reel and post caption are live on Facebook for followers and visitors.'
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 420px',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {/* Left Column: Form Configuration */}
          <div style={{ padding: '24px', overflowY: 'auto', borderRight: '1px solid #E2E8F0' }}>
            {/* SECTION 1: VIDEO RECORDING UPLOAD */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  1. Gameplay Video Asset
                </span>
                <span style={{ fontSize: '11px', color: '#7C3AED', fontWeight: 700 }}>
                  📹 Video-Only Ad
                </span>
              </div>

              {/* Source Mode Switcher */}
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
                  📁 Upload New Video File
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
                        ✓ Active Video Selected: {uploadedVideoFile ? uploadedVideoFile.name : selectedSavedVideoTitle || 'Saved Video'}
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
                    <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={handleVideoUpload} id="game-video-upload" style={{ display: 'none' }} />
                    <label htmlFor="game-video-upload" style={{ cursor: 'pointer', display: 'block', padding: '8px' }}>
                      <div style={{ fontSize: '28px', marginBottom: '4px' }}>🎬</div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED' }}>
                        Click to upload Gameplay Screen Recording (MP4 / MOV)
                      </span>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                        Optimal: 10–15s vertical screen capture showing gameplay solve &amp; victory screen
                      </div>
                    </label>
                  </div>
                ) : (
                  <div>
                    {savedVideos.length === 0 ? (
                      <div style={{ padding: '16px', color: '#64748B', fontSize: '12px' }}>
                        No saved video creatives found yet. Switch to "Upload New Video File" to upload your first gameplay video.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', maxHeight: '220px', overflowY: 'auto', textAlign: 'left', padding: '4px' }}>
                        {savedVideos.map(vid => (
                          <div
                            key={vid.id}
                            onClick={() => {
                              setUploadedVideoUrl(vid.preview_video_url)
                              setSelectedSavedVideoTitle(vid.title)
                              setUploadedVideoFile(null)
                              const isVertical = vid.aspect_ratio === '9:16'
                              setPreviewTab(isVertical ? 'story' : 'feed')
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
                              transition: 'border-color 0.15s, box-shadow 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#7C3AED'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = '#E2E8F0'}
                          >
                            <div style={{ position: 'relative', height: '90px', background: '#0F172A', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <video
                                src={vid.preview_video_url}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              />
                              <div style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', color: '#FFFFFF', fontSize: '9px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px' }}>
                                {vid.aspect_ratio || '9:16'}
                              </div>
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {vid.title}
                            </div>
                            <button
                              type="button"
                              style={{
                                width: '100%',
                                padding: '4px',
                                background: '#7C3AED',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
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

            {/* SECTION 2: AI COPY & HEADLINES */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  2. Headline &amp; Post Caption
                </span>
                <button
                  disabled={generatingCopy}
                  onClick={() => generateGameAiCopy(selectedGame)}
                  style={{
                    background: '#FAF5FF',
                    border: '1px solid #DDD6FE',
                    color: '#7C3AED',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>✨</span>
                  <span>{generatingCopy ? 'Drafting...' : 'AI Generate Copy'}</span>
                </button>
              </div>

              {/* Copy Variations */}
              {copyVariations.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  {copyVariations.map((v, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setHeadline(v.headline)
                        setPrimaryText(v.text)
                        setCallToAction(v.cta)
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: headline === v.headline ? '1px solid #7C3AED' : '1px solid #E2E8F0',
                        background: headline === v.headline ? '#F5F3FF' : '#FFFFFF',
                        color: headline === v.headline ? '#6D28D9' : '#64748B',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Option {i + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* Headline */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                  Headline Hook:
                </label>
                <input
                  type="text"
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder="e.g. Can you solve today's Garden Spell in 4 tries?"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Caption Body */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                  Caption Text Body:
                </label>
                <textarea
                  rows={3}
                  value={primaryText}
                  onChange={e => setPrimaryText(e.target.value)}
                  placeholder="e.g. Daily 3-minute brain game for garden lovers..."
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              {/* Action Button CTA (Paid Ads) */}
              {publishType === 'paid_ad' && (
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                    Meta Action Button CTA:
                  </label>
                  <select
                    value={callToAction}
                    onChange={e => setCallToAction(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', background: '#FFFFFF', fontWeight: 600 }}
                  >
                    <option value="Play Today's Puzzle">Play Today's Puzzle</option>
                    <option value="Play Free Now">Play Free Now</option>
                    <option value="Play Game">Play Game</option>
                    <option value="Try Daily Puzzle">Try Daily Puzzle</option>
                    <option value="Learn More">Learn More</option>
                  </select>
                </div>
              )}
            </div>

            {/* SECTION 3: DESTINATION URL, UTM TRACKING & SHORT LINK */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  3. Destination Link &amp; UTM Tracking
                </span>
                <button
                  type="button"
                  onClick={() => setShowUtmBuilder(!showUtmBuilder)}
                  style={{
                    background: showUtmBuilder ? '#EDE9FE' : '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    color: showUtmBuilder ? '#6D28D9' : '#475569',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {showUtmBuilder ? '▲ Hide UTM Parameters' : '⚙️ Custom UTM Builder'}
                </button>
              </div>

              {/* Destination URL Presets */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setUrlPreset(selectedGame.path)
                    setCustomUrl('')
                    setShortUrl('')
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: urlPreset === selectedGame.path && !customUrl ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                    background: urlPreset === selectedGame.path && !customUrl ? '#FAF5FF' : '#FFFFFF',
                    color: urlPreset === selectedGame.path && !customUrl ? '#6D28D9' : '#475569',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🎯 {selectedGame.name.split('(')[0].trim()} ({selectedGame.path.replace('https://casagrown.com', '')})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUrlPreset('https://casagrown.com/games')
                    setCustomUrl('')
                    setShortUrl('')
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: urlPreset === 'https://casagrown.com/games' && !customUrl ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                    background: urlPreset === 'https://casagrown.com/games' && !customUrl ? '#FAF5FF' : '#FFFFFF',
                    color: urlPreset === 'https://casagrown.com/games' && !customUrl ? '#6D28D9' : '#475569',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🎮 Daily Games Hub (/games)
                </button>
              </div>

              {/* Destination URL Input */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Target Destination URL:
                </label>
                <input
                  type="text"
                  value={customUrl || urlPreset}
                  onChange={e => {
                    setCustomUrl(e.target.value)
                    setShortUrl('')
                  }}
                  placeholder="https://casagrown.com/games?game=..."
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>

              {/* UTM Parameters Builder (Expandable) */}
              {showUtmBuilder && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>
                    📊 Campaign Attribution (UTM Parameters)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '2px' }}>
                        UTM Source (Platform)
                      </label>
                      <input
                        type="text"
                        value={utmSource}
                        onChange={e => {
                          setUtmSource(e.target.value)
                          setShortUrl('')
                        }}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '2px' }}>
                        UTM Medium (Channel)
                      </label>
                      <input
                        type="text"
                        value={utmMedium}
                        onChange={e => {
                          setUtmMedium(e.target.value)
                          setShortUrl('')
                        }}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '2px' }}>
                        UTM Campaign
                      </label>
                      <input
                        type="text"
                        value={utmCampaign}
                        onChange={e => {
                          setUtmCampaign(e.target.value)
                          setShortUrl('')
                        }}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '2px' }}>
                        UTM Content (Ad Creative)
                      </label>
                      <input
                        type="text"
                        value={utmContent}
                        onChange={e => {
                          setUtmContent(e.target.value)
                          setShortUrl('')
                        }}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Full Tracking URL & Short Link Generator */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    {shortUrl ? '✓ Shortened Link Active' : 'Full Tracking Link (Destination + UTMs)'}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      disabled={generatingShortLink}
                      onClick={handleGenerateShortLink}
                      style={{
                        padding: '3px 10px',
                        borderRadius: '5px',
                        border: '1px solid #7C3AED',
                        background: shortUrl ? '#F5F3FF' : '#7C3AED',
                        color: shortUrl ? '#6D28D9' : '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {generatingShortLink ? 'Shortening...' : shortUrl ? '✓ Regenerate Short Link' : '🔗 Generate Short Link'}
                    </button>
                    {shortUrl && (
                      <button
                        type="button"
                        onClick={handleAppendLinkToCaption}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '5px',
                          border: '1px solid #16A34A',
                          background: '#F0FDF4',
                          color: '#166534',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ✍️ Append to Post Caption
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: shortUrl ? '#166534' : '#475569', wordBreak: 'break-all', fontFamily: 'monospace', background: '#FFFFFF', padding: '6px 8px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                  {effectiveLink}
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 4: META CAMPAIGN & AD SET CONFIG (PAID ADS ONLY)    */}
            {/* ══════════════════════════════════════════════════════════ */}
            {publishType === 'paid_ad' && (
              <div style={{ marginBottom: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    4. Meta Campaign &amp; Ad Set Configuration
                  </span>
                  <span style={{ fontSize: '10px', color: '#7C3AED', background: '#EDE9FE', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    🎯 Meta Marketing API
                  </span>
                </div>

                {/* 1. Campaign Level */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#334155' }}>
                      1. Campaign (Objective Level):
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setCampaignMode('new')}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: campaignMode === 'new' ? '1px solid #7C3AED' : '1px solid #CBD5E1',
                          background: campaignMode === 'new' ? '#FAF5FF' : '#FFFFFF',
                          color: campaignMode === 'new' ? '#6D28D9' : '#64748B',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        + Create New
                      </button>
                      <button
                        type="button"
                        onClick={() => setCampaignMode('existing')}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: campaignMode === 'existing' ? '1px solid #2563EB' : '1px solid #CBD5E1',
                          background: campaignMode === 'existing' ? '#EFF6FF' : '#FFFFFF',
                          color: campaignMode === 'existing' ? '#1E40AF' : '#64748B',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        📂 Pick Existing
                      </button>
                    </div>
                  </div>

                  {campaignMode === 'new' ? (
                    <input
                      type="text"
                      value={campaignName}
                      onChange={e => setCampaignName(e.target.value)}
                      placeholder="e.g. [CasaGrown] Games - Garden Spell"
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                    />
                  ) : (
                    <select
                      value={existingCampaignId}
                      onChange={e => setExistingCampaignId(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', background: '#FFFFFF' }}
                    >
                      {availableCampaigns.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 2. Ad Set Level (Where Targeting, Budget & Placements Live) */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#334155' }}>
                      2. Meta Ad Set (Audience, Budget &amp; Placements):
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setAdSetSelectionType('auto')}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: adSetSelectionType === 'auto' ? '1px solid #7C3AED' : '1px solid #CBD5E1',
                          background: adSetSelectionType === 'auto' ? '#FAF5FF' : '#FFFFFF',
                          color: adSetSelectionType === 'auto' ? '#6D28D9' : '#64748B',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🤖 Smart Auto (Recommended)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdSetSelectionType('new')
                          setAdSetMode('new')
                        }}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: adSetSelectionType === 'new' ? '1px solid #7C3AED' : '1px solid #CBD5E1',
                          background: adSetSelectionType === 'new' ? '#FAF5FF' : '#FFFFFF',
                          color: adSetSelectionType === 'new' ? '#6D28D9' : '#64748B',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        + Force New
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdSetSelectionType('existing')
                          setAdSetMode('existing')
                        }}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: adSetSelectionType === 'existing' ? '1px solid #2563EB' : '1px solid #CBD5E1',
                          background: adSetSelectionType === 'existing' ? '#EFF6FF' : '#FFFFFF',
                          color: adSetSelectionType === 'existing' ? '#1E40AF' : '#64748B',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        📂 Pick Manual
                      </button>
                    </div>
                  </div>

                  {/* Smart Auto Match Feedback Banner */}
                  {adSetSelectionType === 'auto' && smartMatchResult && (
                    <div
                      style={{
                        background: smartMatchResult.mode === 'existing' ? '#F0FDF4' : '#FAF5FF',
                        border: smartMatchResult.mode === 'existing' ? '1px solid #86EFAC' : '1px solid #D8B4FE',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        marginBottom: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: smartMatchResult.mode === 'existing' ? '#166534' : '#6D28D9' }}>
                          {smartMatchResult.mode === 'existing' ? '✅ Auto-Matched to Compatible Ad Set:' : '✨ New Audience Detected:'}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: smartMatchResult.mode === 'existing' ? '#15803D' : '#7C3AED',
                            background: smartMatchResult.mode === 'existing' ? '#DCFCE7' : '#EDE9FE',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {smartMatchResult.mode === 'existing' ? 'Reusing Ad Set' : 'Auto-Provisioning New Ad Set'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '3px' }}>
                        📁 {smartMatchResult.suggestedName}
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: smartMatchResult.mode === 'existing' ? '#166534' : '#581C87', lineHeight: 1.35 }}>
                        {smartMatchResult.reason}
                      </p>
                    </div>
                  )}

                  {adSetSelectionType !== 'existing' ? (
                    <div>
                      {adSetSelectionType === 'new' && (
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                            New Ad Set Name:
                          </label>
                          <input
                            type="text"
                            value={adSetName}
                            onChange={e => setAdSetName(e.target.value)}
                            placeholder="e.g. AdSet_Wordle_Garden_Age25-65"
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                          />
                        </div>
                      )}

                      {/* Nested Ad Set Targeting Controls */}
                      <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                          Ad Set Audience &amp; Geo-Fencing:
                        </span>

                        {/* Geographic Scope */}
                        <div style={{ marginBottom: '8px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                            Target ZIP Codes (Optional / Local Launch):
                          </label>
                          <input
                            type="text"
                            value={targetZips}
                            onChange={e => setTargetZips(e.target.value)}
                            placeholder="e.g. 94025, 94024 (leave empty for nationwide)"
                            style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                          />
                        </div>

                        {/* Age & Gender */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Min Age</label>
                            <select value={ageMin} onChange={e => setAgeMin(Number(e.target.value))} style={{ width: '100%', padding: '5px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px' }}>
                              <option value={18}>18+</option>
                              <option value={25}>25+</option>
                              <option value={35}>35+</option>
                              <option value={45}>45+</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Max Age</label>
                            <select value={ageMax} onChange={e => setAgeMax(e.target.value)} style={{ width: '100%', padding: '5px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px' }}>
                              <option value="65+">65+</option>
                              <option value="55">55</option>
                              <option value="45">45</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Gender</label>
                            <select value={targetGender} onChange={e => setTargetGender(e.target.value as any)} style={{ width: '100%', padding: '5px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px' }}>
                              <option value="all">All Genders</option>
                              <option value="women">Women</option>
                              <option value="men">Men</option>
                            </select>
                          </div>
                        </div>

                        {/* Meta Interests Targeting */}
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                            Target Meta Interests ({selectedInterests.length} selected):
                          </label>

                          {/* Active Selected Interest Pills */}
                          {selectedInterests.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', padding: '6px', background: '#FAF5FF', border: '1px solid #DDD6FE', borderRadius: '6px' }}>
                              {selectedInterests.map(tag => (
                                <span
                                  key={tag}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 7px',
                                    borderRadius: '10px',
                                    background: '#7C3AED',
                                    color: '#FFFFFF',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                  }}
                                >
                                  <span>✓ {tag}</span>
                                  <button
                                    type="button"
                                    onClick={() => toggleInterest(tag)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#FFFFFF',
                                      fontSize: '10px',
                                      cursor: 'pointer',
                                      padding: '0',
                                      lineHeight: 1,
                                    }}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Custom Interest Input Bar */}
                          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                            <input
                              type="text"
                              placeholder="Type custom Meta interest (e.g. Gardeners, Hydroponics)..."
                              value={customInterestInput}
                              onChange={e => setCustomInterestInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleAddCustomInterest()
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '5px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '11px',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleAddCustomInterest()}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                background: '#7C3AED',
                                color: '#FFFFFF',
                                border: 'none',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              + Add
                            </button>
                          </div>

                          {/* Popular Quick Suggestions */}
                          <div>
                            <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '3px' }}>
                              Popular Suggestions:
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {SUGGESTED_META_INTERESTS.map(tag => {
                                const isSelected = selectedInterests.includes(tag)
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => toggleInterest(tag)}
                                    style={{
                                      padding: '2px 7px',
                                      borderRadius: '10px',
                                      border: isSelected ? '1px solid #7C3AED' : '1px solid #CBD5E1',
                                      background: isSelected ? '#FAF5FF' : '#FFFFFF',
                                      color: isSelected ? '#6D28D9' : '#64748B',
                                      fontSize: '10px',
                                      fontWeight: isSelected ? 700 : 500,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {isSelected ? '✓ ' : '+ '}{tag}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* Narrow Audience (AND Must Also Match) Toggle / Card */}
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
                            <div style={{ marginTop: '12px', padding: '10px', background: '#F5F3FF', border: '1px solid #C4B5FD', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#6D28D9', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>🔗</span>
                                  <span>AND MUST ALSO MATCH ({narrowInterests.length} selected):</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowNarrowAudience(false)
                                    setNarrowInterests([])
                                  }}
                                  style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '10px', cursor: 'pointer' }}
                                >
                                  ✕ Remove Narrowing
                                </button>
                              </div>

                              {/* Active Narrowed Interest Pills */}
                              {narrowInterests.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', padding: '6px', background: '#FFFFFF', border: '1px solid #DDD6FE', borderRadius: '6px' }}>
                                  {narrowInterests.map(tag => (
                                    <span
                                      key={tag}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '2px 7px',
                                        borderRadius: '10px',
                                        background: '#4C1D95',
                                        color: '#FFFFFF',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                      }}
                                    >
                                      <span>✓ {tag}</span>
                                      <button
                                        type="button"
                                        onClick={() => toggleNarrowInterest(tag)}
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          color: '#FFFFFF',
                                          fontSize: '10px',
                                          cursor: 'pointer',
                                          padding: '0',
                                          lineHeight: 1,
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Custom Narrow Interest Input Bar */}
                              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                                <input
                                  type="text"
                                  placeholder="Type narrowing interest (e.g. Gardeners, Organic Farming)..."
                                  value={customNarrowInterestInput}
                                  onChange={e => setCustomNarrowInterestInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleAddCustomNarrowInterest()
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '11px',
                                    background: '#FFFFFF',
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddCustomNarrowInterest()}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    background: '#6D28D9',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  + Add
                                </button>
                              </div>

                              {/* Quick Suggestions for Narrowing */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {['Gardeners', 'Gardening', 'Organic Farming', 'Fruit Trees', 'Home Gardening', 'Permaculture', 'Wordle', 'Brain Games'].map(tag => {
                                  const isSelected = narrowInterests.includes(tag)
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() => toggleNarrowInterest(tag)}
                                      style={{
                                        padding: '2px 7px',
                                        borderRadius: '10px',
                                        border: isSelected ? '1px solid #6D28D9' : '1px solid #CBD5E1',
                                        background: isSelected ? '#DDD6FE' : '#FFFFFF',
                                        color: isSelected ? '#4C1D95' : '#64748B',
                                        fontSize: '10px',
                                        fontWeight: isSelected ? 700 : 500,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {isSelected ? '✓ ' : '+ '}{tag}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Budget & Duration */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                            Daily Budget:
                          </label>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>$</span>
                            <input
                              type="number"
                              min={1}
                              value={budgetAmount}
                              onChange={e => setBudgetAmount(Number(e.target.value))}
                              style={{ width: '60px', padding: '5px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px' }}
                            />
                            <select
                              value={budgetType}
                              onChange={e => setBudgetType(e.target.value as any)}
                              style={{ flex: 1, padding: '5px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', background: '#FFFFFF' }}
                            >
                              <option value="daily">/ Day</option>
                              <option value="lifetime">Total</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                            Duration:
                          </label>
                          <select
                            value={adDurationDays}
                            onChange={e => setAdDurationDays(e.target.value)}
                            style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', background: '#FFFFFF' }}
                          >
                            <option value="3">3 Days ($ {budgetType === 'daily' ? budgetAmount * 3 : budgetAmount})</option>
                            <option value="7">7 Days ($ {budgetType === 'daily' ? budgetAmount * 7 : budgetAmount})</option>
                            <option value="14">14 Days ($ {budgetType === 'daily' ? budgetAmount * 14 : budgetAmount})</option>
                            <option value="30">30 Days ($ {budgetType === 'daily' ? budgetAmount * 30 : budgetAmount})</option>
                            <option value="continuous">Continuous (Until Paused)</option>
                          </select>
                        </div>
                      </div>

                      {/* Placements */}
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                          Placements:
                        </label>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {[
                            { id: 'ig_reels', label: 'Instagram Reels' },
                            { id: 'ig_stories', label: 'Instagram Stories' },
                            { id: 'fb_feed', label: 'Facebook Feed' },
                            { id: 'ig_feed', label: 'Instagram Feed' },
                          ].map(p => {
                            const isSel = selectedPlacements.includes(p.id)
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => togglePlacement(p.id)}
                                style={{
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  border: isSel ? '1px solid #7C3AED' : '1px solid #CBD5E1',
                                  background: isSel ? '#FAF5FF' : '#FFFFFF',
                                  color: isSel ? '#6D28D9' : '#64748B',
                                  fontSize: '10px',
                                  fontWeight: isSel ? 700 : 500,
                                  cursor: 'pointer',
                                }}
                              >
                                {isSel ? '✓ ' : ''}{p.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <select
                        value={existingAdSetId}
                        onChange={e => setExistingAdSetId(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', background: '#FFFFFF', marginBottom: '8px' }}
                      >
                        {availableAdSets.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: '#1E40AF' }}>
                        ℹ️ <strong>Inherited Settings:</strong> This ad will run inside the selected Ad Set, inheriting its pre-configured ZIP targeting, demographics, daily budget, and placements automatically.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SECTION 6: PUBLISHING SCHEDULE */}
            <div style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
                {publishType === 'paid_ad' ? '6. Launch Timing' : '4. Publishing Schedule'}
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setScheduleType('immediate')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    border: scheduleType === 'immediate' ? '2px solid #16A34A' : '1px solid #CBD5E1',
                    background: scheduleType === 'immediate' ? '#F0FDF4' : '#FFFFFF',
                    color: scheduleType === 'immediate' ? '#166534' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🚀 Publish / Run Immediately
                </button>

                <button
                  onClick={() => setScheduleType('scheduled')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    border: scheduleType === 'scheduled' ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                    background: scheduleType === 'scheduled' ? '#FAF5FF' : '#FFFFFF',
                    color: scheduleType === 'scheduled' ? '#6D28D9' : '#64748B',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  📅 Schedule Date &amp; Time
                </button>
              </div>

              {scheduleType === 'scheduled' && (
                <div style={{ marginTop: '12px' }}>
                  {/* Timezone Badge */}
                  {(() => {
                    const isPaid = publishType === 'paid_ad'
                    const zipTz = isPaid ? getZipTimezone(targetZips.split(',').map(z => z.trim()).filter(Boolean)) : { iana: 'America/Los_Angeles', short: 'PT (Pacific Time)' }
                    const targetDate = new Date(Date.now() + scheduleDayOffset * 86400000)
                    const slotsForDay = getOptimalSlotsForDay(targetDate.getDay())
                    
                    return (
                      <div>
                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '6px 10px', borderRadius: '6px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                            📍 {isPaid ? 'Target Timezone:' : 'Page Timezone:'} <strong style={{ color: '#0F172A' }}>{zipTz.iana} ({zipTz.short})</strong>
                          </span>
                          <span style={{ fontSize: '10px', color: isPaid ? '#7C3AED' : '#2563EB', background: isPaid ? '#EDE9FE' : '#EFF6FF', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            {isPaid ? 'Local Time' : 'Pacific Time'}
                          </span>
                        </div>

                        {/* Day Tabs */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                          {[
                            { offset: 0, label: `Today (${new Date().toLocaleDateString('en-US', { weekday: 'short' })})` },
                            { offset: 1, label: `Tomorrow (${new Date(Date.now() + 86400000).toLocaleDateString('en-US', { weekday: 'short' })})` },
                            { offset: ((6 - new Date().getDay() + 7) % 7) || 7, label: 'Saturday' },
                            { offset: ((7 - new Date().getDay() + 7) % 7) || 7, label: 'Sunday' },
                          ].map(tab => (
                            <button
                              key={tab.offset}
                              type="button"
                              onClick={() => setScheduleDayOffset(tab.offset)}
                              style={{
                                flex: 1,
                                padding: '4px',
                                borderRadius: '4px',
                                border: scheduleDayOffset === tab.offset ? '1px solid #7C3AED' : '1px solid #CBD5E1',
                                background: scheduleDayOffset === tab.offset ? '#FAF5FF' : '#FFFFFF',
                                color: scheduleDayOffset === tab.offset ? '#6D28D9' : '#64748B',
                                fontSize: '10px',
                                fontWeight: scheduleDayOffset === tab.offset ? 700 : 500,
                                cursor: 'pointer',
                              }}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        {/* Dynamic Slot Cards for this Day */}
                        <div style={{ marginBottom: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '6px' }}>
                            ⚡ Researched Peak Windows for {targetDate.toLocaleDateString('en-US', { weekday: 'long' })}:
                          </span>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            {slotsForDay.map(slot => {
                              const slotIso = computeSlotDateTime(scheduleDayOffset, slot.hours, slot.minutes)
                              const isSelected = scheduledDateTime === slotIso
                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => setScheduledDateTime(slotIso)}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    border: isSelected ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                                    background: isSelected ? '#FAF5FF' : '#FFFFFF',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? '#6D28D9' : '#0F172A' }}>
                                      {slot.icon} {slot.name}
                                    </span>
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#7C3AED', background: '#EDE9FE', padding: '1px 5px', borderRadius: '4px' }}>
                                      {slot.timeLabel}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '10px', color: '#64748B' }}>
                                    {slot.badge}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Custom Date & Time Picker */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                      Or Enter Custom Date &amp; Time:
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledDateTime}
                      onChange={e => setScheduledDateTime(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Video Mockup */}
          <div style={{ padding: '20px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflowY: 'auto' }}>
            <div>
              {/* Preview Header with Auto-Detected Aspect Ratio */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Live Gameplay Ad Mockup
                </span>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: previewTab === 'story' ? '#EDE9FE' : '#F1F5F9', border: previewTab === 'story' ? '1px solid #DDD6FE' : '1px solid #E2E8F0', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: previewTab === 'story' ? '#6D28D9' : '#475569' }}>
                  {previewTab === 'story' ? '📱 9:16 Vertical Reel' : '🖥️ Feed Video'}
                </div>
              </div>

              {/* Feed Post Video Mockup */}
              {previewTab === 'feed' ? (
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                    maxWidth: '420px',
                    margin: '0 auto',
                    overflow: 'hidden',
                  }}
                >
                  {/* Account Header */}
                  <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: '14px' }}>
                        {selectedGame.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>
                          CasaGrown • {selectedGame.name}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748B' }}>
                          {publishType === 'paid_ad' ? 'Sponsored • Daily Games' : 'Just now • Brain Game'}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: '14px', color: '#94A3B8' }}>•••</span>
                  </div>

                  {/* Post Caption Body */}
                  <div style={{ padding: '10px 14px', fontSize: '12px', color: '#1E293B', lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                    {primaryText}
                    {publishType === 'organic_post' && (
                      <div style={{ marginTop: '8px', color: '#2563EB', fontWeight: 600 }}>
                        👉 {effectiveLink}
                      </div>
                    )}
                  </div>

                  {/* Video Container */}
                  <div style={{ position: 'relative', width: '100%', height: '260px', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {uploadedVideoUrl ? (
                      <video src={uploadedVideoUrl} controls autoPlay loop muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                        <div style={{ fontSize: '36px', marginBottom: '4px' }}>🎬</div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>Upload Gameplay Video</div>
                        <div style={{ fontSize: '10px', color: '#64748B' }}>Auto-detected dimensions</div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Bar (Paid Ads) */}
                  {publishType === 'paid_ad' && (
                    <div style={{ padding: '10px 14px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ maxWidth: '240px' }}>
                        <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          casagrown.com/games
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {headline || selectedGame.name}
                        </div>
                      </div>

                      <button
                        style={{
                          background: '#7C3AED',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {callToAction}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* 9:16 Reels Mockup */
                <div
                  style={{
                    position: 'relative',
                    width: '240px',
                    height: '426px',
                    margin: '0 auto',
                    borderRadius: '24px',
                    background: '#0F172A',
                    overflow: 'hidden',
                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
                    border: '4px solid #1E293B',
                  }}
                >
                  {uploadedVideoUrl ? (
                    <video src={uploadedVideoUrl} controls autoPlay loop muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8' }}>
                      <div style={{ fontSize: '36px' }}>🎬</div>
                      <div style={{ fontSize: '11px', marginTop: '6px', textAlign: 'center', padding: '0 12px' }}>
                        Vertical 9:16 Gameplay Screen Recording
                      </div>
                    </div>
                  )}

                  {/* Reel Overlay Text & CTA */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: '12px' }}>
                        {selectedGame.icon}
                      </div>
                      <span style={{ color: '#FFFFFF', fontSize: '11px', fontWeight: 700 }}>CasaGrown Games</span>
                    </div>

                    <div style={{ color: '#FFFFFF', fontSize: '11px', fontWeight: 700, lineHeight: 1.3, marginBottom: '4px' }}>
                      {headline}
                    </div>

                    {primaryText && (
                      <div style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '10px', lineHeight: 1.35, marginBottom: '8px', maxHeight: '72px', overflowY: 'auto', whiteSpace: 'pre-line', paddingRight: '2px' }}>
                        {primaryText}
                      </div>
                    )}

                    <button
                      style={{
                        width: '100%',
                        background: '#7C3AED',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '8px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {callToAction} →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Action Footer */}
            <div style={{ marginTop: '20px' }}>
              {livePostUrl && (
                <div style={{ marginBottom: '12px', padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534' }}>
                    🎉 Post Published Live to Facebook Page!
                  </div>
                  <a
                    href={livePostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '4px 10px',
                      background: '#16A34A',
                      color: '#FFFFFF',
                      borderRadius: '5px',
                      fontSize: '11px',
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    View on Facebook ↗
                  </a>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleSaveCampaign('draft')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save as Draft
                </button>

                <button
                  disabled={isSaving}
                  onClick={() => handleSaveCampaign(scheduleType === 'immediate' ? 'active' : 'scheduled')}
                  style={{
                    flex: 2,
                    padding: '10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: publishType === 'paid_ad' ? '#7C3AED' : '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  {isSaving ? 'Processing...' : (
                    saveSuccess ? '✓ Campaign Saved!' : (
                      publishType === 'paid_ad'
                        ? (scheduleType === 'immediate' ? '🚀 Launch Meta Video Ad ($' + budgetAmount + '/day)' : '📅 Schedule Meta Video Ad')
                        : (scheduleType === 'immediate' ? '📘 Publish Video Post Now' : '📅 Schedule Video Post')
                    )
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meta API Settings Modal */}
      <MetaSettingsModal
        isOpen={showMetaSettings}
        onClose={() => setShowMetaSettings(false)}
      />
    </div>
  )
}
