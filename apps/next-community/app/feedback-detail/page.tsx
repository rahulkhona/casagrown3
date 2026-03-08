'use client'

import { useSearchParams } from 'next/navigation'
import { FeedbackDetailScreen } from '@casagrown/app/features/feedback/FeedbackDetailScreen'

export default function FeedbackDetailPage() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id') ?? ''
  return <FeedbackDetailScreen id={id} />
}
