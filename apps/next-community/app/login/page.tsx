'use client'

import { LoginScreen } from '@casagrown/app/features/auth/login-screen'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  return (
    <LoginScreen 
      logoSrc="/logo.png"
      onBack={() => router.back()} // Or router.push('/')
      onLogin={(email, name) => {
        console.log('Login attempt:', email, name)
        alert(`Login logic not implemented yet.\nUser: ${name}\nEmail: ${email}`)
      }}
    />
  )
}
