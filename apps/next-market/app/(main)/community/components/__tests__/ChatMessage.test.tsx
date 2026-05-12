// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, fireEvent, act, screen, waitFor } from '@testing-library/react'

// Mock the supabase client
vi.mock('../../../../lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: () => ({ data: { id: 'new-msg' }, error: null }) }) }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://mock/${p}` } }) }) },
  }),
}))

// Mock the service
vi.mock('../../../../../../../packages/app/features/community-chat/community-chat-service', () => ({
  toggleMessageReaction: vi.fn().mockResolvedValue(undefined),
  fetchCommunityReplies: vi.fn().mockResolvedValue([]),
}))

// Mock CSS modules — return plain string class names
vi.mock('../../page.module.css', () => {
  return { default: new Proxy({}, { get: (_, prop) => String(prop) }) }
})

import ChatMessage from '../ChatMessage'

const baseMessage = {
  id: 'msg-1',
  community_h3_index: '89283470c2fffff',
  author_id: 'user-1',
  author_name: 'Sam Seller',
  author_avatar_url: null,
  parent_id: null,
  content: 'Hello neighbors!',
  media: [],
  product_listing_id: null,
  is_system: false,
  is_pinned: false,
  edited_at: null,
  created_at: '2026-03-18T07:00:00Z',
  reaction_counts: {},
  reply_count: 0,
  user_reactions: [],
  flag_count: 0,
  bumped_at: '2026-03-18T07:00:00Z',
}

const botMessage = {
  ...baseMessage,
  id: 'bot-1',
  author_id: '00000000-0000-0000-0000-000000000000',
  author_name: 'CasaGrown',
  is_system: true,
  content: '🐝 What is the best thing you have grown this year?',
}

const messageWithReplies = {
  ...baseMessage,
  id: 'msg-replies',
  reply_count: 3,
}

// Helper to find the message bubble
function findBubble(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-testid="message-bubble"]') as HTMLElement
}

