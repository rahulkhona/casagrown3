'use client'
import { useState } from 'react'
import { useErrorToast } from '../../../components/ErrorToast'
import styles from '../page.module.css'

interface InviteBannerProps {
  h3Index: string
}

export default function InviteBanner({ h3Index }: InviteBannerProps) {
  const [copied, setCopied] = useState(false)
  const { showError, showSuccess } = useErrorToast()

  const handleInvite = async () => {
    const inviteUrl = `${window.location.origin}/community?join=${h3Index}`
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join CasaGrown',
          text: 'Come hang out with us on Buzz to discuss gardening related topics! 🐝',
          url: inviteUrl,
        })
        return
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing', err)
          showError('Failed to share link.')
        }
      }
    }
    
    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      showSuccess('Invite link copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy', err)
      showError('Failed to copy link.')
    }
  }

  return (
    <div className={styles.inviteBanner}>
      <div className={styles.inviteContent}>
        <span className={styles.inviteIcon}>🏘️</span>
        <div className={styles.inviteText}>
          <strong>Invite your neighbors</strong>
          <p>Grow your local community</p>
        </div>
      </div>
      <button className={styles.inviteBtn} onClick={handleInvite}>
        {copied ? 'Copied!' : 'Invite'}
      </button>
    </div>
  )
}
