/**
 * CommunityMapWrapper Component Tests
 *
 * Tests: native rendering, prop forwarding.
 * Note: Web lazy loading via React.lazy + Suspense is not testable in jest's
 * react-native preset, so tests focus on the native code path.
 */

import React from 'react'
import { render, screen } from '@testing-library/react-native'

// Mock tamagui
jest.mock('tamagui', () => {
  const { View, Text: RNText } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Spinner: () => <RNText>Loading...</RNText>,
  }
})

// Mock CommunityMap
jest.mock('../community/CommunityMap', () => {
  const { Text: RNText } = require('react-native')
  return {
    __esModule: true,
    default: (props: any) => (
      <RNText>
        CommunityMap-{props.height || 'default'}-{props.showLabels ? 'labels' : 'nolabels'}
      </RNText>
    ),
  }
})

import { CommunityMapWrapper } from './CommunityMapWrapper'

const defaultResolveData = {
  primary: {
    h3_index: '872834461ffffff',
    name: 'Oak Street',
    city: 'San Jose',
    location: 'POINT(-121.8863 37.3382)',
  },
  neighbors: [],
  resolved_location: { lat: 37.3382, lng: -121.8863 },
}

describe('CommunityMapWrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders CommunityMap on native', () => {
    render(
      <CommunityMapWrapper
        resolveData={defaultResolveData}
        height={200}
        showLabels={true}
      />
    )
    expect(screen.getByText('CommunityMap-200-labels')).toBeTruthy()
  })

  it('passes all props through to CommunityMap', () => {
    render(
      <CommunityMapWrapper
        resolveData={defaultResolveData}
        height={300}
        showLabels={false}
        selectedNeighborH3Indices={['872834460ffffff']}
      />
    )
    expect(screen.getByText('CommunityMap-300-nolabels')).toBeTruthy()
  })

  it('uses default height when not specified', () => {
    render(
      <CommunityMapWrapper
        resolveData={defaultResolveData}
        showLabels={true}
      />
    )
    expect(screen.getByText('CommunityMap-default-labels')).toBeTruthy()
  })

  it('matches snapshot', () => {
    const tree = render(
      <CommunityMapWrapper
        resolveData={defaultResolveData}
        height={200}
        showLabels={true}
      />
    )
    expect(tree.toJSON()).toMatchSnapshot()
  })
})
