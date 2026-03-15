'use client'

import { MarketProvider } from '../../lib/store'
import { Navbar } from '../components/Navbar'
import { BottomNav } from '../components/BottomNav'
import { RatingReminder } from '../components/RatingReminder'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <Navbar />
      <main className="page-wrapper">
        {children}
      </main>
      <BottomNav />
      <RatingReminder />
    </MarketProvider>
  )
}
