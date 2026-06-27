// Light + dark palettes for Chatalog. The exported `Colors` object in
// `./colors.ts` is mutated in place when the theme switches, and the root
// navigator is re-keyed so every component's `StyleSheet.create(...)` runs
// again against the new values. This lets us flip the whole app without
// rewriting every leaf to read from a context.

export type ThemePalette = {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  warning: string;
  error: string;
  errorLight: string;
  successLight: string;
  warningLight: string;
  cardBlue: string;
  white: string;
  black: string;
  overlay: string;
  cardShadow: string;
  bubbleAI: string;
  bubbleUser: string;
  bubbleAgent: string;
  bubbleUserText: string;
  holdTimerSafe: string;
  holdTimerWarning: string;
  holdTimerExpired: string;
};

export const lightTheme: ThemePalette = {
  primary: '#295F2D',
  primaryLight: '#3d8042',
  primaryDark: '#1a3f1e',
  secondary: '#ff7722',
  background: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  success: '#28a745',
  warning: '#f59e0b',
  error: '#ef4444',
  errorLight: '#fef2f2',
  successLight: '#EAFFEB',
  warningLight: '#FFF1B7',
  cardBlue: '#D4F0FF',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
  cardShadow: 'rgba(0,0,0,0.06)',
  bubbleAI: '#EEF2FF',
  bubbleUser: '#295F2D',
  bubbleAgent: '#DCFCE7',
  bubbleUserText: '#ffffff',
  holdTimerSafe: '#295F2D',
  holdTimerWarning: '#f59e0b',
  holdTimerExpired: '#94a3b8',
};

export const darkTheme: ThemePalette = {
  primary: '#3d8042',
  primaryLight: '#5aa460',
  primaryDark: '#295F2D',
  secondary: '#ff8c3d',
  background: '#0f172a',
  surface: '#1e293b',
  border: '#334155',
  text: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  success: '#22c55e',
  warning: '#fbbf24',
  error: '#f87171',
  errorLight: '#3a1414',
  successLight: '#143a1d',
  warningLight: '#3a2f0a',
  cardBlue: '#1e3a52',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.65)',
  cardShadow: 'rgba(0,0,0,0.4)',
  bubbleAI: '#1e293b',
  bubbleUser: '#3d8042',
  bubbleAgent: '#1e3a25',
  bubbleUserText: '#ffffff',
  holdTimerSafe: '#3d8042',
  holdTimerWarning: '#fbbf24',
  holdTimerExpired: '#64748b',
};

export type ThemeMode = 'light' | 'dark';
