/**
 * Shared Design Tokens for CasaGrown
 *
 * These tokens are the source of truth for colors, fonts, and spacing
 * across both web (Tailwind) and mobile (Tamagui/Expo) platforms.
 *
 * All values are extracted from the Figma design to ensure consistency.
 */

// =============================================================================
// Color Palette (from Tailwind CSS / Figma)
// =============================================================================

export const colors = {
  // Primary Green - Main brand color
  green: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    500: "#22c55e",
    600: "#16a34a", // Primary green
    700: "#15803d",
    800: "#166534",
    900: "#14532d",
  },

  // Emerald - For "Incredible Freshness" card
  emerald: {
    200: "#a7f3d0", // Card background
    300: "#6ee7b7", // Icon circle background
    700: "#047857", // Icon color
  },

  // Amber - For "Stop Food Waste" card
  amber: {
    200: "#fde68a", // Card background
    300: "#fcd34d", // Icon circle background
    700: "#b45309", // Icon color
  },

  // Sky - For "Beat Inflation" card
  sky: {
    200: "#bae6fd", // Card background
    300: "#7dd3fc", // Icon circle background
    700: "#0369a1", // Icon color
  },

  // Pink - For "Teen Opportunity" card
  pink: {
    50: "#fdf2f8",
    100: "#fce7f3",
    200: "#fbcfe8", // Card background
    300: "#f9a8d4", // Icon circle background
    600: "#db2777",
    700: "#be185d", // Icon color
  },

  // Blue - For "Buying" post type badges
  blue: {
    100: "#dbeafe",
    600: "#2563eb",
    700: "#1d4ed8",
  },

  // Purple - For "Services" post type badges
  purple: {
    100: "#f3e8ff",
    600: "#9333ea",
    700: "#7c3aed",
  },

  // Red - For error states and notification badges
  red: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    400: "#f87171",
    500: "#ef4444", // Notification badges
    600: "#dc2626",
    700: "#b91c1c",
  },

  // Gray - Text and backgrounds
  gray: {
    50: "#f9fafb", // Light background
    100: "#f3f4f6", // Lighter background
    200: "#e5e7eb", // Borders
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280", // Secondary text
    600: "#4b5563", // Body text
    700: "#374151", // Dark body text
    800: "#1f2937", // Headings
    900: "#111827", // Darkest
  },

  // Neutral - Alias for gray (for compatibility)
  neutral: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },

  // Primary - Green scale with all shades (for UI components)
  primary: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#14532d",
  },

  // Error - Red scale for destructive actions
  error: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d",
  },

  // Pure colors
  white: "#ffffff",
  black: "#000000",

  // Semantic aliases for easier use (legacy - prefer using scales above)
  primaryColor: "#16a34a", // green-600
  primaryDark: "#15803d", // green-700
  primaryLight: "#dcfce7", // green-100
  background: "#ffffff",
  backgroundAlt: "#f9fafb", // gray-50
  text: "#1f2937", // gray-800
  textSecondary: "#4b5563", // gray-600
  textMuted: "#6b7280", // gray-500
  border: "#e5e7eb", // gray-200
  borderPrimary: "#bbf7d0", // green-200
} as const;

// =============================================================================
// Typography
// =============================================================================

export const typography = {
  // Font families
  fontFamily: {
    sans:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },

  // Font sizes (in pixels, matching Computed Styles)
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16, // text-base (16px from user computed style)
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 36,
    "5xl": 48,
    "6xl": 60,
  },

  // Font weights
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },

  // Line heights
  lineHeight: {
    tight: 1.25,
    normal: 24, // 24px from user computed style
    relaxed: 1.625,
    loose: 2,
  },
} as const;

// =============================================================================
// Spacing (in pixels, matching Tailwind's spacing scale)
// =============================================================================

export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  28: 112,
  32: 128,
  36: 144,
  40: 160,
  44: 176,
  48: 192,
  52: 208,
  56: 224,
  60: 240,
  64: 256,
  72: 288,
  80: 320,
  96: 384,
} as const;

// =============================================================================
// Border Radius
// =============================================================================

export const borderRadius = {
  none: 0,
  sm: 2,
  default: 4,
  md: 6,
  lg: 8,
  xl: 12,
  "2xl": 16,
  "3xl": 24,
  full: 9999,
} as const;

// =============================================================================
// Shadows
// =============================================================================

