'use client'
import { classifyCreativeIntent } from '@/lib/creative-intent-classifier'
import { useState, useEffect, useRef, useMemo } from 'react'
import { MotionStoryboardScene, MotionVideoStoryboardResponse } from '../app/api/creative-studio/storyboard/route'
import { GeneratedProducePhoto } from '../app/api/creative-studio/photos/route'
import ProduceAdPostCreatorModal, { ProduceAdPostModalContext } from './ProduceAdPostCreatorModal'
import { EXHAUSTIVE_INTERESTS_CATALOG, getInterestImage } from '../../next-market/lib/interestCatalog'

export interface ChatMessage {
  id: string
  sender: 'user' | 'agent'
  content: string
  thought?: string
  toolCalls?: Array<{
    name: string
    summary: string
    status: 'done' | 'running'
  }>
  timestamp: string
  artifactAction?: {
    type: 'photos' | 'storyboard' | 'video'
    label: string
  }
}

export interface AntigravityCreativeWorkspaceProps {
  initialProduceContext?: string[]
  initialTab?: 'photos' | 'storyboard' | 'video'
}

export default function AntigravityCreativeWorkspace({
  initialProduceContext = ['Meyer Lemons', 'Heirloom Tomatoes', 'Haas Avocados', 'Fresh Basil'],
  initialTab = 'photos',
}: AntigravityCreativeWorkspaceProps) {
  // ── WORKSPACE TAB STATE ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'photos' | 'storyboard' | 'video'>(initialTab)
  const [selectedProduce, setSelectedProduce] = useState<string[]>(initialProduceContext)

  // ── CHAT & AGENT STATE ───────────────────────────────────────────
  const [inputPrompt, setInputPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '4:5' | '1:1' | '16:9'>('9:16')
  const [isProcessing, setIsProcessing] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'agent',
      content:
        '👋 Welcome to the **CasaGrown Creative Studio**!\n\nI can help you **generate high-definition still photos** from prompts or your uploaded garden photos, and compile them into **cinematic Pan & Zoom (Ken Burns motion) video ads** without talking narrators.\n\nType a creative request below or click any quick prompt to start!',
      thought:
        'Ready to process text-to-photo, photo upload variations, and pan-and-zoom motion video storyboards with on-screen kinetic typography.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])

  // ── PHOTO CANDIDATES STATE (Starts Empty until User Prompts or Uploads) ──
  const [photoCandidates, setPhotoCandidates] = useState<GeneratedProducePhoto[]>([])
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [photoFeedbackTargetId, setPhotoFeedbackTargetId] = useState<string | null>(null)
  const [photoFeedbackText, setPhotoFeedbackText] = useState('')

  // ── MOTION STORYBOARD STATE (Starts Empty until Generated) ───────
  const [storyboardTitle, setStoryboardTitle] = useState('Neighborhood Harvest Demand Alert')
  const [storyboardReasoning, setStoryboardReasoning] = useState('Optimized for high CTR Instagram Reels & Facebook Feed video ads')
  const [scenes, setScenes] = useState<MotionStoryboardScene[]>([])
  const [sceneFeedbackTargetId, setSceneFeedbackTargetId] = useState<string | null>(null)
  const [sceneFeedbackText, setSceneFeedbackText] = useState('')

  // ── 60FPS CANVAS VIDEO PLAYER STATE ──────────────────────────────
  const [isPlayingVideo, setIsPlayingVideo] = useState(false)
  const [isExportingVideo, setIsExportingVideo] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [processingStep, setProcessingStep] = useState<string>('Initializing creative AI...')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    let interval: any = null
    if (isProcessing) {
      setElapsedSeconds(0)
      interval = setInterval(() => {
        setElapsedSeconds(s => s + 1)
      }, 1000)
    } else {
      setElapsedSeconds(0)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isProcessing])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({})
  const animationFrameRef = useRef<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const fileUploadInputRef = useRef<HTMLInputElement | null>(null)

  // ── LIBRARY DRAWER / SEARCHABLE CATALOG MODAL STATE ──────────────
  const [showLibraryModal, setShowLibraryModal] = useState(false)
  const [librarySearchQuery, setLibrarySearchQuery] = useState('')
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState<'all' | 'community' | 'citrus' | 'vegetables' | 'fruits' | 'herbs' | 'saved'>('all')
  const [savedLibraryAssets, setSavedLibraryAssets] = useState<any[]>([])
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null)

  // Load saved assets on mount and when modal opens
  useEffect(() => {
    fetch('/api/creative-studio/assets')
      .then(res => res.json())
      .then(data => {
        if (data?.assets && Array.isArray(data.assets)) {
          setSavedLibraryAssets(data.assets)
        }
      })
      .catch(() => {})
  }, [showLibraryModal])

  // Build exhaustive searchable catalog combining Produce Listings, 4K Container Presets, Community Signs, and Saved Assets
  const allCatalogItems = useMemo(() => {
    const items: Array<{
      id: string
      title: string
      produceName: string
      category: 'community' | 'citrus' | 'vegetables' | 'fruits' | 'herbs' | 'saved' | 'other'
      displayCategory: string
      imageUrl: string
      style: string
      type?: 'video' | 'photo'
      durationSeconds?: number
    }> = []

    // 1. Community & Demand Cards
    items.push({
      id: 'cat-neighbors-demand',
      title: 'Community Neighbors ("I Want Fresh Harvest")',
      produceName: 'Community Neighbors',
      category: 'community',
      displayCategory: 'Community Demand',
      imageUrl: '/products/neighbors-demand.jpg',
      style: '4K Photo',
    })
    items.push({
      id: 'cat-wanted-now',
      title: 'Wanted Now Produce Announcement Card',
      produceName: 'Wanted Alert',
      category: 'community',
      displayCategory: 'Community Demand',
      imageUrl: '/products/wanted-now-card.svg',
      style: 'Chalkboard Sign',
    })

    // 2. Exhaustive Interests & Produce Listings Catalog
    for (const interest of EXHAUSTIVE_INTERESTS_CATALOG) {
      if (!interest.image) continue
      const catLower = (interest.displayCategory || '').toLowerCase()
      const categoryGroup = catLower.includes('citrus')
        ? 'citrus'
        : catLower.includes('vegetable')
        ? 'vegetables'
        : catLower.includes('fruit') || catLower.includes('berry')
        ? 'fruits'
        : catLower.includes('herb') || catLower.includes('honey') || catLower.includes('specialty') || catLower.includes('egg')
        ? 'herbs'
        : 'other'

      if (!items.some(i => i.imageUrl === interest.image)) {
        items.push({
          id: `cat-interest-${interest.id}`,
          title: `${interest.name} (Market Listing)`,
          produceName: interest.name,
          category: categoryGroup,
          displayCategory: interest.displayCategory || 'Market Listing',
          imageUrl: interest.image,
          style: 'Market Catalog',
        })
      }
    }

    // 4. Saved User Assets
    for (const asset of savedLibraryAssets) {
      const url = asset.mediaUrl || asset.media_url || asset.thumbnailUrl || asset.thumbnail_url
      if (!url) continue
      const isVideo = asset.type === 'video' || url.endsWith('.webm') || url.endsWith('.mp4')
      items.unshift({
        id: `cat-saved-${asset.id}`,
        title: asset.title || (isVideo ? 'Saved Motion Video' : 'Saved Photo'),
        produceName: asset.produceList?.[0] || asset.produce_list?.[0] || 'Saved Asset',
        description: asset.description || '',
        category: 'saved',
        displayCategory: isVideo ? '🎬 Saved Motion Video' : '📸 Saved Photo Asset',
        imageUrl: url,
        style: isVideo ? 'Saved Video' : 'Saved Photo',
        type: isVideo ? 'video' : 'photo',
        durationSeconds: asset.durationSeconds || asset.duration_seconds || 15,
      })
    }

    return items
  }, [savedLibraryAssets])

  // Filtered Catalog Items based on live keyword query & category
  const filteredCatalogItems = useMemo(() => {
    const q = librarySearchQuery.trim().toLowerCase()
    return allCatalogItems.filter(item => {
      const matchesCategory = libraryCategoryFilter === 'all' || item.category === libraryCategoryFilter
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.produceName.toLowerCase().includes(q) ||
        item.displayCategory.toLowerCase().includes(q) ||
        item.style.toLowerCase().includes(q) ||
        ((item as any).description && (item as any).description.toLowerCase().includes(q))
      return matchesCategory && matchesSearch
    })
  }, [allCatalogItems, librarySearchQuery, libraryCategoryFilter])

  const handleAddPhotoFromLibrary = (photo: { title: string; produceName: string; imageUrl: string; prompt?: string }) => {
    const newPhoto: GeneratedProducePhoto = {
      id: `lib-photo-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title: photo.title,
      produceName: photo.produceName,
      styleOption: 'harvest_tray',
      prompt: photo.prompt || `Saved Library photo of ${photo.produceName}`,
      imageUrl: photo.imageUrl,
      aspectRatio: '4:5',
      sourceType: 'prompt',
      createdAt: new Date().toISOString(),
    }
    setPhotoCandidates(prev => [newPhoto, ...prev])
    setSelectedPhotoIds(prev => [newPhoto.id, ...prev])

    // Append a clean new scene card to the active sequence
    setScenes(prev => [
      ...prev,
      {
        id: `motion-scene-${Date.now()}`,
        sceneNumber: prev.length + 1,
        heading: photo.title,
        produceFocus: photo.produceName,
        visualPrompt: photo.prompt || photo.title,
        imageUrl: photo.imageUrl,
        motionType: prev.length % 2 === 0 ? 'push_in' : 'pan_horizontal',
        durationSeconds: 3.5,
        headlineOverlay: '',
        badgeOverlay: '',
        rationale: `Scene ${prev.length + 1}: ${photo.produceName}`,
      },
    ])

    showToast(`🖼️ Added "${photo.title}" into active video sequence!`)
  }

  // ── SAVE A SINGLE PHOTO CANDIDATE TO LIBRARY ─────────────────────
  const handleSaveSinglePhotoToLibrary = async (photo: GeneratedProducePhoto) => {
    try {
      const res = await fetch('/api/creative-studio/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'photo',
          title: photo.title,
          description: photo.prompt,
          produceList: [photo.produceName],
          mediaUrl: photo.imageUrl,
          thumbnailUrl: photo.imageUrl,
          aspectRatio: photo.aspectRatio || '4:5',
        }),
      })
      const data = await res.json()
      if (data?.asset) {
        setSavedLibraryAssets(prev => [data.asset, ...prev.filter(a => a.id !== data.asset.id)])
      }
      showToast(`💾 Saved "${photo.title}" to Creative Asset Library!`)
    } catch (err) {
      console.error('Save photo error:', err)
      showToast('❌ Failed to save photo to library')
    }
  }

  // Ad Creator Modal
  const [adModalContext, setAdModalContext] = useState<ProduceAdPostModalContext>({
    isOpen: false,
    initialPublishType: 'paid_ad',
  })

  const totalVideoDuration = scenes.reduce((a, b) => a + b.durationSeconds, 0)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  // Scroll chat messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Pre-load all scene images into memory for smooth 60fps canvas rendering
  useEffect(() => {
    scenes.forEach(s => {
      if (s.imageUrl && !loadedImagesRef.current[s.imageUrl]) {
        const img = new Image()
        if (s.imageUrl.startsWith('http://') || s.imageUrl.startsWith('https://')) {
          img.crossOrigin = 'anonymous'
        }
        img.src = s.imageUrl
        img.onload = () => {
          loadedImagesRef.current[s.imageUrl] = img
        }
        img.onerror = () => {
          const fallback = new Image()
          fallback.src = getInterestImage(s.produceFocus)
          fallback.onload = () => {
            loadedImagesRef.current[s.imageUrl] = fallback
          }
        }
      }
    })
  }, [scenes])

  // 60FPS Canvas Ken Burns Pan & Zoom Render Loop
  useEffect(() => {
    if (activeTab !== 'video') return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let startTime = performance.now()

    const render = (now: number) => {
      const elapsed = (now - startTime) / 1000
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (scenes.length === 0) {
        ctx.fillStyle = '#0F172A'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#94A3B8'
        ctx.font = 'bold 14px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('🎬 No scenes selected for video yet', canvas.width / 2, canvas.height / 2)
        animationFrameRef.current = requestAnimationFrame(render)
        return
      }

      let accumulatedTime = 0
      let activeIdx = 0
      const loopTime = elapsed % Math.max(1, totalVideoDuration)

      for (let i = 0; i < scenes.length; i++) {
        accumulatedTime += scenes[i].durationSeconds
        if (loopTime < accumulatedTime) {
          activeIdx = i
          break
        }
      }

      const activeScene = scenes[activeIdx] || scenes[0]
      const sceneStartTime = accumulatedTime - activeScene.durationSeconds
      const sceneProgress = Math.min(1.0, Math.max(0, (loopTime - sceneStartTime) / activeScene.durationSeconds))

      let img = loadedImagesRef.current[activeScene.imageUrl]

      if (!img) {
        const newImg = new Image()
        if (activeScene.imageUrl && (activeScene.imageUrl.startsWith('http://') || activeScene.imageUrl.startsWith('https://'))) {
          newImg.crossOrigin = 'anonymous'
        }
        newImg.src = activeScene.imageUrl || getInterestImage(activeScene.produceFocus)
        newImg.onload = () => {
          loadedImagesRef.current[activeScene.imageUrl] = newImg
        }
        newImg.onerror = () => {
          const fallback = new Image()
          fallback.src = getInterestImage(activeScene.produceFocus)
          fallback.onload = () => {
            loadedImagesRef.current[activeScene.imageUrl] = fallback
          }
        }
        img = newImg
      }

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save()

        // Apply Ken Burns Pan and Zoom Trajectory Curves
        let scale = 1.0
        let offsetX = 0
        let offsetY = 0

        if (activeScene.motionType === 'push_in') {
          scale = 1.0 + sceneProgress * 0.18
        } else if (activeScene.motionType === 'zoom_out') {
          scale = 1.2 - sceneProgress * 0.18
        } else if (activeScene.motionType === 'pan_horizontal') {
          scale = 1.12
          offsetX = (sceneProgress - 0.5) * (canvas.width * 0.1)
        } else if (activeScene.motionType === 'diagonal_sweep') {
          scale = 1.15
          offsetX = (sceneProgress - 0.5) * (canvas.width * 0.08)
          offsetY = (sceneProgress - 0.5) * (canvas.height * 0.08)
        }

        // Calculate object-fit: cover dimensions to avoid stretching or distorting photos
        const imgW = img.naturalWidth || img.width || canvas.width
        const imgH = img.naturalHeight || img.height || canvas.height
        const imgAspect = imgW / imgH
        const canvasAspect = canvas.width / canvas.height

        let drawW = canvas.width
        let drawH = canvas.height

        if (imgAspect > canvasAspect) {
          drawW = canvas.height * imgAspect
          drawH = canvas.height
        } else {
          drawW = canvas.width
          drawH = canvas.width / imgAspect
        }

        ctx.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY)
        ctx.scale(scale, scale)
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
        ctx.restore()

        // Badge Overlay (Only if explicitly provided)
        if (activeScene.badgeOverlay && activeScene.badgeOverlay.trim()) {
          ctx.save()
          ctx.fillStyle = 'rgba(21, 128, 61, 0.92)'
          ctx.beginPath()
          ctx.roundRect(24, 24, 260, 34, 8)
          ctx.fill()
          ctx.fillStyle = '#FFFFFF'
          ctx.font = 'bold 12px Inter, sans-serif'
          ctx.fillText(`✨ ${activeScene.badgeOverlay.trim()}`, 36, 46)
          ctx.restore()
        }

        // Headline Overlay (Only if user specified text!)
        if (activeScene.headlineOverlay && activeScene.headlineOverlay.trim()) {
          ctx.save()
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)'
          ctx.beginPath()
          ctx.roundRect(20, canvas.height - 84, canvas.width - 40, 56, 10)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
          ctx.lineWidth = 1.5
          ctx.stroke()

          ctx.fillStyle = '#FFFFFF'
          ctx.font = 'bold 16px Inter, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(activeScene.headlineOverlay.trim(), canvas.width / 2, canvas.height - 50)
          ctx.restore()
        }

        // Timeline Progress Bar
        ctx.save()
        const barY = canvas.height - 12
        const barWidth = canvas.width - 40
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.fillRect(20, barY, barWidth, 4)

        const totalProgress = loopTime / Math.max(1, totalVideoDuration)
        ctx.fillStyle = '#10B981'
        ctx.fillRect(20, barY, barWidth * totalProgress, 4)
        ctx.restore()
      } else {
        ctx.fillStyle = '#0F172A'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 14px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`Loading Scene ${activeIdx + 1} (${activeScene.produceFocus || 'Produce'})...`, canvas.width / 2, canvas.height / 2)
      }

      animationFrameRef.current = requestAnimationFrame(render)
    }

    animationFrameRef.current = requestAnimationFrame(render)
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [scenes, totalVideoDuration, activeTab])

  // ── 1. SEND CONVERSATIONAL PROMPT TO AI CREATIVE AGENT ─────────────
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputPrompt
    if (!textToSend.trim() || isProcessing) return

    const userMsgId = `user-${Date.now()}`
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages(prev => [...prev, userMsg])
    setInputPrompt('')
    setIsProcessing(true)

    try {
      // Auto-detect ratio from prompt if mentioned, otherwise use selected aspectRatio pill
      let targetRatio = aspectRatio
      const lowerPrompt = textToSend.toLowerCase()
      if (lowerPrompt.includes('9:16') || lowerPrompt.includes('reel') || lowerPrompt.includes('story') || lowerPrompt.includes('tiktok') || lowerPrompt.includes('short')) {
        targetRatio = '9:16'
        setAspectRatio('9:16')
      } else if (lowerPrompt.includes('4:5') || lowerPrompt.includes('feed ad')) {
        targetRatio = '4:5'
        setAspectRatio('4:5')
      } else if (lowerPrompt.includes('1:1') || lowerPrompt.includes('square')) {
        targetRatio = '1:1'
        setAspectRatio('1:1')
      } else if (lowerPrompt.includes('16:9') || lowerPrompt.includes('landscape') || lowerPrompt.includes('wide')) {
        targetRatio = '16:9'
        setAspectRatio('16:9')
      }

      // Determine user intent using wink-NLP POS tagging + fuzzy matching.
      // This replaces fragile regex — handles negation, verb-object pairs,
      // typos, and context (can't build storyboard without existing photos).
      const { intent: classifiedIntent, reason: intentReason } = classifyCreativeIntent(
        textToSend,
        photoCandidates.length > 0
      )
      console.debug('[CreativeIntent]', intentReason)
      const isVideoIntent = classifiedIntent === 'video'
      const isRefineIntent = classifiedIntent === 'refine'


      if (isVideoIntent) {
        setProcessingStep('🎬 Composing dynamic pan & zoom motion camera trajectories...')
        // Generate Pan & Zoom Motion Storyboard
        const chosen = photoCandidates.filter(p => selectedPhotoIds.includes(p.id))
        const res = await fetch('/api/creative-studio/storyboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: textToSend,
            produceContext: selectedProduce,
            selectedPhotos: chosen,
            selectedPhotoUrls: chosen.map(p => p.imageUrl),
          }),
        })

        const data: MotionVideoStoryboardResponse = await res.json()
        if (data.success && Array.isArray(data.scenes)) {
          setStoryboardTitle(data.title)
          setStoryboardReasoning(data.reasoning)
          setScenes(data.scenes)
          setActiveTab('storyboard')

          setMessages(prev => [
            ...prev,
            {
              id: `agent-${Date.now()}`,
              sender: 'agent',
              content: `🎬 Generated Pan & Zoom Motion Video Blueprint: **${data.title}** (${data.totalDurationSeconds}s total duration, ${data.scenes.length} scenes).\n\n${data.summary}\n\nYou can review each scene's camera motion and headline in the right panel, or switch to the **Live Motion Video Player** to preview!`,
              thought: data.reasoning,
              toolCalls: [
                { name: 'generate_motion_storyboard', summary: `Created ${data.scenes.length} pan-and-zoom motion scenes`, status: 'done' },
              ],
              artifactAction: { type: 'storyboard', label: 'View Motion Storyboard' },
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ])
        }
      } else {
        setProcessingStep(`🎨 Generating commercial ${targetRatio} photo candidates across requested subjects...`)
        // Generate Still Photos
        const res = await fetch('/api/creative-studio/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'text_to_image',
            produceList: selectedProduce,
            count: selectedProduce.length || 4,
            customPrompt: textToSend,
            aspectRatio: targetRatio,
          }),
        })

        const data = await res.json()
        if (data.success && Array.isArray(data.photos)) {
          setPhotoCandidates(data.photos)
          setSelectedPhotoIds(data.photos.map((p: any) => p.id))
          setActiveTab('photos')

          setMessages(prev => [
            ...prev,
            {
              id: `agent-${Date.now()}`,
              sender: 'agent',
              content: `📸 Generated **${data.photos.length} new high-definition produce photos** based on your prompt:\n\n*“${textToSend}”*\n\nReview them on the right board. You can select the ones you love to generate a motion video, or click **Leave Feedback** on any photo to refine it!`,
              thought: 'Synthesized 4 photographic candidates with warm sunlight, natural textures, and commercial ad framing.',
              toolCalls: [
                { name: 'generate_photos_from_prompt', summary: `Rendered ${data.photos.length} 4:5 commercial photos`, status: 'done' },
              ],
              artifactAction: { type: 'photos', label: 'Review Photo Candidates' },
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ])
        }
      }
    } catch (err) {
      console.error('Creative Workspace error:', err)
      setMessages(prev => [
        ...prev,
        {
          id: `agent-err-${Date.now()}`,
          sender: 'agent',
          content: '❌ An error occurred while processing your request. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setIsProcessing(false)
    }
  }

  // ── 2. HANDLE LOCAL PHOTO UPLOAD ───────────────────────────────────
  const handleLocalPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newPhotos: GeneratedProducePhoto[] = []
    Array.from(files).forEach((file, idx) => {
      const url = URL.createObjectURL(file)
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      newPhotos.push({
        id: `upload-${Date.now()}-${idx}`,
        title: `Uploaded: ${cleanName}`,
        produceName: cleanName,
        styleOption: 'variation',
        prompt: 'User uploaded garden reference photo',
        imageUrl: url,
        aspectRatio: '4:5',
        sourceType: 'upload_variation',
        createdAt: new Date().toISOString(),
      })
    })

    setPhotoCandidates(prev => [...newPhotos, ...prev])
    setSelectedPhotoIds(prev => [...prev, ...newPhotos.map(p => p.id)])
    setActiveTab('photos')
    showToast(`📸 Added ${newPhotos.length} uploaded photo(s). Select and generate motion video!`)
    if (fileUploadInputRef.current) fileUploadInputRef.current.value = ''
  }

  // ── 3. SUBMIT SECTION-LEVEL FEEDBACK ON A PHOTO ────────────────────
  const handleSendPhotoFeedback = async (photo: GeneratedProducePhoto) => {
    if (!photoFeedbackText.trim()) return
    const text = photoFeedbackText.trim()
    setPhotoFeedbackTargetId(null)
    setPhotoFeedbackText('')
    setIsProcessing(true)

    // Add user message to chat dock
    setMessages(prev => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        content: `💬 Feedback on **${photo.title}**: *"${text}"*`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ])

    try {
      const res = await fetch('/api/creative-studio/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'refine_single_photo',
          targetPhotoId: photo.id,
          produceName: photo.produceName,
          feedbackText: text,
          styleOption: photo.styleOption,
          aspectRatio,
        }),
      })

      const data = await res.json()
      if (data.success && data.photo) {
        // In-place replace ONLY this specific photo candidate on the board
        setPhotoCandidates(prev => prev.map(p => (p.id === photo.id ? data.photo : p)))
        showToast(`✨ Refined photo for ${photo.produceName}!`)

        // Add agent response message confirming localized update
        setMessages(prev => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            sender: 'agent',
            content: `✨ Refined photo for **${photo.produceName}** based on your feedback:\n\n*“${text}”*\n\nThe updated candidate has been applied directly to your selection board!`,
            thought: `Applied localized refinements to ${photo.produceName} while keeping other produce candidates intact.`,
            toolCalls: [
              { name: 'refine_produce_photo', summary: `Updated ${photo.produceName} candidate in-place`, status: 'done' },
            ],
            artifactAction: { type: 'photos', label: 'View Photo Board' },
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      }
    } catch (err) {
      console.error('Error refining photo:', err)
      showToast('❌ Failed to refine photo. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  // ── 4. SUBMIT SECTION-LEVEL FEEDBACK ON A SCENE ────────────────────
  const handleSendSceneFeedback = (scene: MotionStoryboardScene) => {
    if (!sceneFeedbackText.trim()) return
    const text = sceneFeedbackText.trim()
    setSceneFeedbackTargetId(null)
    setSceneFeedbackText('')

    // In-place update scene headline / rationale
    setScenes(prev =>
      prev.map(s => {
        if (s.id === scene.id) {
          return {
            ...s,
            headlineOverlay: text.length < 60 ? text.toUpperCase() : s.headlineOverlay,
            rationale: text,
          }
        }
        return s
      })
    )

    setMessages(prev => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        content: `💬 Feedback on Scene ${scene.sceneNumber} (${scene.produceFocus}): *"${text}"*`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        content: `✅ Updated Scene ${scene.sceneNumber} (${scene.produceFocus}) with your feedback: *"${text}"*. You can preview the changes in the storyboard and live video player!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ])
    showToast(`✅ Updated Scene ${scene.sceneNumber}!`)
  }

  // ── 4B. SAVE SELECTED PHOTOS TO LIBRARY ───────────────────────────
  const handleSavePhotosToLibrary = async () => {
    const chosenPhotos = photoCandidates.filter(p => selectedPhotoIds.includes(p.id))
    if (chosenPhotos.length === 0) {
      showToast('⚠️ Please select at least 1 photo to save.')
      return
    }

    try {
      for (const photo of chosenPhotos) {
        await fetch('/api/creative-studio/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'photo',
            title: photo.title,
            description: photo.prompt,
            produceList: [photo.produceName],
            mediaUrl: photo.imageUrl,
            thumbnailUrl: photo.imageUrl,
            aspectRatio: photo.aspectRatio || '4:5',
          }),
        })
      }
      showToast(`✅ Saved ${chosenPhotos.length} photo(s) to Creative Asset Library!`)
    } catch (err) {
      console.error('Save photos error:', err)
      showToast('❌ Failed to save photos to library')
    }
  }

  // ── 5. BUILD PAN & ZOOM VIDEO WITH SELECTED PHOTOS ─────────────────
  const handleBuildVideoFromSelectedPhotos = () => {
    const chosenPhotos = photoCandidates.filter(p => selectedPhotoIds.includes(p.id))
    if (chosenPhotos.length === 0) {
      showToast('⚠️ Please select at least 1 photo to build a video.')
      return
    }

    const motions: Array<'push_in' | 'pan_horizontal' | 'zoom_out' | 'diagonal_sweep'> = [
      'push_in',
      'pan_horizontal',
      'zoom_out',
      'diagonal_sweep',
    ]

    const initialScenes: MotionStoryboardScene[] = chosenPhotos.map((photo, idx) => ({
      id: `motion-scene-${Date.now()}-${idx}`,
      sceneNumber: idx + 1,
      heading: photo.title,
      produceFocus: photo.produceName,
      visualPrompt: photo.prompt,
      imageUrl: photo.imageUrl,
      motionType: motions[idx % motions.length],
      durationSeconds: 3.5,
      headlineOverlay: '', // Pure clean photo by default (no unwanted text)
      badgeOverlay: '',
      rationale: `Scene ${idx + 1}: ${photo.produceName}`,
    }))

    setScenes(initialScenes)
    setStoryboardTitle(`Pan & Zoom Video Sequence (${initialScenes.length} Scenes)`)
    setStoryboardReasoning(`Loaded ${initialScenes.length} photos in sequence. You can reorder scenes, enter custom text overlays (or leave blank for clean photos), choose motion paths, and generate your video!`)
    setActiveTab('storyboard')
    showToast(`🎬 Loaded ${initialScenes.length} scenes into the sequence builder!`)
  }

  // ── 5B. SCENE SEQUENCE EDITING & REORDERING HANDLERS ───────────────
  const handleMoveSceneUp = (index: number) => {
    if (index <= 0) return
    setScenes(prev => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index - 1]
      copy[index - 1] = temp
      return copy.map((s, i) => ({ ...s, sceneNumber: i + 1 }))
    })
  }

  const handleMoveSceneDown = (index: number) => {
    setScenes(prev => {
      if (index >= prev.length - 1) return prev
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[index + 1]
      copy[index + 1] = temp
      return copy.map((s, i) => ({ ...s, sceneNumber: i + 1 }))
    })
  }

  const handleRemoveScene = (index: number) => {
    setScenes(prev => {
      const copy = prev.filter((_, i) => i !== index)
      return copy.map((s, i) => ({ ...s, sceneNumber: i + 1 }))
    })
    showToast('🗑️ Removed scene from video sequence')
  }

  const handleUpdateSceneHeadline = (index: number, text: string) => {
    setScenes(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], headlineOverlay: text }
      return copy
    })
  }

  const handleUpdateSceneBadge = (index: number, badge: string) => {
    setScenes(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], badgeOverlay: badge }
      return copy
    })
  }

  const handleUpdateSceneMotion = (index: number, motion: 'push_in' | 'pan_horizontal' | 'diagonal_sweep' | 'zoom_out') => {
    setScenes(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], motionType: motion }
      return copy
    })
  }

  const handleUpdateSceneDuration = (index: number, duration: number) => {
    setScenes(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], durationSeconds: duration }
      return copy
    })
  }

  const handleGenerateAndPlayVideo = () => {
    if (scenes.length === 0) {
      showToast('⚠️ Please add at least 1 scene to generate video.')
      return
    }
    setActiveTab('video')
    showToast(`▶️ Playing your ${scenes.length}-scene Pan & Zoom video!`)
  }

  // ── HEADLESS OFFSCREEN VIDEO STITCHER ──────────────────────────────
  const renderStoryboardToBlob = async (
    targetScenes: MotionStoryboardScene[],
    duration: number,
    targetAspect: '1:1' | '4:5' | '9:16' | '16:9'
  ): Promise<Blob | null> => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return null

    const w = targetAspect === '16:9' ? 1280 : targetAspect === '9:16' ? 720 : targetAspect === '1:1' ? 720 : 720
    const h = targetAspect === '16:9' ? 720 : targetAspect === '9:16' ? 1280 : targetAspect === '1:1' ? 720 : 900

    const offCanvas = document.createElement('canvas')
    offCanvas.width = w
    offCanvas.height = h
    const ctx = offCanvas.getContext('2d')
    if (!ctx) return null

    // Preload images
    const loadedImages: HTMLImageElement[] = await Promise.all(
      targetScenes.map(
        scene =>
          new Promise<HTMLImageElement>(resolve => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => resolve(img)
            img.onerror = () => {
              const fallback = new Image()
              fallback.crossOrigin = 'anonymous'
              fallback.onload = () => resolve(fallback)
              fallback.onerror = () => resolve(img)
              fallback.src = getInterestImage(scene.produceFocus)
            }
            img.src = scene.imageUrl
          })
      )
    )

    return new Promise<Blob | null>(resolve => {
      try {
        const stream = offCanvas.captureStream(30)
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : MediaRecorder.isTypeSupported('video/mp4')
          ? 'video/mp4'
          : 'video/webm'
        const recorder = new MediaRecorder(stream, { mimeType })
        const chunks: Blob[] = []

        recorder.ondataavailable = e => {
          if (e.data && e.data.size > 0) chunks.push(e.data)
        }

        recorder.onstop = () => {
          if (chunks.length > 0) {
            resolve(new Blob(chunks, { type: mimeType }))
          } else {
            resolve(null)
          }
        }

        const fps = 30
        const totalFrames = Math.max(1, Math.round(duration * fps))
        let currentFrame = 0
        let isRecordingStopped = false

        recorder.start()

        const frameInterval = setInterval(() => {
          if (currentFrame >= totalFrames || isRecordingStopped) {
            clearInterval(frameInterval)
            if (!isRecordingStopped) {
              isRecordingStopped = true
              recorder.stop()
            }
            return
          }

          const currentTimeSec = currentFrame / fps
          let accumulated = 0
          let activeIndex = 0
          let timeInScene = 0

          for (let i = 0; i < targetScenes.length; i++) {
            const sceneDur = targetScenes[i].durationSeconds || 3.5
            if (currentTimeSec >= accumulated && currentTimeSec < accumulated + sceneDur) {
              activeIndex = i
              timeInScene = currentTimeSec - accumulated
              break
            }
            accumulated += sceneDur
            if (i === targetScenes.length - 1) {
              activeIndex = i
              timeInScene = sceneDur
            }
          }

          const activeScene = targetScenes[activeIndex]
          const sceneDuration = activeScene.durationSeconds || 3.5
          const sceneProgress = Math.min(Math.max(timeInScene / sceneDuration, 0), 1)
          const img = loadedImages[activeIndex]

          // Render Frame
          ctx.fillStyle = '#0F172A'
          ctx.fillRect(0, 0, w, h)

          if (img && img.complete && img.naturalWidth > 0) {
            let scale = 1.0
            let tx = 0
            let ty = 0

            switch (activeScene.motionType) {
              case 'push_in':
                scale = 1.0 + sceneProgress * 0.18
                break
              case 'zoom_out':
                scale = 1.2 - sceneProgress * 0.18
                break
              case 'pan_horizontal':
                scale = 1.15
                tx = (sceneProgress - 0.5) * (w * 0.12)
                break
              case 'diagonal_sweep':
                scale = 1.12 + sceneProgress * 0.08
                tx = (sceneProgress - 0.5) * (w * 0.08)
                ty = (sceneProgress - 0.5) * (h * 0.08)
                break
              default:
                scale = 1.05 + sceneProgress * 0.1
            }

            ctx.save()
            ctx.translate(w / 2 + tx, h / 2 + ty)

            const imgAspect = img.naturalWidth / img.naturalHeight
            const canvasAspect = w / h
            let drawW = w * scale
            let drawH = h * scale

            if (imgAspect > canvasAspect) {
              drawW = h * imgAspect * scale
              drawH = h * scale
            } else {
              drawW = w * scale
              drawH = (w / imgAspect) * scale
            }

            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
            ctx.restore()
          }

          // Render Text Overlays if present
          if (activeScene.headlineOverlay) {
            ctx.save()
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
            ctx.fillRect(20, h - 140, w - 40, 90)
            ctx.fillStyle = '#FFFFFF'
            ctx.font = 'bold 24px system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(activeScene.headlineOverlay, w / 2, h - 88)
            ctx.restore()
          }

          currentFrame++
        }, 1000 / fps)
      } catch (err) {
        console.error('Headless render error:', err)
        resolve(null)
      }
    })
  }

  // ── 6. SAVE VIDEO TO LIBRARY ───────────────────────────────────────
  const handleSaveVideoToLibrary = async () => {
    if (scenes.length === 0) {
      showToast('⚠️ Please add at least 1 scene to save a video.')
      return
    }

    try {
      showToast(`🎥 Stitching & encoding ${totalVideoDuration}s video file in background…`)
      const videoBlob = await renderStoryboardToBlob(scenes, totalVideoDuration, aspectRatio)

      if (videoBlob) {
        const formData = new FormData()
        formData.append('type', 'video')
        formData.append('title', storyboardTitle)
        formData.append('description', scenes.map(s => s.headlineOverlay).join(' | '))
        formData.append('produceList', JSON.stringify(selectedProduce))
        formData.append('durationSeconds', String(totalVideoDuration))
        formData.append('aspectRatio', aspectRatio)
        formData.append('thumbnailUrl', scenes[0]?.imageUrl || '')
        formData.append('file', videoBlob, `${storyboardTitle.replace(/\s+/g, '_')}_MotionAd.webm`)

        const res = await fetch('/api/creative-studio/assets', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (data.success && data.asset) {
          setSavedLibraryAssets(prev => [data.asset, ...prev.filter(a => a.id !== data.asset.id)])
          showToast('✅ Stitched 1 video file and saved to Supabase & Creative Library!')
          return
        }
      }
    } catch (err) {
      console.error('Headless stitch error, falling back to metadata:', err)
    }

    // Fallback if browser media recording is unsupported
    try {
      const res = await fetch('/api/creative-studio/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          title: storyboardTitle,
          description: scenes.map(s => s.headlineOverlay).join(' | '),
          produceList: selectedProduce,
          mediaUrl: scenes[0]?.imageUrl || '',
          thumbnailUrl: scenes[0]?.imageUrl || '',
          durationSeconds: totalVideoDuration,
          aspectRatio,
        }),
      })

      const data = await res.json()
      if (data.success && data.asset) {
        setSavedLibraryAssets(prev => [data.asset, ...prev.filter(a => a.id !== data.asset.id)])
        showToast('✅ Saved Motion Video to Creative Asset Library!')
      }
    } catch (err) {
      console.error('Save asset error:', err)
    }
  }

  // ── 7. EXPORT VIDEO FILE ───────────────────────────────────────────
  const handleExportVideoFile = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsExportingVideo(true)

    try {
      const stream = canvas.captureStream(30)
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' })
      const chunks: Blob[] = []

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${storyboardTitle.replace(/\s+/g, '_')}_MotionAd.webm`
        a.click()
        setIsExportingVideo(false)
        showToast('🎉 Video downloaded successfully!')
      }

      recorder.start()
      setTimeout(() => {
        recorder.stop()
      }, totalVideoDuration * 1000)
    } catch (e) {
      console.error('Export error:', e)
      setIsExportingVideo(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ─── TOAST NOTIFICATION ────────────────────────────────────────── */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
            zIndex: 9999,
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* LEFT PANEL: PINNED DOCK CHAT & REASONING STREAM                 */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          width: '420px',
          minWidth: '380px',
          maxWidth: '460px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #E2E8F0',
          background: '#FFFFFF',
          flexShrink: 0,
        }}
      >
        {/* Left Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '16px' }}>✨</span>
              <h2 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                Creative AI Agent
              </h2>
            </div>
            <span style={{ fontSize: '11px', color: '#64748B' }}>
              Photos &amp; Pan-Zoom Video Director
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setShowLibraryModal(true)}
              style={{
                padding: '6px 10px',
                background: '#EFF6FF',
                color: '#1D4ED8',
                border: '1px solid #BFDBFE',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>🖼️ Library</span>
            </button>
            <button
              onClick={() => fileUploadInputRef.current?.click()}
              style={{
                padding: '6px 10px',
                background: '#F1F5F9',
                color: '#334155',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>⬆️ Upload</span>
            </button>
          </div>
          <input
            ref={fileUploadInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleLocalPhotoUpload}
            style={{ display: 'none' }}
          />
        </div>

        {/* Carried-Forward Produce Context Pill Bar */}
        <div style={{ padding: '8px 16px', background: '#F0FDF4', borderBottom: '1px solid #DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: '#166534' }}>
            <span>📍 Active Produce Context:</span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {selectedProduce.map(p => (
                <span key={p} style={{ background: '#DCFCE7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #86EFAC' }}>
                  🍋 {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Chat Messages Stream */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
              }}
            >
              <div
                style={{
                  background: msg.sender === 'user' ? '#15803D' : '#F8FAFC',
                  color: msg.sender === 'user' ? '#FFFFFF' : '#0F172A',
                  padding: '12px 16px',
                  borderRadius: msg.sender === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  border: msg.sender === 'user' ? 'none' : '1px solid #E2E8F0',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                {/* Reasoning Trace */}
                {msg.thought && (
                  <details style={{ marginBottom: '8px', padding: '6px 10px', background: 'rgba(0,0,0,0.04)', borderRadius: '6px', fontSize: '11px', color: '#475569' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>🧠 Creative Reasoning</summary>
                    <p style={{ margin: '4px 0 0 0' }}>{msg.thought}</p>
                  </details>
                )}

                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                {/* Tool Pills */}
                {msg.toolCalls && msg.toolCalls.map((tc, i) => (
                  <div key={i} style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                    <span>✓</span>
                    <span>{tc.summary}</span>
                  </div>
                ))}

                {/* Artifact Action Button */}
                {msg.artifactAction && (
                  <button
                    onClick={() => setActiveTab(msg.artifactAction!.type)}
                    style={{
                      marginTop: '10px',
                      display: 'block',
                      width: '100%',
                      padding: '6px 10px',
                      background: '#15803D',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    👉 {msg.artifactAction.label}
                  </button>
                )}
              </div>
              <span style={{ display: 'block', fontSize: '10px', color: '#94A3B8', marginTop: '4px', textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
                {msg.timestamp}
              </span>
            </div>
          ))}
          {isProcessing && (
            <div
              style={{
                alignSelf: 'flex-start',
                background: '#F0FDF4',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #BBF7D0',
                fontSize: '12px',
                color: '#166534',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(21,128,61,0.06)',
                maxWidth: '90%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                <span>🎨</span>
                <span>Generating Commercial Assets...</span>
                <span style={{ fontSize: '11px', color: '#15803D', fontWeight: 700, marginLeft: 'auto' }}>
                  ⏱️ {elapsedSeconds}s
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>
                {processingStep}
              </div>
              <div style={{ height: '4px', background: '#DCFCE7', borderRadius: '2px', overflow: 'hidden', width: '100%', marginTop: '2px' }}>
                <div
                  style={{
                    height: '100%',
                    background: '#15803D',
                    width: `${Math.min(95, elapsedSeconds * 8 + 15)}%`,
                    transition: 'width 0.8s ease',
                    borderRadius: '2px',
                  }}
                />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Pinned Bottom Input Dock */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid #E2E8F0', background: '#FFFFFF', flexShrink: 0 }}>
          {/* Quick Suggestions using Active Produce Context */}
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '6px' }}>
            {[
              `Generate 4 photos for ${selectedProduce.slice(0, 2).join(' & ')} on sunlit rustic table`,
              `Create 3-scene pan & zoom motion video for ${selectedProduce.join(', ')}`,
              `Macro close-up with morning dew droplets for ${selectedProduce[0] || 'Produce'}`,
            ].map((sug, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(sug)}
                style={{
                  whiteSpace: 'nowrap',
                  background: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  color: '#475569',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {sug}
              </button>
            ))}
          </div>

          {/* Aspect Ratio Format Selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', padding: '0 2px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748B' }}>📐 FORMAT:</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[
                { key: '9:16', label: '📱 9:16 Story/Reel' },
                { key: '4:5', label: '🖼️ 4:5 Feed' },
                { key: '1:1', label: '⏹️ 1:1 Square' },
                { key: '16:9', label: '🖥️ 16:9 Wide' },
              ].map(fmt => (
                <button
                  key={fmt.key}
                  type="button"
                  onClick={() => setAspectRatio(fmt.key as any)}
                  style={{
                    padding: '2px 7px',
                    borderRadius: '6px',
                    border: aspectRatio === fmt.key ? '1px solid #15803D' : '1px solid #E2E8F0',
                    background: aspectRatio === fmt.key ? '#DCFCE7' : '#F8FAFC',
                    color: aspectRatio === fmt.key ? '#166534' : '#64748B',
                    fontSize: '10px',
                    fontWeight: aspectRatio === fmt.key ? 800 : 600,
                    cursor: 'pointer',
                  }}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-line Auto-Expanding Prompt Box */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #CBD5E1',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              padding: '8px 10px',
              gap: '6px',
            }}
          >
            <textarea
              id="chat-prompt-input"
              data-testid="chat-prompt-input"
              rows={2}
              value={inputPrompt}
              onChange={e => {
                setInputPrompt(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder={`Type your prompt for ${selectedProduce.slice(0, 2).join(', ')} (e.g. 1 photo per produce in generous containers + a Wanted Now card)...\n[Enter to send, Shift+Enter for new line]`}
              style={{
                width: '100%',
                minHeight: '46px',
                maxHeight: '160px',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontSize: '13px',
                lineHeight: '1.45',
                color: '#0F172A',
                fontFamily: 'inherit',
                background: 'transparent',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                Press <b>Enter ↵</b> to send • <b>Shift+Enter</b> for new line
              </span>
              <button
                id="chat-send-btn"
                data-testid="chat-send-btn"
                onClick={() => handleSendMessage()}
                disabled={isProcessing || !inputPrompt.trim()}
                style={{
                  padding: '6px 14px',
                  background: isProcessing || !inputPrompt.trim() ? '#94A3B8' : '#15803D',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: isProcessing || !inputPrompt.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>✨ Send</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* RIGHT PANEL: ARTIFACT & REVIEW WORKSPACE                        */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Workspace Tab Header */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              id="tab-photos"
              data-testid="tab-photos"
              onClick={() => setActiveTab('photos')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: activeTab === 'photos' ? '#15803D' : '#F1F5F9',
                color: activeTab === 'photos' ? '#FFFFFF' : '#475569',
              }}
            >
              📸 Photo Candidates ({photoCandidates.length})
            </button>

            <button
              id="tab-storyboard"
              data-testid="tab-storyboard"
              onClick={() => setActiveTab('storyboard')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: activeTab === 'storyboard' ? '#15803D' : '#F1F5F9',
                color: activeTab === 'storyboard' ? '#FFFFFF' : '#475569',
              }}
            >
              📝 Motion Storyboard ({scenes.length} Scenes)
            </button>

            <button
              id="tab-video"
              data-testid="tab-video"
              onClick={() => setActiveTab('video')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: activeTab === 'video' ? '#15803D' : '#F1F5F9',
                color: activeTab === 'video' ? '#FFFFFF' : '#475569',
              }}
            >
              🎬 Live Motion Video Player
            </button>
          </div>

          {activeTab === 'photos' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowLibraryModal(true)}
                style={{
                  padding: '6px 12px',
                  background: '#EFF6FF',
                  color: '#1D4ED8',
                  border: '1px solid #BFDBFE',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>🖼️</span>
                <span>Add from Library</span>
              </button>
              <button
                onClick={handleSavePhotosToLibrary}
                style={{
                  padding: '6px 12px',
                  background: '#F8FAFC',
                  color: '#334155',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>💾</span>
                <span>Save Photos to Library ({selectedPhotoIds.length})</span>
              </button>
              <button
                onClick={handleBuildVideoFromSelectedPhotos}
                style={{
                  padding: '6px 14px',
                  background: '#15803D',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>🎬</span>
                <span>Build Video with Selected Photos ({selectedPhotoIds.length})</span>
              </button>
            </div>
          )}

          {activeTab === 'video' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleExportVideoFile}
                disabled={isExportingVideo}
                style={{
                  padding: '6px 12px',
                  background: '#15803D',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: isExportingVideo ? 'not-allowed' : 'pointer',
                }}
              >
                {isExportingVideo ? '⏳ Exporting...' : '⬇️ Export Video File'}
              </button>
              <button
                onClick={handleSaveVideoToLibrary}
                style={{
                  padding: '6px 12px',
                  background: '#0F172A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ✅ Save to Library
              </button>
            </div>
          )}
        </div>

        {/* Tab Content Container */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
          {/* ── TAB 1: PHOTO CANDIDATES & FEEDBACK BOARD ── */}
          {activeTab === 'photos' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 2px 0', color: '#0F172A' }}>
                    Photo Candidates &amp; Selection Board
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>
                    Select the photos you want in your Pan &amp; Zoom video, or leave feedback to refine individual shots.
                  </span>
                </div>
              </div>

              {photoCandidates.length === 0 ? (
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '2px dashed #CBD5E1',
                    borderRadius: '16px',
                    padding: '48px 24px',
                    textAlign: 'center',
                    maxWidth: '560px',
                    margin: '40px auto',
                  }}
                >
                  <div style={{ fontSize: '42px', marginBottom: '12px' }}>📸</div>
                  <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                    No Photos Generated Yet
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 20px 0', lineHeight: 1.5 }}>
                    Type your request in the chat dock on the left (e.g. <em>&ldquo;Generate 1 photo for each produce in containers plus a Wanted Now card&rdquo;</em>), or add photos from your library or device below.
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      id="btn-1click-generate-photos"
                      onClick={() => handleSendMessage(`Generate 4 commercial high-definition photo candidates for ${selectedProduce.slice(0, 4).join(', ')} in generous market harvest crates`)}
                      style={{
                        padding: '10px 20px',
                        background: '#15803D',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(21, 128, 61, 0.3)',
                      }}
                    >
                      <span>✨</span>
                      <span>Generate Photos for {selectedProduce.slice(0, 2).join(', ')}...</span>
                    </button>
                    <button
                      onClick={() => setShowLibraryModal(true)}
                      style={{
                        padding: '10px 16px',
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                        border: '1px solid #BFDBFE',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>🖼️</span>
                      <span>Browse Saved Library</span>
                    </button>
                    <button
                      onClick={() => fileUploadInputRef.current?.click()}
                      style={{
                        padding: '10px 16px',
                        background: '#F1F5F9',
                        color: '#334155',
                        border: '1px solid #CBD5E1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>⬆️</span>
                      <span>Upload Photos</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '18px' }}>
                  {photoCandidates.map(photo => {
                    const isSelected = selectedPhotoIds.includes(photo.id)
                    const isGivingFeedback = photoFeedbackTargetId === photo.id

                    return (
                      <div
                        key={photo.id}
                        style={{
                          background: '#FFFFFF',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          border: isSelected ? '2px solid #15803D' : '1px solid #E2E8F0',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <div style={{ position: 'relative', width: '100%', height: '220px' }}>
                          <img
                            src={photo.imageUrl}
                            alt={photo.title}
                            onError={e => {
                              e.currentTarget.src = getInterestImage(photo.produceName)
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <button
                            onClick={() => {
                              if (isSelected) {
                                setSelectedPhotoIds(prev => prev.filter(id => id !== photo.id))
                              } else {
                                setSelectedPhotoIds(prev => [...prev, photo.id])
                              }
                            }}
                            style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              background: isSelected ? '#15803D' : 'rgba(0,0,0,0.6)',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '10px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span>{isSelected ? '✓ Selected for Video' : '+ Select'}</span>
                          </button>
                        </div>

                        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>{photo.title}</div>
                            <span style={{ fontSize: '9px', fontWeight: 800, background: '#F1F5F9', color: '#475569', padding: '2px 5px', borderRadius: '4px' }}>
                              {photo.aspectRatio}
                            </span>
                          </div>
                          <p style={{ fontSize: '11px', color: '#64748B', margin: 0, lineHeight: 1.4, flex: 1 }}>
                            📸 <em>4K Commercial Harvest Asset (Admin Preview)</em>
                          </p>

                          {isGivingFeedback ? (
                            <div style={{ marginTop: '8px', background: '#F8FAFC', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                              <input
                                type="text"
                                value={photoFeedbackText}
                                onChange={e => setPhotoFeedbackText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendPhotoFeedback(photo)}
                                placeholder="e.g., warmer sunlight, more dew drops..."
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', marginBottom: '6px' }}
                              />
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => setPhotoFeedbackTargetId(null)}
                                  style={{ padding: '4px 8px', background: '#F1F5F9', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleSendPhotoFeedback(photo)}
                                  style={{ padding: '4px 8px', background: '#15803D', color: '#FFFFFF', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  Submit Feedback
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                              <button
                                onClick={() => handleSaveSinglePhotoToLibrary(photo)}
                                title="Save photo to library"
                                style={{
                                  flex: 1,
                                  padding: '5px 8px',
                                  background: '#F0FDF4',
                                  color: '#166534',
                                  border: '1px solid #BBF7D0',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <span>💾</span>
                                <span>Save</span>
                              </button>
                              <button
                                onClick={() => setPhotoFeedbackTargetId(photo.id)}
                                title="Refine photo with AI"
                                style={{
                                  flex: 1,
                                  padding: '5px 8px',
                                  background: '#F1F5F9',
                                  color: '#334155',
                                  border: '1px solid #CBD5E1',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <span>💬</span>
                                <span>Refine</span>
                              </button>
                              <button
                                onClick={() => {
                                  setPhotoCandidates(prev => prev.filter(p => p.id !== photo.id))
                                  setSelectedPhotoIds(prev => prev.filter(id => id !== photo.id))
                                  showToast('🗑️ Discarded photo candidate')
                                }}
                                title="Discard photo candidate"
                                style={{
                                  padding: '5px 10px',
                                  background: '#FEE2E2',
                                  color: '#991B1B',
                                  border: '1px solid #FCA5A5',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                }}
                              >
                                <span>🗑️</span>
                                <span>Discard</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: INTERACTIVE SCENE SEQUENCER & CUSTOM TEXT OVERLAYS ── */}
          {activeTab === 'storyboard' && (
            <div style={{ maxWidth: '880px', margin: '0 auto' }}>
              <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px 22px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 4px 0', color: '#0F172A' }}>
                    🎬 Pan &amp; Zoom Video Sequencer ({scenes.length} Scenes)
                  </h2>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
                    Arrange photos in your desired sequence, enter custom text overlays (or leave blank for clean photos), and pick camera motions.
                  </p>
                  <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 700, color: '#15803D' }}>
                    ⏱️ Total Motion Video Duration: {totalVideoDuration}s
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setShowLibraryModal(true)}
                    style={{
                      padding: '8px 14px',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      border: '1px solid #BFDBFE',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>🖼️</span>
                    <span>+ Add Photo</span>
                  </button>
                  <button
                    onClick={handleGenerateAndPlayVideo}
                    disabled={scenes.length === 0}
                    style={{
                      padding: '8px 16px',
                      background: scenes.length === 0 ? '#CBD5E1' : '#15803D',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: scenes.length === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>▶️</span>
                    <span>Generate &amp; Play Video</span>
                  </button>
                </div>
              </div>

              {scenes.length === 0 ? (
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '2px dashed #CBD5E1',
                    borderRadius: '16px',
                    padding: '48px 24px',
                    textAlign: 'center',
                    maxWidth: '560px',
                    margin: '40px auto',
                  }}
                >
                  <div style={{ fontSize: '42px', marginBottom: '12px' }}>🎬</div>
                  <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                    No Scenes in Video Sequence Yet
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 20px 0', lineHeight: 1.5 }}>
                    Select photos from the <strong>Photo Candidates</strong> board and click &ldquo;Build Video with Selected Photos&rdquo;, or add photos from your library!
                  </p>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      onClick={() => setActiveTab('photos')}
                      style={{
                        padding: '8px 16px',
                        background: '#15803D',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      👈 Go to Photo Candidates
                    </button>
                    <button
                      onClick={() => setShowLibraryModal(true)}
                      style={{
                        padding: '8px 16px',
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                        border: '1px solid #BFDBFE',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      🖼️ Add from Library
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {scenes.map((scene, idx) => (
                    <div
                      key={scene.id || `scene-${idx}`}
                      style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        border: '1px solid #E2E8F0',
                        padding: '16px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        display: 'grid',
                        gridTemplateColumns: '140px 1fr',
                        gap: '18px',
                      }}
                    >
                      {/* Left: Thumbnail & Reordering Controls */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ position: 'relative', width: '140px', height: '140px', borderRadius: '10px', overflow: 'hidden' }}>
                          <img
                            src={scene.imageUrl}
                            alt={scene.heading}
                            onError={e => {
                              e.currentTarget.src = getInterestImage(scene.produceFocus)
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <span
                            style={{
                              position: 'absolute',
                              top: '6px',
                              left: '6px',
                              background: '#15803D',
                              color: '#FFFFFF',
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            SCENE {idx + 1}
                          </span>
                        </div>

                        {/* Reorder Buttons */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => handleMoveSceneUp(idx)}
                            disabled={idx === 0}
                            title="Move scene up"
                            style={{
                              flex: 1,
                              padding: '4px',
                              background: idx === 0 ? '#F1F5F9' : '#FFFFFF',
                              color: idx === 0 ? '#94A3B8' : '#0F172A',
                              border: '1px solid #CBD5E1',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: idx === 0 ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ⬆️ Up
                          </button>
                          <button
                            onClick={() => handleMoveSceneDown(idx)}
                            disabled={idx === scenes.length - 1}
                            title="Move scene down"
                            style={{
                              flex: 1,
                              padding: '4px',
                              background: idx === scenes.length - 1 ? '#F1F5F9' : '#FFFFFF',
                              color: idx === scenes.length - 1 ? '#94A3B8' : '#0F172A',
                              border: '1px solid #CBD5E1',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: idx === scenes.length - 1 ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ⬇️ Down
                          </button>
                          <button
                            onClick={() => handleRemoveScene(idx)}
                            title="Remove scene"
                            style={{
                              padding: '4px 8px',
                              background: '#FEE2E2',
                              color: '#991B1B',
                              border: '1px solid #FCA5A5',
                              borderRadius: '6px',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Right: Scene Customization & Overlays */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                            {scene.heading || `Scene ${idx + 1}: ${scene.produceFocus}`}
                          </div>
                          <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                            Focus: {scene.produceFocus}
                          </span>
                        </div>

                        {/* Custom Headline Text Overlay */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '3px' }}>
                            ✏️ Text Overlay <span style={{ fontWeight: 400, color: '#64748B' }}>(Optional — leave blank for pure clean photo)</span>
                          </label>
                          <input
                            type="text"
                            value={scene.headlineOverlay || ''}
                            onChange={e => handleUpdateSceneHeadline(idx, e.target.value)}
                            placeholder="e.g. I WANT, MEYER LEMONS (Leave blank for clean video)"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              fontSize: '12px',
                              color: '#0F172A',
                              background: '#FFFFFF',
                            }}
                          />
                        </div>

                        {/* Motion Path & Duration Controls */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '3px' }}>
                              🎥 Camera Motion
                            </label>
                            <select
                              value={scene.motionType}
                              onChange={e => handleUpdateSceneMotion(idx, e.target.value as any)}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '11px',
                                color: '#0F172A',
                                background: '#FFFFFF',
                              }}
                            >
                              <option value="push_in">🔍 Push In (Zoom into center)</option>
                              <option value="zoom_out">🔎 Zoom Out (Reveal wider scene)</option>
                              <option value="pan_horizontal">↔️ Pan Horizontal (Left to Right)</option>
                              <option value="diagonal_sweep">↗️ Diagonal Sweep (Dynamic)</option>
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '3px' }}>
                              ⏱️ Duration
                            </label>
                            <select
                              value={scene.durationSeconds}
                              onChange={e => handleUpdateSceneDuration(idx, Number(e.target.value))}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '11px',
                                color: '#0F172A',
                                background: '#FFFFFF',
                              }}
                            >
                              <option value="2">2.0 seconds</option>
                              <option value="2.5">2.5 seconds</option>
                              <option value="3">3.0 seconds</option>
                              <option value="3.5">3.5 seconds</option>
                              <option value="4">4.0 seconds</option>
                              <option value="5">5.0 seconds</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Bottom Generate Action Bar */}
                  <div style={{ marginTop: '14px', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setShowLibraryModal(true)}
                      style={{
                        padding: '10px 16px',
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                        border: '1px solid #BFDBFE',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Add Another Photo
                    </button>

                    <button
                      onClick={handleSaveVideoToLibrary}
                      style={{
                        padding: '10px 18px',
                        background: '#F0FDF4',
                        color: '#166534',
                        border: '1px solid #BBF7D0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>💾</span>
                      <span>Save Video to Library</span>
                    </button>

                    <button
                      onClick={() => {
                        handleSaveVideoToLibrary()
                        setAdModalContext({
                          isOpen: true,
                          initialPublishType: 'paid_ad',
                          produceNames: selectedProduce,
                          produceImages: [scenes[0]?.imageUrl || ''],
                          metricsSummary: storyboardTitle,
                        })
                      }}
                      style={{
                        padding: '10px 18px',
                        background: '#1E40AF',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 6px rgba(30, 64, 175, 0.25)',
                      }}
                    >
                      <span>🚀</span>
                      <span>Launch in Ad Creator</span>
                    </button>

                    <button
                      onClick={handleGenerateAndPlayVideo}
                      style={{
                        padding: '10px 20px',
                        background: '#15803D',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(21, 128, 61, 0.25)',
                      }}
                    >
                      <span>▶️</span>
                      <span>Play &amp; Preview ({scenes.length} Scenes)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: LIVE 60FPS PAN & ZOOM MOTION VIDEO PLAYER ── */}
          {activeTab === 'video' && (
            <div style={{ maxWidth: aspectRatio === '16:9' ? '760px' : (aspectRatio === '9:16' ? '420px' : '560px'), margin: '0 auto' }}>
              <div
                style={{
                  background: '#0F172A',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  position: 'relative',
                  aspectRatio: aspectRatio === '9:16' ? '9 / 16' : (aspectRatio === '1:1' ? '1 / 1' : (aspectRatio === '16:9' ? '16 / 9' : '4 / 5')),
                  boxShadow: '0 15px 35px -5px rgba(0,0,0,0.3)',
                  marginBottom: '16px',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={aspectRatio === '16:9' ? 800 : (aspectRatio === '9:16' ? 450 : (aspectRatio === '1:1' ? 600 : 480))}
                  height={aspectRatio === '16:9' ? 450 : (aspectRatio === '9:16' ? 800 : (aspectRatio === '1:1' ? 600 : 600))}
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                    {storyboardTitle}
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>
                    {totalVideoDuration}s Total Video • 60FPS Ken Burns Motion
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={handleSaveVideoToLibrary}
                    style={{
                      padding: '8px 14px',
                      background: '#F0FDF4',
                      color: '#166534',
                      border: '1px solid #BBF7D0',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>💾</span>
                    <span>Save Video to Library</span>
                  </button>

                  <button
                    onClick={handleExportVideoFile}
                    disabled={isExportingVideo}
                    style={{
                      padding: '8px 14px',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      border: '1px solid #BFDBFE',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: isExportingVideo ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>📥</span>
                    <span>{isExportingVideo ? 'Exporting WebM…' : 'Export Video File'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setAdModalContext({
                        isOpen: true,
                        initialPublishType: 'paid_ad',
                        produceNames: selectedProduce,
                        produceImages: [scenes[0]?.imageUrl || ''],
                        metricsSummary: storyboardTitle,
                      })
                    }}
                    style={{
                      padding: '8px 16px',
                      background: '#15803D',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    🚀 Launch in Ad Creator
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── SEARCHABLE PRODUCE CATALOG & ASSET LIBRARY MODAL ───────── */}
      {showLibraryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
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
              maxWidth: '920px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 2px 0', fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
                  🖼️ Produce Catalog &amp; Photo Library Search
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Search and select from produce listings, 4K harvest containers, community demand cards, and saved photos.
                </span>
              </div>
              <button
                onClick={() => setShowLibraryModal(false)}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                ✕ Close
              </button>
            </div>

            {/* Keyword Search & Category Bar */}
            <div style={{ padding: '14px 24px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Search input */}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={e => setLibrarySearchQuery(e.target.value)}
                  placeholder="🔍 Search by keyword, produce name, category (e.g. lemons, tomatoes, neighbors, basil, fruit, crate, 4k)..."
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    color: '#0F172A',
                    background: '#FFFFFF',
                    outline: 'none',
                  }}
                />
                {librarySearchQuery && (
                  <button
                    onClick={() => setLibrarySearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94A3B8',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Category Filter Pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                  { id: 'all', label: `🌟 All (${allCatalogItems.length})` },
                  { id: 'community', label: `👥 Community (${allCatalogItems.filter(i => i.category === 'community').length})` },
                  { id: 'citrus', label: `🍋 Citrus (${allCatalogItems.filter(i => i.category === 'citrus').length})` },
                  { id: 'vegetables', label: `🍅 Vegetables (${allCatalogItems.filter(i => i.category === 'vegetables').length})` },
                  { id: 'fruits', label: `🥑 Fruits (${allCatalogItems.filter(i => i.category === 'fruits').length})` },
                  { id: 'herbs', label: `🌿 Herbs & Specialty (${allCatalogItems.filter(i => i.category === 'herbs').length})` },
                  { id: 'saved', label: `💾 Saved Assets (${allCatalogItems.filter(i => i.category === 'saved').length})` },
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setLibraryCategoryFilter(cat.id as any)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '16px',
                      border: libraryCategoryFilter === cat.id ? '1px solid #15803D' : '1px solid #CBD5E1',
                      background: libraryCategoryFilter === cat.id ? '#DCFCE7' : '#FFFFFF',
                      color: libraryCategoryFilter === cat.id ? '#15803D' : '#475569',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Results Count & Card Grid */}
            <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '12px' }}>
                Showing {filteredCatalogItems.length} matching photo{filteredCatalogItems.length === 1 ? '' : 's'}
              </div>

              {filteredCatalogItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>No matching photos found</div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>Try searching for a different keyword or select another category filter.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
                  {filteredCatalogItems.map(item => (
                    <div
                      key={item.id}
                      style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div 
                        style={{ position: 'relative', width: '100%', height: '140px', background: '#0F172A', cursor: item.type === 'video' ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (item.type === 'video') {
                            setPreviewVideo({ url: item.imageUrl, title: item.title })
                          }
                        }}
                      >
                        {item.type === 'video' ? (
                          <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              onError={e => {
                                e.currentTarget.src = getInterestImage(item.produceName)
                              }}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: 'rgba(21, 128, 61, 0.9)',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                              }}
                            >
                              ▶
                            </div>
                          </div>
                        ) : (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            onError={e => {
                              e.currentTarget.src = getInterestImage(item.produceName)
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )}
                        <span
                          style={{
                            position: 'absolute',
                            top: '6px',
                            left: '6px',
                            background: item.type === 'video' ? 'rgba(21, 128, 61, 0.92)' : 'rgba(15,23,42,0.82)',
                            color: '#FFFFFF',
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {item.type === 'video' ? `🎬 Video (${item.durationSeconds || 15}s)` : item.style}
                        </span>
                      </div>
                      <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '2px', lineHeight: 1.3 }}>
                            {item.title}
                          </div>
                          <span style={{ fontSize: '10px', color: '#166534', fontWeight: 700 }}>
                            🏷️ {item.produceName}
                          </span>
                        </div>
                        {item.type === 'video' ? (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                            <button
                              onClick={() => setPreviewVideo({ url: item.imageUrl, title: item.title })}
                              style={{
                                flex: 1,
                                padding: '6px 8px',
                                background: '#EFF6FF',
                                color: '#1D4ED8',
                                border: '1px solid #BFDBFE',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textAlign: 'center',
                              }}
                            >
                              ▶️ Play
                            </button>
                            <button
                              onClick={() => {
                                setAdModalContext({
                                  isOpen: true,
                                  initialPublishType: 'paid_ad',
                                  initialMediaMode: 'video',
                                  prefilledHeadline: item.title,
                                  prefilledMediaUrl: item.imageUrl,
                                  produceNames: [item.produceName],
                                })
                                setShowLibraryModal(false)
                              }}
                              style={{
                                flex: 1,
                                padding: '6px 8px',
                                background: '#15803D',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textAlign: 'center',
                                boxShadow: '0 2px 4px rgba(21,128,61,0.2)',
                              }}
                            >
                              🚀 Ad Creator
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              handleAddPhotoFromLibrary(item)
                              setShowLibraryModal(false)
                            }}
                            style={{
                              marginTop: '8px',
                              padding: '6px 10px',
                              background: '#15803D',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              width: '100%',
                              textAlign: 'center',
                              boxShadow: '0 2px 4px rgba(21,128,61,0.2)',
                            }}
                          >
                            + Add to Active Video
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── VIDEO PREVIEW PLAYER MODAL ─── */}
      {previewVideo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setPreviewVideo(null)}
        >
          <div
            style={{
              background: '#0F172A',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              border: '1px solid #334155',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#F8FAFC' }}>
                🎬 {previewVideo.title}
              </h4>
              <button
                onClick={() => setPreviewVideo(null)}
                style={{ background: '#1E293B', border: 'none', color: '#94A3B8', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ background: '#000000', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', maxHeight: '70vh' }}>
              <video
                src={previewVideo.url}
                controls
                autoPlay
                style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain' }}
              />
            </div>
            <div style={{ padding: '14px 18px', background: '#0F172A', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #1E293B' }}>
              <button
                onClick={() => {
                  setAdModalContext({
                    isOpen: true,
                    initialPublishType: 'paid_ad',
                    initialMediaMode: 'video',
                    prefilledHeadline: previewVideo.title,
                    prefilledMediaUrl: previewVideo.url,
                  })
                  setPreviewVideo(null)
                  setShowLibraryModal(false)
                }}
                style={{
                  padding: '8px 16px',
                  background: '#15803D',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🚀 Launch in Ad Creator
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Integrated Produce Ad Creator Modal */}
      {adModalContext.isOpen && (
        <ProduceAdPostCreatorModal
          modalContext={adModalContext}
          onClose={() => setAdModalContext({ isOpen: false, initialPublishType: 'paid_ad' })}
        />
      )}
    </div>
  )
}
