'use client'

import { Suspense } from 'react'
import DelegateScreen from '@casagrown/app/features/delegate/delegate-screen'
import { Provider } from '@casagrown/app/provider'
import { useSearchParams } from 'next/navigation'
import { Spinner } from 'tamagui'

function DelegatePageContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab = tabParam === 'for' ? 'for' : undefined

  return (
    <Provider>
      <DelegateScreen initialTab={initialTab} />
    </Provider>
  )
}

export default function DelegatePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DelegatePageContent />
    </Suspense>
  )
}
