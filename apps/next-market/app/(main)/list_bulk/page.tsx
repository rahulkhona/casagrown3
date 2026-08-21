import React, { Suspense } from 'react'
import { Metadata } from 'next'
import BulkListingClient from './BulkListingClient'
import { parseProduceParams } from '../../../lib/bulkListingUtils'
import { extractBaseProduce, getProduceImage } from '../../../lib/produceCatalog'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const resolvedParams = await searchParams
  const rawProduce = resolvedParams.produce || resolvedParams.items
  const produceList = parseProduceParams(rawProduce)

  let title = 'List Your Produce in Bulk — Free Backyard Stand Setup | CasaGrown'
  let description =
    'Quickly list fresh produce from your garden in seconds. Set your prices, choose delivery or pickup, and connect with neighbors on CasaGrown.'

  if (produceList.length > 0) {
    const namesString = produceList.slice(0, 3).join(', ')
    title = `List ${namesString} & More — CasaGrown Market`
    description = `Sell or share your harvest (${produceList.join(', ')}). Free to list, delivery and pickup options available.`
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: '/list_bulk',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default function BulkListingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading bulk listing form...</div>}>
      <BulkListingClient />
    </Suspense>
  )
}
