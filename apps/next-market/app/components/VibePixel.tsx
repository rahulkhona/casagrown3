'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'

const PIXEL_ID = process.env.NEXT_PUBLIC_VIBE_PIXEL_ID || 'XtJC92'

export function VibePixel() {
  const pathname = usePathname()
  const isFirstRender = useRef(true)

  useEffect(() => {
    // Avoid double pageview on initial load since inline script handles it
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (typeof window !== 'undefined' && (window as any).vbpx) {
      ;(window as any).vbpx('event', 'page_view')
    }
  }, [pathname])

  return (
    <Script
      id="vibe-pixel"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          !function(v,i,b,e,c,o){if(!v[c]){var s=v[c]=function(){s.process?s.process.apply(s,arguments):s.queue.push(arguments)};s.queue=[],s.b=1*new Date;var t=i.createElement(b);t.async=!0,t.src=e;var n=i.getElementsByTagName(b)[0];n.parentNode.insertBefore(t,n)}}(window,document,"script","https://s.vibe.co/vbpx.js","vbpx");
          vbpx('init','${PIXEL_ID}');
          vbpx('event', 'page_view');
        `,
      }}
    />
  )
}
