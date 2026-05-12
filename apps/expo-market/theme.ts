/**
 * CasaGrown Market — Design System
 * Direct port of globals.css design tokens to React Native
 */
import { Platform, TextStyle } from 'react-native';

// ─── Color Palette ───────────────────────────────────────────────
export const colors = {
  green: {
    50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
    400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d',
    800: '#166534', 900: '#14532d',
  },
  emerald: { 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 700: '#047857' },
  amber: {
    50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
    500: '#f59e0b', 600: '#d97706', 700: '#b45309',
  },
  sky: { 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 700: '#0369a1' },
  pink: {
    50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4',
    600: '#db2777', 700: '#be185d',
  },
  blue: { 100: '#dbeafe', 600: '#2563eb', 700: '#1d4ed8' },
  purple: { 100: '#f3e8ff', 600: '#9333ea', 700: '#7c3aed' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
  gray: {
    50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
    400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
    800: '#1f2937', 900: '#111827',
  },
  white: '#ffffff',
  black: '#000000',
} as const;

// ─── Semantic Colors ─────────────────────────────────────────────
export const semantic = {
  bg: colors.white,
  bgAlt: colors.gray[50],
  textPrimary: colors.gray[800],
  textSecondary: colors.gray[600],
  textMuted: colors.gray[500],
  border: colors.gray[200],
  primary: colors.green[600],
  primaryDark: colors.green[700],
  primaryLight: colors.green[50],
  danger: colors.red[600],
  dangerLight: colors.red[50],
  warning: colors.amber[500],
  warningLight: colors.amber[50],
  info: colors.blue[600],
  infoLight: colors.blue[100],
  success: colors.green[500],
  successLight: colors.green[100],
} as const;

// ─── Spacing ─────────────────────────────────────────────────────
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40,
} as const;

// ─── Border Radius ───────────────────────────────────────────────
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 16,
  '2xl': 24,
  full: 9999,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────
export const shadows = {
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
    android: { elevation: 1 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    android: { elevation: 3 },
  }),
  lg: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
    android: { elevation: 6 },
  }),
  xl: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16 },
    android: { elevation: 10 },
  }),
} as const;

// ─── Typography ──────────────────────────────────────────────────
export const fontFamily = 'Inter';

export const typography = {
  hero: { fontFamily, fontSize: 32, fontWeight: '800' as TextStyle['fontWeight'], lineHeight: 38 },
  h1: { fontFamily, fontSize: 24, fontWeight: '700' as TextStyle['fontWeight'], lineHeight: 30 },
  h2: { fontFamily, fontSize: 20, fontWeight: '700' as TextStyle['fontWeight'], lineHeight: 26 },
  h3: { fontFamily, fontSize: 18, fontWeight: '600' as TextStyle['fontWeight'], lineHeight: 24 },
  h4: { fontFamily, fontSize: 16, fontWeight: '600' as TextStyle['fontWeight'], lineHeight: 22 },
  body: { fontFamily, fontSize: 14, fontWeight: '400' as TextStyle['fontWeight'], lineHeight: 20 },
  bodyBold: { fontFamily, fontSize: 14, fontWeight: '600' as TextStyle['fontWeight'], lineHeight: 20 },
  caption: { fontFamily, fontSize: 13, fontWeight: '400' as TextStyle['fontWeight'], lineHeight: 18 },
  captionBold: { fontFamily, fontSize: 13, fontWeight: '600' as TextStyle['fontWeight'], lineHeight: 18 },
  small: { fontFamily, fontSize: 12, fontWeight: '400' as TextStyle['fontWeight'], lineHeight: 16 },
  smallBold: { fontFamily, fontSize: 12, fontWeight: '600' as TextStyle['fontWeight'], lineHeight: 16 },
  tiny: { fontFamily, fontSize: 11, fontWeight: '400' as TextStyle['fontWeight'], lineHeight: 14 },
} as const;

// ─── Badge Color Presets ─────────────────────────────────────────
export const badgeColors = {
  green: { bg: colors.green[100], text: colors.green[700] },
  red: { bg: colors.red[100], text: colors.red[700] },
  amber: { bg: colors.amber[100], text: colors.amber[700] },
  blue: { bg: colors.blue[100], text: colors.blue[700] },
  gray: { bg: colors.gray[100], text: colors.gray[600] },
  purple: { bg: colors.purple[100], text: colors.purple[700] },
  pink: { bg: colors.pink[100], text: colors.pink[700] },
} as const;

// ─── Status Colors ───────────────────────────────────────────────
export const statusColors = {
  open: { bg: colors.green[100], text: colors.green[700] },
  closed: { bg: colors.red[50], text: colors.red[600] },
  pending: { bg: colors.amber[100], text: colors.amber[700] },
  confirmed: { bg: colors.blue[100], text: colors.blue[700] },
  delivered: { bg: colors.green[100], text: colors.green[700] },
  disputed: { bg: colors.red[100], text: colors.red[700] },
  cancelled: { bg: colors.gray[100], text: colors.gray[600] },
} as const;

// ─── Layout Constants ────────────────────────────────────────────
export const layout = {
  navbarHeight: 56,
  tabBarHeight: 60,
  containerPadding: 16,
  maxContentWidth: 600,
} as const;
