'use client'
import { useState } from 'react'
import { useErrorToast } from '../../../components/ErrorToast'
import styles from '../page.module.css'
import SocialShareModal from '../../../components/SocialShareModal'
import { getCommunityInviteMessage } from '../../../../lib/shareMessages'

interface InviteBannerProps {
  h3Index: string
}

export default function InviteBanner({ h3Index }: InviteBannerProps) {
  const [showShareModal, setShowShareModal] = useState(false)
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/community?join=${h3Index}` : ''

  const handleInvite = () => {
    setShowShareModal(true)
  }

  return (
    <div className={styles.inviteBanner}>
      <div className={styles.inviteContent}>
        <span className={styles.inviteIcon}>🏘️</span>
        <div className={styles.inviteText}>
          <strong>Invite your neighbors</strong>
          <p>Everything's better with friends and neighbors</p>
        </div>
      </div>
      <button className={styles.inviteBtn} onClick={handleInvite}>
        Invite
      </button>

      {showShareModal && (
        <SocialShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          title="Invite Neighbors"
          subtitle="Share the community with your neighborhood."
          shareUrl={inviteUrl}
          shareMessage={getCommunityInviteMessage()}
          entityName="Community Invite"
        />
      )}
    </div>
  )
}
