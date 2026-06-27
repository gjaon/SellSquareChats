import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../theme/ThemeContext';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'muted';

const buildVariantColors = (C: typeof Colors): Record<BadgeVariant, { bg: string; text: string }> => ({
  success: { bg: C.successLight, text: C.success },
  warning: { bg: C.warningLight, text: C.warning },
  error: { bg: C.errorLight, text: C.error },
  info: { bg: C.cardBlue, text: '#0369a1' },
  muted: { bg: C.border, text: C.textSecondary },
});

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export default function Badge({ label, variant = 'info' }: BadgeProps) {
  const { paletteVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const variantColors = useMemo(() => buildVariantColors(Colors), [paletteVersion]);
  const { bg, text } = variantColors[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 99,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    textTransform: 'capitalize',
  },
});
