import { lightTheme, type ThemePalette } from './themes';

// `Colors` is a singleton mutated in place by the ThemeProvider on theme
// switch. Module-level `StyleSheet.create({...})` only captures the values
// that exist at module evaluation time, so any component that wants its
// styles to react to a theme change must build them inside the component
// body using the `useThemedStyles(makeStyles)` hook from
// `../theme/useThemedStyles`. That hook subscribes to the palette version
// from `useTheme()` and rebuilds the StyleSheet whenever the theme flips.
//
// `Colors.x` references inside JSX (icon `color` props, dynamic style
// objects, etc.) re-evaluate naturally because `useThemedStyles` already
// triggers a re-render — so they read the up-to-date palette.
export const Colors: ThemePalette = { ...lightTheme };

export const applyThemePalette = (palette: ThemePalette) => {
  // Mutate in place so any code path that captured a reference to `Colors`
  // sees the updated values.
  for (const key of Object.keys(palette) as (keyof ThemePalette)[]) {
    (Colors as any)[key] = palette[key];
  }
};
