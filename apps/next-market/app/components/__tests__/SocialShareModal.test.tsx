import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, vi, beforeEach, afterAll } from 'vitest'
import React from 'react'
import SocialShareModal from '../SocialShareModal'

// Mock createTrackedShareLink quiet fetch utility
vi.mock('../../../lib/createTrackedShareLink', () => ({
  createTrackedShareLink: vi.fn((url, context, platform) => 
    Promise.resolve(`https://casagrown.org/r/${platform}-short`)
  )
}))

// Mock clipboard and window actions
const mockWriteText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true
})

const mockOpen = vi.fn()
window.open = mockOpen

// Handle location mocking safely for jsdom
let locationHref = ''
const originalLocation = window.location
Object.defineProperty(window, 'location', {
  value: {
    get href() {
      return locationHref
    },
    set href(val) {
      locationHref = val
    }
  },
  configurable: true,
  writable: true
})

// Handle navigator.share mocking
const mockShare = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'share', {
  value: mockShare,
  configurable: true,
  writable: true
})

describe('SocialShareModal Component - User Interactions', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Invite Neighbors',
    subtitle: 'Share your local garden produce',
    entityName: 'Crisp Tomatoes',
    shareUrl: 'https://casagrown.org/booth/crisp-tomatoes',
    shareMessage: 'Check out my fresh garden crisp tomatoes!',
    shareContext: 'product_share' as const,
    userId: 'u-123'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteText.mockClear()
    mockOpen.mockClear()
    mockShare.mockClear()
    locationHref = ''
  })

  afterAll(() => {
    // Restore original location property
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true
    })
  })

  it('renders Screen 1 (Platform Selection list) with hoverable cards by default', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises so tracked URLs resolve and avoid act warnings
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    
    // Screen 1 Headers — title prop overrides the default 'Select Platform to Share' fallback
    expect(screen.getByText('Invite Neighbors')).toBeInTheDocument()
    expect(screen.getByText('Share your local garden produce')).toBeInTheDocument()

    // Platform options present
    expect(screen.getByText('Share on WhatsApp')).toBeInTheDocument()
    expect(screen.getByText('Share on Nextdoor')).toBeInTheDocument()
    expect(screen.getByText('Share on Facebook')).toBeInTheDocument()
    expect(screen.getByText('Text a Neighbor')).toBeInTheDocument()
    expect(screen.getByText('Send via Email')).toBeInTheDocument()
    expect(screen.getByText('Copy Link')).toBeInTheDocument()
  })

  it('navigates to Screen 2 on clicking WhatsApp, displays mockup, and opens WhatsApp share link', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises so tracked URLs resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Select WhatsApp
    fireEvent.click(screen.getByText('Share on WhatsApp'))

    // Transitions to focused Screen 2
    expect(screen.getByText('WhatsApp Share')).toBeInTheDocument()
    expect(screen.getByText('← Back')).toBeInTheDocument()

    // Clicking Back returns to selection
    fireEvent.click(screen.getByText('← Back'))
    expect(screen.getByText('Invite Neighbors')).toBeInTheDocument()

    // Go to WhatsApp screen again
    fireEvent.click(screen.getByText('Share on WhatsApp'))

    // Trigger WhatsApp share click
    const actionBtn = screen.getByRole('button', { name: /Open WhatsApp & Share/ })
    fireEvent.click(actionBtn)

    // Verify it opened correct link with the tracked short link
    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('https://casagrown.org/r/whatsapp-short')),
      '_blank'
    )
  })

  it('verifies the Nextdoor flow: copies text on Step 1, copies comment message on Step 2', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises so tracked URLs resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Select Nextdoor
    fireEvent.click(screen.getByText('Share on Nextdoor'))
    expect(screen.getByText('Nextdoor Post')).toBeInTheDocument()

    // Step 1 check
    expect(screen.getByText('Step 1: Custom Post Text')).toBeInTheDocument()
    const step1Btn = screen.getByRole('button', { name: /Copy & Continue to Nextdoor/ })
    
    // Click Step 1
    fireEvent.click(step1Btn)
    expect(mockWriteText).toHaveBeenCalledWith('Check out my fresh garden crisp tomatoes!')
    expect(mockOpen).toHaveBeenCalledWith('https://nextdoor.com/news_feed/', '_blank')

    // Step 2 check
    expect(screen.getByText('Step 2: Copy Comment Message')).toBeInTheDocument()
    const step2Btn = screen.getByRole('button', { name: /Copy Comment Message/ })

    // Click Step 2
    fireEvent.click(step2Btn)
    
    // Should copy context-tailored comment message containing the tracked URL
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('👉 Browse & order here: https://casagrown.org/r/nextdoor-short 🌿')
    })
    expect(screen.getByText('📋 Comment Message Copied! Paste in comments.')).toBeInTheDocument()
  })

  it('verifies the Facebook flow: Step 1 copies post text and opens standard Facebook homepage, Step 2 copies comment message', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises so tracked URLs resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Select Facebook
    fireEvent.click(screen.getByText('Share on Facebook'))
    expect(screen.getByText('Facebook Post')).toBeInTheDocument()

    // Step 1 check
    const step1Btn = screen.getByRole('button', { name: /Copy & Continue to Facebook/ })
    fireEvent.click(step1Btn)
    
    // Verify it opens standard FB homepage rather than sharer.php
    expect(mockWriteText).toHaveBeenCalledWith('Check out my fresh garden crisp tomatoes!')
    expect(mockOpen).toHaveBeenCalledWith('https://www.facebook.com/', '_blank')

    // Step 2 check
    const step2Btn = screen.getByRole('button', { name: /Copy Comment Message/ })
    fireEvent.click(step2Btn)

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('👉 Browse & order here: https://casagrown.org/r/facebook-short 🌿')
    })
    expect(screen.getByText('📋 Comment Message Copied! Paste in comments.')).toBeInTheDocument()
  })

  it('supports toggling Edit Mode, customizes the platform specific text, collapses back to Preview Mode', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises so tracked URLs resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Select WhatsApp
    fireEvent.click(screen.getByText('Share on WhatsApp'))

    // We start in Preview Mode with mockup visible
    expect(screen.getByText('casagrown.org')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Add a custom message to your share...')).not.toBeInTheDocument()

    // Trigger Edit Mode
    const editBtn = screen.getByRole('button', { name: /Edit Message/ })
    fireEvent.click(editBtn)

    // Mockup preview should collapse/be hidden, and text editor displays
    expect(screen.queryByText('casagrown.org')).not.toBeInTheDocument()
    const textarea = screen.getByPlaceholderText('Add a custom message to your share...') as HTMLTextAreaElement
    expect(textarea).toBeInTheDocument()
    expect(textarea.value).toBe('Check out my fresh garden crisp tomatoes!')

    // Edit the text
    fireEvent.change(textarea, { target: { value: 'Fresh out of my backyard!' } })
    
    // Collapse Edit Mode
    const doneBtn = screen.getByRole('button', { name: /Done/ })
    fireEvent.click(doneBtn)

    // Mockup shows again and text area is hidden
    expect(screen.getByText('casagrown.org')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Add a custom message to your share...')).not.toBeInTheDocument()

    // WhatsApp action shares the edited message
    const actionBtn = screen.getByRole('button', { name: /Open WhatsApp & Share/ })
    fireEvent.click(actionBtn)

    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('Fresh out of my backyard!')),
      '_blank'
    )
  })

  it('renders dynamic pre-formatted comments according to the context provided', async () => {
    // 1. Booth invitation share context
    const { rerender } = render(
      <SocialShareModal 
        {...defaultProps} 
        shareContext="booth_invitation" 
      />
    )

    // Flush promises so tracked URLs resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    fireEvent.click(screen.getByText('Share on Facebook'))
    fireEvent.click(screen.getByRole('button', { name: /Copy Comment Message/ }))
    
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('👉 View my produce stand and order here: https://casagrown.org/r/facebook-short 🌿')
    })

    // 2. Community invite share context
    rerender(
      <SocialShareModal 
        {...defaultProps} 
        shareContext="community_invite" 
      />
    )

    // Flush promises so tracked URLs resolve again for new render
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    fireEvent.click(screen.getByRole('button', { name: /Copy Comment Message/ }))
    
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('👉 Join our local garden community and browse fresh produce here: https://casagrown.org/r/facebook-short 🌿')
    })
  })

  it('calls onClose when Skip is clicked on Screen 1 and Screen 2', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Click Skip on Selection screen (Screen 1)
    const skipBtn1 = screen.getByRole('button', { name: /No thanks, I'll share later/ })
    fireEvent.click(skipBtn1)
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)

    // Reset mock onClose
    defaultProps.onClose.mockClear()

    // Select WhatsApp to navigate to Screen 2
    fireEvent.click(screen.getByText('Share on WhatsApp'))

    // Click Close on Focused screen (Screen 2)
    const closeBtn2 = screen.getByRole('button', { name: /Close/ })
    fireEvent.click(closeBtn2)
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('supports editing a message, resetting to default, and saving', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Select WhatsApp
    fireEvent.click(screen.getByText('Share on WhatsApp'))

    // Click Edit Message
    fireEvent.click(screen.getByRole('button', { name: /Edit Message/ }))

    const textarea = screen.getByPlaceholderText('Add a custom message to your share...') as HTMLTextAreaElement
    expect(textarea.value).toBe('Check out my fresh garden crisp tomatoes!')

    // Customize the text
    fireEvent.change(textarea, { target: { value: 'This is a brand new customized message!' } })
    expect(textarea.value).toBe('This is a brand new customized message!')

    // The Reset button should now be visible since message is customized
    const resetBtn = screen.getByRole('button', { name: /Reset to Default/ })
    expect(resetBtn).toBeInTheDocument()

    // Click Reset
    fireEvent.click(resetBtn)

    // Text area is reset back to default
    expect(textarea.value).toBe('Check out my fresh garden crisp tomatoes!')
    
    // Reset button is gone
    expect(screen.queryByRole('button', { name: /Reset to Default/ })).not.toBeInTheDocument()

    // Click Done
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
  })

  it('verifies SMS share flow with custom message & tracked link', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Select SMS Card
    fireEvent.click(screen.getByText('Text a Neighbor'))

    // Verify SMS Preview shows default text
    expect(screen.getByText('Check out my fresh garden crisp tomatoes!')).toBeInTheDocument()

    // Click "Open Messages & Text" button
    const actionBtn = screen.getByRole('button', { name: /Open Messages & Text/ })
    fireEvent.click(actionBtn)

    // Verify correct window.location.href was targeted
    expect(locationHref).toContain('sms:?body=')
    expect(locationHref).toContain(encodeURIComponent('https://casagrown.org/r/sms-short'))

    // Toggle Edit Mode
    fireEvent.click(screen.getByRole('button', { name: /Edit Message/ }))
    const textarea = screen.getByPlaceholderText('Add a custom message to your share...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'SMS Custom Text' } })
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))

    // Click Action again
    fireEvent.click(actionBtn)
    expect(locationHref).toContain(encodeURIComponent('SMS Custom Text'))
  })

  it('verifies Email share flow with custom message & tracked link', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Select Email Card
    fireEvent.click(screen.getByText('Send via Email'))

    // Click Open Email & Send
    const actionBtn = screen.getByRole('button', { name: /Open Email & Send/ })
    fireEvent.click(actionBtn)

    // Verify email mailto structure
    expect(locationHref).toContain('mailto:?subject=')
    expect(locationHref).toContain(encodeURIComponent('Crisp Tomatoes'))
    expect(locationHref).toContain(encodeURIComponent('https://casagrown.org/r/email-short'))
  })

  it('verifies Copy Message & Link action copies text & tracked link', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Select Copy
    fireEvent.click(screen.getByText('Copy Link'))

    // Click button (may be 'Message Copied!' due to immediate copy)
    const actionBtn = screen.getByRole('button', { name: /Message Copied!|Copy Message & Link/ })
    fireEvent.click(actionBtn)

    // Verify clipboard content and toast
    expect(mockWriteText).toHaveBeenCalledWith('Check out my fresh garden crisp tomatoes!\n\nhttps://casagrown.org/r/copy-short')
    expect(screen.getByText('📋 Copied to Clipboard!')).toBeInTheDocument()
  })

  it('verifies native share triggers navigator.share when available', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Select More Options
    fireEvent.click(screen.getByText('More Options'))

    // Click action button
    const actionBtn = screen.getByRole('button', { name: /Share via Device Options/ })
    fireEvent.click(actionBtn)

    expect(mockShare).toHaveBeenCalledWith({
      title: 'Crisp Tomatoes',
      text: 'Check out my fresh garden crisp tomatoes!',
      url: 'https://casagrown.org/booth/crisp-tomatoes'
    })
  })

  it('does not render native share option if navigator.share is not supported', async () => {
    const originalShare = navigator.share
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
      writable: true
    })

    render(<SocialShareModal {...defaultProps} />)
    
    // Flush promises
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.queryByText('More Options')).not.toBeInTheDocument()

    // Restore
    Object.defineProperty(navigator, 'share', {
      value: originalShare,
      configurable: true,
      writable: true
    })
  })

  it('verifies custom messages are persistent per platform during tab swapping', async () => {
    render(<SocialShareModal {...defaultProps} />)

    // Flush promises
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // 1. WhatsApp editing
    fireEvent.click(screen.getByText('Share on WhatsApp'))
    fireEvent.click(screen.getByRole('button', { name: /Edit Message/ }))
    let textarea = screen.getByPlaceholderText('Add a custom message to your share...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Custom WhatsApp text!' } })
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))

    // Go Back
    fireEvent.click(screen.getByText('← Back'))

    // 2. SMS editing
    fireEvent.click(screen.getByText('Text a Neighbor'))
    fireEvent.click(screen.getByRole('button', { name: /Edit Message/ }))
    textarea = screen.getByPlaceholderText('Add a custom message to your share...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Custom SMS text!' } })
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))

    // Go Back
    fireEvent.click(screen.getByText('← Back'))

    // 3. Re-verify WhatsApp custom text
    fireEvent.click(screen.getByText('Share on WhatsApp'))
    fireEvent.click(screen.getByRole('button', { name: /Edit Message/ }))
    textarea = screen.getByPlaceholderText('Add a custom message to your share...') as HTMLTextAreaElement
    expect(textarea.value).toBe('Custom WhatsApp text!')
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))

    // Go Back
    fireEvent.click(screen.getByText('← Back'))

    // 4. Re-verify SMS custom text
    fireEvent.click(screen.getByText('Text a Neighbor'))
    fireEvent.click(screen.getByRole('button', { name: /Edit Message/ }))
    textarea = screen.getByPlaceholderText('Add a custom message to your share...') as HTMLTextAreaElement
    expect(textarea.value).toBe('Custom SMS text!')
  })
})
