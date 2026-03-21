import { Metadata } from 'next'
import ClientPage from './ClientPage'

export const metadata: Metadata = {
  title: 'Buzz | CasaGrown',
  description: 'Connect with your neighbors, trade produce, and grow your local community.',
  openGraph: {
    title: 'CasaGrown Buzz — Neighborhood Community Chat',
    description: 'Connect with neighbors, share gardening tips, and trade homegrown produce.',
    images: [{ url: '/og-share.jpg', width: 1200, height: 630, alt: 'CasaGrown Buzz — Neighborhood Chat' }],
  },
}

export default function CommunityChatPage() {
  return <ClientPage />
}
