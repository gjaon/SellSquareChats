import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import SmartImage from '../../src/components/SmartImage';
import { FeedPost, getHistoryFeed } from '../../src/services/feedService';
import { Colors } from '../../src/constants/colors';
import { API_URL } from '../../src/constants/config';
import { useThemedStyles } from '../../src/theme/useThemedStyles';

// Resolve a possibly-relative media URL into something loadable. Keep in sync
// with `resolveMediaUrl` in discover.tsx / DiscoverPostCard.
const resolveMediaUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${API_URL}${raw}`;
  return raw;
};

const formatNaira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

const priceLabel = (post: FeedPost) => {
  const p = post.price;
  if (p.hasRange && p.min !== p.max) {
    return `${formatNaira(p.min)} – ${formatNaira(p.max)}`;
  }
  return formatNaira(p.effective || p.base || p.min);
};

const timeAgo = (iso?: string) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
};

// Bucket the seen time into a human section. Ordered list of (key, matcher).
const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

const bucketFor = (iso?: string): string => {
  if (!iso) return 'Earlier';
  const today = startOfDay(new Date());
  const seen = startOfDay(new Date(iso));
  const dayMs = 86400000;
  if (seen >= today) return 'Today';
  if (seen >= today - dayMs) return 'Yesterday';
  if (seen >= today - 6 * dayMs) return 'This week';
  if (seen >= today - 29 * dayMs) return 'This month';
  return 'Earlier';
};

const SECTION_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier'];

interface Section {
  title: string;
  data: FeedPost[];
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await getHistoryFeed();
      setPosts(data?.items || []);
      setError(null);
    } catch (_err) {
      setError('Could not load your history. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // Group the (already most-recent-first) list into time-bucketed sections,
  // preserving the server order within each bucket.
  const sections = useMemo<Section[]>(() => {
    const byBucket = new Map<string, FeedPost[]>();
    for (const post of posts) {
      const key = bucketFor(post.seenAt);
      if (!byBucket.has(key)) byBucket.set(key, []);
      byBucket.get(key)!.push(post);
    }
    return SECTION_ORDER.filter((k) => byBucket.has(k)).map((title) => ({
      title,
      data: byBucket.get(title)!,
    }));
  }, [posts]);

  const openPost = useCallback(
    (post: FeedPost) => {
      const productContext = JSON.stringify({
        type: post.type,
        productId: post.productId,
        groupId: post.groupId,
        variantKey: null,
        name: post.name,
        price: post.price.effective || post.price.min,
      });
      router.push({
        pathname: '/chat/[storeToken]',
        params: {
          storeToken: post.business.chatToken,
          presetMessage: `Hi! I'm interested in ${post.name}.`,
          productContext,
        },
      });
    },
    [router],
  );

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={() => router.back()}
        accessibilityLabel="Back"
      >
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>History</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  const renderItem = ({ item }: { item: FeedPost }) => {
    const thumb = resolveMediaUrl(item.media?.primary);
    const soldOut =
      item.type === 'group' ? !item.stock?.anyInStock : item.stock?.quantity === 0;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => openPost(item)}
      >
        <View style={styles.thumbWrap}>
          {thumb ? (
            <SmartImage uri={thumb} style={styles.thumb} variant="thumb" />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Ionicons name="image-outline" size={22} color={Colors.textMuted} />
            </View>
          )}
          {soldOut && (
            <View style={styles.soldOutPill}>
              <Text style={styles.soldOutText}>Sold out</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.price}>{priceLabel(item)}</Text>
          <View style={styles.storeRow}>
            {item.business?.logo ? (
              <SmartImage
                uri={resolveMediaUrl(item.business.logo)}
                style={styles.storeLogo}
                variant="thumb"
              />
            ) : (
              <View style={[styles.storeLogo, styles.storeLogoFallback]}>
                <Text style={styles.storeLogoLetter}>
                  {(item.business?.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.storeName} numberOfLines={1}>
              {item.business?.name}
            </Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <Text style={styles.seenAt}>{timeAgo(item.seenAt)}</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && posts.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (!loading && posts.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={34} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No history yet</Text>
          <Text style={styles.emptySubtitle}>
            {error ||
              'Posts you view in Discover show up here, most recent first.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      />
    </View>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingBottom: 12,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: 'Manrope_700Bold',
      color: C.text,
    },
    listContent: { paddingBottom: 40, paddingHorizontal: 16, paddingTop: 8 },
    sectionHeader: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 18,
      marginBottom: 8,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surface,
      borderRadius: 16,
      padding: 10,
      marginBottom: 10,
      shadowColor: C.cardShadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 3,
      elevation: 1,
    },
    thumbWrap: { position: 'relative' },
    thumb: {
      width: 78,
      height: 78,
      borderRadius: 12,
      backgroundColor: C.border,
    },
    thumbFallback: { alignItems: 'center', justifyContent: 'center' },
    soldOutPill: {
      position: 'absolute',
      bottom: 4,
      left: 4,
      backgroundColor: 'rgba(0,0,0,0.65)',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    soldOutText: {
      color: '#fff',
      fontSize: 9,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
    },
    cardBody: { flex: 1, marginLeft: 12, gap: 3 },
    name: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: C.text,
      lineHeight: 19,
    },
    price: {
      fontSize: 14,
      fontFamily: 'Manrope_700Bold',
      color: C.primary,
    },
    storeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    storeLogo: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: C.border,
    },
    storeLogoFallback: { alignItems: 'center', justifyContent: 'center' },
    storeLogoLetter: {
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      color: C.textSecondary,
    },
    storeName: {
      flex: 1,
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
    },
    cardMeta: {
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      paddingLeft: 8,
      gap: 6,
    },
    seenAt: {
      fontSize: 11,
      fontFamily: 'Manrope_500Medium',
      color: C.textMuted,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.primaryLight,
      marginBottom: 6,
    },
    emptyTitle: {
      fontSize: 17,
      fontFamily: 'Manrope_700Bold',
      color: C.text,
    },
    emptySubtitle: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
    },
  });
