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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import DiscoverPostCard from '../../src/components/DiscoverPostCard';
import { FeedPost, getSavedPostsFeed } from '../../src/services/feedService';
import { Colors } from '../../src/constants/colors';

// "Saved Posts" reuses the Discover card / vertical pager so the
// experience matches the main feed — the only difference is the data
// source (the buyer's BuyerPostInteraction kind="save" rows). Posts the
// buyer un-saves while scrolling are removed on the next refresh.
export default function SavedPostsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const tabBarHeight = useBottomTabBarHeight();
  const screenHeight = Dimensions.get('window').height;
  const itemHeight = screenHeight - tabBarHeight;

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mediaLocked, setMediaLocked] = useState(false);

  const flatListRef = useRef<FlatList<FeedPost>>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await getSavedPostsFeed();
      setPosts(data?.items || []);
      setError(null);
    } catch (_err) {
      setError('Could not load your saved posts. Pull down to retry.');
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

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && typeof viewableItems[0].index === 'number') {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const renderHeader = () => (
    <View
      style={[styles.headerOverlay, { paddingTop: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Posts</Text>
        <View style={{ width: 36 }} />
      </View>
    </View>
  );

  if (loading && posts.length === 0) {
    return (
      <View style={styles.fullCenter}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <ActivityIndicator color="#fff" />
        {renderHeader()}
      </View>
    );
  }

  if (!loading && posts.length === 0) {
    return (
      <View style={styles.fullCenter}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Ionicons name="bookmark-outline" size={42} color="#fff" />
        <Text style={styles.emptyTitle}>No saved posts yet</Text>
        <Text style={styles.emptySubtitle}>
          {error || 'Tap the bookmark icon on any post in Discover to save it here.'}
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
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        pagingEnabled
        scrollEnabled={!mediaLocked}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
          />
        }
      />
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
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: 'Manrope_700Bold',
    color: '#fff',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
