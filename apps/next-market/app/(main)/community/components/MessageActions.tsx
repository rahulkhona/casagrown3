'use client'
import { useState, useRef, useEffect } from 'react'
import styles from '../page.module.css'

interface MessageActionsProps {
  messageId: string
  isOwnMessage: boolean
  messageText: string
  onDelete: () => void
  onFlag: () => void
  onReact: (emoji: string) => void
  onReply?: () => void
  emojis: string[]
  onClose: () => void
}

export default function MessageActions({ isOwnMessage, messageText, onDelete, onFlag, onReact, onReply, emojis, onClose }: MessageActionsProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const handleShare = async () => {
    onClose()
    const truncated = messageText.length > 200 ? messageText.slice(0, 200) + '…' : messageText
    const shareText = `💬 From CasaGrown Buzz:\n\n"${truncated}"\n\nJoin the neighborhood chat 👇`
    const shareData = {
      title: 'CasaGrown Buzz — Neighborhood Chat',
      text: shareText,
      url: `${window.location.origin}/login?redirect=${encodeURIComponent('/community')}`,
    }
    if (navigator.share) {
      try {
        await navigator.share(shareData)
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(shareText)
    } catch {}
  }

  return (
    <div className={styles.actionsPopover} ref={menuRef}>
      {/* Quick emoji row */}
      <div className={styles.quickReactions}>
        {emojis.map(emoji => (
          <button key={emoji} onClick={() => onReact(emoji)} className={styles.quickEmojiBtn}>
            {emoji}
          </button>
        ))}
      </div>
      
      {/* Action items */}
      <div className={styles.actionsList}>
        {onReply && (
          <button className={styles.menuItem} onClick={onReply}>
            <span className="material-symbols-outlined">reply</span>
            Reply
          </button>
        )}
        <button className={styles.menuItem} onClick={handleShare}>
          <span className="material-symbols-outlined">share</span>
          Share
        </button>
        {isOwnMessage ? (
          <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={onDelete}>
            <span className="material-symbols-outlined">delete</span>
            Delete
          </button>
        ) : (
          <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={onFlag}>
            <span className="material-symbols-outlined">flag</span>
            Report
          </button>
        )}
      </div>
    </div>
  )
}
