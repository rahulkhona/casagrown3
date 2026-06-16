import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, vi, beforeEach, afterEach } from 'vitest'
import { BlockModal } from '../BlockModal'

afterEach(() => {
  cleanup()
})

const mockInsert = vi.fn()
const mockSupabase = {
  from: vi.fn(() => ({
    insert: mockInsert
  }))
}

vi.mock('../../../lib/supabase', () => ({
  createClient: () => mockSupabase
}))

describe('BlockModal component', () => {
  const defaultProps = {
    userIdToBlock: 'u-123',
    userName: 'Beth Smith',
    currentUserId: 'me-456',
    onClose: vi.fn(),
    onBlocked: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({ error: null })
  })

  it('renders correctly', () => {
    render(<BlockModal {...defaultProps} />)
    expect(screen.getByText('🚫 Block Neighbor')).toBeInTheDocument()
    expect(screen.getByText(/Beth Smith/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Block' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    render(<BlockModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('inserts into market_blocks on Confirm Block', async () => {
    render(<BlockModal {...defaultProps} />)
    
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Block' }))
    
    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith('market_blocks')
      expect(mockInsert).toHaveBeenCalledWith({ blocker_id: 'me-456', blocked_id: 'u-123' })
      expect(defaultProps.onBlocked).toHaveBeenCalledTimes(1)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('displays error if already blocked', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    render(<BlockModal {...defaultProps} />)
    
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Block' }))
    
    await waitFor(() => {
      expect(screen.getByText('You have already blocked this neighbor.')).toBeInTheDocument()
      expect(defaultProps.onBlocked).not.toHaveBeenCalled()
    })
  })
})
