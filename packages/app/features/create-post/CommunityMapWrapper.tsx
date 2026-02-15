/**
 * CommunityMapWrapper — Platform-conditional lazy-loaded CommunityMap
 *
 * Extracted from SellForm / BuyForm / GeneralForm to eliminate duplication.
 * Handles lazy loading on web (code splitting) and direct require on native.
 */

import { lazy, Suspense } from 'react'
import { Platform } from 'react-native'
import { YStack, Spinner } from 'tamagui'
import { colors } from '../../design-tokens'
import type { ResolveResponse } from '../community/use-resolve-community'

// Platform-conditional lazy import for CommunityMap
const CommunityMapLazy = Platform.OS === 'web'
  ? lazy(() => import('../community/CommunityMap'))
  : null
const CommunityMapNative = Platform.OS !== 'web'
  ? require('../community/CommunityMap').default
  : null

export interface CommunityMapWrapperProps {
  resolveData: ResolveResponse
  height?: number
  showLabels?: boolean
  selectedNeighborH3Indices?: string[]
}

export function CommunityMapWrapper(props: CommunityMapWrapperProps) {
  if (Platform.OS === 'web' && CommunityMapLazy) {
    return (
      <Suspense
        fallback={
          <YStack
            height={props.height || 180}
            alignItems="center"
            justifyContent="center"
            backgroundColor={colors.neutral[50]}
            borderRadius={12}
          >
            <Spinner size="large" color={colors.primary[600]} />
          </YStack>
        }
      >
        <CommunityMapLazy {...props} />
      </Suspense>
    )
  }
  if (CommunityMapNative) {
    return <CommunityMapNative {...props} />
  }
  return null
}
