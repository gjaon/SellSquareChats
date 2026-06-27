import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyThemePalette } from '../constants/colors';
import { darkTheme, lightTheme, type ThemeMode } from '../constants/themes';

const STORAGE_KEY = 'chatalog.theme.mode';

type ThemeContextValue = {
  mode: ThemeMode;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
  /** Increments on each theme change. Use as a `key` to remount subtrees. */
  paletteVersion: number;
  isReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [paletteVersion, setPaletteVersion] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Apply palette synchronously on every mode change BEFORE children
  // render, so initial style evaluation already sees the right values.
  const applyMode = useCallback((next: ThemeMode) => {
    applyThemePalette(next === 'dark' ? darkTheme : lightTheme);
  }, []);

  // Load persisted preference once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const next: ThemeMode = stored === 'dark' ? 'dark' : 'light';
        if (cancelled) return;
        applyMode(next);
        setModeState(next);
        // Bump paletteVersion so any subtree that already rendered with
        // the default light palette (e.g. while AsyncStorage was loading)
        // remounts / recomputes its themed StyleSheet with the restored
        // palette. Without this, restoring `dark` on launch leaves
        // children rendering stale light-mode styles until the user
        // toggles the theme again.
        setPaletteVersion((v) => v + 1);
      } catch {
        applyMode('light');
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMode]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      applyMode(next);
      setModeState(next);
      setPaletteVersion((v) => v + 1);
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    },
    [applyMode],
  );

  const toggleMode = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, toggleMode, setMode, paletteVersion, isReady }),
    [mode, toggleMode, setMode, paletteVersion, isReady],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
