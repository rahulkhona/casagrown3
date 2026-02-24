/**
 * JoinByCodeSheet — Component Tests
 *
 * Tests the 2-step delegation flow:
 *   Step 1: Enter 6-digit pairing code → lookup
 *   Step 2: Review split + delegator info → Accept / Decline
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'

// ─── Mock dependencies ───────────────────────────────────────

const mockInvoke = jest.fn()

jest.mock('../auth/auth-hook', () => ({
  supabase: {
    functions: {
      invoke: function() { return mockInvoke.apply(null, arguments) },
    },
  },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('tamagui', () => {
  const React = require('react')
  const { View, Text: RNText, TouchableOpacity, ScrollView: RNScrollView } = require('react-native')
  return {
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    Button: ({ children, onPress, disabled, ...props }: any) => (
      <TouchableOpacity onPress={onPress} disabled={disabled} {...props}>{children}</TouchableOpacity>
    ),
    Spinner: () => <RNText>Loading...</RNText>,
    ScrollView: ({ children, ...props }: any) => <RNScrollView {...props}>{children}</RNScrollView>,
  }
})

jest.mock('@tamagui/lucide-icons', () => {
  const { View } = require('react-native')
  return {
    X: (props: any) => <View testID="icon-x" />,
    Check: (props: any) => <View testID="icon-check" />,
    AlertCircle: (props: any) => <View testID="icon-alert" />,
    Users: (props: any) => <View testID="icon-users" />,
    XCircle: (props: any) => <View testID="icon-x-circle" />,
    CheckCircle: (props: any) => <View testID="icon-check-circle" />,
  }
})

jest.mock('../../design-tokens', () => ({
  colors: {
    green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
    gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827' },
    red: { 50: '#fef2f2', 200: '#fecaca', 300: '#fca5a5', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
    blue: { 300: '#93c5fd', 600: '#2563eb', 700: '#1d4ed8' },
  },
  borderRadius: { sm: 4, default: 4, md: 8, lg: 12, xl: 16, '2xl': 20 },
}))

// ─── Import after mocks ──────────────────────────────────────

import JoinByCodeSheet from './JoinByCodeSheet'

// ─── Test Data ───────────────────────────────────────────────

const LOOKUP_SUCCESS = {
  data: {
    delegation: { id: 'del-1', delegatePct: 40, message: 'Help me sell tomatoes!' },
    delegator: { id: 'user-abc', full_name: 'Jane Farmer', avatar_url: null },
  },
  error: null,
}

const LOOKUP_ERROR = {
  data: { error: 'Invalid or expired pairing code' },
  error: null,
}

// ─── Tests ───────────────────────────────────────────────────

describe('JoinByCodeSheet', () => {
  const mockOnClose = jest.fn()
  const mockOnAcceptCode = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockOnAcceptCode.mockResolvedValue({ delegation: { id: 'del-1' } })
  })

  it('does not render when not visible', () => {
    const { toJSON } = render(
      <JoinByCodeSheet visible={false} onClose={mockOnClose} onAcceptCode={mockOnAcceptCode} />
    )
    expect(toJSON()).toBeNull()
  })

  it('renders code entry step when visible', () => {
    render(
      <JoinByCodeSheet visible={true} onClose={mockOnClose} onAcceptCode={mockOnAcceptCode} />
    )
    expect(screen.getByText('delegate.joinByCode.title')).toBeTruthy()
    expect(screen.getByText('delegate.joinByCode.instructions')).toBeTruthy()
  })

  it('calls lookup-pairing on 6th digit (not onAcceptCode)', async () => {
    mockInvoke.mockResolvedValue(LOOKUP_SUCCESS)

    render(
      <JoinByCodeSheet visible={true} onClose={mockOnClose} onAcceptCode={mockOnAcceptCode} />
    )

    // Simulate entering 6 digits
    const inputs = screen.root.findAllByType(require('react-native').TextInput)
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.changeText(inputs[i], String(i + 1))
      })
    }

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pair-delegation', {
        body: { action: 'lookup-pairing', code: '123456' },
      })
    })

    // onAcceptCode should NOT have been called yet (only after Accept button)
    expect(mockOnAcceptCode).not.toHaveBeenCalled()
  })

  it('shows split review after successful lookup', async () => {
    mockInvoke.mockResolvedValue(LOOKUP_SUCCESS)

    render(
      <JoinByCodeSheet visible={true} onClose={mockOnClose} onAcceptCode={mockOnAcceptCode} />
    )

    const inputs = screen.root.findAllByType(require('react-native').TextInput)
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.changeText(inputs[i], String(i + 1))
      })
    }

    await waitFor(() => {
      expect(screen.getByText('Review Delegation')).toBeTruthy()
      expect(screen.getByText('Jane Farmer')).toBeTruthy()
      expect(screen.getByText('40%')).toBeTruthy()
      expect(screen.getByText('60%')).toBeTruthy()
      expect(screen.getByText('You get')).toBeTruthy()
      expect(screen.getByText('Delegator keeps')).toBeTruthy()
    })
  })

  it('shows delegator personal message', async () => {
    mockInvoke.mockResolvedValue(LOOKUP_SUCCESS)

    render(
      <JoinByCodeSheet visible={true} onClose={mockOnClose} onAcceptCode={mockOnAcceptCode} />
    )

    const inputs = screen.root.findAllByType(require('react-native').TextInput)
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.changeText(inputs[i], String(i + 1))
      })
    }

    await waitFor(() => {
      expect(screen.getByText(/"Help me sell tomatoes!"/)).toBeTruthy()
    })
  })

  it('calls onAcceptCode when Accept is pressed', async () => {
    mockInvoke.mockResolvedValue(LOOKUP_SUCCESS)

    render(
      <JoinByCodeSheet visible={true} onClose={mockOnClose} onAcceptCode={mockOnAcceptCode} />
    )

    const inputs = screen.root.findAllByType(require('react-native').TextInput)
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.changeText(inputs[i], String(i + 1))
      })
    }

    await waitFor(() => {
      expect(screen.getByText('Accept')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(screen.getByText('Accept'))
    })

    await waitFor(() => {
      expect(mockOnAcceptCode).toHaveBeenCalledWith('123456')
    })
  })

  it('resets to code entry when Decline is pressed', async () => {
    mockInvoke.mockResolvedValue(LOOKUP_SUCCESS)

    render(
      <JoinByCodeSheet visible={true} onClose={mockOnClose} onAcceptCode={mockOnAcceptCode} />
    )

    const inputs = screen.root.findAllByType(require('react-native').TextInput)
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.changeText(inputs[i], String(i + 1))
      })
    }

    await waitFor(() => {
      expect(screen.getByText('Decline')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(screen.getByText('Decline'))
    })

    // Should be back to code entry
    await waitFor(() => {
      expect(screen.getByText('delegate.joinByCode.title')).toBeTruthy()
    })

    expect(mockOnAcceptCode).not.toHaveBeenCalled()
  })

  it('shows error for invalid code', async () => {
    mockInvoke.mockResolvedValue(LOOKUP_ERROR)

    render(
      <JoinByCodeSheet visible={true} onClose={mockOnClose} onAcceptCode={mockOnAcceptCode} />
    )

    const inputs = screen.root.findAllByType(require('react-native').TextInput)
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.changeText(inputs[i], '9')
      })
    }

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired pairing code')).toBeTruthy()
    })
  })

  it('shows success after acceptance', async () => {
    mockInvoke.mockResolvedValue(LOOKUP_SUCCESS)
    mockOnAcceptCode.mockResolvedValue({ delegation: { id: 'del-1' } })

    render(
      <JoinByCodeSheet visible={true} onClose={mockOnClose} onAcceptCode={mockOnAcceptCode} />
    )

    const inputs = screen.root.findAllByType(require('react-native').TextInput)
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.changeText(inputs[i], String(i + 1))
      })
    }

    await waitFor(() => {
      expect(screen.getByText('Accept')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(screen.getByText('Accept'))
    })

    await waitFor(() => {
      expect(screen.getByText('delegate.joinByCode.success')).toBeTruthy()
    })
  })
})
