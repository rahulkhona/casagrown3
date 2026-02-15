/**
 * NativeVideoPreview — Native implementation using expo-video
 *
 * Renders an inline video player with native controls for
 * video asset previews in the create-post form.
 */

import React from 'react'
import { useVideoPlayer, VideoView } from 'expo-video'

export function NativeVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false
    p.muted = false
  })

  return (
    <VideoView
      player={player}
      style={{ width: 140, height: 140, borderRadius: 8 }}
      contentFit="cover"
      nativeControls
    />
  )
}
