'use client'

import { useSearchParams } from 'next/navigation'
import { FeedbackSubmitScreen } from '@casagrown/app/features/feedback/FeedbackSubmitScreen'

export default function FeedbackSubmitPage() {
  const searchParams = useSearchParams()
  const type = searchParams.get('type') as 'bug' | 'feature' | 'support' | null
  return <FeedbackSubmitScreen initialType={type || undefined} />
}
