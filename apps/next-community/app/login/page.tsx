'use client'

import { LoginScreen } from '@casagrown/app/features/auth/login-screen'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  return (
    <LoginScreen 
      logoSrc="/logo.png"
      onBack={() => router.back()}
    />
  )
}
