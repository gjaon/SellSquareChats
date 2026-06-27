import { useMemo } from 'react';
import { Colors } from '../constants/colors';
import { useTheme } from './ThemeContext';

/**
 * Builds a StyleSheet from the current theme palette and recomputes when
 * the theme changes.
 *
 * Usage:
 *   const makeStyles = (C: typeof Colors) => StyleSheet.create({
 *     container: { backgroundColor: C.background },
 *   });
 *
 *   function MyScreen() {
 *     const styles = useThemedStyles(makeStyles);
 *     return <View style={styles.container} />;
 *   }
 *
 * `useTheme()` is called so the component re-renders on palette change,
 * and `useMemo` keyed on `paletteVersion` rebuilds the StyleSheet so the
 * native side-table receives the fresh color values.
 */
export function useThemedStyles<T>(factory: (palette: typeof Colors) => T): T {
  const { paletteVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(Colors), [paletteVersion, factory]);
}