export const shadows = {
  sm: {
    color: "rgba(0, 0, 0, 0.05)",
    offset: { width: 0, height: 1 },
    radius: 2,
    elevation: 1,
  },
  default: {
    color: "rgba(0, 0, 0, 0.1)",
    offset: { width: 0, height: 1 },
    radius: 3,
    elevation: 2,
  },
  md: {
    color: "rgba(0, 0, 0, 0.1)",
    offset: { width: 0, height: 4 },
    radius: 6,
    elevation: 3,
  },
  lg: {
    color: "rgba(0, 0, 0, 0.1)",
    offset: { width: 0, height: 10 },
    radius: 15,
    elevation: 5,
  },
  xl: {
    color: "rgba(0, 0, 0, 0.1)",
    offset: { width: 0, height: 20 },
    radius: 25,
    elevation: 8,
  },
  "2xl": {
    color: "rgba(0, 0, 0, 0.25)",
    offset: { width: 0, height: 25 },
    radius: 50,
    elevation: 12,
  },
} as const;

// =============================================================================
// Why Trade Homegrown Card Configurations
// =============================================================================

export const whyTradeCards = [
  {
    id: "freshness",
    title: "Incredible Freshness",
    description:
      "Fruits in grocery stores often take weeks to months to reach the shelves. CasaGrown connects you with neighbors for produce picked fresh from the tree.",
    bgColor: colors.emerald[200],
    iconBgColor: colors.emerald[300],
    iconColor: colors.emerald[700],
    icon: "Sparkles",
  },
  {
    id: "waste",
    title: "Stop Food Waste",
    description:
      "Over 11.5 billion pounds of backyard produce goes to waste every year. Join us in saving it to feed 28 million people.",
    bgColor: colors.amber[200],
    iconBgColor: colors.amber[300],
    iconColor: colors.amber[700],
    icon: "Ban",
  },
  {
    id: "inflation",
    title: "Beat Inflation",
    description:
      "Earn extra cash from your garden selling homegrown abundance to neighbors, or save money by finding high-quality produce right next door.",
    bgColor: colors.sky[200],
    iconBgColor: colors.sky[300],
    iconColor: colors.sky[700],
    icon: "TrendingUp",
  },
  {
    id: "teen",
    title: "Teen Opportunity",
    description:
      "Empower teens to learn business skills and earn pocket money by selling and delivering homegrown produce.",
    bgColor: colors.pink[200],
    iconBgColor: colors.pink[300],
    iconColor: colors.pink[700],
    icon: "GraduationCap",
  },
] as const;

// =============================================================================
// How It Works Steps
// =============================================================================

export const howItWorksSteps = [
  {
    number: 1,
    title: "Join Your Community",
    description:
      "Sign up and join communities based on your neighborhood, workplace, or frequented spots",
  },
  {
    number: 2,
    title: "Buy or Sell Produce",
    description:
      "List your excess produce or find fresh items from neighbors using our point system",
  },
  {
    number: 3,
    title: "Delegate Tasks (Optional)",
    description:
      "Optionally empower your teen or gardener to manage sales and deliveries on your behalf",
  },
  {
    number: 4,
    title: "Drop-off",
    description:
      "Drop-off produce, take photo of delivery and get paid in points. No awkward meetups or schedule coordination needed—safe, contactless, and convenient for everyone.",
  },
  {
    number: 5,
    title: "Redeem or Donate Points",
    description:
      "Redeem your points for gift cards or donate to local charities and food banks",
  },
] as const;

// =============================================================================
// Safety & Convenience Features
// =============================================================================

export const safetyFeatures = [
  {
    id: "transaction",
    icon: "Shield",
    iconBg: colors.green[600],
    title: "Transaction Safety & Security",
    bullets: [
      "Built-in escrow system protects buyers and sellers",
      "Drop-off option for safety and convenience",
      "Safe for teen sellers",
      "Local-only membership keeps community trusted",
      "Dispute handling for complete peace of mind",
    ],
  },
  {
    id: "instant",
    icon: "Zap",
    iconBg: colors.green[600],
    title: "Instant Point Availability",
    introText:
      "Unlike credit cards or Venmo which take 2-5 business days to make funds available, CasaGrown points are available immediately upon order completion.",
    bullets: [
      "No waiting periods or banking delays",
      "Start spending points instantly",
      "Redeem for gift cards anytime",
    ],
  },
  {
    id: "charity",
    icon: "HandHeart",
    iconBg: colors.green[600],
    title: "Give Back to Your Community",
    introText:
      "Turn your backyard surplus into community support by donating points to local charities and food banks.",
    bullets: [
      "Donate points to local charities",
      "Support community food banks",
      "Every transaction reduces food waste",
      "Make a difference with every sale",
    ],
  },
] as const;

// =============================================================================
// Export all tokens as a single object for convenience
// =============================================================================

export const designTokens = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  whyTradeCards,
  howItWorksSteps,
  safetyFeatures,
} as const;

export default designTokens;
