'use client'

import { HomeScreen } from '@casagrown/app/features/home/screen'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  return <HomeScreen onLinkPress={() => router.push('/login')} heroImageSrc="/hero.jpg" logoSrc="/logo.png" />
}
