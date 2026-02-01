import { HomeScreen } from '@casagrown/app/features/home/screen'
import { Stack, useRouter } from 'expo-router'

export default function Screen() {
  const router = useRouter()

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Home',
        }}
      />
      <HomeScreen 
        onLinkPress={() => router.push('/user/nate')} 
        heroImageSrc={require('../assets/hero.jpg')}
        logoSrc={require('../assets/logo.png')}
      />
    </>
  )
}
