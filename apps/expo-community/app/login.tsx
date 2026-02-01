import { LoginScreen } from '@casagrown/app/features/auth/login-screen'
import { useRouter, Stack } from 'expo-router'

export default function Login() {
  const router = useRouter()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LoginScreen 
        logoSrc={require('../assets/logo.png')}
        onBack={() => router.back()}
        onLogin={(email, name) => {
          console.log('Login attempt:', email, name)
          alert(`Login logic not implemented yet.\nUser: ${name}\nEmail: ${email}`)
        }}
      />
    </>
  )
}
