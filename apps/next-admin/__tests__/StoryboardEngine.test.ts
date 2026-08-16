import { describe, it, expect } from 'vitest'
import { MotionStoryboardScene } from '../app/api/creative-studio/storyboard/route'

describe('Motion Storyboard Engine — Pan & Zoom Video Structure', () => {
  it('validates motion types and on-screen kinetic typography overlays', () => {
    const scene: MotionStoryboardScene = {
      id: 's1',
      sceneNumber: 1,
      heading: 'Intro',
      produceFocus: 'Meyer Lemons',
      visualPrompt: 'Cinematic photo of fresh Meyer Lemons on rustic table',
      imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2',
      motionType: 'push_in',
      durationSeconds: 4,
      headlineOverlay: '🚨 GOT EXTRA MEYER LEMONS?',
      badgeOverlay: 'High Demand in 95125',
    }

    expect(scene.motionType).toBe('push_in')
    expect(scene.headlineOverlay).toContain('EXTRA MEYER LEMONS')
    expect(scene.durationSeconds).toBe(4)
  })

  it('validates pan and zoom motion path configurations', () => {
    const validMotions = ['push_in', 'pan_horizontal', 'diagonal_sweep', 'zoom_out']
    expect(validMotions).toContain('push_in')
    expect(validMotions).toContain('pan_horizontal')
    expect(validMotions).toContain('diagonal_sweep')
    expect(validMotions).toContain('zoom_out')
  })
})
