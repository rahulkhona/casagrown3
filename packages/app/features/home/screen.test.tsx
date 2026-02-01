import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HomeScreen } from './screen'

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en',
      changeLanguage: jest.fn(),
    },
  }),
}))

// Mock Tamagui icons
jest.mock('@tamagui/lucide-icons', () => ({
  ArrowRight: () => null,
  Shield: () => null,
  Zap: () => null,
  HandHeart: () => null,
  Sparkles: () => null,
  Ban: () => null,
  TrendingUp: () => null,
  GraduationCap: () => null,
}))

// Mock image asset requires
jest.mock('react-native', () => {
    const RN = jest.requireActual('react-native');
    RN.Image.resolveAssetSource = jest.fn((source) => source);
    return RN;
});

// Mock UI components to avoid "Cannot redefine property" error in Jest
// and to simplify snapshot/testing.
jest.mock('@casagrown/ui', () => {
  const { View, Text, TouchableOpacity } = require('react-native')
  return {
    Button: ({ children, onPress, iconAfter, ...props }: any) => (
      <TouchableOpacity onPress={onPress} {...props}>
          {children}
          {iconAfter && <Text>Icon</Text>}
      </TouchableOpacity>
    ),
    H1: ({ children, ...props }: any) => <Text {...props} testID="h1">{children}</Text>,
    H2: ({ children, ...props }: any) => <Text {...props} testID="h2">{children}</Text>,
    H3: ({ children, ...props }: any) => <Text {...props} testID="h3">{children}</Text>,
    Paragraph: ({ children, ...props }: any) => <Text {...props} testID="p">{children}</Text>,
    Text: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    ScrollView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    // Add other components if specific props need handling
  }
})


describe('HomeScreen', () => {
  it('renders correctly and displays localized text', () => {
    const { getByText } = render(<HomeScreen />)

    // Check for Main Headline
    expect(getByText('home.headline')).toBeTruthy()

    // Check for Subheadline
    expect(getByText('home.subheadline')).toBeTruthy()

    // Check for CTA Button
    expect(getByText('home.joinMovement')).toBeTruthy()
  })

  it('triggers onLinkPress when "Join the Movement" is clicked', () => {
    const onLinkPressMock = jest.fn()
    const { getByText } = render(<HomeScreen onLinkPress={onLinkPressMock} />)

    // Find the CTA button text and press it
    // Note: Tamagui buttons might need to be found by role or text. 
    // Since we put text inside Button, finding by text usually works for press in RNTL.
    const button = getByText('home.joinMovement')
    fireEvent.press(button)

    expect(onLinkPressMock).toHaveBeenCalledTimes(1)
  })

  it('renders all feature sections', () => {
    const { getByText } = render(<HomeScreen />)
    
    // How It Works
    expect(getByText('home.howItWorks.title')).toBeTruthy()
    
    // Points System
    expect(getByText('home.pointsSection.title')).toBeTruthy()
    
    // Safety
    expect(getByText('home.safetySection.title')).toBeTruthy()
    
    // Mission
    expect(getByText('home.missionSection.title')).toBeTruthy()
  })
  it('matches snapshot', () => {
    const tree = render(<HomeScreen />).toJSON()
    expect(tree).toMatchSnapshot()
  })
})
