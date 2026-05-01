import React from 'react'
import ProductListingWizard from '../../components/wizard/ProductListingWizard'

export const metadata = {
  title: 'Start Selling on CasaGrown',
  description: 'Join your neighborhood market and start selling fresh produce today.',
}

export default function SellPage() {
  return (
    <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading wizard...</div>}>
        <ProductListingWizard />
      </React.Suspense>
    </div>
  )
}
