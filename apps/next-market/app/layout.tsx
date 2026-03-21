import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3002'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${host}`

  return {
    metadataBase: new URL(siteUrl),
    title: 'CasaGrown Market — Fresh from Neighbors\' Backyard',
    description: 'Buy and sell fresh, locally-grown produce from your neighbors. Market opens Saturdays & Sundays 8–11 AM.',
    icons: '/favicon.ico',
    openGraph: {
      title: 'CasaGrown Market — Fresh from Your Neighbor\'s Backyard',
      description: '11.5 billion lbs of backyard produce is wasted every year. Join CasaGrown to stop the waste — buy and sell fresh, homegrown produce with your neighbors.',
      siteName: 'CasaGrown Market',
      type: 'website',
      images: [{ url: '/og-share.jpg', width: 1200, height: 630, alt: 'CasaGrown — Incredible Freshness, Stop Food Waste, Beat Inflation, Teen Opportunity' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'CasaGrown Market — Fresh from Your Neighbor\'s Backyard',
      description: 'Over 11.5 billion lbs of backyard produce goes to waste every year. Join the movement!',
      images: ['/og-share.jpg'],
    },
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CasaGrown Market" />
        <meta name="theme-color" content="#16a34a" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Service Worker registration for Web Push */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function(err) {
                console.log('[SW] Registration failed:', err);
              });
            });
          }
        ` }} />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}

/* rebuilt Wed Mar 18 22:47:20 PDT 2026 */
