import { ProfileScreen } from '@casagrown/app/features/user/profile-screen'
import { useRouter } from 'expo-router'

export default function ProfileTab() {
  const router = useRouter()

  const handleLogout = () => {
    // Navigate back to login after logout
    router.replace('/login')
  }

  return <ProfileScreen />
}
