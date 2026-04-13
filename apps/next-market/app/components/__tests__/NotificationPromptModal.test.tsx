// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, fireEvent } from '@testing-library/react'

import { NotificationPromptModal } from '../NotificationPromptModal'

const defaultProps = {
  visible: true,
  variant: 'first-time' as const,
  onEnable: vi.fn(),
  onDismiss: vi.fn(),
  onPermanentDismiss: vi.fn(),
}

describe('NotificationPromptModal', () => {
  it('returns null when not visible', () => {
    const { container } = render(
      React.createElement(NotificationPromptModal, { ...defaultProps, visible: false })
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders first-time variant', () => {
    const { container } = render(React.createElement(NotificationPromptModal, defaultProps))
    expect(container.textContent).toContain('Stay in the Loop')
    expect(container.textContent).toContain('Enable Notifications')
    expect(container.textContent).toContain('Not now')
  })

  it('shows 3 benefits', () => {
    const { container } = render(React.createElement(NotificationPromptModal, defaultProps))
    expect(container.textContent).toContain('order is accepted')
    expect(container.textContent).toContain('miss a message')
    expect(container.textContent).toContain('new orders on your produce stand')
  })

  it('renders denied variant', () => {
    const { container } = render(
      React.createElement(NotificationPromptModal, { ...defaultProps, variant: 'denied' })
    )
    expect(container.textContent).toContain('Notifications Blocked')
    expect(container.textContent).toContain('Got It')
  })

  it('renders ios-safari variant with PWA steps', () => {
    const { container } = render(
      React.createElement(NotificationPromptModal, { ...defaultProps, variant: 'ios-safari' })
    )
    expect(container.textContent).toContain('One quick setup step')
    expect(container.textContent).toContain('Step 1')
    expect(container.textContent).toContain('Share button')
  })

  it('renders ios-chrome variant', () => {
    const { container } = render(
      React.createElement(NotificationPromptModal, { ...defaultProps, variant: 'ios-chrome' })
    )
    expect(container.textContent).toContain('⋯ menu')
  })

  it('calls onEnable when enable button clicked', () => {
    const { container } = render(React.createElement(NotificationPromptModal, defaultProps))
    const enableBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Enable Notifications'))
    fireEvent.click(enableBtn!)
    expect(defaultProps.onEnable).toHaveBeenCalled()
  })

  it('calls onDismiss when "Not now" clicked', () => {
    const { container } = render(React.createElement(NotificationPromptModal, defaultProps))
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Not now')
    fireEvent.click(btn!)
    expect(defaultProps.onDismiss).toHaveBeenCalled()
  })

  it('calls onPermanentDismiss', () => {
    const { container } = render(React.createElement(NotificationPromptModal, defaultProps))
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes("Don't ask again"))
    fireEvent.click(btn!)
    expect(defaultProps.onPermanentDismiss).toHaveBeenCalled()
  })
})
