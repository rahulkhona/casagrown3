'use client'

import { LoginScreen } from '@casagrown/app/features/auth/login-screen'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const referralCode = searchParams.get('ref') || undefined

  return (
    <LoginScreen 
      logoSrc="/logo.png"
      onBack={() => router.back()}
      referralCode={referralCode}
    />
  )
}
