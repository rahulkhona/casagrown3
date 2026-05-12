import React from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  View,
  Platform,
  StyleSheet,
  StatusBar,
  RefreshControl,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, spacing } from '../../theme';

type ScreenWrapperProps = {
  children: React.ReactNode;
  scrollable?: boolean;
  keyboardAvoiding?: boolean;
  noPadding?: boolean;
  bgColor?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export function ScreenWrapper({
  children, scrollable = true, keyboardAvoiding = false,
  noPadding = false, bgColor, refreshing, onRefresh, style, contentStyle,
}: ScreenWrapperProps) {
  const insets = useSafeAreaInsets();

  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        !noPadding && styles.padded,
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing || false}
            onRefresh={onRefresh}
            tintColor={colors.green[600]}
            colors={[colors.green[600]]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fillContent, !noPadding && styles.padded, contentStyle]}>
      {children}
    </View>
  );

  const wrapped = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? layout.navbarHeight + insets.top : 0}
    >
      {content}
    </KeyboardAvoidingView>
  ) : content;

  return (
    <View style={[styles.container, { backgroundColor: bgColor || colors.white }, style]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      {wrapped}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  fillContent: { flex: 1 },
  padded: { paddingHorizontal: layout.containerPadding },
});
