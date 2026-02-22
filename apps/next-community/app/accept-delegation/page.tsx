'use client'

import AcceptDelegationScreen from '@casagrown/app/features/delegate/AcceptDelegationScreen'
import { Provider } from '@casagrown/app/provider'

export default function AcceptDelegationPage() {
  return (
    <Provider>
      <AcceptDelegationScreen />
    </Provider>
  )
}
