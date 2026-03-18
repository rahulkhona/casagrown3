'use client'
import styles from '../page.module.css'

export default function NewMessagesBadge({ count, onClick }: { count: number, onClick: () => void }) {
  if (count <= 0) return null

  return (
    <div className={styles.badgeWrapper}>
      <button className={styles.newMessagesBadge} onClick={onClick}>
        <span>↓</span>
        {count} new message{count > 1 ? 's' : ''}
      </button>
    </div>
  )
}
