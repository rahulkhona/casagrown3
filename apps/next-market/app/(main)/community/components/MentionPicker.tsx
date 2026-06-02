import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../../lib/supabase'
import styles from '../page.module.css'

interface MentionPickerProps {
  query: string
  onSelect: (user: { id: string, name: string }) => void
  h3Index: string
}

export default function MentionPicker({ query, onSelect, h3Index }: MentionPickerProps) {
  const [users, setUsers] = useState<{id: string, name: string, avatar: string | null}[]>([])
  const [loading, setLoading] = useState(false)
  
  useEffect(() => {
    if (!query || query.length < 1) {
      setUsers([])
      return
    }
    
    const searchUsers = async () => {
      setLoading(true)
      const supabase = createClient()
      
      // Look for users in the same community matching the query
      // For privacy, we only search by name prefix
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('home_community_h3_index', h3Index)
        .is('closure_status', null)
        .ilike('full_name', `${query}%`)
        .limit(5)
        
      if (!error && data) {
        setUsers(data.map((d: any) => ({
          id: d.id,
          name: d.full_name || 'Neighbor',
          avatar: d.avatar_url
        })))
      }
      setLoading(false)
    }
    
    // Debounce
    const timer = setTimeout(searchUsers, 300)
    return () => clearTimeout(timer)
  }, [query, h3Index])

  if (!query || (users.length === 0 && !loading)) return null

  return (
    <div className={styles.mentionPicker}>
      {loading ? (
        <div className={styles.mentionItem}>Searching...</div>
      ) : (
        users.map(user => (
          <button 
            key={user.id} 
            className={styles.mentionItem}
            onClick={() => onSelect(user)}
          >
            <div className={styles.mentionAvatar}>
              {user.avatar ? (
                <img src={user.avatar} alt="" />
              ) : (
                <span>{user.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <span>{user.name}</span>
          </button>
        ))
      )}
    </div>
  )
}
