import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

// Mock tamagui
jest.mock('tamagui', () => {
  const { View, Text: RNText, Pressable } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    Button: ({ children, onPress, ...props }: any) => (
      <Pressable onPress={onPress} {...props}>{children}</Pressable>
    ),
  }
})

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock design tokens
jest.mock('../../design-tokens', () => ({
  colors: {
    green: { 600: '#16a34a' },
    gray: { 100: '#f3f4f6', 200: '#e5e7eb', 700: '#374151' },
    red: { 500: '#ef4444' },
  },
}))

import { FeedNavigation, type NavItem } from './FeedNavigation'

const NAV_ITEMS: NavItem[] = [
  { key: 'feed', active: true, badge: 0 },
  { key: 'chats', badge: 3 },
  { key: 'orders', badge: 0 },
  { key: 'myPosts', badge: 0 },
]

describe('FeedNavigation', () => {
  // ─── Desktop variant ───────────────────────────────

  it('renders all nav items in desktop variant', () => {
    render(
      <FeedNavigation navKeys={NAV_ITEMS} variant="desktop" onNavigate={jest.fn()} />
    )
    expect(screen.getByText('feed.nav.feed')).toBeTruthy()
    expect(screen.getByText('feed.nav.chats')).toBeTruthy()
    expect(screen.getByText('feed.nav.orders')).toBeTruthy()
    expect(screen.getByText('feed.nav.myPosts')).toBeTruthy()
  })

  it('shows badge count for items with badge > 0 (desktop)', () => {
    render(
      <FeedNavigation navKeys={NAV_ITEMS} variant="desktop" onNavigate={jest.fn()} />
    )
    // Badge "3" for chats
    expect(screen.getByText('3')).toBeTruthy()
    // No badge for feed (badge: 0)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('calls onNavigate with correct key on press (desktop)', () => {
    const onNavigate = jest.fn()
    render(
      <FeedNavigation navKeys={NAV_ITEMS} variant="desktop" onNavigate={onNavigate} />
    )
    fireEvent.press(screen.getByText('feed.nav.myPosts'))
    expect(onNavigate).toHaveBeenCalledWith('myPosts')
  })

  // ─── Mobile variant ────────────────────────────────

  it('renders all nav items in mobile variant', () => {
    render(
      <FeedNavigation navKeys={NAV_ITEMS} variant="mobile" onNavigate={jest.fn()} />
    )
    expect(screen.getByText('feed.nav.feed')).toBeTruthy()
    expect(screen.getByText('feed.nav.chats')).toBeTruthy()
    expect(screen.getByText('feed.nav.orders')).toBeTruthy()
    expect(screen.getByText('feed.nav.myPosts')).toBeTruthy()
  })

  it('shows badge count for items with badge > 0 (mobile)', () => {
    render(
      <FeedNavigation navKeys={NAV_ITEMS} variant="mobile" onNavigate={jest.fn()} />
    )
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('calls onNavigate with correct key on press (mobile)', () => {
    const onNavigate = jest.fn()
    render(
      <FeedNavigation navKeys={NAV_ITEMS} variant="mobile" onNavigate={onNavigate} />
    )
    fireEvent.press(screen.getByText('feed.nav.chats'))
    expect(onNavigate).toHaveBeenCalledWith('chats')
  })

  // ─── Edge cases ────────────────────────────────────

  it('does not render any badges when all items have badge 0', () => {
    const noBadgeItems: NavItem[] = [
      { key: 'feed', active: true, badge: 0 },
      { key: 'chats', badge: 0 },
    ]
    const { toJSON } = render(
      <FeedNavigation navKeys={noBadgeItems} variant="desktop" onNavigate={jest.fn()} />
    )
    // Snapshot should have no numeric badge text
    const json = JSON.stringify(toJSON())
    // Only text nodes should be translation keys, no numeric badge text
    expect(json).not.toContain('"0"')
  })

  it('renders correctly with empty nav keys', () => {
    render(
      <FeedNavigation navKeys={[]} variant="desktop" onNavigate={jest.fn()} />
    )
    // Should render without crashing, no nav items
    expect(screen.queryByText('feed.nav.feed')).toBeNull()
  })
})
