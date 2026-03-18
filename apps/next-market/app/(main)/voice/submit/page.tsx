'use client'


import { useState, useEffect, useRef , Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { createTicket, type FeedbackType } from '../../../../lib/feedback-service'
import styles from '../voice.module.css'

const TYPE_MAP: Record<string, FeedbackType> = {
  bug: 'bug_report', feature: 'feature_request', support: 'support_request',
}
const TITLES: Record<string, string> = {
  bug: 'Report a Bug', feature: 'Request a Feature', support: 'Support Request',
}
const SUBTITLES: Record<string, string> = {
  bug: 'Tell us what went wrong so we can fix it.',
  feature: 'Suggest an improvement or new feature.',
  support: 'Get help from the CasaGrown team.',
}

function VoiceSubmitPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialType = searchParams.get('type') || ''

  const [userId, setUserId] = useState<string | null>(null)
  const [type, setType] = useState<'bug' | 'feature' | 'support'>(
    (initialType as any) || 'bug'
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login?redirect=/voice/submit?type=' + type); return }
      setUserId(user.id)
    })
  }, [router, type])

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || [])
    setFiles(prev => [...prev, ...newFiles])
    newFiles.forEach(f => {
      if (f.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = ev => setPreviews(prev => [...prev, ev.target?.result as string])
        reader.readAsDataURL(f)
      }
    })
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !userId) return
    setLoading(true)
    const result = await createTicket({
      title: title.trim(),
      description: description.trim(),
      type: TYPE_MAP[type] || 'bug_report',
      authorId: userId,
      files,
    })
    setLoading(false)
    if (result) router.push('/voice/board')
  }

  return (
    <div className={styles.voicePage}>
      <button className={styles.backLink} onClick={() => router.back()}>← Cancel</button>

      <div className={styles.voiceHeader} style={{ marginBottom: 24 }}>
        <h1>{TITLES[type] || 'Submit Feedback'}</h1>
        <p>{SUBTITLES[type] || 'Found a bug? Have a great idea? Need help? Let us know!'}</p>
      </div>

      <div className={styles.submitCard}>
        {/* Type Selector */}
        {!initialType && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Feedback Type</label>
            <div className={styles.typeSelector}>
              <button className={`${styles.typeOption} ${type === 'bug' ? styles.selected : ''}`} onClick={() => setType('bug')}>
                <span className={styles.typeIcon}>🐛</span>
                <span className={styles.typeName}>Bug Report</span>
              </button>
              <button className={`${styles.typeOption} ${type === 'feature' ? styles.selected : ''}`} onClick={() => setType('feature')}>
                <span className={styles.typeIcon}>💡</span>
                <span className={styles.typeName}>Feature Request</span>
              </button>
              <button className={`${styles.typeOption} ${type === 'support' ? styles.selected : ''}`} onClick={() => setType('support')}>
                <span className={styles.typeIcon}>🎧</span>
                <span className={styles.typeName}>Support</span>
              </button>
            </div>
            {type === 'support' && (
              <div className={styles.privateNotice}>🔒 This ticket is private — only you and CasaGrown staff can see it.</div>
            )}
          </div>
        )}

        {initialType === 'support' && (
          <div className={styles.privateNotice} style={{ marginBottom: 16 }}>
            🔒 This ticket is private — only you and CasaGrown staff can see it.
          </div>
        )}

        {/* Title */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Title</label>
          <input
            className={styles.formInput}
            placeholder="Short summary..."
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        {/* Description */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Description</label>
          <textarea
            className={styles.formTextarea}
            placeholder="Describe the issue or idea in detail..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {/* File Upload */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Screenshots (optional)</label>
          {previews.length > 0 && (
            <div className={styles.filePreviewRow}>
              {previews.map((src, i) => (
                <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={src} className={styles.filePreviewThumb} alt="Preview" />
                  <button className={styles.fileRemoveBtn} onClick={() => removeFile(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div className={styles.fileUploadArea} onClick={() => fileInputRef.current?.click()}>
            <div className={styles.fileUploadLabel}>📷 Click to add images</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFiles}
            />
          </div>
        </div>

        {/* Submit */}
        <button
          className={styles.submitBtn}
          disabled={loading || !title.trim() || !description.trim()}
          onClick={handleSubmit}
        >
          {loading ? 'Submitting...' : `Submit ${type === 'bug' ? 'Bug Report' : type === 'feature' ? 'Feature Request' : 'Support Request'}`}
        </button>
      </div>
    </div>
  )
}

export default function VoiceSubmitPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <VoiceSubmitPageInner />
    </Suspense>
  )
}
