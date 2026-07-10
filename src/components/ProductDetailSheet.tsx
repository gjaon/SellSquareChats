// Bottom-sheet modal that shows full details for an AI-recommended
// product card (image, name, price, description). Buyer can tap "Ask
// about this" to send a preset chat message back to the AI. When the
// product has multiple gallery images they appear in a horizontally
// swipeable carousel with a dot indicator.
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SmartImage from './SmartImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import type { ProductCard } from '../store/slices/chatSlice';
import { getCurrencySymbol } from '../utils/currency';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  card: ProductCard | null;
  visible: boolean;
  onClose: () => void;
  onAsk?: (card: ProductCard) => void;
  /** Store currency (ISO-4217). Price formats in the store's own currency. */
  currency?: string;
}

const formatPrice = (n: number, symbol: string) =>
  Number.isFinite(n) && n > 0 ? `${symbol}${Math.round(n).toLocaleString()}` : '';

export default function ProductDetailSheet({ card, visible, onClose, onAsk, currency }: Props) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [pageIndex, setPageIndex] = useState(0);

  if (!card) return null;

  const priceLabel = formatPrice(card.price, getCurrencySymbol(currency));
  // Build the gallery — prefer the multi-image array but fall back to
  // the single `image` for legacy cards. Drop empties so we don't show
  // broken slots.
  const gallery = (card.images && card.images.length > 0
    ? card.images
    : card.image
      ? [card.image]
      : []
  ).filter(Boolean);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const w = e.nativeEvent.layoutMeasurement.width || SCREEN_WIDTH;
    const idx = Math.round(x / w);
    if (idx !== pageIndex) setPageIndex(idx);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16, maxHeight: SCREEN_HEIGHT * 0.85 },
          ]}
        >
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            {gallery.length > 0 ? (
              <View>
                <FlatList
                  data={gallery}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onScrollEnd}
                  keyExtractor={(uri, i) => `${uri}-${i}`}
                  renderItem={({ item }) => (
                    <SmartImage
                      uri={item}
                      style={[styles.image, { width: SCREEN_WIDTH }]}
                      variant="feed"
                      resizeMode="contain"
                    />
                  )}
                />
                {gallery.length > 1 ? (
                  <View style={styles.dots}>
                    {gallery.map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          i === pageIndex && styles.dotActive,
                        ]}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={[styles.image, styles.imagePlaceholder, { width: SCREEN_WIDTH }]}>
                <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
              </View>
            )}
            <View style={styles.body}>
              <Text style={styles.name}>{card.name}</Text>
              {priceLabel ? <Text style={styles.price}>{priceLabel}</Text> : null}
              {card.description ? (
                <Text style={styles.description}>{card.description}</Text>
              ) : (
                <Text style={styles.descriptionMuted}>
                  No additional details available.
                </Text>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.askBtn}
              onPress={() => onAsk?.(card)}
              activeOpacity={0.85}
            >
              <Ionicons name="chatbubble-ellipses" size={16} color={Colors.white} />
              <Text style={styles.askBtnText}>Ask about this</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 8,
    },
    handle: {
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      alignSelf: 'center',
      marginBottom: 8,
    },
    image: {
      // `contain` displays the image in its entirety without cropping;
      // a taller container gives it room to breathe so portrait/square
      // photos don't render as a thin strip.
      width: '100%',
      height: 320,
      backgroundColor: C.background,
    },
    imagePlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      paddingTop: 8,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: C.border,
    },
    dotActive: {
      backgroundColor: C.primary,
      width: 16,
    },
    body: {
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    name: {
      fontSize: 18,
      fontFamily: 'Manrope_700Bold',
      color: C.text,
    },
    price: {
      fontSize: 16,
      fontFamily: 'Manrope_700Bold',
      color: C.primary,
      marginTop: 4,
    },
    description: {
      fontSize: 14,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
      lineHeight: 20,
      marginTop: 12,
    },
    descriptionMuted: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: C.textMuted,
      fontStyle: 'italic',
      marginTop: 12,
    },
    footer: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 18,
      paddingTop: 10,
    },
    closeBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
    },
    closeBtnText: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: C.text,
    },
    askBtn: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: C.primary,
    },
    askBtnText: {
      fontSize: 14,
      fontFamily: 'Manrope_700Bold',
      color: C.white,
    },
  });
