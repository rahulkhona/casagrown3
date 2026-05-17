import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserSearchModal } from '../UserSearchModal'

// Mocks
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush })
}))

const mockSupabase = {
  from: vi.fn(),
}
vi.mock('../../../../lib/supabase', () => ({
  createClient: () => mockSupabase
}))

const mockUser = { id: 'me-123' }
vi.mock('../../../../lib/useAuth', () => ({
  useAuth: () => ({ user: mockUser })
}))

vi.mock('../../../components/ErrorToast', () => ({
  useErrorToast: () => ({ showError: vi.fn(), showInfo: vi.fn() })
}))

describe('UserSearchModal', () => {
  const defaultProps = {
    onClose: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches default 10 neighbors on mount with empty query', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: 'u-1', full_name: 'Beth Smith', communities: { name: 'Test City' } }],
        error: null
      })
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    render(<UserSearchModal {...defaultProps} />)

    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
      expect(screen.getByText('Beth Smith')).toBeInTheDocument()
      expect(screen.getByText('• Test City')).toBeInTheDocument()
    })
  })

  it('debounces and searches based on input', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: 'u-2', full_name: 'Martha', communities: null }],
        error: null
      })
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    render(<UserSearchModal {...defaultProps} />)

    const input = screen.getByPlaceholderText('Search neighbors by name...')
    fireEvent.change(input, { target: { value: 'Martha' } })

    await waitFor(() => {
      expect(mockQuery.ilike).toHaveBeenCalledWith('full_name', '%Martha%')
      expect(screen.getByText('Martha')).toBeInTheDocument()
    })
  })

  it('shows empty state appropriately', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null })
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    render(<UserSearchModal {...defaultProps} />)

    const input = screen.getByPlaceholderText('Search neighbors by name...')
    fireEvent.change(input, { target: { value: 'Nobody' } })

    await waitFor(() => {
      expect(screen.getByText('No neighbors found matching "Nobody"')).toBeInTheDocument()
    })
  })
})
