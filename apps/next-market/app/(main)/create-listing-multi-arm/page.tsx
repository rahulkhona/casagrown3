import React from 'react'
import ExperimentWrapper from './ExperimentWrapper'

export const metadata = {
  title: 'Sell Your Backyard Produce | CasaGrown',
  description: "Describe what you want to sell or list it step-by-step. Upload photos, set your price, and start selling homegrown harvest to neighbors in minutes.",
  openGraph: {
    title: 'Sell Your Backyard Produce | CasaGrown',
    description: "Describe what you want to sell or list it step-by-step. Upload photos, set your price, and start selling homegrown harvest to neighbors in minutes.",
    type: 'website',
    url: '/create-listing-multi-arm',
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
    title: 'Sell Your Backyard Produce | CasaGrown',
    description: "Describe what you want to sell or list it step-by-step. Upload photos, set your price, and start selling homegrown harvest to neighbors in minutes.",
    images: ['/og-create-listing.png'],
  },
}

export default function CreateListingMultiArmPage() {
  return (
    <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100%', overflowX: 'hidden' }}>
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>}>
        <ExperimentWrapper />
      </React.Suspense>
    </div>
  )
}
