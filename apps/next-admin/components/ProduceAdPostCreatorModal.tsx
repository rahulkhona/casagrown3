'use client'

import { useState, useEffect } from 'react'
import { EXHAUSTIVE_INTERESTS_CATALOG } from '../../next-market/lib/interestCatalog'
import MetaSettingsModal from './MetaSettingsModal'
import { getZipTimezone, getOptimalSlotsForDay, computeSlotDateTime } from '../lib/socialPostingSlots'
import { resolveSmartAdSet, MetaAdSetRecord, MatchResult } from '../lib/adSetMatching'
import { createClient } from '../lib/supabase'

export type AdPostModalContext = {
  isOpen: boolean
  initialPublishType?: 'paid_ad' | 'organic_post'
  contextType: 'seller_single_produce' | 'buyer_single_produce' | 'seller_multi_produce' | 'buyer_multi_produce'
  produceIds: string[]
  produceNames: string[]
  produceImages: string[]
  topZips: string[]
  metricsSummary: string
}

export type MediaMode = 'video' | 'photos'
export type PublishType = 'paid_ad' | 'organic_post'
export type PhotoLayout = 'single' | 'split_2' | 'grid_4' | 'carousel'

export const DEFAULT_INTEREST_TAGS = [
  'Gardening',
  'Organic Food',
  'Farmers Market',
  'Fruit Trees',
  'Home Cooking',
  'Food Waste Reduction',
  'Urban Agriculture',
  'Permaculture',
  'Local Harvest',
]

