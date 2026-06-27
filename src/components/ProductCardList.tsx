// Inline product cards rendered with an AI assistant bubble. Driven by
// the `[[PRODUCT:id]]` / `[[GROUP:id]]` markers that the AI emits in
// chat — the backend resolves them and returns structured cards on the
// message. Tapping "View details" opens a bottom-sheet ProductDetailSheet
// with the full description, image, and an "Ask about this" CTA.
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SmartImage from './SmartImage';
import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import type { ProductCard } from '../store/slices/chatSlice';
import ProductDetailSheet from './ProductDetailSheet';

interface Props {
  cards: ProductCard[];
  /**
   * Called when the buyer taps "Ask about this" inside the detail sheet.
   * The chat screen wires this up to send a preset chat message.
   */
  onAskAbout?: (card: ProductCard) => void;
}

const formatPrice = (n: number) =>
  Number.isFinite(n) && n > 0 ? `₦${Math.round(n).toLocaleString()}` : '';

export default function ProductCardList({ cards, onAskAbout }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [activeCard, setActiveCard] = useState<ProductCard | null>(null);

  if (!cards || cards.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {cards.map((card, idx) => {
        const key = `${card.productId || card.groupId || 'card'}-${idx}`;
        const priceLabel = formatPrice(card.price);
        return (
          <View key={key} style={styles.card}>
            {card.image ? (
              <SmartImage
                uri={card.image}
                style={styles.image}
                variant="card"
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <Ionicons name="image-outline" size={28} color={Colors.textMuted} />
              </View>
            )}
            <View style={styles.body}>
              <Text style={styles.name} numberOfLines={2}>
                {card.name}
              </Text>
              {priceLabel ? (
                <Text style={styles.price}>{priceLabel}</Text>
              ) : null}
              {/* Always show "View details" — tapping it opens the
                  product detail sheet which also shows the larger image
                  and "Ask about this" CTA, even when description is empty. */}
              <TouchableOpacity
                style={styles.detailsBtn}
                onPress={() => setActiveCard(card)}
                activeOpacity={0.8}
              >
                <Text style={styles.detailsBtnText}>View details</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <ProductDetailSheet
        card={activeCard}
        visible={!!activeCard}
        onClose={() => setActiveCard(null)}
        onAsk={(c) => {
          setActiveCard(null);
          onAskAbout?.(c);
        }}
      />
    </View>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    wrap: {
      marginTop: 8,
      gap: 8,
    },
    card: {
      flexDirection: 'row',
      backgroundColor: C.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    image: {
      width: 84,
      height: 84,
    },
    imagePlaceholder: {
      backgroundColor: C.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
      justifyContent: 'space-between',
    },
    name: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: C.text,
    },
    price: {
      fontSize: 13,
      fontFamily: 'Manrope_700Bold',
      color: C.text,
      marginTop: 2,
    },
    detailsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      alignSelf: 'flex-start',
      marginTop: 6,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      backgroundColor: C.successLight,
    },
    detailsBtnText: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      color: C.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
  });
