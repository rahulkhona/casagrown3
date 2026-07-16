import React from 'react'
import SimpleListingEntry from '../../components/simple-wizard/SimpleListingEntry'


export const metadata = {
  title: 'Quick Listing — Sell Your Backyard Produce | CasaGrown',
  description: "Describe what you want to sell in your own words and we'll create your listing. Upload photos, set your price, and start selling to neighbors in minutes.",
  openGraph: {
    title: 'Quick Listing — Sell Your Backyard Produce | CasaGrown',
    description: "Describe what you want to sell in your own words and we'll create your listing. Upload photos, set your price, and start selling to neighbors in minutes.",
    type: 'website',
    url: '/create-listing-simple',
    images: [
      {
        url: '/og-create-listing.png',
        width: 1200,
        height: 630,
        alt: 'Sell Your Homegrown Produce — CasaGrown',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Quick Listing — Sell Your Backyard Produce | CasaGrown',
    description: "Describe what you want to sell in your own words and we'll create your listing.",
    images: ['/og-create-listing.png'],
  },
}

export default function CreateListingSimplePage() {
  return (
    <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100%', overflowX: 'hidden' }}>
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>}>
        <SimpleListingEntry />
      </React.Suspense>
    </div>
  )
}