export default function ProduceAdPostCreatorModal({
  modalContext,
  context,
  onClose,
}: {
  modalContext?: AdPostModalContext
  context?: any
  onClose: () => void
}) {
  const ctx = modalContext || context || {}
  const produceNames = ctx.produceNames || []
  const topZips = ctx.topZips || []
  const metricsSummary = ctx.metricsSummary || ''
  const contextType = ctx.contextType || 'seller_single_produce'

  const isMulti = contextType.includes('multi')
  const initialIsSeller = contextType.startsWith('seller')

  // Target Audience & Campaign Type
  const [targetAudience, setTargetAudience] = useState<'seller' | 'buyer'>(initialIsSeller ? 'seller' : 'buyer')
  const [publishType, setPublishType] = useState<PublishType>(ctx.initialPublishType || 'paid_ad')

  // Media Creative State
  const [mediaMode, setMediaMode] = useState<MediaMode>('photos')
  const [photoLayout, setPhotoLayout] = useState<PhotoLayout>('split_2')
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([])
  const [videoSourceMode, setVideoSourceMode] = useState<'upload' | 'saved_library'>('upload')
  const [uploadedVideoFile, setUploadedVideoFile] = useState<File | null>(null)
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null)
  const [selectedSavedVideoTitle, setSelectedSavedVideoTitle] = useState<string>('')
  const [savedVideos, setSavedVideos] = useState<Array<{ id: string; title: string; preview_video_url: string; aspect_ratio?: string; created_at?: string }>>([])
  const [savedPhotos, setSavedPhotos] = useState<Array<{ id: string; title: string; imageUrl: string; produceName?: string }>>([])
  const [carouselActiveIdx, setCarouselActiveIdx] = useState(0)
  const [showPhotoGallery, setShowPhotoGallery] = useState(false)
  const [showAiPhotoDrawer, setShowAiPhotoDrawer] = useState(false)
  const [aiPhotoPrompt, setAiPhotoPrompt] = useState(
    produceNames.length > 0
      ? `Sunlit rustic wooden farm table with fresh ripe ${produceNames.join(' and ')}, morning dew droplets`
      : 'Sunlit rustic wooden farm table with fresh organic garden harvest'
  )
  const [isGeneratingAiPhotos, setIsGeneratingAiPhotos] = useState(false)
  const [generatedCandidatePhotos, setGeneratedCandidatePhotos] = useState<Array<{ id: string; title: string; imageUrl: string }>>([])

  const loadSavedVideos = () => {
    fetch('/api/creative-studio/assets?type=video')
      .then(res => res.json())
      .then(data => {
        if (data?.assets && Array.isArray(data.assets)) {
          const vids = data.assets.map((a: any) => ({
            id: a.id,
            title: a.title,
            preview_video_url: a.mediaUrl || a.thumbnailUrl,
            aspect_ratio: a.aspectRatio || '9:16',
            created_at: a.savedAt,
          }))
          setSavedVideos(vids)
        }
      })
      .catch(() => {})
  }

  // Copywriting & Messaging
  const [headline, setHeadline] = useState('')
  const [primaryText, setPrimaryText] = useState('')
  const [callToAction, setCallToAction] = useState('List Your Harvest')
  const [generatingCopy, setGeneratingCopy] = useState(false)
  const [copyVariations, setCopyVariations] = useState<{ headline: string; text: string; cta: string }[]>([])

  // Destination URL & UTM Parameters
  const [urlPreset, setUrlPreset] = useState<string>('https://casagrown.com/create-listing')
  const [customUrl, setCustomUrl] = useState('')
  const [utmSource, setUtmSource] = useState('facebook')
  const [utmMedium, setUtmMedium] = useState(ctx.initialPublishType === 'organic_post' ? 'facebook_post' : 'paid_ad')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [utmContent, setUtmContent] = useState('')
  const [showUtmBuilder, setShowUtmBuilder] = useState(false)
  const [shortUrl, setShortUrl] = useState('')
  const [generatingShortLink, setGeneratingShortLink] = useState(false)

  // Audience Demographics & Targeting
  const [targetZips, setTargetZips] = useState<string>('')
  const [targetRadius, setTargetRadius] = useState<string>('10')
  const [ageMin, setAgeMin] = useState<number>(25)
  const [ageMax, setAgeMax] = useState<string>('65+')
  const [targetGender, setTargetGender] = useState<'all' | 'women' | 'men'>('all')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    'Gardening',
    'Organic Food',
    'Fruit Trees',
  ])
  const [customInterestInput, setCustomInterestInput] = useState('')
  const [showNarrowAudience, setShowNarrowAudience] = useState(false)
  const [narrowInterests, setNarrowInterests] = useState<string[]>([])
  const [customNarrowInterestInput, setCustomNarrowInterestInput] = useState('')

  // Budget & Scheduling
  const [scheduleType, setScheduleType] = useState<'immediate' | 'scheduled'>('immediate')
  const [scheduledDateTime, setScheduledDateTime] = useState('')
  const [scheduleDayOffset, setScheduleDayOffset] = useState<number>(0)
  const [budgetType, setBudgetType] = useState<'daily' | 'lifetime'>('daily')
  const [budgetAmount, setBudgetAmount] = useState<number>(15)
  const [adDurationDays, setAdDurationDays] = useState<string>('7')
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>([
    'fb_feed',
    'ig_feed',
    'ig_reels',
    'ig_stories',
  ])

  // UI state
  const [previewTab, setPreviewTab] = useState<'feed' | 'story'>('feed')
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

  const produceNamesKey = (produceNames || []).join(',')
  const topZipsKey = (topZips || []).join(',')
  const interestsKey = selectedInterests.join(',')
  const adSetsCount = availableAdSets.length

  // Dynamic Smart Ad Set Matcher (Guarantees Intent & Produce Budget Isolation)
  useEffect(() => {
    if (!ctx.isOpen) return
    if (adSetSelectionType === 'auto') {
      const criteria = {
        audienceIntent: targetAudience,
        items: produceNames,
        zips: targetZips.split(',').map(z => z.trim()).filter(Boolean),
        ageMin,
        ageMax: ageMax === '65+' ? 65 : Number(ageMax),
        gender: targetGender,
        interests: selectedInterests,
        campaignId: campaignMode === 'existing' ? existingCampaignId : undefined,
      }
      const res = resolveSmartAdSet(criteria, availableAdSets, produceNames.join('_') || 'Produce')
      setSmartMatchResult(res)
      if (res.mode === 'existing' && res.matchedAdSet) {
        setAdSetMode('existing')
        setExistingAdSetId(res.matchedAdSet.id)
      } else {
        setAdSetMode('new')
        setAdSetName(res.suggestedName)
      }
    }
  }, [ctx.isOpen, adSetSelectionType, targetAudience, produceNamesKey, targetZips, ageMin, ageMax, targetGender, interestsKey, adSetsCount, campaignMode, existingCampaignId])

  // Sync state when modal opens
  useEffect(() => {
    if (ctx.isOpen) {
      const isSel = (ctx.contextType || 'seller_single_produce').startsWith('seller')
      const initialMode = ctx.initialPublishType || 'paid_ad'
      setTargetAudience(isSel ? 'seller' : 'buyer')
      setPublishType(initialMode)
      setUtmMedium(initialMode === 'organic_post' ? 'facebook_post' : 'paid_ad')
      setTargetZips(topZips.join(', '))
      setUtmCampaign(`produce_${produceNames.map((p: string) => p.toLowerCase().replace(/\s+/g, '_')).join('_') || 'demand'}`)
      
      const cleanNames = produceNames.map((p: string) => p.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()))
      setCampaignName(`[CasaGrown] ${isSel ? 'Seller Demand' : 'Buyer Wishlist'} - ${cleanNames.join(' & ')} (${topZips[0] || 'Local'})`)
      setAdSetName(`AdSet_${produceNames.join('_')}_${topZips[0] || 'All'}_Age25-65_10mi`)

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

      loadSavedVideos()

      // Fetch saved photos library from Creative Studio
      fetch('/api/creative-studio/assets?type=photo')
        .then(res => res.json())
        .then(data => {
          if (data?.assets && Array.isArray(data.assets)) {
            const photos = data.assets.map((a: any) => ({
              id: a.id,
              title: a.title,
              imageUrl: a.mediaUrl || a.thumbnailUrl,
              produceName: a.produceList?.[0] || 'Saved Produce',
            }))
            setSavedPhotos(photos)
          }
        })
        .catch(() => {})

      const defaultUrl = isSel ? 'https://casagrown.com/create-listing' : 'https://casagrown.com/market'
      setUrlPreset(defaultUrl)
      setCustomUrl('')
      setCallToAction(isSel ? 'LEARN_MORE' : 'SIGN_UP')

      if (ctx.initialMediaMode === 'video' || ctx.prefilledMediaUrl) {
        setMediaMode('video')
        setVideoSourceMode('saved_library')
        if (ctx.prefilledMediaUrl) {
          setUploadedVideoUrl(ctx.prefilledMediaUrl)
          setSelectedSavedVideoTitle(ctx.prefilledHeadline || ctx.prefilledTitle || 'Selected Motion Video')
        }
      }

      // Populate default photos from catalog
      const matchedImages = produceNames.map((p: string) => {
        const found = EXHAUSTIVE_INTERESTS_CATALOG.find(
          c => c.name.toLowerCase() === p.toLowerCase() || c.id.toLowerCase() === p.toLowerCase()
        )
        return found?.image || 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=600&q=80'
      })
      setSelectedPhotos(matchedImages.length > 0 ? matchedImages : [
        'https://images.unsplash.com/photo-1590502593747-42a996133562?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=600&q=80',
      ])

      // Auto-trigger AI Copy Generation
      generateAiCopy(isSel ? 'seller' : 'buyer')
    }
  }, [ctx.isOpen, ctx.contextType, produceNamesKey, topZipsKey])

  const cleanProduceNames = produceNames.map((p: string) => 
    p.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
  )

  const isSeller = targetAudience === 'seller'
  const destinationUrl = customUrl.trim() || urlPreset

  // Build Full Tracking URL
  const buildFullTrackingUrl = () => {
    try {
      const url = new URL(destinationUrl.startsWith('http') ? destinationUrl : `https://${destinationUrl}`)
      if (utmSource) url.searchParams.set('utm_source', utmSource)
      if (utmMedium) url.searchParams.set('utm_medium', utmMedium)
      if (utmCampaign || cleanProduceNames.length > 0) url.searchParams.set('utm_campaign', utmCampaign || `produce_${cleanProduceNames[0]?.toLowerCase() || 'harvest'}`)
      if (utmContent || mediaMode) url.searchParams.set('utm_content', utmContent || `${mediaMode}_${publishType}`)
      return url.toString()
    } catch {
      const glue = destinationUrl.includes('?') ? '&' : '?'
      return `${destinationUrl}${glue}utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(utmMedium)}&utm_campaign=${encodeURIComponent(utmCampaign || `produce_${cleanProduceNames[0]?.toLowerCase() || 'harvest'}`)}&utm_content=${encodeURIComponent(utmContent || `${mediaMode}_${publishType}`)}`
    }
  }
  const fullTrackingUrl = buildFullTrackingUrl()
  const effectiveLink = shortUrl || fullTrackingUrl

  // Generate Short URL & Insert into Active Destination URL
  const handleGenerateShortLink = async () => {
    setGeneratingShortLink(true)
    try {
      const res = await fetch('/api/crm/short-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_url: fullTrackingUrl,
          target_url: fullTrackingUrl,
          label: `Ad: ${cleanProduceNames.join(', ')} (${publishType})`,
        }),
      })
      const json = await res.json()
      if (json.short_url) {
        setShortUrl(json.short_url)
        setCustomUrl(json.short_url) // Directly insert shortened URL into field
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

  // Helper: Append short link to post caption
  const handleAppendLinkToCaption = () => {
    const link = shortUrl || fullTrackingUrl
    setPrimaryText(prev => {
      const cleaned = prev.replace(/\n*👉.*$/gi, '').trim()
      return `${cleaned}\n\n👉 ${link}`
    })
  }

  // Generate AI Copy Variations
  const generateAiCopy = async (audience: 'seller' | 'buyer') => {
    setGeneratingCopy(true)
    const pNames = cleanProduceNames.join(' & ') || 'Fresh Produce'
    const zipStr = topZips.length > 0 ? (topZips.length === 1 ? `in ${topZips[0]}` : `in ${topZips.slice(0, 2).join(' & ')}`) : 'in your neighborhood'
    const primaryZip = topZips[0] ? `in ${topZips[0]}` : 'down your street'
    
    // Generates fast deterministic variations and prompts
    if (audience === 'seller') {
      const variations = [
        {
          headline: `Neighbors ${zipStr} are searching for backyard ${pNames} right now! 🍋`,
          text: `Real buyers on CasaGrown are actively requesting fresh, homegrown ${pNames} ${zipStr}.\n\nDon't let your overloaded tree drop to the lawn and go to waste. Verified neighbors are waiting for porch pickup today.\n\n📸 Snap a photo & list in 60 seconds\n💵 Keep 100% of your earnings — Zero fees\n🤝 Direct contactless porch pickups from nearby families`,
          cta: 'LEARN_MORE',
        },
        {
          headline: `Got extra ${pNames}? Families on your block want to buy your harvest today! 🌿`,
          text: `We have active buyer requests for homegrown ${pNames} waiting ${primaryZip}.\n\nTurn your yard's overflow into cash this afternoon instead of letting it spoil. Local families would rather buy tree-ripened fruit from you than supermarket produce.\n\n✨ Free to list in under 1 minute\n📍 Buyers walk or drive right to your porch\n🌱 100% zero food waste in our community`,
          cta: 'SIGN_UP',
        },
        {
          headline: `Overloaded ${pNames} tree? Local buyers are waiting on CasaGrown! 🌳`,
          text: `Local households nearby are looking for pesticide-free ${pNames} picked straight from the branch.\n\nList your surplus on CasaGrown in 60 seconds and fulfill active neighbor requests before the harvest season ends!`,
          cta: 'LEARN_MORE',
        }
      ]
      setCopyVariations(variations)
      setHeadline(variations[0].headline)
      setPrimaryText(variations[0].text)
      setCallToAction(variations[0].cta)
    } else {
      const variations = [
        {
          headline: `Craving fresh backyard ${pNames}? Request it from local growers ${zipStr}! 🥑`,
          text: `Tired of tasteless, cold-storage produce from the grocery store? Tell neighbors on CasaGrown that you're looking for fresh, sun-ripened ${pNames}.\n\nWhen local gardeners with overloaded trees in your ZIP code harvest, you'll be the first to get notified for fresh porch pickup!\n\n🌿 100% pesticide-free homegrown harvest\n🔔 Get instant notifications when neighbors list\n🤝 Connect directly with gardeners down your street`,
          cta: 'SIGN_UP',
        },
        {
          headline: `Want tree-ripened ${pNames} from backyard trees ${primaryZip}? 🧺`,
          text: `Backyard trees across ${zipStr} grow the sweetest ${pNames}, but most goes to waste on lawns.\n\nAdd ${pNames} to your CasaGrown neighborhood wishlist in 30 seconds so local growers know there is demand and notify you when their fruit is ripe!\n\n✨ Free to join neighborhood wishlist\n📍 Walking-distance contactless porch pickups\n🌱 Help stop neighborhood food waste`,
          cta: 'SUBSCRIBE',
        },
        {
          headline: `Get notified when neighbors harvest fresh ${pNames} ${primaryZip}! ☀️`,
          text: `Looking for chemical-free, tree-ripened ${pNames} grown right in your community?\n\nExpress your interest on CasaGrown today and encourage local growers with overloaded trees to share their harvest with you!`,
          cta: 'LEARN_MORE',
        }
      ]
      setCopyVariations(variations)
      setHeadline(variations[0].headline)
      setPrimaryText(variations[0].text)
      setCallToAction(variations[0].cta)
    }
    setGeneratingCopy(false)
  }

  // Handle Photo Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const newUrls = Array.from(files).map(f => URL.createObjectURL(f))
      setSelectedPhotos(prev => [...prev, ...newUrls].slice(0, 6))
    }
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
        title: `${cleanProduceNames.join(' & ')} ${publishType === 'paid_ad' ? 'Paid Ad' : 'Social Post'} (${targetAudience})`,
        campaign_mode: campaignMode,
        campaign_name: campaignMode === 'new' ? campaignName : availableCampaigns.find(c => c.id === existingCampaignId)?.name,
        existing_campaign_id: campaignMode === 'existing' ? existingCampaignId : undefined,
        ad_set_mode: adSetMode,
        ad_set_name: adSetMode === 'new' ? adSetName : availableAdSets.find(a => a.id === existingAdSetId)?.name,
        existing_ad_set_id: adSetMode === 'existing' ? existingAdSetId : undefined,
        publish_type: publishType,
        target_audience: targetAudience,
        produce_names: cleanProduceNames,
        headline,
        primary_text: primaryText,
        call_to_action: callToAction,
        destination_url: fullTrackingUrl,
        short_url: shortUrl || undefined,
        media_mode: mediaMode,
        photo_layout: mediaMode === 'photos' ? photoLayout : undefined,
        photo_urls: mediaMode === 'photos' ? selectedPhotos : undefined,
        video_name: mediaMode === 'video' ? (uploadedVideoFile?.name || selectedSavedVideoTitle || 'produce_video.mp4') : undefined,
        preview_video_url: mediaMode === 'video' ? (uploadedVideoUrl || undefined) : undefined,
        target_zips: targetZips.split(',').map(z => z.trim()).filter(Boolean),
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

      // 1. Upload video directly to Supabase from the client to bypass Vercel 4.5MB limits
      let finalVideoUrl = payload.preview_video_url
      if (uploadedVideoFile && mediaMode === 'video') {
        const fileExt = uploadedVideoFile.name.split('.').pop()
        const fileName = `manual_vid_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        
        const supabase = createClient()
        
        // Try uploading to 'marketing_assets'
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('marketing_assets')
          .upload(`ad-videos/${fileName}`, uploadedVideoFile, {
            cacheControl: '3600',
            upsert: false
          })
          
        if (uploadError) {
          console.error('Client-side video upload failed:', uploadError)
          // Fallback to sending via API if client-side fails (e.g. RLS policies)
          // For <4.5MB it might still work.
        } else if (uploadData) {
          const { data: { publicUrl } } = supabase.storage
            .from('marketing_assets')
            .getPublicUrl(`ad-videos/${fileName}`)
          finalVideoUrl = publicUrl
          payload.preview_video_url = publicUrl
        }
      }

      // 2. Persist to internal CRM database
      const formData = new FormData()
      formData.append('action', 'create_campaign_post')
      formData.append('campaignPayload', JSON.stringify(payload))
      
      // Only append file if client-side upload failed and we still want to try the fallback
      if (uploadedVideoFile && mediaMode === 'video' && (!finalVideoUrl || finalVideoUrl === uploadedVideoUrl)) {
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

      // 2. If Paid Meta Ad, deploy to Meta Marketing API (Campaign -> Ad Set -> Creative -> Ad)
      if (publishType === 'paid_ad') {
        // Fetch saved settings first from localStorage
        const localSettingsStr = typeof window !== 'undefined' ? localStorage.getItem('casagrown_meta_settings') : null
        const settingsData = localSettingsStr ? JSON.parse(localSettingsStr) : {}
        
        const metaRes = await fetch('/api/crm/meta-ads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            campaign: payload,
            settings: settingsData 
          }),
        })
        const metaData = await metaRes.json()
        setMetaResult(metaData)
      }

      setSaveSuccess(true)
    } catch (err) {
      console.error('Error saving campaign:', err)
    } finally {
      setIsSaving(false)
    }
  }

  if (!ctx.isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
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
                background: isSeller ? '#DCFCE7' : '#DBEAFE',
                color: isSeller ? '#16A34A' : '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
              }}
            >
              {isSeller ? '👨‍🌾' : '🍎'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                {/* Target Audience Switcher */}
                <div style={{ display: 'inline-flex', background: '#E2E8F0', padding: '2px', borderRadius: '20px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetAudience('seller')
                      setUrlPreset('https://casagrown.com/create-listing')
                      setCallToAction('List Your Harvest')
                      generateAiCopy('seller')
                    }}
                    style={{
                      border: 'none',
                      padding: '3px 10px',
                      borderRadius: '16px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: isSeller ? '#16A34A' : 'transparent',
                      color: isSeller ? '#FFFFFF' : '#475569',
                    }}
                  >
                    👨‍🌾 Target Sellers
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetAudience('buyer')
                      setUrlPreset('https://casagrown.com/interest')
                      setCallToAction('Request Local Harvest')
                      generateAiCopy('buyer')
                    }}
                    style={{
                      border: 'none',
                      padding: '3px 10px',
                      borderRadius: '16px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: !isSeller ? '#2563EB' : 'transparent',
                      color: !isSeller ? '#FFFFFF' : '#475569',
                    }}
                  >
                    🍎 Target Buyers
                  </button>
                </div>

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
                {publishType === 'paid_ad' ? 'Launch Meta Ad Campaign' : 'Publish Facebook Post'} for {cleanProduceNames.join(' & ')}
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

        {/* Studio Workspace Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', flex: 1, overflow: 'hidden' }}>
          {/* Left Column: Form & Configuration */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', borderRight: '1px solid #E2E8F0' }}>
            {/* SECTION 1: MEDIA CREATIVE ASSETS */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  1. Media Creative Asset
                </span>
                {/* Media Type Toggle */}
                <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '2px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <button
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
                    📸 Photos / Collage ({selectedPhotos.length})
                  </button>
                  <button
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
                    📹 Video MP4 {uploadedVideoFile ? '✓' : ''}
                  </button>
                </div>
              </div>

              {mediaMode === 'photos' ? (
                <div>
                  {/* Photo Layout Options */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    {[
                      { id: 'single', label: 'Single Photo (OG Card)' },
                      { id: 'split_2', label: '2-Photo Split Collage' },
                      { id: 'grid_4', label: '4-Photo Grid' },
                      { id: 'carousel', label: 'Swipeable Carousel' },
                    ].map(l => (
                      <button
                        key={l.id}
                        onClick={() => setPhotoLayout(l.id as PhotoLayout)}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: photoLayout === l.id ? '2px solid #2563EB' : '1px solid #CBD5E1',
                          background: photoLayout === l.id ? '#EFF6FF' : '#FFFFFF',
                          color: photoLayout === l.id ? '#1E40AF' : '#475569',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>

                  {/* Thumbnail Row + Upload Button */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {selectedPhotos.map((url, idx) => (
                      <div key={idx} style={{ position: 'relative', width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                        <img src={url} alt={`Produce ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          onClick={() => setSelectedPhotos(prev => prev.filter((_, i) => i !== idx))}
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            background: 'rgba(0,0,0,0.6)',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '50%',
                            width: '14px',
                            height: '14px',
                            fontSize: '9px',
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
                        width: '56px',
                        height: '56px',
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
                        background: showPhotoGallery ? '#EFF6FF' : '#FFFFFF',
                        color: showPhotoGallery ? '#2563EB' : '#475569',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>🖼️</span>
                      <span>{showPhotoGallery ? 'Hide Catalog' : 'Catalog Photos'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPhotoGallery(!showPhotoGallery)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        background: showPhotoGallery ? '#EFF6FF' : '#FFFFFF',
                        color: showPhotoGallery ? '#2563EB' : '#475569',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>🖼️</span>
                      <span>{showPhotoGallery ? 'Hide Photo Library' : 'Choose from Saved & Catalog Photos'}</span>
                    </button>
                  </div>

                  {/* Photo Gallery Picker Drawer */}
                  {showPhotoGallery && (
                    <div style={{ marginTop: '12px', padding: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Click any photo below to add it to your collage:</span>
                        {savedPhotos.length > 0 && (
                          <span style={{ color: '#16A34A', fontWeight: 800 }}>💾 {savedPhotos.length} Saved from Studio</span>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '8px', maxHeight: '200px', overflowY: 'auto', padding: '2px' }}>
                        {/* Saved Photos from Creative Studio First */}
                        {savedPhotos.map((item) => {
                          const isAlreadySelected = selectedPhotos.includes(item.imageUrl)
                          return (
                            <div
                              key={`saved-${item.id}`}
                              onClick={() => {
                                if (isAlreadySelected) {
                                  setSelectedPhotos(prev => prev.filter(p => p !== item.imageUrl))
                                } else {
                                  setSelectedPhotos(prev => [...prev, item.imageUrl].slice(0, 6))
                                }
                              }}
                              style={{
                                position: 'relative',
                                height: '64px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                border: isAlreadySelected ? '2px solid #16A34A' : '1px solid #86EFAC',
                                opacity: isAlreadySelected ? 0.9 : 1,
                              }}
                              title={`Saved: ${item.title}`}
                            >
                              <img src={item.imageUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <div style={{ position: 'absolute', top: '2px', left: '2px', background: '#15803D', color: '#FFFFFF', borderRadius: '4px', fontSize: '7px', padding: '1px 3px', fontWeight: 800 }}>
                                💾 Saved
                              </div>
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: '#FFFFFF', fontSize: '8px', padding: '2px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.title}
                              </div>
                              {isAlreadySelected && (
                                <div style={{ position: 'absolute', top: '2px', right: '2px', background: '#16A34A', color: '#FFFFFF', borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                                  ✓
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {/* Standard Catalog Photos */}
                        {EXHAUSTIVE_INTERESTS_CATALOG.filter(c => Boolean(c.image)).map((item) => {
                          const isAlreadySelected = selectedPhotos.includes(item.image)
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (isAlreadySelected) {
                                  setSelectedPhotos(prev => prev.filter(p => p !== item.image))
                                } else {
                                  setSelectedPhotos(prev => [...prev, item.image].slice(0, 6))
                                }
                              }}
                              style={{
                                position: 'relative',
                                height: '64px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                border: isAlreadySelected ? '2px solid #2563EB' : '1px solid #CBD5E1',
                                opacity: isAlreadySelected ? 0.9 : 1,
                              }}
                              title={item.name}
                            >
                              <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: '#FFFFFF', fontSize: '8px', padding: '2px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.name}
                              </div>
                              {isAlreadySelected && (
                                <div style={{ position: 'absolute', top: '2px', right: '2px', background: '#2563EB', color: '#FFFFFF', borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
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
                  {/* Video Source Mode Switcher */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setVideoSourceMode('upload')}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: videoSourceMode === 'upload' ? '1px solid #2563EB' : '1px solid #CBD5E1',
                        background: videoSourceMode === 'upload' ? '#EFF6FF' : '#FFFFFF',
                        color: videoSourceMode === 'upload' ? '#1D4ED8' : '#64748B',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      📁 Upload Video File
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVideoSourceMode('saved_library')
                        loadSavedVideos()
                      }}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: videoSourceMode === 'saved_library' ? '1px solid #2563EB' : '1px solid #CBD5E1',
                        background: videoSourceMode === 'saved_library' ? '#EFF6FF' : '#FFFFFF',
                        color: videoSourceMode === 'saved_library' ? '#1D4ED8' : '#64748B',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>🎬 Choose from Saved Videos</span>
                      <span style={{ padding: '1px 5px', borderRadius: '10px', background: '#DBEAFE', color: '#1E40AF', fontSize: '10px', fontWeight: 800 }}>
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
                        <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={handleVideoUpload} id="ad-video-upload" style={{ display: 'none' }} />
                        <label htmlFor="ad-video-upload" style={{ cursor: 'pointer', display: 'block', padding: '8px' }}>
                          <div style={{ fontSize: '24px', marginBottom: '4px' }}>📹</div>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563EB' }}>
                            Click to upload MP4 / MOV Video Clip
                          </span>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                            Optimal: 12–15s vertical video (1080x1920)
                          </div>
                        </label>
                      </div>
                    ) : (
                      <div>
                        {savedVideos.length === 0 ? (
                          <div style={{ padding: '16px', color: '#64748B', fontSize: '12px' }}>
                            No saved video creatives found yet. Use "Upload Video File" to upload your first video.
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
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#2563EB'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = '#E2E8F0'}
                              >
                                <div style={{ position: 'relative', height: '90px', background: '#0F172A', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {vid.preview_video_url && (vid.preview_video_url.endsWith('.mp4') || vid.preview_video_url.endsWith('.mov') || vid.preview_video_url.endsWith('.webm')) ? (
                                    <video
                                      src={vid.preview_video_url}
                                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                      muted
                                    />
                                  ) : (
                                    <img
                                      src={vid.preview_video_url}
                                      alt={vid.title}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  )}
                                  <div style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(21, 128, 61, 0.9)', color: '#FFFFFF', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px' }}>
                                    🎬 Motion Video
                                  </div>
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
                                    background: '#2563EB',
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
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 2: AD COPY & HEADLINES                            */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  2. Headline &amp; Post Caption
                </span>
                <button
                  disabled={generatingCopy}
                  onClick={() => generateAiCopy(targetAudience)}
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
                  <span>{generatingCopy ? 'Drafting...' : 'AI Generate Variations'}</span>
                </button>
              </div>

              {/* Copy Variation Switcher */}
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
                      Variation {i + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* Headline */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                  Headline / Hook:
                </label>
                <input
                  type="text"
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder="Catchy headline..."
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Primary Caption Text */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                  Primary Caption / Post Body:
                </label>
                <textarea
                  rows={4}
                  value={primaryText}
                  onChange={e => setPrimaryText(e.target.value)}
                  placeholder="Post body copy..."
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', lineHeight: 1.4, boxSizing: 'border-box' }}
                />
              </div>

              {/* Call to Action Button (If Paid Ad) */}
              {publishType === 'paid_ad' && (
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                    Meta Action Button:
                  </label>
                  <select
                    value={callToAction}
                    onChange={e => setCallToAction(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', background: '#FFFFFF', fontWeight: 600 }}
                  >
                    <option value="LEARN_MORE">Learn More</option>
                    <option value="SIGN_UP">Sign Up</option>
                    <option value="SHOP_NOW">Shop Now</option>
                    <option value="SUBSCRIBE">Subscribe</option>
                    <option value="APPLY_NOW">Apply Now</option>
                    <option value="CONTACT_US">Contact Us</option>
                  </select>
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 3: DESTINATION URL & UTM PARAMETERS               */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  3. Destination Link &amp; UTM Tracking
                </span>
                <button
                  type="button"
                  onClick={() => setShowUtmBuilder(!showUtmBuilder)}
                  style={{
                    background: showUtmBuilder ? '#DCFCE7' : '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    color: showUtmBuilder ? '#166534' : '#475569',
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

              {/* Preset URLs */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Bulk Listing (/list_bulk)', url: produceNames.length > 0 ? `https://casagrown.com/list_bulk?produce=${produceNames.map((p: string) => encodeURIComponent(p.toLowerCase().replace(/ /g, '_'))).join(',')}` : 'https://casagrown.com/list_bulk' },
                  { label: 'Seller (/create-listing)', url: 'https://casagrown.com/create-listing' },
                  { label: 'Buyer Wishlist (/interest)', url: 'https://casagrown.com/interest' },
                  { label: 'Market Map (/market)', url: 'https://casagrown.com/market' },
                  { label: 'Games (/games)', url: 'https://casagrown.com/games' },
                ].map(p => (
                  <button
                    key={p.url}
                    type="button"
                    onClick={() => {
                      setUrlPreset(p.url)
                      setCustomUrl('')
                      setShortUrl('')
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: urlPreset === p.url && !customUrl ? '2px solid #16A34A' : '1px solid #CBD5E1',
                      background: urlPreset === p.url && !customUrl ? '#F0FDF4' : '#FFFFFF',
                      color: urlPreset === p.url && !customUrl ? '#166534' : '#475569',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom URL Input */}
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
                  placeholder="https://casagrown.com/..."
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
                        border: '1px solid #16A34A',
                        background: shortUrl ? '#F0FDF4' : '#16A34A',
                        color: shortUrl ? '#166534' : '#FFFFFF',
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
                          border: '1px solid #2563EB',
                          background: '#EFF6FF',
                          color: '#1E40AF',
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
            {/* SECTION 4 & 5: DEMOGRAPHICS & CAMPAIGN (PAID ADS ONLY)     */}
            {/* ══════════════════════════════════════════════════════════ */}
            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 4: META CAMPAIGN & AD SET CONFIG (PAID ADS ONLY)    */}
            {/* ══════════════════════════════════════════════════════════ */}
            {publishType === 'paid_ad' && (
              <div style={{ marginBottom: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    4. Meta Campaign &amp; Ad Set Configuration
                  </span>
                  <span style={{ fontSize: '10px', color: '#16A34A', background: '#DCFCE7', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
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
                          border: campaignMode === 'new' ? '1px solid #16A34A' : '1px solid #CBD5E1',
                          background: campaignMode === 'new' ? '#F0FDF4' : '#FFFFFF',
                          color: campaignMode === 'new' ? '#166534' : '#64748B',
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
                      placeholder="e.g. [CasaGrown] Produce Demand - Lemons"
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
                          border: adSetSelectionType === 'auto' ? '1px solid #16A34A' : '1px solid #CBD5E1',
                          background: adSetSelectionType === 'auto' ? '#F0FDF4' : '#FFFFFF',
                          color: adSetSelectionType === 'auto' ? '#166534' : '#64748B',
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
                          border: adSetSelectionType === 'new' ? '1px solid #16A34A' : '1px solid #CBD5E1',
                          background: adSetSelectionType === 'new' ? '#F0FDF4' : '#FFFFFF',
                          color: adSetSelectionType === 'new' ? '#166534' : '#64748B',
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
                            placeholder="e.g. AdSet_Lemons_Age25-65_10mi"
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                          />
                        </div>
                      )}

                      {/* Nested Ad Set Targeting Controls */}
                      <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                          Ad Set Audience &amp; Geo-Fencing:
                        </span>

                        {/* ZIPs & Radius */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginBottom: '8px' }}>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                              Target ZIP Codes:
                            </label>
                            <input
                              type="text"
                              value={targetZips}
                              onChange={e => setTargetZips(e.target.value)}
                              placeholder="e.g. 94025, 94024"
                              style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                              Radius:
                            </label>
                            <select
                              value={targetRadius}
                              onChange={e => setTargetRadius(e.target.value)}
                              style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', background: '#FFFFFF' }}
                            >
                              <option value="5">+5 miles</option>
                              <option value="10">+10 miles</option>
                              <option value="15">+15 miles</option>
                              <option value="25">+25 miles</option>
                            </select>
                          </div>
                        </div>

                        {/* Age & Gender */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                              Age Bracket:
                            </label>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <select
                                value={ageMin}
                                onChange={e => setAgeMin(Number(e.target.value))}
                                style={{ flex: 1, padding: '5px 4px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', background: '#FFFFFF' }}
                              >
                                <option value={18}>18</option>
                                <option value={21}>21</option>
                                <option value={25}>25</option>
                                <option value={30}>30</option>
                              </select>
                              <span style={{ fontSize: '10px', color: '#64748B' }}>to</span>
                              <select
                                value={ageMax}
                                onChange={e => setAgeMax(e.target.value)}
                                style={{ flex: 1, padding: '5px 4px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', background: '#FFFFFF' }}
                              >
                                <option value="55">55</option>
                                <option value="65">65</option>
                                <option value="65+">65+</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                              Gender:
                            </label>
                            <select
                              value={targetGender}
                              onChange={e => setTargetGender(e.target.value as any)}
                              style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', background: '#FFFFFF' }}
                            >
                              <option value="all">All (Men &amp; Women)</option>
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
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', padding: '6px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px' }}>
                              {selectedInterests.map(tag => (
                                <span
                                  key={tag}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 7px',
                                    borderRadius: '10px',
                                    background: '#16A34A',
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
                                background: '#16A34A',
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
                              {DEFAULT_INTEREST_TAGS.map((tag: string) => {
                                const isSelected = selectedInterests.includes(tag)
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => toggleInterest(tag)}
                                    style={{
                                      padding: '2px 7px',
                                      borderRadius: '10px',
                                      border: isSelected ? '1px solid #16A34A' : '1px solid #CBD5E1',
                                      background: isSelected ? '#F0FDF4' : '#FFFFFF',
                                      color: isSelected ? '#166534' : '#475569',
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
                                  background: '#F0FDF4',
                                  border: '1px dashed #16A34A',
                                  color: '#16A34A',
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
                            <div style={{ marginTop: '12px', padding: '10px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#15803D', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', padding: '6px', background: '#FFFFFF', border: '1px solid #BBF7D0', borderRadius: '6px' }}>
                                  {narrowInterests.map(tag => (
                                    <span
                                      key={tag}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '2px 7px',
                                        borderRadius: '10px',
                                        background: '#15803D',
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
                                  placeholder="Type narrowing interest (e.g. Wordle, Brain Games)..."
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
                                    background: '#16A34A',
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
                                {['Wordle', 'New York Times Games', 'Brain Games', 'Sudoku', 'Crossword Puzzles', 'Organic Food', 'Gardeners'].map(tag => {
                                  const isSelected = narrowInterests.includes(tag)
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() => toggleNarrowInterest(tag)}
                                      style={{
                                        padding: '2px 7px',
                                        borderRadius: '10px',
                                        border: isSelected ? '1px solid #16A34A' : '1px solid #CBD5E1',
                                        background: isSelected ? '#DCFCE7' : '#FFFFFF',
                                        color: isSelected ? '#15803D' : '#64748B',
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
                            Budget:
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
                            { id: 'fb_feed', label: 'Facebook Feed' },
                            { id: 'ig_feed', label: 'Instagram Feed' },
                            { id: 'ig_reels', label: 'Instagram Reels' },
                            { id: 'ig_stories', label: 'Instagram Stories' },
                          ].map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => togglePlacement(p.id)}
                              style={{
                                padding: '2px 7px',
                                borderRadius: '4px',
                                border: selectedPlacements.includes(p.id) ? '1px solid #16A34A' : '1px solid #CBD5E1',
                                background: selectedPlacements.includes(p.id) ? '#F0FDF4' : '#FFFFFF',
                                color: selectedPlacements.includes(p.id) ? '#166534' : '#64748B',
                                fontSize: '10px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {selectedPlacements.includes(p.id) ? '✓ ' : ''}{p.label}
                            </button>
                          ))}
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

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 6: SCHEDULE LAUNCH TIMING                         */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
                {publishType === 'paid_ad' ? '6. Launch Timing' : '4. Publishing Schedule'}
              </span>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                    border: scheduleType === 'scheduled' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                    background: scheduleType === 'scheduled' ? '#EFF6FF' : '#FFFFFF',
                    color: scheduleType === 'scheduled' ? '#1E40AF' : '#475569',
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
                            📍 {isPaid ? 'Target ZIP Timezone:' : 'Page Timezone:'} <strong style={{ color: '#0F172A' }}>{zipTz.iana} ({zipTz.short})</strong>
                          </span>
                          <span style={{ fontSize: '10px', color: isPaid ? '#16A34A' : '#2563EB', background: isPaid ? '#DCFCE7' : '#EFF6FF', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
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
                                border: scheduleDayOffset === tab.offset ? '1px solid #2563EB' : '1px solid #CBD5E1',
                                background: scheduleDayOffset === tab.offset ? '#EFF6FF' : '#FFFFFF',
                                color: scheduleDayOffset === tab.offset ? '#1E40AF' : '#64748B',
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
                                    border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1',
                                    background: isSelected ? '#EFF6FF' : '#FFFFFF',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? '#1E40AF' : '#0F172A' }}>
                                      {slot.icon} {slot.name}
                                    </span>
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563EB', background: '#DBEAFE', padding: '1px 5px', borderRadius: '4px' }}>
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

          {/* Right Column: Interactive Live Meta Feed & Story Mockup */}
          <div style={{ padding: '20px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflowY: 'auto' }}>
            <div>
              {/* Preview Mode Switcher */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  📱 Live Meta Post &amp; Ad Preview
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: previewTab === 'story' ? '#DCFCE7' : '#F1F5F9', border: previewTab === 'story' ? '1px solid #BBF7D0' : '1px solid #E2E8F0', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: previewTab === 'story' ? '#166534' : '#475569' }}>
                  {previewTab === 'story' ? '📱 9:16 Vertical Reel' : '🖥️ Standard Feed Post'}
                </div>
              </div>

              {/* ═══════════════════════════════════════════════════════ */}
              {/* LIVE FEED POST MOCKUP                                   */}
              {/* ═══════════════════════════════════════════════════════ */}
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
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: '14px' }}>
                        🌱
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>
                          CasaGrown • {cleanProduceNames[0] || 'Local Harvest'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748B' }}>
                          {publishType === 'paid_ad' ? 'Sponsored • Hyperlocal Harvest' : 'Just now • Community Garden'}
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

                  {/* Media Container: Photo Collage vs Video vs Carousel */}
                  {mediaMode === 'video' ? (
                    <div style={{ position: 'relative', width: '100%', height: '260px', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {uploadedVideoUrl ? (
                        <video src={uploadedVideoUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                          <div style={{ fontSize: '32px', marginBottom: '4px' }}>📹</div>
                          <div style={{ fontSize: '12px' }}>Video Preview (1080x1920)</div>
                        </div>
                      )}
                    </div>
                  ) : photoLayout === 'single' || selectedPhotos.length <= 1 ? (
                    <div style={{ width: '100%', height: '220px', background: '#F1F5F9', overflow: 'hidden' }}>
                      <img src={selectedPhotos[0]} alt="Produce" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : photoLayout === 'split_2' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', height: '220px' }}>
                      <img src={selectedPhotos[0]} alt="Produce 1" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <img src={selectedPhotos[1] || selectedPhotos[0]} alt="Produce 2" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : photoLayout === 'grid_4' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '2px', height: '220px' }}>
                      {selectedPhotos.slice(0, 4).map((p, i) => (
                        <img key={i} src={p} alt={`Grid ${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ))}
                    </div>
                  ) : (
                    /* Swipeable Carousel */
                    <div style={{ position: 'relative', width: '100%', height: '220px', overflow: 'hidden' }}>
                      <img src={selectedPhotos[carouselActiveIdx] || selectedPhotos[0]} alt="Carousel" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {selectedPhotos.length > 1 && (
                        <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', color: '#FFFFFF', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 700 }}>
                          {carouselActiveIdx + 1}/{selectedPhotos.length}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Meta Ad Action Card (If Paid Ad) */}
                  {publishType === 'paid_ad' && (
                    <div style={{ padding: '10px 14px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ overflow: 'hidden', paddingRight: '8px' }}>
                        <div style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>
                          casagrown.com
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {headline}
                        </div>
                      </div>
                      <button
                        style={{
                          background: '#2563EB',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                      >
                        {callToAction.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </button>
                    </div>
                  )}

                  {/* Footer Engagement Mockup */}
                  <div style={{ padding: '8px 14px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B' }}>
                    <span>❤️ 48 Likes</span>
                    <span>💬 12 Comments • 🔄 8 Shares</span>
                  </div>
                </div>
              ) : (
                /* ═══════════════════════════════════════════════════════ */
                /* LIVE 9:16 STORY / REELS MOCKUP                          */
                /* ═══════════════════════════════════════════════════════ */
                <div
                  style={{
                    width: '240px',
                    height: '426px',
                    background: '#0F172A',
                    borderRadius: '16px',
                    margin: '0 auto',
                    overflow: 'hidden',
                    position: 'relative',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
                    border: '2px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '14px',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Background Image / Video */}
                  {mediaMode === 'video' && uploadedVideoUrl ? (
                    <video src={uploadedVideoUrl} autoPlay loop muted playsInline style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <img
                      src={selectedPhotos[0]}
                      alt="Story bg"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
                    />
                  )}

                  {/* Story Top Progress & Account */}
                  <div style={{ position: 'relative', zIndex: 2 }}>
                    <div style={{ width: '100%', height: '2px', background: 'rgba(255,255,255,0.4)', borderRadius: '2px', marginBottom: '8px' }}>
                      <div style={{ width: '60%', height: '100%', background: '#FFFFFF', borderRadius: '2px' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px' }}>🌱</span>
                      <span style={{ color: '#FFFFFF', fontSize: '11px', fontWeight: 700 }}>CasaGrown</span>
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px' }}>• Sponsored</span>
                    </div>
                  </div>

                  {/* Story Bottom Swipe-up Action */}
                  <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
                    <div style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', padding: '8px 10px', borderRadius: '8px', color: '#FFFFFF', fontSize: '11px', fontWeight: 700, marginBottom: '8px', lineHeight: 1.3 }}>
                      <div>{headline}</div>
                      {primaryText && (
                        <div style={{ fontSize: '10px', fontWeight: 400, color: 'rgba(255,255,255,0.85)', marginTop: '4px', maxHeight: '60px', overflowY: 'auto', textAlign: 'left', whiteSpace: 'pre-line' }}>
                          {primaryText}
                        </div>
                      )}
                    </div>

                    <button
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: '#16A34A',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
                      }}
                    >
                      👆 {callToAction.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Launch / Save Actions */}
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px', marginTop: '16px' }}>
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
                disabled={isSaving}
                onClick={() => handleSaveCampaign('draft')}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '12px',
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                💾 Save as Draft
              </button>

              <button
                disabled={isSaving}
                onClick={() => handleSaveCampaign(scheduleType === 'immediate' ? 'active' : 'scheduled')}
                style={{
                  flex: 1.8,
                  padding: '11px',
                  background: saveSuccess ? '#059669' : publishType === 'paid_ad' ? '#2563EB' : '#16A34A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)',
                }}
              >
                <span>{saveSuccess ? '✅' : scheduleType === 'immediate' ? '🚀' : '📅'}</span>
                <span>
                  {saveSuccess
                    ? 'Campaign Saved!'
                    : publishType === 'paid_ad'
                    ? (scheduleType === 'immediate' ? `Launch Ad ($${budgetType === 'daily' ? budgetAmount + '/day' : budgetAmount})` : 'Schedule Meta Ad')
                    : (scheduleType === 'immediate' ? 'Publish Social Post' : 'Schedule Post')}
                </span>
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
