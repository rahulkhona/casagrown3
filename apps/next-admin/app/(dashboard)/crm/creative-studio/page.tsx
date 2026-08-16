'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AntigravityCreativeWorkspace from '../../../../components/AntigravityCreativeWorkspace'

function CreativeStudioContent() {
  const searchParams = useSearchParams()
  const sourceParam = searchParams.get('source')
  const produceParam = searchParams.get('produce')
  const tabParam = searchParams.get('tab')

  const initialTab: 'photos' | 'storyboard' | 'video' =
    tabParam === 'video' || sourceParam === 'video'
      ? 'video'
      : tabParam === 'storyboard'
      ? 'storyboard'
      : 'photos'

  const initialProduceContext = produceParam
    ? produceParam.split(',').map(s => s.trim()).filter(Boolean)
    : ['Meyer Lemons', 'Heirloom Tomatoes', 'Haas Avocados', 'Fresh Basil']

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <AntigravityCreativeWorkspace
        initialProduceContext={initialProduceContext}
        initialTab={initialTab}
      />
    </div>
  )
}

export default function CreativeStudioPage() {
  return (
    <Suspense fallback={<div style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>Loading Creative Studio Workspace...</div>}>
      <CreativeStudioContent />
    </Suspense>
  )
}
