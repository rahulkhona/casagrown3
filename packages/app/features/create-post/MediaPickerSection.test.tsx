/**
 * MediaPickerSection Component Tests
 *
 * Tests: section rendering, media preview thumbnails, video vs photo distinction,
 * remove button, picker buttons (camera/gallery/file upload).
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import type { UseMediaAssetsReturn } from './useMediaAssets'

// Mock WebCameraModal
jest.mock('./WebCameraModal', () => ({
  WebCameraModal: () => null,
}))

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock lucide icons
jest.mock('@tamagui/lucide-icons', () => {
  const { Text: RNText } = require('react-native')
  return {
    Camera: () => <RNText>CameraIcon</RNText>,
    Video: () => <RNText>VideoIcon</RNText>,
    Trash2: () => <RNText>TrashIcon</RNText>,
    Image: () => <RNText>ImageIcon</RNText>,
  }
})

// Mock tamagui
jest.mock('tamagui', () => {
  const { View, Text: RNText, TouchableOpacity, ScrollView: RNScrollView } = require('react-native')

  return {
    Button: ({ children, onPress, icon, ...props }: any) => (
      <TouchableOpacity onPress={onPress} {...props}>
        {icon}
        {typeof children === 'string' ? <RNText>{children}</RNText> : children}
      </TouchableOpacity>
    ),
    Text: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    Label: ({ children, ...props }: any) => <RNText {...props}>{children}</RNText>,
    ScrollView: ({ children, ...props }: any) => <RNScrollView {...props}>{children}</RNScrollView>,
  }
})

import { MediaPickerSection } from './MediaPickerSection'

// Helper to build a mock UseMediaAssetsReturn
function buildMockMedia(overrides: Partial<UseMediaAssetsReturn> = {}): UseMediaAssetsReturn {
  return {
    mediaAssets: [],
    setMediaAssets: jest.fn(),
    showMediaMenu: false,
    setShowMediaMenu: jest.fn(),
    cameraMode: null,
    setCameraMode: jest.fn(),
    fileInputRef: { current: null },
    handleWebFileChange: jest.fn(),
    handleWebCameraCapture: jest.fn(),
    handlePickMedia: jest.fn(),
    takePhoto: jest.fn(),
    pickFromGallery: jest.fn(),
    recordVideo: jest.fn(),
    removeMedia: jest.fn(),
    ...overrides,
  }
}

describe('MediaPickerSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the section label', () => {
    const media = buildMockMedia()
    render(<MediaPickerSection media={media} />)
    expect(screen.getByText('createPost.fields.media')).toBeTruthy()
  })

  it('renders custom label when provided', () => {
    const media = buildMockMedia()
    render(<MediaPickerSection media={media} label="Attach Files" />)
    expect(screen.getByText('Attach Files')).toBeTruthy()
  })

  it('renders no preview items when mediaAssets is empty', () => {
    const media = buildMockMedia({ mediaAssets: [] })
    render(<MediaPickerSection media={media} />)
    expect(screen.queryByText('TrashIcon')).toBeNull()
  })

  it('renders image previews for photo assets', () => {
    const media = buildMockMedia({
      mediaAssets: [
        { uri: 'file:///photo1.jpg', type: 'image' as const },
        { uri: 'file:///photo2.jpg', type: 'image' as const },
      ],
    })
    render(<MediaPickerSection media={media} />)
    // Each preview item has a delete button
    expect(screen.getAllByText('TrashIcon')).toHaveLength(2)
  })

  it('shows VIDEO badge for video assets', () => {
    const media = buildMockMedia({
      mediaAssets: [
        { uri: 'file:///video.mp4', type: 'video' as const },
      ],
    })
    render(<MediaPickerSection media={media} />)
    expect(screen.getByText('createPost.media.videoBadge')).toBeTruthy()
  })

  it('does not show VIDEO badge for image assets', () => {
    const media = buildMockMedia({
      mediaAssets: [
        { uri: 'file:///photo.jpg', type: 'image' as const },
      ],
    })
    render(<MediaPickerSection media={media} />)
    expect(screen.queryByText('createPost.media.videoBadge')).toBeNull()
  })

  it('calls removeMedia when trash button is pressed', () => {
    const removeMedia = jest.fn()
    const media = buildMockMedia({
      mediaAssets: [
        { uri: 'file:///photo.jpg', type: 'image' as const },
      ],
      removeMedia,
    })
    render(<MediaPickerSection media={media} />)
    fireEvent.press(screen.getByText('TrashIcon'))
    expect(removeMedia).toHaveBeenCalledWith(0)
  })

  it('calls removeMedia with correct index for multiple items', () => {
    const removeMedia = jest.fn()
    const media = buildMockMedia({
      mediaAssets: [
        { uri: 'file:///a.jpg', type: 'image' as const },
        { uri: 'file:///b.jpg', type: 'image' as const },
        { uri: 'file:///c.jpg', type: 'image' as const },
      ],
      removeMedia,
    })
    render(<MediaPickerSection media={media} />)
    const trashButtons = screen.getAllByText('TrashIcon')
    fireEvent.press(trashButtons[1]!) // Remove middle item
    expect(removeMedia).toHaveBeenCalledWith(1)
  })

  it('renders camera buttons', () => {
    const media = buildMockMedia()
    render(<MediaPickerSection media={media} />)
    expect(screen.getByText('CameraIcon')).toBeTruthy()
    expect(screen.getByText('VideoIcon')).toBeTruthy()
  })

  it('calls takePhoto when camera button pressed', () => {
    const takePhoto = jest.fn()
    const media = buildMockMedia({ takePhoto })
    render(<MediaPickerSection media={media} />)
    fireEvent.press(screen.getByText('CameraIcon'))
    expect(takePhoto).toHaveBeenCalled()
  })

  it('calls recordVideo when video button pressed', () => {
    const recordVideo = jest.fn()
    const media = buildMockMedia({ recordVideo })
    render(<MediaPickerSection media={media} />)
    fireEvent.press(screen.getByText('VideoIcon'))
    expect(recordVideo).toHaveBeenCalled()
  })

  it('calls pickFromGallery when image picker button pressed', () => {
    const pickFromGallery = jest.fn()
    const media = buildMockMedia({ pickFromGallery })
    render(<MediaPickerSection media={media} />)
    fireEvent.press(screen.getByText('ImageIcon'))
    expect(pickFromGallery).toHaveBeenCalled()
  })

  it('matches snapshot with mixed media', () => {
    const media = buildMockMedia({
      mediaAssets: [
        { uri: 'file:///photo.jpg', type: 'image' as const },
        { uri: 'file:///video.mp4', type: 'video' as const },
      ],
    })
    const tree = render(<MediaPickerSection media={media} />)
    expect(tree.toJSON()).toMatchSnapshot()
  })
})
