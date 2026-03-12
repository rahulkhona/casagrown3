'use client'

import { UserDetailScreen } from '@casagrown/app/features/user/detail-screen'
import { useParams } from 'solito/navigation'

export default function Page() {
  const { id } = useParams()
  return <UserDetailScreen id={id as string} />
}
