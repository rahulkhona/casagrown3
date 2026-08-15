import React from 'react'
import type { Metadata } from 'next'
import ExperimentWrapper from './ExperimentWrapper'
import { extractBaseProduce, getProduceImage } from '../../../lib/produceCatalog'

const MARKET_BASE_URL = 
  process.env.NEXT_PUBLIC_APP_URL || 
  (typeof window !== 'undefined' && window.location.hostname.includes('staging') 
    ? 'https://market-staging.casagrown.com' 
    : 'https://casagrown.com')

function resolveImageUrl(url?: string): string {
  if (!url) return `${MARKET_BASE_URL}/og-create-listing.png`
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${MARKET_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}): Promise<Metadata> {
  const params = await searchParams
  const rawProduce = typeof params?.produce === 'string' ? params.produce : undefined
  const rawZip = typeof params?.zip === 'string' ? params.zip : undefined

  if (rawProduce) {
    const base = extractBaseProduce(rawProduce)
    const produceName = base.name || rawProduce.replace(/_/g, ' ')
    const produceImage = resolveImageUrl(getProduceImage(produceName))
    const locStr = rawZip ? ` in ${rawZip}` : ''

    const title = `Sell Your Backyard ${produceName}${locStr} | CasaGrown`
    const description = `Have extra ${produceName} growing in your garden? Easily list your homegrown harvest for sale, earn extra cash, and share fresh food with neighbors.`

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        url: `/create-listing?produce=${encodeURIComponent(rawProduce)}${rawZip ? `&zip=${rawZip}` : ''}`,
        images: [
          {
            url: produceImage,
            width: 1200,
            height: 630,
            alt: `Sell Backyard ${produceName} on CasaGrown`,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [produceImage],
      },
    }
  }

  const defaultTitle = 'Sell Your Backyard Produce | CasaGrown'
  const defaultDesc = 'Have extra fruits, vegetables, or herbs growing in your garden? Easily list your homegrown harvest for sale, earn extra cash, and share fresh food with your neighbors.'
  const defaultOgImage = `${MARKET_BASE_URL}/og-create-listing.png`

  return {
    title: defaultTitle,
    description: defaultDesc,
    openGraph: {
      title: defaultTitle,
      description: defaultDesc,
      type: 'website',
      url: '/create-listing',
      images: [
        {
          url: defaultOgImage,
          width: 1200,
          height: 630,
          alt: 'Sell Your Homegrown Produce — CasaGrown',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: defaultTitle,
      description: defaultDesc,
      images: [defaultOgImage],
    },
  }
}

export default function SellPage() {
  return (
    <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100%', overflowX: 'hidden' }}>
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading wizard...</div>}>
        <ExperimentWrapper />
      </React.Suspense>
    </div>
  )
}
