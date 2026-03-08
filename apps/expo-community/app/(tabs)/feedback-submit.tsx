import { useLocalSearchParams } from 'expo-router'
import { FeedbackSubmitScreen } from '@casagrown/app/features/feedback/FeedbackSubmitScreen'

export default function FeedbackSubmitPage() {
  const { type } = useLocalSearchParams<{ type?: string }>()
  const initialType = type === 'feature' ? 'feature' : type === 'support' ? 'support' : 'bug'
  return <FeedbackSubmitScreen initialType={initialType} />
}
