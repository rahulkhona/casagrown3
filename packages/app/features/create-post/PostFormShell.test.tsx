/**
 * PostFormShell Component Tests
 *
 * Tests: layout rendering, back navigation, submit button states,
 * error banner display/dismissal, custom labels.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { PostFormShell } from './PostFormShell'

// Mock safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock lucide icons
jest.mock('@tamagui/lucide-icons', () => ({
  ArrowLeft: () => null,
}))

// Mock tamagui
jest.mock('tamagui', () => {
  const { View, Text: RNText, TouchableOpacity, ScrollView: RNScrollView } = require('react-native')

  return {
    Button: ({ children, onPress, disabled, icon, ...props }: any) => (
      <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityState={{ disabled }} {...props}>
        {icon}
        {typeof children === 'string' ? <RNText>{children}</RNText> : children}
      </TouchableOpacity>
    ),
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    ScrollView: ({ children, ...props }: any) => <RNScrollView {...props}>{children}</RNScrollView>,
    Spinner: () => <RNText>Spinner</RNText>,
  }
})

describe('PostFormShell', () => {
  const defaultProps = {
    title: 'Sell Produce',
    onBack: jest.fn(),
    onSubmit: jest.fn(),
    submitting: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders title text', () => {
    render(
      <PostFormShell {...defaultProps}>
        <></>
      </PostFormShell>
    )
    expect(screen.getByText('Sell Produce')).toBeTruthy()
  })

  it('renders children content', () => {
    const { Text: RNText } = require('react-native')
    render(
      <PostFormShell {...defaultProps}>
        <RNText>Form Fields Here</RNText>
      </PostFormShell>
    )
    expect(screen.getByText('Form Fields Here')).toBeTruthy()
  })

  it('renders default submit label from translation key', () => {
    render(
      <PostFormShell {...defaultProps}>
        <></>
      </PostFormShell>
    )
    expect(screen.getByText('createPost.submit')).toBeTruthy()
  })

  it('renders custom submit label when provided', () => {
    render(
      <PostFormShell {...defaultProps} submitLabel="List Item">
        <></>
      </PostFormShell>
    )
    expect(screen.getByText('List Item')).toBeTruthy()
  })

  it('shows spinner and submitting label when submitting', () => {
    render(
      <PostFormShell {...defaultProps} submitting={true}>
        <></>
      </PostFormShell>
    )
    expect(screen.getByText('Spinner')).toBeTruthy()
    expect(screen.getByText('createPost.submitting')).toBeTruthy()
  })

  it('shows custom submitting label', () => {
    render(
      <PostFormShell {...defaultProps} submitting={true} submittingLabel="Saving...">
        <></>
      </PostFormShell>
    )
    expect(screen.getByText('Saving...')).toBeTruthy()
  })

  it('displays error banner when formError is set', () => {
    render(
      <PostFormShell {...defaultProps} formError="Category is required">
        <></>
      </PostFormShell>
    )
    expect(screen.getByText('Category is required')).toBeTruthy()
  })

  it('does not display error banner when formError is empty', () => {
    render(
      <PostFormShell {...defaultProps} formError="">
        <></>
      </PostFormShell>
    )
    expect(screen.queryByText('✕')).toBeNull()
  })

  it('shows dismiss button when onClearError is provided', () => {
    const onClearError = jest.fn()
    render(
      <PostFormShell {...defaultProps} formError="Error!" onClearError={onClearError}>
        <></>
      </PostFormShell>
    )
    const dismissButton = screen.getByText('✕')
    expect(dismissButton).toBeTruthy()
    fireEvent.press(dismissButton)
    expect(onClearError).toHaveBeenCalled()
  })

  it('hides dismiss button when onClearError is not provided', () => {
    render(
      <PostFormShell {...defaultProps} formError="Error!">
        <></>
      </PostFormShell>
    )
    // The ✕ should not be rendered without onClearError
    expect(screen.queryByText('✕')).toBeNull()
  })

  it('calls onSubmit when submit button pressed', () => {
    render(
      <PostFormShell {...defaultProps}>
        <></>
      </PostFormShell>
    )
    fireEvent.press(screen.getByText('createPost.submit'))
    expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('matches snapshot in default state', () => {
    const tree = render(
      <PostFormShell {...defaultProps}>
        <></>
      </PostFormShell>
    )
    expect(tree.toJSON()).toMatchSnapshot()
  })

  it('matches snapshot in submitting state with error', () => {
    const tree = render(
      <PostFormShell
        {...defaultProps}
        submitting={true}
        formError="Something went wrong"
        onClearError={() => {}}
      >
        <></>
      </PostFormShell>
    )
    expect(tree.toJSON()).toMatchSnapshot()
  })
})
