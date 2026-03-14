'use client'

import { MarketProvider } from '../../lib/store'
import { Navbar } from '../components/Navbar'
import { BottomNav } from '../components/BottomNav'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <Navbar />
      <main className="page-wrapper">
        {children}
      </main>
      <BottomNav />
    </MarketProvider>
  )
}
