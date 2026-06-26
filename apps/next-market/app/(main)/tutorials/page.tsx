'use client'

import { useEffect, useState } from 'react'
import LinkComponent from 'next/link'
import { createClient } from '../../../lib/supabase'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import styles from './page.module.css'

interface TutorialSection {
  id: string
  title: string
  description: string
  video_url: string
  sort_order: number
  is_published: boolean
}

// Extract YouTube ID and return the no-cookie embed URL
function getYoutubeEmbedUrl(url: string) {
  if (!url) return ''
  
  // Regular expressions to match YouTube IDs from standard watch, share, embed, and shorts formats
  const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i
  const match = url.match(ytRegex)
  
  if (match && match[1]) {
    return `https://www.youtube-nocookie.com/embed/${match[1]}?rel=0&modestbranding=1&playsinline=1`
  }
  
  return url // Fallback
}

// Client-side aspect ratio detection
function getAspectRatio(url: string) {
  if (!url) return '16:9'
  if (url.includes('/shorts/') || url.includes('ratio=9:16')) {
    return '9:16'
  }
  return '16:9'
}

// Check if a URL is a direct video file (like .mp4 or .webm)
function isDirectVideoFile(url: string) {
  if (!url) return false
  const cleanUrl = url.split('?')[0].toLowerCase()
  return cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov') || cleanUrl.endsWith('.ogg')
}

export default function TutorialsPage() {
  const [tutorials, setTutorials] = useState<TutorialSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoplayId, setAutoplayId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('tutorial_sections')
      .select('id, title, description, video_url, sort_order, is_published')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) {
          console.error('[Tutorials] Error fetching tutorials:', error)
          setError('Failed to load tutorials. Please try again later.')
        } else {
          setTutorials(data || [])
        }
        setLoading(false)
      })
  }, [])

  // Detect hash anchor and scroll to + autoplay the targeted tutorial
  useEffect(() => {
    if (loading || tutorials.length === 0) return
    const hash = window.location.hash
    if (!hash || !hash.startsWith('#tutorial-section-')) return
    const targetId = hash.replace('#tutorial-section-', '')
    const targetEl = document.getElementById(`tutorial-section-${targetId}`)
    if (targetEl) {
      setAutoplayId(targetId)
      setTimeout(() => {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
    }
  }, [loading, tutorials])

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <LoadingSpinner />
        <p className={styles.loadingText}>Loading video tutorials...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <span className={styles.errorIcon}>⚠️</span>
        <h2 className={styles.errorTitle}>Oops! Something went wrong</h2>
        <p className={styles.errorText}>{error}</p>
        <LinkComponent href="/" className={styles.backHomeBtn}>
          Back to Home
        </LinkComponent>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* ──── Hero Header ──── */}
      <header className={styles.header}>
        <div className={styles.logoBrand}>
          <img src="/logo.png" alt="CasaGrown" className={styles.logoImg} />
          <span className={styles.brandBadge}>HELP &amp; RESOURCES</span>
        </div>
        <h1 className={styles.title}>Grower &amp; Buyer Tutorials&nbsp;🌱</h1>
        <p className={styles.subtitle}>
          Learn how to buy fresh produce, manage your garden stands, set up payouts, and make the most of your CasaGrown local community.
        </p>
      </header>

      {/* ──── Main Content List ──── */}
      {tutorials.length === 0 ? (
        <div className={styles.emptyContainer}>
          <div className={styles.emptyIcon}>🎥</div>
          <h3>Tutorials coming soon!</h3>
          <p>Our team is currently preparing walkthrough videos. Check back shortly.</p>
          <LinkComponent href="/" className={styles.backHomeBtn}>
            Back to Home
          </LinkComponent>
        </div>
      ) : (
        <div className={styles.list}>
          {tutorials.map((item, index) => {
            let embedUrl = getYoutubeEmbedUrl(item.video_url)
            const ratio = getAspectRatio(item.video_url)
            const isLandscape = ratio === '16:9'
            const isDirectFile = isDirectVideoFile(item.video_url)
            const shouldAutoplay = autoplayId === item.id

            // Append autoplay param for the targeted video
            if (shouldAutoplay && embedUrl && !isDirectFile) {
              embedUrl += '&autoplay=1'
            }

            return (
              <section 
                key={item.id} 
                className={`${styles.section} ${isLandscape ? styles.landscapeSection : styles.portraitSection}`}
                id={`tutorial-section-${item.id}`}
              >
                {/* Visual player wrapper */}
                <div className={`${styles.videoWrapper} ${isLandscape ? styles.aspectLandscape : styles.aspectPortrait}`}>
                  {isDirectFile ? (
                    <video
                      src={item.video_url}
                      controls
                      playsInline
                      autoPlay={shouldAutoplay}
                      className={styles.iframe}
                    />
                  ) : (
                    <iframe
                      src={embedUrl}
                      title={item.title}
                      className={styles.iframe}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  )}
                </div>

                {/* Content description wrapper */}
                <div className={styles.content}>
                  <div className={styles.numberIndex}>0{index + 1}</div>
                  <h2 className={styles.sectionTitle}>{item.title}</h2>
                  <div 
                    className={styles.description} 
                    dangerouslySetInnerHTML={{ __html: item.description }} 
                  />
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
