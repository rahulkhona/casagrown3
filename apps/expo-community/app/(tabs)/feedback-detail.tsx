import { useLocalSearchParams } from 'expo-router'
import { FeedbackDetailScreen } from '@casagrown/app/features/feedback/FeedbackDetailScreen'

export default function FeedbackDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  if (!id) return null
  return <FeedbackDetailScreen id={id} />
}
