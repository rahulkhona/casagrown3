import React from 'react';
import { View, Text, TextInput, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';

type InputProps = {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  helper?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  maxLength?: number;
  editable?: boolean;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  returnKeyType?: 'done' | 'next' | 'go' | 'search';
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
  textAlign?: 'left' | 'center' | 'right';
};

export function Input({
  label, value, onChangeText, placeholder, error, helper,
  secureTextEntry, keyboardType = 'default', autoCapitalize = 'sentences',
  multiline, maxLength, editable = true, style, inputStyle,
  returnKeyType, onSubmitEditing, autoFocus, textAlign,
}: InputProps) {
  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.gray[400]}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        maxLength={maxLength}
        editable={editable}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        textAlign={textAlign}
        style={[
          styles.input,
          multiline && styles.multiline,
          error && styles.inputError,
          !editable && styles.disabled,
          inputStyle,
        ]}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {helper && !error && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: {
    ...typography.captionBold,
    color: colors.gray[700],
    marginBottom: 6,
  },
  input: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.lg,
    fontSize: 14,
    fontFamily: 'Inter',
    color: colors.gray[800],
    backgroundColor: colors.white,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  inputError: { borderColor: colors.red[500] },
  disabled: { backgroundColor: colors.gray[100], color: colors.gray[500] },
  error: { ...typography.small, color: colors.red[600], marginTop: 4 },
  helper: { ...typography.small, color: colors.gray[500], marginTop: 4 },
});
