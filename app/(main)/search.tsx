// Dedicated search screen for the Discover marketplace.
// Lives at /(main)/search and is opened from the search icon on Discover.
// The input and the result list share this single page so users can refine
// without losing context.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import SmartImage from '../../src/components/SmartImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { FeedPost, getDiscoverFeed } from '../../src/services/feedService';
import { getCurrencySymbol } from '../../src/utils/currency';
import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';
import { API_URL } from '../../src/constants/config';

const RECENT_KEY = 'chatalog.discover.recentSearches.v1';
const MAX_RECENT = 8;

const resolveMediaUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${API_URL}${raw}`;
  return raw;
};

const formatPrice = (post: FeedPost): string => {
  const symbol = getCurrencySymbol(post.business?.currency);
  const fmt = (n: number) => `${symbol}${Number(n || 0).toLocaleString()}`;
  if (post.type === 'group' && post.price.hasRange) {
    return `${fmt(post.price.min)} – ${fmt(post.price.max)}`;
  }
  return fmt(post.price.effective || post.price.min || post.price.base);
};

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);

  const [input, setInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [results, setResults] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const inputRef = useRef<TextInput>(null);
  const reqIdRef = useRef(0);

  // Load recent searches from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setRecent(parsed.slice(0, MAX_RECENT));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  const persistRecent = useCallback((next: string[]) => {
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const runSearch = useCallback(
    async (term: string, opts: { append?: boolean; cursorToken?: string | null } = {}) => {
      const trimmed = term.trim();
      if (!trimmed) {
        setResults([]);
        setCursor(null);
        setHasMore(false);
        setActiveQuery('');
        setError(null);
        return;
      }
      const myReqId = ++reqIdRef.current;
      if (opts.append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setActiveQuery(trimmed);
      }
      try {
        const { data } = await getDiscoverFeed({
          search: trimmed,
          cursor: opts.append ? opts.cursorToken || null : null,
          limit: 20,
        });
        // Drop stale responses
        if (myReqId !== reqIdRef.current) return;
        setResults((prev) => (opts.append ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
        setHasMore(Boolean(data.nextCursor));
        setError(null);
      } catch (_err) {
        if (myReqId !== reqIdRef.current) return;
        setError('Search failed. Try again.');
        if (!opts.append) setResults([]);
      } finally {
        if (myReqId === reqIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  const submit = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      Keyboard.dismiss();
      if (!trimmed) return;
      // Bump to top of recents
      const next = [
        trimmed,
        ...recent.filter((r) => r.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, MAX_RECENT);
      persistRecent(next);
      setInput(trimmed);
      runSearch(trimmed);
    },
    [recent, persistRecent, runSearch],
  );

  const onEndReached = useCallback(() => {
    if (loading || loadingMore || !hasMore || !cursor || !activeQuery) return;
    runSearch(activeQuery, { append: true, cursorToken: cursor });
  }, [loading, loadingMore, hasMore, cursor, activeQuery, runSearch]);

  const clearInput = () => {
    setInput('');
    setResults([]);
    setCursor(null);
    setHasMore(false);
    setActiveQuery('');
    setError(null);
    inputRef.current?.focus();
  };

  const removeRecent = (term: string) => {
    persistRecent(recent.filter((r) => r !== term));
  };

  const clearAllRecent = () => {
    persistRecent([]);
  };

  const openPost = (post: FeedPost) => {
    // Take the user back into the Discover feed focused on the selected
    // product. We pass the full post JSON via the route param so Discover
    // can render it immediately without an extra fetch.
    router.push({
      pathname: '/(main)/discover',
      params: { focusPost: JSON.stringify(post) },
    } as any);
  };

  const renderResult = ({ item }: { item: FeedPost }) => {
    const thumbUrl = resolveMediaUrl(item.media.primary);
    const cleanName = (item.name || '').split('/')[0].trim() || item.name;
    return (
      <TouchableOpacity
        style={styles.resultRow}
        onPress={() => openPost(item)}
        activeOpacity={0.7}
      >
        {thumbUrl ? (
          <SmartImage uri={thumbUrl} style={styles.resultThumb} variant="thumb" />
        ) : (
          <View style={[styles.resultThumb, styles.thumbPlaceholder]}>
            <Ionicons name="image-outline" size={22} color={Colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.resultName} numberOfLines={1}>
            {cleanName}
          </Text>
          <Text style={styles.resultStore} numberOfLines={1}>
            {item.business?.name || 'Store'}
            {item.category ? ` · ${item.category}` : ''}
          </Text>
          <View style={styles.resultMetaRow}>
            <Text style={styles.resultPrice}>{formatPrice(item)}</Text>
            {item.type === 'group' && item.variants && (
              <View style={styles.variantBadge}>
                <Ionicons name="layers-outline" size={11} color={Colors.textSecondary} />
                <Text style={styles.variantBadgeText}>
                  {item.variants.combinations.length} variants
                </Text>
              </View>
            )}
            {!item.stock.inStock && !item.stock.anyInStock && (
              <Text style={styles.soldOutText}>Sold out</Text>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  };

  const showRecents = !activeQuery && !loading && results.length === 0;
  const showEmptyState =
    activeQuery && !loading && results.length === 0 && !error;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => submit(input)}
            placeholder="Search products, categories, stores…"
            placeholderTextColor={Colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
          />
          {!!input && (
            <TouchableOpacity onPress={clearInput} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!!activeQuery && (
        <View style={styles.activeQueryRow}>
          <Text style={styles.activeQueryText} numberOfLines={1}>
            Results for "<Text style={styles.activeQueryBold}>{activeQuery}</Text>"
          </Text>
        </View>
      )}

      {loading && results.length === 0 ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : showRecents ? (
        <View style={styles.recentsBlock}>
          {recent.length === 0 ? (
            <View style={styles.centerBlock}>
              <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.hintTitle}>Search the marketplace</Text>
              <Text style={styles.hintText}>
                Find products by name, category, or store.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>Recent searches</Text>
                <TouchableOpacity onPress={clearAllRecent} hitSlop={8}>
                  <Text style={styles.clearAllText}>Clear all</Text>
                </TouchableOpacity>
              </View>
              {recent.map((term) => (
                <View key={term} style={styles.recentRow}>
                  <TouchableOpacity
                    style={styles.recentRowLeft}
                    onPress={() => submit(term)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                    <Text style={styles.recentText}>{term}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeRecent(term)} hitSlop={8}>
                    <Ionicons name="close" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>
      ) : showEmptyState ? (
        <View style={styles.centerBlock}>
          <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.hintTitle}>No matches</Text>
          <Text style={styles.hintText}>
            We couldn't find anything for "{activeQuery}". Try a different keyword.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderResult}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={Colors.primary} size="small" />
              </View>
            ) : null
          }
        />
      )}

      {!!error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    padding: 0,
  },
  activeQueryRow: {
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  activeQueryText: {
    color: C.textSecondary,
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
  },
  activeQueryBold: {
    color: C.text,
    fontFamily: 'Manrope_700Bold',
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  hintTitle: {
    color: C.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
    marginTop: 6,
  },
  hintText: {
    color: C.textSecondary,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  recentsBlock: {
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  recentTitle: {
    color: C.textSecondary,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  clearAllText: {
    color: C.primary,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  recentRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  recentText: {
    color: C.text,
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: C.surface,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultName: {
    color: C.text,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  resultStore: {
    color: C.textSecondary,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  resultPrice: {
    color: C.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  variantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: C.surface,
    borderRadius: 6,
  },
  variantBadgeText: {
    color: C.textSecondary,
    fontFamily: 'Manrope_500Medium',
    fontSize: 11,
  },
  soldOutText: {
    color: C.textMuted,
    fontFamily: 'Manrope_500Medium',
    fontSize: 11,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 84,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  errorText: {
    color: C.text,
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    textAlign: 'center',
  },
});
