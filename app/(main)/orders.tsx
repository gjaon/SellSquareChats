import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import api from '../../src/services/api';
import { RootState } from '../../src/store';
import Badge from '../../src/components/ui/Badge';
import EmptyState from '../../src/components/ui/EmptyState';
import { getCurrencySymbol } from '../../src/utils/currency';
import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';
import ThemeToggleButton from '../../src/components/ThemeToggleButton';

interface Order {
  _id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  createdAt: string;
  business?: { businessName?: string; currency?: string };
  storeToken?: string;
  lines?: { name: string; requestedQty: number }[];
  reviewSummary?: { averageRating: number; count: number } | null;
}

const STATUS_VARIANT: Record<string, any> = {
  placed: 'info',
  payment_confirmed: 'success',
  accepted: 'success',
  rejected: 'error',
  processing: 'warning',
  shipped: 'info',
  delivered: 'success',
  received: 'success',
  completed: 'success',
  refunded: 'error',
};

// Filter chips. "All" is the default; the rest map 1:1 to backend
// status values. The label is what the chip shows; the value is what we
// match against `order.status`.
const STATUS_FILTERS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'Placed', value: 'placed' },
  { label: 'Confirmed', value: 'payment_confirmed' },
  { label: 'Processing', value: 'processing' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Refunded', value: 'refunded' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Orders() {
  const router = useRouter();
  // When the buyer taps the receipts icon in a store chat, we land here
  // with `?storeToken=…&storeName=…` and pre-filter to that store so
  // they only see orders placed with that business.
  const { storeToken: storeTokenFilter, storeName: storeNameFilter } =
    useLocalSearchParams<{ storeToken?: string; storeName?: string }>();
  const styles = useThemedStyles(makeStyles);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // First narrow by store (when the buyer entered the page from a
  // specific chat), then apply the status chip on top of that.
  const storeScopedOrders = useMemo(() => {
    if (!storeTokenFilter) return orders;
    return orders.filter((o) => o.storeToken === storeTokenFilter);
  }, [orders, storeTokenFilter]);

  // Apply the chip filter. We also surface a count next to each chip so
  // the user can see at a glance how many orders sit in each state.
  const filteredOrders = useMemo(() => {
    if (!activeFilter) return storeScopedOrders;
    return storeScopedOrders.filter((o) => o.status === activeFilter);
  }, [storeScopedOrders, activeFilter]);

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of storeScopedOrders) counts[o.status] = (counts[o.status] || 0) + 1;
    return counts;
  }, [storeScopedOrders]);

  const openOrder = (order: Order) => {
    // Pass the full order as JSON so the detail screen can render
    // immediately without an extra API call (and so the dev mocks work).
    router.push({
      pathname: '/orders/[id]',
      params: { id: order._id, order: JSON.stringify(order) },
    } as any);
  };

  const fetchOrders = async () => {
    try {
      const { data } = await api.get('/api/buyer/marketplace/orders');
      const list: Order[] = Array.isArray(data) ? data : data.orders ?? [];
      setOrders(list);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  // Realtime refresh: a `buyer.order.updated` / internal-order status
  // event bumps `ordersDirtyAt`; refetch the list when it changes (skip
  // the initial null so we don't double-fetch on mount).
  const ordersDirtyAt = useSelector((s: RootState) => s.realtime.ordersDirtyAt);
  const lastOrdersDirtyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ordersDirtyAt) return;
    if (lastOrdersDirtyRef.current === ordersDirtyAt) return;
    lastOrdersDirtyRef.current = ordersDirtyAt;
    fetchOrders();
  }, [ordersDirtyAt]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <View style={styles.headerActions}>
          <ThemeToggleButton />
          <TouchableOpacity
            style={styles.headerIcon}
            onPress={() => router.push('/(main)/notifications' as any)}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {storeTokenFilter && (
        <View style={styles.storeFilterBanner}>
          <Ionicons name="storefront-outline" size={14} color={Colors.primary} />
          <Text style={styles.storeFilterText} numberOfLines={1}>
            Showing orders from {storeNameFilter || 'this store'}
          </Text>
          <TouchableOpacity
            onPress={() => router.setParams({ storeToken: '', storeName: '' } as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsRow}
      >
        {STATUS_FILTERS.map((f) => {
          const active = activeFilter === f.value;
          const count = f.value ? filterCounts[f.value] || 0 : storeScopedOrders.length;
          return (
            <TouchableOpacity
              key={f.label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setActiveFilter(f.value)}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
                numberOfLines={1}
              >
                {f.label}
              </Text>
              {count > 0 && (
                <View style={[styles.chipCount, active && styles.chipCountActive]}>
                  <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={filteredOrders}
        keyExtractor={(o) => o._id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title={
              storeTokenFilter
                ? 'No orders from this store yet'
                : activeFilter
                ? 'No orders in this state'
                : 'No orders yet'
            }
            subtitle={
              storeTokenFilter
                ? "Once you place an order in this store's chat, it'll show up here."
                : activeFilter
                ? 'Try a different filter to see other orders.'
                : 'Orders you place through AI store chats will appear here.'
            }
          />
        }
        contentContainerStyle={filteredOrders.length === 0 ? { flex: 1 } : { padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => openOrder(item)}
          >
            <View style={styles.cardTop}>
              <Text style={styles.orderNum}>{item.orderNumber}</Text>
              <Badge label={item.status.replace('_', ' ')} variant={STATUS_VARIANT[item.status] ?? 'muted'} />
            </View>
            {item.business?.businessName && (
              <Text style={styles.storeName}>{item.business.businessName}</Text>
            )}
            {item.lines && item.lines.length > 0 && (
              <Text style={styles.itemsSummary} numberOfLines={1}>
                {item.lines.map((l) => `${l.name} ×${l.requestedQty}`).join(', ')}
              </Text>
            )}
            <View style={styles.cardBottom}>
              <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
              <View style={styles.cardBottomRight}>
                {item.reviewSummary && item.reviewSummary.count > 0 && (
                  <View style={styles.ratingPill}>
                    <Ionicons name="star" size={12} color="#F5A623" />
                    <Text style={styles.ratingText}>
                      {item.reviewSummary.averageRating.toFixed(1)}
                    </Text>
                  </View>
                )}
                <Text style={styles.total}>
                  {getCurrencySymbol(item.business?.currency)}
                  {item.subtotal.toLocaleString()}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIcon: { padding: 6 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 24, fontFamily: 'Manrope_700Bold', color: C.text },
  storeFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  storeFilterText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    color: C.text,
  },
  chipsScroll: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    // Lock the chip rail to its content height so a long FlatList below
    // can never compress it (which was clipping the chip labels and
    // count badges as the orders list scrolled).
    flexGrow: 0,
    flexShrink: 0,
  },
  chipsRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    // Stable height so chips with a count badge don't sit taller than
    // ones without — keeps the rail visually steady as filters change.
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
    // Prevent the horizontal ScrollView from squeezing each chip when
    // there are enough chips to overflow — without this, chips with
    // count badges visually clip their label text.
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    color: C.textSecondary,
    flexShrink: 0,
  },
  chipTextActive: { color: C.white, fontFamily: 'Manrope_600SemiBold' },
  chipCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chipCountActive: { backgroundColor: C.white },
  chipCountText: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    color: C.textMuted,
    lineHeight: 14,
  },
  chipCountTextActive: { color: C.primary },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: C.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderNum: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: C.text },
  storeName: { fontSize: 13, fontFamily: 'Manrope_500Medium', color: C.textSecondary, marginBottom: 4 },
  itemsSummary: { fontSize: 13, fontFamily: 'Manrope_400Regular', color: C.textSecondary, marginBottom: 8 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBottomRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(245,166,35,0.12)',
  },
  ratingText: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    color: '#B07814',
  },
  date: { fontSize: 12, fontFamily: 'Manrope_400Regular', color: C.textMuted },
  total: { fontSize: 15, fontFamily: 'Manrope_700Bold', color: C.text },
});
