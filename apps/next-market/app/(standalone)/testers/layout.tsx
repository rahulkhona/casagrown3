import type { Metadata } from 'next'

const BASE_URL = 'https://casagrown.com'

export const metadata: Metadata = {
  title: 'Join CasaGrown Beta — Be an Early Tester',
  description: 'Sign up to be an early tester for CasaGrown, the neighborhood backyard marketplace. Fresh produce and homemade goods from your neighbors\' gardens.',
  openGraph: {
    title: 'Join CasaGrown Beta — Be an Early Tester',
    description: 'Sign up to be an early tester for CasaGrown, the neighborhood backyard marketplace.',
    url: `${BASE_URL}/testers`,
    siteName: 'CasaGrown',
    type: 'website',
    images: [
      {
        url: `${BASE_URL}/og-testers.png`,
        width: 1200,
        height: 630,
        alt: 'Join CasaGrown Beta — Fresh from your neighbors\' backyard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Join CasaGrown Beta — Be an Early Tester',
    description: 'Sign up to be an early tester for CasaGrown, the neighborhood backyard marketplace.',
    images: [`${BASE_URL}/og-share.png`],
  },
}

export default function TestersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
