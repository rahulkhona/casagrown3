import React from 'react'
import ProductListingWizard from '../../components/wizard/ProductListingWizard'

export const metadata = {
  title: 'Sell Your Backyard Produce | CasaGrown',
  description: 'Have extra fruits, vegetables, or herbs growing in your garden? Easily list your homegrown harvest for sale, earn extra cash, and share fresh food with your neighbors.',
  openGraph: {
    title: 'Sell Your Backyard Produce | CasaGrown',
    description: 'Have extra fruits, vegetables, or herbs growing in your garden? Easily list your homegrown harvest for sale, earn extra cash, and share fresh food with your neighbors.',
    type: 'website',
    url: '/create-listing',
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
    description: 'Have extra fruits, vegetables, or herbs growing in your garden? Easily list your homegrown harvest for sale, earn extra cash, and share fresh food with your neighbors.',
    images: ['/og-create-listing.png'],
  },
}

export default function SellPage() {
  return (
    <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100%', overflowX: 'hidden' }}>
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading wizard...</div>}>
        <ProductListingWizard />
      </React.Suspense>
    </div>
  )
}
