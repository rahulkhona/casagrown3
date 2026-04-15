import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CasaGrown — Fresh Produce from Your Neighbors',
  description: 'Buy and sell fresh, locally-grown produce from your neighbors. Join a community stopping 11.5 billion lbs of garden food waste every year.',
  openGraph: {
    title: 'CasaGrown — Fresh Produce from Your Neighbors',
    description: 'Join thousands of growers and buyers sharing fresh, local food.',
    type: 'website',
  },
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return children
}
