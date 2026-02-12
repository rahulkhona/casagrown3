/**
 * FeedVideoPlayer — Web implementation using HTML5 <video>.
 * Shows first frame via #t=0.5, inline playback with native browser controls.
 */

import React from 'react'

interface FeedVideoPlayerProps {
  uri: string
}

export function FeedVideoPlayer({ uri }: FeedVideoPlayerProps) {
  return (
    <div style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#1a1a1a', overflow: 'hidden' }}>
      {/* @ts-ignore — web-only element */}
      <video
        src={`${uri}#t=0.5`}
        controls
        preload="metadata"
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  )
}
