'use client'
import { useState } from 'react'
import { useErrorToast } from '../../../components/ErrorToast'
import styles from '../page.module.css'
import SocialShareModal from '../../../components/SocialShareModal'
import { getCommunityInviteMessage } from '../../../../lib/shareMessages'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

interface InviteBannerProps {
  h3Index: string
  userId?: string
}

export default function InviteBanner({ h3Index, userId }: InviteBannerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const autoShare = searchParams?.get('share') === 'true'

  const [showShareModal, setShowShareModal] = useState(autoShare)
  const refParam = userId ? `?ref=${userId}` : ''
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/community${refParam}` : ''

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
          onClose={() => {
            setShowShareModal(false)
            if (autoShare) {
              const params = new URLSearchParams(searchParams?.toString())
              params.delete('share')
              router.replace(`${pathname}?${params.toString()}`, { scroll: false })
            }
          }}
          title="Invite Neighbors"
          subtitle="Share the community with your neighborhood."
          shareUrl={inviteUrl}
          shareMessage={getCommunityInviteMessage()}
          entityName="Community Invite"
          shareContext="community_invite"
          userId={userId}
        />
      )}
    </div>
  )
}

