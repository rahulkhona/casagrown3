import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '../../theme';
import { badgeColors } from '../../theme';

// ─── Card ────────────────────────────────────────────────────────
type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
};

export function Card({ children, style, padded = true }: CardProps) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>
      {children}
    </View>
  );
}

// ─── Badge ───────────────────────────────────────────────────────
type BadgeColor = keyof typeof badgeColors;

type BadgeProps = {
  text: string;
  color?: BadgeColor;
  icon?: string;
  style?: ViewStyle;
};

export function Badge({ text, color = 'green', icon, style }: BadgeProps) {
  const scheme = badgeColors[color];
  return (
    <View style={[styles.badge, { backgroundColor: scheme.bg }, style]}>
      {icon && <Text style={{ fontSize: 12 }}>{icon}</Text>}
      <Text style={[styles.badgeText, { color: scheme.text }]}>{text}</Text>
    </View>
  );
}

// ─── Divider ─────────────────────────────────────────────────────
export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

// ─── EmptyState ──────────────────────────────────────────────────
type EmptyStateProps = {
  icon: string;
  title: string;
  message?: string;
  children?: React.ReactNode;
};

export function EmptyState({ icon, title, message, children }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message && <Text style={styles.emptyMessage}>{message}</Text>}
      {children}
    </View>
  );
}

// ─── LoadingSpinner ──────────────────────────────────────────────
import { ActivityIndicator } from 'react-native';

export function LoadingSpinner({ size = 'large', color }: { size?: 'small' | 'large'; color?: string }) {
  return (
    <View style={styles.spinner}>
      <ActivityIndicator size={size} color={color || colors.green[600]} />
    </View>
  );
}

// ─── Price ───────────────────────────────────────────────────────
export function Price({ amount, large, strikethrough }: { amount: number; large?: boolean; strikethrough?: boolean }) {
  return (
    <Text style={[
      styles.price,
      large && styles.priceLarge,
      strikethrough && styles.priceStrike,
    ]}>
      ${amount.toFixed(2)}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.gray[200],
    ...shadows.sm,
  } as ViewStyle,
  padded: { padding: spacing.lg },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.full,
  },
  badgeText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray[200],
    marginVertical: spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: { fontSize: 48, marginBottom: spacing.lg },
  emptyTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[700],
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyMessage: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: colors.gray[500],
    textAlign: 'center',
    maxWidth: 360,
    marginBottom: spacing.xl,
  },
  spinner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
  },
  price: {
    fontFamily: 'Inter',
    fontWeight: '700',
    color: colors.green[700],
    fontSize: 14,
  },
  priceLarge: { fontSize: 24 },
  priceStrike: {
    textDecorationLine: 'line-through',
    color: colors.gray[400],
    fontWeight: '400',
  },
});
