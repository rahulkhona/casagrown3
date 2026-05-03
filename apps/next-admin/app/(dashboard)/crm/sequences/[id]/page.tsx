'use client'

import dynamic from 'next/dynamic'
import { use } from 'react'

const SequenceBuilder = dynamic(
  () => import('../../../../../components/SequenceBuilder'),
  { ssr: false }
)

export default function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params)

  return (
    <div style={{ margin: '-24px', height: 'calc(100vh - 64px)' }}>
      <SequenceBuilder sequenceId={unwrappedParams.id} />
    </div>
  )
}
