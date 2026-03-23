import type { Metadata } from 'next'
import Script from 'next/script'

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
  const PIXEL_ID = '1274538794819292'
  return (
    <>
      {/* Meta Pixel base code */}
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${PIXEL_ID}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        <img
          height="1" width="1" style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
      {children}
    </>
  )
}
