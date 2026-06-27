// Full-height variant picker for a single FeedPost group, opened from the
// chat store info panel when a buyer taps a group card. Shows a swipeable
// image carousel that re-syncs when a variant is chosen, the variant chip
// strip (with color swatches), live price + stock, and two CTAs:
//   - "Ask about this variant" (preset includes the chosen variant)
//   - "Ask about all variants"  (preset just lists the options)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SmartImage from './SmartImage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { API_URL } from '../constants/config';
import type { FeedPost } from '../services/feedService';
import {
  buildCarousel,
  buildChatPresetMessage,
  findCombination,
  formatPriceLabel,
} from '../utils/variantHelpers';
import VariantChipStrip from './VariantChipStrip';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_WIDTH = SCREEN_WIDTH;
const CAROUSEL_HEIGHT = Math.round(SCREEN_WIDTH * 0.85);

const resolveMediaUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${API_URL}${raw}`;
  return raw;
};

interface Props {
  post: FeedPost | null;
  visible: boolean;
  onClose: () => void;
  /** Called with a preset chat message + structured productContext */
  onAsk: (preset: string, productContext: Record<string, unknown>) => void;
}

export default function VariantSheet({ post, visible, onClose, onAsk }: Props) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Record<string, string | null>>({});

  // Reset selection whenever a new post is opened. Selection is OPTIONAL —
  // the user can pick some, all, or none of the attributes; the AI will
  // ask follow-up questions in chat to fill in the gaps.
  useEffect(() => {
    if (!post || !visible) return;
    setSelected({});
    setPageIndex(0);
  }, [post, visible]);

  const carouselImages = useMemo(() => {
    if (!post) return [];
    return buildCarousel(post, selected)
      .map(resolveMediaUrl)
      .filter(Boolean) as string[];
  }, [post, selected]);

  const [pageIndex, setPageIndex] = useState(0);
  const flatRef = useRef<FlatList<string>>(null);

  const activeCombo = post ? findCombination(post, selected) : null;

  // Sync carousel with active variant image
  useEffect(() => {
    if (!activeCombo?.image) return;
    const resolved = resolveMediaUrl(activeCombo.image);
    if (!resolved) return;
    const idx = carouselImages.indexOf(resolved);
    if (idx >= 0 && idx !== pageIndex) {
      flatRef.current?.scrollToIndex({ index: idx, animated: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCombo?.image]);

  if (!post) return null;

  const handleSelect = (attribute: string, value: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => {
      // Tapping the same chip clears it (so users can deselect).
      if (prev[attribute] === value) {
        const next = { ...prev };
        next[attribute] = null;
        return next;
      }
      return { ...prev, [attribute]: value };
    });
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_WIDTH);
    if (idx !== pageIndex) setPageIndex(idx);
  };

  const askAboutProduct = () => {
    const preset = buildChatPresetMessage(post, selected);
    const productContext = {
      type: post.type,
      productId: post.productId,
      groupId: post.groupId,
      variantKey: activeCombo?.key || null,
      variantLabel: activeCombo?.label || null,
      values: activeCombo?.values || (post.type === 'group' ? selected : null),
      name: post.name,
      price: activeCombo?.price ?? post.price.effective,
    };
    onAsk(preset, productContext);
  };

  const isSoldOut = post.type === 'group'
    ? !post.stock.anyInStock
    : post.stock.quantity === 0;
  const variantSoldOut = post.type === 'group' && activeCombo
    ? !activeCombo.inStock
    : false;
  const ctaDisabled = isSoldOut;

  // Merchants often store group names as "Product / Variant". Strip anything
  // after the first "/" for the title so the variant part doesn't show up
  // twice (once in the title, once in the chips).
  const displayName = (post.name || '').split('/')[0].trim() || post.name;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={2}>
                {displayName}
              </Text>
              {post.category && (
                <Text style={styles.category}>{post.category}</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Carousel */}
            <View style={[styles.carouselWrap, { height: CAROUSEL_HEIGHT }]}>
              {carouselImages.length > 0 ? (
                <FlatList
                  ref={flatRef}
                  data={carouselImages}
                  keyExtractor={(uri, i) => `${uri}-${i}`}
                  renderItem={({ item }) => (
                    <SmartImage
                      uri={item}
                      style={{
                        width: CAROUSEL_WIDTH - 40,
                        height: CAROUSEL_HEIGHT,
                      }}
                      variant="feed"
                      resizeMode="cover"
                    />
                  )}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onScrollEnd}
                  snapToInterval={CAROUSEL_WIDTH - 40}
                  decelerationRate="fast"
                />
              ) : (
                <View style={styles.imgPlaceholder}>
                  <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
                </View>
              )}

              {carouselImages.length > 1 && (
                <View style={styles.dotsRow} pointerEvents="none">
                  {carouselImages.map((_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, i === pageIndex && styles.dotActive]}
                    />
                  ))}
                </View>
              )}

              {post.type === 'group' && post.variants && (
                <View style={styles.variantsPill}>
                  <Ionicons name="layers-outline" size={12} color="#fff" />
                  <Text style={styles.variantsPillText}>
                    {post.variants.combinations.length} variants
                  </Text>
                </View>
              )}
            </View>

            {/* Variant chips */}
            {post.type === 'group' && post.variants && (
              <View style={styles.chipsBlock}>
                <VariantChipStrip
                  variants={post.variants}
                  selected={selected}
                  onSelect={handleSelect}
                />
              </View>
            )}

            {/* Price + stock */}
            <View style={styles.priceBlock}>
              <Text style={styles.priceText}>{formatPriceLabel(post, selected)}</Text>
              {variantSoldOut && (
                <View style={styles.stockBadgeOut}>
                  <Text style={styles.stockBadgeText}>Sold out</Text>
                </View>
              )}
              {!variantSoldOut && activeCombo?.lowStock && (
                <View style={styles.stockBadgeLow}>
                  <Text style={styles.stockBadgeText}>
                    Only {activeCombo.quantity} left
                  </Text>
                </View>
              )}
              {!activeCombo && post.type !== 'group' && post.stock.lowStock && (
                <View style={styles.stockBadgeLow}>
                  <Text style={styles.stockBadgeText}>
                    Only {post.stock.quantity} left
                  </Text>
                </View>
              )}
            </View>

            {/* Description */}
            {!!post.description && (
              <Text style={styles.description}>{post.description}</Text>
            )}
          </ScrollView>

          {/* CTAs */}
          <View
            style={[
              styles.ctaRow,
              { paddingBottom: 14 + Math.max(insets.bottom, 8) },
            ]}
          >
            <TouchableOpacity
              style={[styles.ctaPrimary, ctaDisabled && styles.ctaDisabled]}
              onPress={askAboutProduct}
              activeOpacity={0.85}
              disabled={ctaDisabled}
            >
              <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
              <Text style={styles.ctaPrimaryText}>
                {ctaDisabled ? 'Sold out' : 'Ask about this'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    color: C.text,
  },
  category: {
    fontSize: 12,
    fontFamily: 'Manrope_500Medium',
    color: C.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  carouselWrap: {
    backgroundColor: C.background,
    marginHorizontal: 20,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  imgPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dotActive: {
    width: 14,
    backgroundColor: '#fff',
  },
  variantsPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  variantsPillText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
  },
  chipsBlock: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    flexWrap: 'wrap',
  },
  priceText: {
    fontSize: 22,
    fontFamily: 'Manrope_700Bold',
    color: C.primary,
  },
  stockBadgeLow: {
    backgroundColor: 'rgba(245, 158, 11, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  stockBadgeOut: {
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  stockBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
  },
  description: {
    paddingHorizontal: 20,
    paddingTop: 14,
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
    lineHeight: 20,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  ctaSecondary: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSecondaryText: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: C.text,
  },
  ctaPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: C.primary,
  },
  ctaDisabled: {
    backgroundColor: 'rgba(120,120,120,0.6)',
  },
  ctaPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
});
