import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { colors, radius, typography, shadows } from '../../theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
};

export function Button({
  title, onPress, variant = 'primary', size = 'md',
  disabled = false, loading = false, icon, fullWidth = false, style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && { width: '100%' },
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.green[600]} />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, variantTextStyles[variant], sizeTextStyles[size]]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.xl,
    ...shadows.sm,
  } as ViewStyle,
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  text: { fontFamily: 'Inter', fontWeight: '600' },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.green[600] },
  secondary: { backgroundColor: colors.green[50], borderWidth: 1, borderColor: colors.green[200] },
  danger: { backgroundColor: colors.red[600] },
  ghost: { backgroundColor: 'transparent' },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.gray[200] },
};

const variantTextStyles: Record<ButtonVariant, TextStyle> = {
  primary: { color: '#fff' },
  secondary: { color: colors.green[700] },
  danger: { color: '#fff' },
  ghost: { color: colors.gray[600] },
  outline: { color: colors.gray[700] },
};

const sizeStyles: Record<ButtonSize, ViewStyle> = {
  xs: { paddingVertical: 4, paddingHorizontal: 10 },
  sm: { paddingVertical: 6, paddingHorizontal: 14 },
  md: { paddingVertical: 10, paddingHorizontal: 20 },
  lg: { paddingVertical: 14, paddingHorizontal: 28 },
};

const sizeTextStyles: Record<ButtonSize, TextStyle> = {
  xs: { fontSize: 12 },
  sm: { fontSize: 13 },
  md: { fontSize: 14 },
  lg: { fontSize: 16 },
};
