'use client'

import { FeedbackDetail } from '../../../features/feedback/feedback-detail'
import { useParams } from 'next/navigation'

export default function Page() {
  const params = useParams()
  return <FeedbackDetail id={params.id as string} />
}
