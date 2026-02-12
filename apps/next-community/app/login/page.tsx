'use client'

import { Suspense } from 'react'
import { LoginScreen } from '@casagrown/app/features/auth/login-screen'
import { useRouter, useSearchParams } from 'next/navigation'
import { Spinner } from 'tamagui'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const referralCode = searchParams.get('ref') || undefined
  const delegationCode = searchParams.get('delegate') || undefined
  const returnTo = searchParams.get('returnTo')

  // Store returnTo so login-success can redirect back
  if (typeof window !== 'undefined' && returnTo) {
    sessionStorage.setItem('casagrown_returnTo', returnTo)
  }

  return (
    <LoginScreen 
      logoSrc="/logo.png"
      onBack={() => router.back()}
      referralCode={referralCode}
      delegationCode={delegationCode}
    />
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LoginPageContent />
    </Suspense>
  )
}
