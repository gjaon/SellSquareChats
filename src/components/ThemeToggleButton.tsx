import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';

interface Props {
  /** Override icon color (defaults to `Colors.text`). */
  color?: string;
  /** Background style — pass to match the surrounding header chrome. */
  style?: StyleProp<ViewStyle>;
  size?: number;
}

export default function ThemeToggleButton({ color, style, size = 24 }: Props) {
  const { mode, toggleMode } = useTheme();
  const iconColor = color || Colors.text;
  const iconName = mode === 'dark' ? 'sunny-outline' : 'moon-outline';

  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={toggleMode}
      accessibilityLabel={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      accessibilityRole="button"
    >
      <Ionicons name={iconName} size={size} color={iconColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 8,
  },
});
