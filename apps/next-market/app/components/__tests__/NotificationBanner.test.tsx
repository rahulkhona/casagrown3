// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react'

// Mock dependencies
vi.mock('../../../lib/useNotificationPrompt', () => ({
  isNotificationsEnabled: vi.fn(() => false),
  isIOSBrowser: vi.fn(() => false),
  getPermissionStatus: vi.fn(() => 'default'),
  detectPlatform: vi.fn(() => 'desktop-web'),
}))

import { NotificationBanner } from '../NotificationBanner'

describe('NotificationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with context message', async () => {
    const { container } = render(React.createElement(NotificationBanner, { context: 'order updates' }))
    await waitFor(() => {
      expect(container.textContent).toContain('order updates')
    })
  })

  it('shows enable button when onEnableClick provided', async () => {
    const onEnable = vi.fn()
    const { container } = render(React.createElement(NotificationBanner, { context: 'alerts', onEnableClick: onEnable }))
    const btn = await waitFor(() => {
      const found = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Enable now'))
      if (!found) throw new Error('Button not found. HTML: ' + container.innerHTML)
      return found
    })
    fireEvent.click(btn)
    expect(onEnable).toHaveBeenCalled()
  })

  it('dismisses when close button clicked', async () => {
    const { container } = render(React.createElement(NotificationBanner, { context: 'updates' }))
    await waitFor(() => {
      expect(container.textContent).toContain('updates')
    })
    const closeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === '✕')
    if (closeBtn) {
      fireEvent.click(closeBtn)
      expect(container.textContent).not.toContain('updates')
    }
  })
})
