// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, fireEvent, act } from '@testing-library/react'

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

// Helper to find the message bubble (the div wrapping the <p> with message text)
function findBubble(container: HTMLElement): HTMLElement | null {
  const p = container.querySelector('p')
  return p?.closest('div[class*="messageBubble"]') ?? p?.parentElement ?? null
}

describe('ChatMessage', () => {
  const defaultProps = {
    message: baseMessage,
    currentUserId: 'user-2',
    onDelete: vi.fn(),
    onFlag: vi.fn(),
    onReply: vi.fn().mockResolvedValue(undefined),
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
    expect(container.textContent).toContain('CasaGrown')
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

  it('shows inline reply input after tapping', () => {
    const { container } = render(React.createElement(ChatMessage, defaultProps))
    const bubble = findBubble(container)
    fireEvent.click(bubble!)
    const input = container.querySelector('input[placeholder="Reply..."]')
    expect(input).toBeTruthy()
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

  // ── Inline Reply Input ───────────────────────────────────────

  it('calls onReply with message id and text when reply is submitted', async () => {
    const onReply = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      React.createElement(ChatMessage, { ...defaultProps, onReply })
    )
    const bubble = findBubble(container)
    fireEvent.click(bubble!)
    const input = container.querySelector('input[placeholder="Reply..."]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Great point!' } })
    
    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(form)
    })
    
    expect(onReply).toHaveBeenCalledWith('msg-1', 'Great point!')
  })

  it('disables send button when reply text is empty', async () => {
    await act(async () => {
      render(React.createElement(ChatMessage, { ...defaultProps, message: messageWithReplies }))
    })
    const sendBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(sendBtn).toBeTruthy()
    expect(sendBtn.disabled).toBe(true)
  })

  // ── Thread Replies ───────────────────────────────────────────

  it('auto-shows reply input for messages with reply_count > 0', async () => {
    await act(async () => {
      render(
        React.createElement(ChatMessage, { ...defaultProps, message: messageWithReplies })
      )
    })
    const input = document.querySelector('input[placeholder="Reply..."]')
    expect(input).toBeTruthy()
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
      React.createElement(ChatMessage, { ...defaultProps, isThreadReply: true })
    )
    const inputs = container.querySelectorAll('input[placeholder="Reply..."]')
    expect(inputs.length).toBe(0)
  })
})
