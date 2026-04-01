import { useState, useRef, useEffect } from 'react'
import MentionPicker from './MentionPicker'
import { uploadChatImage } from '../../../../../../packages/app/features/community-chat/community-chat-service'
import { createClient } from '../../../../lib/supabase'
import { trackClick } from '../../../../lib/analytics'
import CameraCapture from '../../../../components/CameraCapture'
import ImageCropper from '../../../../components/ImageCropper'
import styles from '../page.module.css'

interface ComposeBarProps {
  onSend: (content: string, media?: any[], mentions?: any[]) => Promise<void>
  userId?: string
  h3Index?: string
  /** If set, prefill the compose box with this text and focus it */
  prefillText?: string
  onPrefillConsumed?: () => void
}

export default function ComposeBar({ onSend, userId, h3Index, prefillText, onPrefillConsumed }: ComposeBarProps) {
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  
  // Mentions state
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStartIndex, setMentionStartIndex] = useState(-1)
  const [mentions, setMentions] = useState<any[]>([])

  // Media state
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([])
  const [attachMenu, setAttachMenu] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  // Handle prefill from parent
  useEffect(() => {
    if (prefillText) {
      setContent(prefillText)
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.selectionStart = prefillText.length
          inputRef.current.selectionEnd = prefillText.length
        }
      }, 50)
      onPrefillConsumed?.()
    }
  }, [prefillText, onPrefillConsumed])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if ((!content.trim() && mediaFiles.length === 0) || isSending) return

    trackClick('send_community_message', { hasMedia: mediaFiles.length > 0, hasMentions: mentions.length > 0 })
    setIsSending(true)
    try {
      // Upload media files first
      let uploadedMedia: any[] | undefined
      if (mediaFiles.length > 0 && userId) {
        const supabase = createClient()
        uploadedMedia = []
        for (const file of mediaFiles) {
          const media = await uploadChatImage(supabase, userId, file, file.name)
          uploadedMedia.push(media)
        }
      }

      await onSend(content.trim() || '📷', uploadedMedia, mentions)
      setContent('')
      setMentions([])
      setMentionQuery('')
      setMentionStartIndex(-1)
      setMediaFiles([])
      setMediaPreviews([])
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
        inputRef.current.focus()
      }
    } catch {
      // Moderation or network error — text is preserved for user to edit
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setContent(val)
    
    const cursorPosition = e.target.selectionStart || 0
    const textBeforeCursor = val.slice(0, cursorPosition)
    const match = textBeforeCursor.match(/@([\w\s]*)$/)
    
    if (match) {
      setMentionStartIndex(match.index!)
      setMentionQuery(match[1])
    } else {
      setMentionQuery('')
      setMentionStartIndex(-1)
    }

    // Auto-resize
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 100)}px`
    }
  }

  const handleMentionSelect = (user: { id: string, name: string }) => {
    if (mentionStartIndex === -1) return
    
    const newContent = content.substring(0, mentionStartIndex) + 
      `@${user.name} ` + 
      content.substring(mentionStartIndex + mentionQuery.length + 1)
      
    setContent(newContent)
    
    if (!mentions.find(m => m.id === user.id)) {
      setMentions(prev => [...prev, user])
    }
    
    setMentionQuery('')
    setMentionStartIndex(-1)
    inputRef.current?.focus()
  }

  const handleAttachClick = () => {
    setAttachMenu(prev => !prev)
  }

  const handleTakePhoto = () => {
    setAttachMenu(false)
    setShowCamera(true)
  }

  const handleChoosePhoto = () => {
    setAttachMenu(false)
    fileInputRef.current?.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (mediaFiles.length >= 4) return
      const reader = new FileReader()
      reader.onload = (ev) => setCropSrc(ev.target?.result as string)
      reader.readAsDataURL(file)
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const removeMedia = (index: number) => {
    URL.revokeObjectURL(mediaPreviews[index])
    setMediaFiles(prev => prev.filter((_, i) => i !== index))
    setMediaPreviews(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <>
      {/* Media Previews */}
      {mediaPreviews.length > 0 && (
        <div className={styles.mediaPreview}>
          {mediaPreviews.map((preview, i) => (
            <div key={i} className={styles.mediaPreviewItem}>
              <img src={preview} alt={`Attachment ${i + 1}`} />
              <button 
                className={styles.mediaPreviewRemove} 
                onClick={() => removeMedia(i)}
                type="button"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {showCamera && (
        <CameraCapture
          facingMode="environment"
          onClose={() => setShowCamera(false)}
          onCapture={({ file }) => {
            setShowCamera(false)
            if (mediaFiles.length >= 4) return
            const reader = new FileReader()
            reader.onload = (ev) => setCropSrc(ev.target?.result as string)
            reader.readAsDataURL(file)
          }}
        />
      )}

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspectRatio={1}
          onCancel={() => setCropSrc(null)}
          onCrop={(file) => {
            setCropSrc(null)
            const newFiles = [...mediaFiles, file].slice(0, 4)
            setMediaFiles(newFiles)
            const previews = newFiles.map(f => URL.createObjectURL(f))
            setMediaPreviews(previews)
          }}
        />
      )}

      <form className={styles.composeForm} onSubmit={handleSubmit}>
        {/* Hidden file inputs — one for camera, one for gallery */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        
        <div style={{ position: 'relative' }}>
          <button 
            type="button" 
            className={styles.attachBtn}
            aria-label="Attach Photo"
            onClick={handleAttachClick}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </button>
          
          {attachMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setAttachMenu(false)} />
              <div className={styles.attachPopup}>
                <button type="button" className={styles.attachOption} onClick={handleTakePhoto}>
                  📸 Take Photo
                </button>
                <button type="button" className={styles.attachOption} onClick={handleChoosePhoto}>
                  🖼️ Photo Library
                </button>
              </div>
            </>
          )}
        </div>
        
        <textarea
          ref={inputRef}
          className={styles.composeInput}
          placeholder="Message your neighbors... try @CasaBot for garden tips!"
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={isSending || !userId}
          rows={1}
        />
        
        {h3Index && mentionQuery && (
          <MentionPicker 
            query={mentionQuery} 
            h3Index={h3Index} 
            onSelect={handleMentionSelect} 
          />
        )}
        
        <button 
          type="submit" 
          className={styles.sendBtn}
          disabled={(!content.trim() && mediaFiles.length === 0) || isSending || !userId}
          aria-label="Send Message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    </>
  )
}
