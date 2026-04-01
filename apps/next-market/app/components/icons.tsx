/**
 * Standardized action icons for sharing, inviting, and copying.
 * 
 * Convention:
 *   ShareIcon     — 3-dots-connected (standard share)  → general sharing
 *   PersonPlusIcon — person with +                      → helper/booth invites
 *   📣            — bullhorn emoji                      → invite neighbors (keep emoji)
 *   📋            — clipboard emoji                     → copy to clipboard (keep emoji)
 *   🔗            — link emoji                          → copy URL only (keep emoji)
 */

interface IconProps {
  size?: number
  color?: string
  style?: React.CSSProperties
}

/** Standard share icon: 3 dots connected by 2 lines in a triangle */
export function ShareIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}

/** Person with + icon: for helper/booth invites */
export function PersonPlusIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  )
}
