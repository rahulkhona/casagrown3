import { Metadata } from 'next'
import ClientPage from './ClientPage'

export const metadata: Metadata = {
  title: 'Buzz | CasaGrown',
  description: 'Connect with your neighbors, trade produce, and grow your local community.',
}

export default function CommunityChatPage() {
  return <ClientPage />
}
