'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const AUDIOGO_PIXEL_URL =
  'https://us-47955-adswizz.attribution.adswizz.com/fire?pixelId=04247d1f-aa7c-4d97-981e-ebc0a9b84a10&type=sitevisit&subtype=PageVisit1&aw_0_req.gdpr=true&redirectURL=aHR0cHM6Ly9waXhlbC50YXBhZC5jb20vaWRzeW5jL2V4L3JlY2VpdmU_cGFydG5lcl9pZD0yOTk0JjwjaWYgcmVxdWVzdC5saXN0ZW5lcklkP21hdGNoZXMoJ1swLTlhLWZdezh9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezEyfScpPnBhcnRuZXJfdHlwZWRfZGlkPSU3QiUyMkhBUkRXQVJFX0FORFJPSURfQURfSUQlMjIlM0ElMjIke3JlcXVlc3QubGlzdGVuZXJJZH0lMjIlN0Q8I2Vsc2VpZiByZXF1ZXN0Lmxpc3RlbmVySWQ_bWF0Y2hlcygnWzAtOUEtRl17OH0tWzAtOUEtRl17NH0tWzAtOUEtRl17NH0tWzAtOUEtRl17MTJ9Jyk-cGFydG5lcl90eXBlZF9kaWQ9JTdCJTIySEFSRFdBUkVfSURGQSUyMiUzQSUyMiR7cmVxdWVzdC5saXN0ZW5lcklkfSUyMiU3RDwjZWxzZT5wYXJ0bmVyX2RldmljZV9pZD0ke3JlcXVlc3QubGlzdGVuZXJJZCF9PC8jaWY-'

export function AudioGoPixel() {
  const pathname = usePathname()
  const isFirstRender = useRef(true)
  const [pixelKey, setPixelKey] = useState(0)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setPixelKey((prev) => prev + 1)
  }, [pathname])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={pixelKey}
      src={`${AUDIOGO_PIXEL_URL}&_ts=${Date.now()}`}
      alt=""
      height="0"
      width="0"
      style={{ display: 'none', visibility: 'hidden' }}
    />
  )
}
