// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LandmarkPickerModal from '../LandmarkPickerModal'

describe('LandmarkPickerModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <LandmarkPickerModal
        isOpen={false}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders modal and loads landmarks when isOpen is true', async () => {
    const handleSelect = vi.fn()
    const handleClose = vi.fn()

    render(
      <LandmarkPickerModal
        isOpen={true}
        onClose={handleClose}
        onSelect={handleSelect}
        currentLat={37.3039}
        currentLng={-121.8988}
      />
    )

    expect(screen.getByText(/Pick a Safe Public Spot/i)).toBeInTheDocument()

    // Wait for landmarks to load
    await waitFor(() => {
      expect(screen.getByText(/Bramhall Park/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/Willow Glen Community Center/i)).toBeInTheDocument()
    expect(screen.getByText(/Willow Glen Branch Library/i)).toBeInTheDocument()
  })

  it('filters landmarks by search query', async () => {
    render(
      <LandmarkPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        currentLat={37.3039}
        currentLng={-121.8988}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Bramhall Park/i)).toBeInTheDocument()
    })

    const searchInput = screen.getByTestId('landmark-search-input')
    fireEvent.change(searchInput, { target: { value: 'Library' } })

    expect(screen.getByText(/Willow Glen Branch Library/i)).toBeInTheDocument()
    expect(screen.queryByText(/Bramhall Park/i)).not.toBeInTheDocument()
  })

  it('filters landmarks by category pill', async () => {
    render(
      <LandmarkPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        currentLat={37.3039}
        currentLng={-121.8988}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Bramhall Park/i)).toBeInTheDocument()
    })

    // Click Libraries pill
    const libraryPill = screen.getByText(/Libraries/i)
    fireEvent.click(libraryPill)

    expect(screen.getByText(/Willow Glen Branch Library/i)).toBeInTheDocument()
    expect(screen.queryByText(/Bramhall Park/i)).not.toBeInTheDocument()
  })

  it('triggers onSelect and onClose when landmark is clicked', async () => {
    const handleSelect = vi.fn()
    const handleClose = vi.fn()

    render(
      <LandmarkPickerModal
        isOpen={true}
        onClose={handleClose}
        onSelect={handleSelect}
        currentLat={37.3039}
        currentLng={-121.8988}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Willow Glen Community Center/i)).toBeInTheDocument()
    })

    const commCenterBtn = screen.getByTestId('landmark-option-mock_comm_1')
    fireEvent.click(commCenterBtn)

    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Willow Glen Community Center',
      category: 'community_center',
    }))
    expect(handleClose).toHaveBeenCalled()
  })

  it('closes when close button is clicked', () => {
    const handleClose = vi.fn()
    render(
      <LandmarkPickerModal
        isOpen={true}
        onClose={handleClose}
        onSelect={vi.fn()}
      />
    )

    const closeBtn = screen.getByTestId('close-landmark-modal')
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalled()
  })

  it('supports dark theme styling when theme="dark"', () => {
    render(
      <LandmarkPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        theme="dark"
      />
    )

    const modal = screen.getByTestId('landmark-modal')
    expect(modal).toBeInTheDocument()
    // Verify dark background is applied
    expect(modal).toHaveStyle({ backgroundColor: '#0c140d' })
  })
})
