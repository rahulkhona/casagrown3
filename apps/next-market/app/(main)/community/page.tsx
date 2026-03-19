import { Metadata } from 'next'
import ClientPage from './ClientPage'

export const metadata: Metadata = {
  title: 'Buzz | CasaGrown',
  description: 'Connect with your neighbors, trade produce, and grow your local community.',
  openGraph: {
    title: 'CasaGrown Buzz — Neighborhood Community Chat',
    description: 'Connect with neighbors, share gardening tips, and trade homegrown produce.',
    images: [{ url: '/icon-192.png', width: 192, height: 192, alt: 'CasaGrown' }],
  },
}

export default function CommunityChatPage() {
  return <ClientPage />
}
