// Variant chip strip used by both Discover cards and the chat panel's
// Variant Sheet. Renders one row per attribute as text chips. Every
// attribute (including "Color") is rendered the same way so the merchant's
// own value labels are always visible verbatim.
//
// `selected` is a map { attribute -> selectedOptionValue }. The parent owns
// state. `onSelect(attribute, value)` is fired on every chip tap.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import type { FeedVariants } from '../services/feedService';

interface Props {
  variants: FeedVariants;
  selected: Record<string, string | null>;
  onSelect: (attribute: string, value: string) => void;
  compact?: boolean;
  light?: boolean; // render against dark backgrounds (Discover overlay)
}

export default function VariantChipStrip({
  variants,
  selected,
  onSelect,
  compact = false,
  light = false,
}: Props) {
  if (!variants || variants.attributes.length === 0) return null;

  const labelColor = light ? '#FFFFFF' : Colors.text;
  const subtleColor = light ? 'rgba(255,255,255,0.7)' : Colors.textMuted;
  const chipBg = light ? 'rgba(255,255,255,0.16)' : Colors.background;
  const chipBorder = light ? 'rgba(255,255,255,0.3)' : Colors.border;
  const chipBgActive = light ? '#FFFFFF' : Colors.primary;
  const chipTextActive = light ? Colors.text : '#FFFFFF';

  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      {variants.attributes.map((attr) => {
        const opts = variants.optionMeta?.[attr] || [];
        if (opts.length === 0) return null;
        const activeValue = selected[attr] || null;
        return (
          <View key={attr} style={[styles.row, compact && styles.rowCompact]}>
            <Text style={[styles.attrLabel, { color: subtleColor }]}>
              {attr}
              {activeValue ? (
                <Text style={[styles.attrValue, { color: labelColor }]}>
                  {`  ${activeValue}`}
                </Text>
              ) : null}
            </Text>
            <View style={styles.chipsRow}>
              {opts.map((opt) => {
                const isActive = activeValue === opt.value;
                const dim = !opt.anyInStock;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => onSelect(attr, opt.value)}
                    activeOpacity={0.75}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isActive ? chipBgActive : chipBg,
                        borderColor: isActive
                          ? isActive && light
                            ? '#FFFFFF'
                            : Colors.primary
                          : chipBorder,
                      },
                      dim && styles.chipDim,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: isActive ? chipTextActive : labelColor },
                        dim && styles.chipTextDim,
                      ]}
                    >
                      {opt.value}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  rootCompact: { gap: 6 },
  row: { gap: 6 },
  rowCompact: { gap: 4 },
  attrLabel: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  attrValue: {
    fontFamily: 'Manrope_700Bold',
    textTransform: 'none',
    letterSpacing: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
  },
  chipDim: { opacity: 0.45 },
  chipTextDim: { textDecorationLine: 'line-through' },
  swatchOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  swatchDim: { opacity: 0.4 },
  swatchSlash: {
    position: 'absolute',
    width: 26,
    height: 1.5,
    backgroundColor: 'rgba(255,0,0,0.7)',
    transform: [{ rotate: '-45deg' }],
  },
});