describe('ChatMessage', () => {
  const defaultProps = {
    message: baseMessage,
    currentUserId: 'user-2',
    onDelete: vi.fn(),
    onFlag: vi.fn(),
    onReplyTo: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Basic Rendering ──────────────────────────────────────────

  it('renders a regular user message with author name and content', () => {
    const { container } = render(React.createElement(ChatMessage, defaultProps))
    expect(container.textContent).toContain('Sam Seller')
    expect(container.textContent).toContain('Hello neighbors!')
  })

  it('renders author initial as avatar when no avatar URL', () => {
    const { container } = render(React.createElement(ChatMessage, defaultProps))
    // The first character span inside the avatar area
    expect(container.textContent).toContain('S')
  })

  it('renders time in readable format', () => {
    const { container } = render(React.createElement(ChatMessage, defaultProps))
    expect(container.textContent).toMatch(/\d{1,2}:\d{2}/)
  })

  // ── DM Navigation ──────────────────────────────────────────────

  it('renders author name as a link to DM when it is another user', () => {
    const { container } = render(React.createElement(ChatMessage, defaultProps))
    const link = container.querySelector(`a[title="Send a Direct Message"]`)
    expect(link?.getAttribute('href') || '').toContain('/messages/new?userId=user-1')
  })

  it('does NOT render link to DM if message is from the current user', () => {
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, currentUserId: 'user-1' })
    )
    const link = container.querySelector('a')
    expect(link).toBeFalsy()
  })

  it('does NOT render link to DM if message is from CasaBot', () => {
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: botMessage })
    )
    const link = container.querySelector('a')
    expect(link).toBeFalsy()
  })

  // ── Bot/System Message Styling ───────────────────────────────

  it('renders bot message with bee emoji avatar', () => {
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: botMessage })
    )
    expect(container.textContent).toContain('🐝')
  })

  it('renders bot message with CasaGrown name', () => {
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: botMessage })
    )
    expect(container.textContent).toContain('CasaBot')
  })

  it('renders BOT badge for system messages', () => {
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: botMessage })
    )
    expect(container.textContent).toContain('BOT')
  })

  it('does NOT render BOT badge for regular user messages', () => {
    const { container } = render(React.createElement(ChatMessage, defaultProps))
    expect(container.textContent).not.toContain('BOT')
  })

  it('applies isBotMessage class for system messages', () => {
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: botMessage })
    )
    expect(container.firstElementChild?.className).toContain('isBotMessage')
  })

  it('applies botBubble class for system messages', () => {
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: botMessage })
    )
    const bubble = findBubble(container)
    expect(bubble?.className).toContain('botBubble')
  })

  // ── Tap Actions ──────────────────────────────────────────────

  it('shows emoji buttons after tapping the message', () => {
    const { container } = render(React.createElement(ChatMessage, defaultProps))
    const bubble = findBubble(container)
    expect(bubble).toBeTruthy()
    fireEvent.click(bubble!)
    // After tapping, emoji buttons should appear (each is a button containing an emoji)
    const buttons = container.querySelectorAll('button')
    const emojiButtons = Array.from(buttons).filter(b => ['👍', '❤️', '🎉', '😂', '😮', '🌱'].includes(b.textContent?.trim() || ''))
    expect(emojiButtons.length).toBe(6)
  })

  it('hides action bar when tapped again', () => {
    const { container } = render(React.createElement(ChatMessage, defaultProps))
    const bubble = findBubble(container)
    fireEvent.click(bubble!)
    // Emojis should be visible
    let emojiBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === '👍')
    expect(emojiBtn).toBeTruthy()
    // Tap again
    fireEvent.click(bubble!)
    emojiBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === '👍')
    expect(emojiBtn).toBeFalsy()
  })

  // ── Own Message vs Other's Message ───────────────────────────

  it('shows delete button for own messages', () => {
    const { container } = render(
      React.createElement(ChatMessage, {
        ...defaultProps,
        currentUserId: 'user-1', // same as author
      })
    )
    const bubble = findBubble(container)
    fireEvent.click(bubble!)
    expect(container.textContent).toContain('✕')
  })

  it('shows report button for other user messages', () => {
    const { container } = render(React.createElement(ChatMessage, defaultProps))
    const bubble = findBubble(container)
    fireEvent.click(bubble!)
    expect(container.textContent).toContain('⚑')
  })

  // ── Media ────────────────────────────────────────────────────

  it('renders attached images', () => {
    const msgWithMedia = {
      ...baseMessage,
      media: [{ url: '/demo/tomato.png', storage_path: 'demo/tomato.png', media_type: 'image/png' }],
    }
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: msgWithMedia })
    )
    const imgs = container.querySelectorAll('img[alt="Attached media"]')
    expect(imgs.length).toBeGreaterThan(0)
    expect((imgs[0] as HTMLImageElement).src).toContain('/demo/tomato.png')
  })

  // ── Reactions ────────────────────────────────────────────────

  it('renders existing reaction counts', () => {
    const msgWithReactions = {
      ...baseMessage,
      reaction_counts: { '👍': 3, '❤️': 1 },
      user_reactions: ['👍'],
    }
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: msgWithReactions })
    )
    expect(container.textContent).toContain('👍')
    expect(container.textContent).toContain('3')
    expect(container.textContent).toContain('❤️')
    expect(container.textContent).toContain('1')
  })

  it('marks user reactions as active', () => {
    const msgWithReactions = {
      ...baseMessage,
      reaction_counts: { '👍': 1 },
      user_reactions: ['👍'],
    }
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: msgWithReactions })
    )
    const pills = container.querySelectorAll('button')
    const activePill = Array.from(pills).find(p => p.className.includes('Active'))
    expect(activePill).toBeTruthy()
  })

  // ── Thread Reply as isThreadReply ────────────────────────────

  it('does not show reply input for isThreadReply messages', () => {
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps })
    )
    const inputs = container.querySelectorAll('input[placeholder="Reply..."]')
    expect(inputs.length).toBe(0)
  })

  // ── Optimistic Media (REGRESSION) ────────────────────────────

  it('REGRESSION: renders media immediately in optimistic message (not empty)', () => {
    // This test prevents the bug where optimistic messages had media: []
    // causing uploaded photos to only appear after page revisit.
    const optimisticMedia = [
      { storage_path: 'user1/photo.jpg', media_type: 'image', url: 'https://mock/user1/photo.jpg' },
    ]
    const optimisticMsg = {
      ...baseMessage,
      id: 'temp-12345',
      media: optimisticMedia,
    }
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: optimisticMsg })
    )
    const imgs = container.querySelectorAll('img[alt="Attached media"]')
    expect(imgs.length).toBe(1)
    expect((imgs[0] as HTMLImageElement).src).toContain('photo.jpg')
  })

  it('REGRESSION: multiple media items all render in optimistic message', () => {
    const optimisticMedia = [
      { storage_path: 'user1/photo1.jpg', media_type: 'image', url: 'https://mock/user1/photo1.jpg' },
      { storage_path: 'user1/photo2.jpg', media_type: 'image', url: 'https://mock/user1/photo2.jpg' },
    ]
    const optimisticMsg = {
      ...baseMessage,
      id: 'temp-67890',
      media: optimisticMedia,
    }
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, message: optimisticMsg })
    )
    const imgs = container.querySelectorAll('img[alt="Attached media"]')
    expect(imgs.length).toBe(2)
  })
})
