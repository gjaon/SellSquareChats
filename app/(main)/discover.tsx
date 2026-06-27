import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  ViewToken,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { RootState } from '../../src/store';

import DiscoverPostCard from '../../src/components/DiscoverPostCard';
import DiscoverSkeleton from '../../src/components/DiscoverSkeleton';
import { prefetchImages } from '../../src/components/SmartImage';
import { FeedPost, getDiscoverFeed, recordFeedEngagement } from '../../src/services/feedService';
import { Colors } from '../../src/constants/colors';
import { API_URL } from '../../src/constants/config';
import ThemeToggleButton from '../../src/components/ThemeToggleButton';

const newSeed = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Resolve a possibly-relative media URL into something prefetchable. Keep
// in sync with `resolveMediaUrl` inside DiscoverPostCard.
const resolveMediaUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${API_URL}${raw}`;
  return raw;
};

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { focusPost } = useLocalSearchParams<{ focusPost?: string }>();
  // Each card occupies the entire visible area between the status bar
  // and the bottom tab bar so the FlatList snaps exactly one card per
  // page (TikTok-style). useBottomTabBarHeight() already accounts for
  // the bottom safe-area inset, so we don't subtract insets.bottom
  // separately.
  const tabBarHeight = useBottomTabBarHeight();
  const screenHeight = Dimensions.get('window').height;
  const itemHeight = screenHeight - tabBarHeight;

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [seed, setSeed] = useState<string>(() => newSeed());
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Suspends vertical paging while a card is in magnify / scrub mode,
  // so a downward drag inside the lens doesn't snap to the next post.
  const [mediaLocked, setMediaLocked] = useState(false);

  const loadingRef = useRef(false);
  const flatListRef = useRef<FlatList<FeedPost>>(null);
  const focusHandledRef = useRef<string | null>(null);
  // Post ids whose "view" we've already recorded this session — keeps us from
  // re-pinging the server as the buyer scrolls back and forth.
  const recordedViewsRef = useRef<Set<string>>(new Set());

  const fetchPage = useCallback(
    async ({
      reset = false,
      seedOverride,
    }: { reset?: boolean; seedOverride?: string } = {}) => {
      if (loadingRef.current) return;
      if (!reset && !hasMore) return;
      loadingRef.current = true;
      // Show the full-screen skeleton only when we have nothing to display yet
      // AND this isn't a pull-to-refresh (refresh has its own spinner).
      if (posts.length === 0 && !refreshing) {
        setLoadingInitial(true);
      } else if (!reset) {
        setLoadingMore(true);
      }

      try {
        const { data } = await getDiscoverFeed({
          cursor: reset ? null : cursor,
          seed: seedOverride || seed,
          limit: 10,
        });
        setError(null);
        setPosts((prev) => (reset ? data.items : [...prev, ...data.items]));
        setCursor(data.nextCursor);
        setHasMore(Boolean(data.nextCursor));
      } catch (_err) {
        setError('Could not load the feed. Pull down to retry.');
      } finally {
        loadingRef.current = false;
        setLoadingInitial(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [cursor, hasMore, posts.length, seed, refreshing]
  );

  useEffect(() => {
    fetchPage({ reset: true });
    // intentionally only on mount; subsequent loads driven by user scroll/refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When arriving from the search screen with a `focusPost` param, prepend
  // the selected post (if it isn't already at the top) and snap to it. We
  // intentionally key on the raw param string so navigating to the same
  // post twice still re-focuses.
  useEffect(() => {
    if (!focusPost || focusHandledRef.current === focusPost) return;
    try {
      const parsed = JSON.parse(focusPost) as FeedPost;
      if (!parsed?.id) return;
      focusHandledRef.current = focusPost;
      setPosts((prev) => {
        const without = prev.filter((p) => p.id !== parsed.id);
        return [parsed, ...without];
      });
      setActiveIndex(0);
      // Defer scroll until after the FlatList re-renders with the new item.
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
      // Clear the param so back-navigating + returning doesn't re-trigger.
      router.setParams({ focusPost: undefined } as any);
    } catch {
      // Bad JSON — ignore silently.
    }
  }, [focusPost, router]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const next = newSeed();
    setSeed(next);
    setCursor(null);
    setHasMore(true);
    fetchPage({ reset: true, seedOverride: next });
  }, [fetchPage]);

  // Realtime Discover refresh: a `marketplace.listing.changed` broadcast
  // (product edited / stock changed / a store toggled its AI on-off) bumps
  // `discoverDirtyAt`. Refetch the feed when it changes, skipping the
  // initial null so we don't double-fetch on mount.
  const discoverDirtyAt = useSelector((s: RootState) => s.realtime.discoverDirtyAt);
  const lastDirtyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!discoverDirtyAt) return;
    if (lastDirtyRef.current === discoverDirtyAt) return;
    lastDirtyRef.current = discoverDirtyAt;
    const next = newSeed();
    setSeed(next);
    setCursor(null);
    setHasMore(true);
    fetchPage({ reset: true, seedOverride: next });
  }, [discoverDirtyAt, fetchPage]);

  const onEndReached = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    fetchPage();
  }, [fetchPage, hasMore]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && typeof viewableItems[0].index === 'number') {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  // Warm the next post's primary image so the buyer never sees a blank
  // frame when they swipe up. Limited to ONE post (not two) and gated by
  // a short delay so a fast scroll does not enqueue a prefetch for every
  // card flown past. expo-image dedupes by URL so revisits are free.
  useEffect(() => {
    const next = resolveMediaUrl(posts[activeIndex + 1]?.media?.primary);
    if (!next) return;
    const t = setTimeout(() => prefetchImages([next]), 200);
    return () => clearTimeout(t);
  }, [activeIndex, posts]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  // Record a "view" once the active post has settled for ~1s (so a fast
  // scroll-by doesn't count). This powers the buyer's History screen — the
  // backend de-dupes per post and bumps the seen time on re-view. Deduped
  // per session here too so we don't re-ping while scrolling back and forth.
  useEffect(() => {
    const post = posts[activeIndex];
    if (!post || recordedViewsRef.current.has(post.id)) return;
    const t = setTimeout(() => {
      recordedViewsRef.current.add(post.id);
      recordFeedEngagement({
        productId: post.productId,
        groupId: post.groupId,
        action: 'view',
      }).catch(() => {
        // Allow a later retry if the request failed.
        recordedViewsRef.current.delete(post.id);
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [activeIndex, posts]);

  const openSearch = () => {
    router.push('/(main)/search' as any);
  };

  const renderHeader = () => (
    <View
      style={[styles.headerOverlay, { paddingTop: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Discover</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={openSearch}
            accessibilityLabel="Search products"
          >
            <Ionicons name="search" size={22} color="#fff" />
          </TouchableOpacity>
          <ThemeToggleButton color="#fff" size={22} />
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/(main)/notifications' as any)}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loadingInitial && posts.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <DiscoverSkeleton height={itemHeight} />
        {renderHeader()}
      </View>
    );
  }

  if (!loadingInitial && posts.length === 0) {
    return (
      <View style={styles.fullCenter}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.emptyTitle}>Nothing here yet</Text>
        <Text style={styles.emptySubtitle}>
          {error || 'No products available. Pull down to refresh.'}
        </Text>
        {renderHeader()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <DiscoverPostCard
            post={item}
            height={itemHeight}
            isActive={index === activeIndex}
            onMediaInteractionChange={setMediaLocked}
          />
        )}
        pagingEnabled
        scrollEnabled={!mediaLocked}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: itemHeight,
          offset: itemHeight * index,
          index,
        })}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
            colors={[Colors.primary]}
            progressBackgroundColor="#222"
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null
        }
      />

      {/* Floating header overlay sits above the feed */}
      {renderHeader()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  fullCenter: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontFamily: 'Manrope_500Medium',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  // Header overlay
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Manrope_700Bold',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
