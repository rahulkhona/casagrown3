import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius } from '../../theme';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

type AvatarProps = {
  name?: string | null;
  imageUrl?: string | null;
  size?: AvatarSize;
  style?: ViewStyle;
};

const sizeMap: Record<AvatarSize, number> = { sm: 32, md: 40, lg: 56, xl: 72 };
const fontSizeMap: Record<AvatarSize, number> = { sm: 13, md: 16, lg: 22, xl: 28 };

export function Avatar({ name, imageUrl, size = 'md', style }: AvatarProps) {
  const dim = sizeMap[size];
  const initials = name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[{ width: dim, height: dim, borderRadius: dim / 2 }, style as any]}
      />
    );
  }

  return (
    <View style={[styles.container, { width: dim, height: dim, borderRadius: dim / 2 }, style]}>
      <Text style={[styles.text, { fontSize: fontSizeMap[size] }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.green[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'Inter',
    fontWeight: '600',
    color: colors.green[700],
  },
});
