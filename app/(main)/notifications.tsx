import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import EmptyState from '../../src/components/ui/EmptyState';
import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';
import {
  BuyerNotification,
  BuyerNotificationType,
  fetchNotifications,
  markNotificationRead,
} from '../../src/services/notificationService';

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleDateString();
}

const TYPE_ICON: Record<BuyerNotificationType, keyof typeof Ionicons.glyphMap> = {
  order: 'cube-outline',
  chat: 'chatbubble-ellipses-outline',
  review: 'star-outline',
  promo: 'pricetag-outline',
  system: 'notifications-outline',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const [items, setItems] = useState<BuyerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await fetchNotifications();
      setItems(data.notifications || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh whenever the tab gains focus so a tap that comes in via push
  // shows up immediately.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Route the tap based on the persisted notification's type/data, then
  // mark it read. We do both in parallel — the navigation must not wait
  // on the read API so the UI feels instant.
  const onPressNotification = (item: BuyerNotification) => {
    if (!item.readAt) {
      setItems((prev) =>
        prev.map((n) =>
          n._id === item._id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      );
      markNotificationRead(item._id).catch(() => {});
    }

    const data = item.data || {};
    switch (item.type) {
      case 'order':
        if (data.orderId) router.push(`/orders/${data.orderId}`);
        break;
      case 'chat':
        if (data.storeToken) router.push(`/chat/${data.storeToken}`);
        break;
      case 'review':
        if (data.orderId) {
          router.push(`/orders/review/${data.orderId}`);
        } else {
          router.push('/(main)/orders' as any);
        }
        break;
      case 'promo':
        if (data.storeToken) router.push(`/chat/${data.storeToken}`);
        else router.push('/(main)/discover' as any);
        break;
      default:
        if (data.storeToken) router.push(`/chat/${data.storeToken}`);
        else if (data.orderId) router.push(`/orders/${data.orderId}`);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e._id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="No notifications yet"
              subtitle="Updates from stores you've shopped with will appear here."
            />
          }
          contentContainerStyle={
            items.length === 0 ? { flex: 1 } : { padding: 16 }
          }
          renderItem={({ item }) => {
            const unread = !item.readAt;
            return (
              <TouchableOpacity
                style={[styles.card, unread && styles.cardUnread]}
                activeOpacity={0.8}
                onPress={() => onPressNotification(item)}
              >
                <View style={styles.row}>
                  <View style={styles.iconWrap}>
                    <Ionicons
                      name={TYPE_ICON[item.type] || 'notifications-outline'}
                      size={20}
                      color={Colors.primary}
                    />
                  </View>
                  <View style={styles.content}>
                    {item.title ? (
                      <Text style={styles.notifTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                    ) : null}
                    <Text style={styles.notifBody} numberOfLines={2}>
                      {item.body}
                    </Text>
                  </View>
                  <View style={styles.rightCol}>
                    <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
                    {unread && <View style={styles.unreadDot} />}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    title: { fontSize: 24, fontFamily: 'Manrope_700Bold', color: C.text },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    card: {
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      shadowColor: C.cardShadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 3,
      elevation: 1,
    },
    cardUnread: {
      borderWidth: 1,
      borderColor: C.primary,
    },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.successLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: { flex: 1 },
    notifTitle: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: C.text,
      marginBottom: 2,
    },
    notifBody: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
      lineHeight: 18,
    },
    rightCol: { alignItems: 'flex-end', gap: 4 },
    time: {
      fontSize: 11,
      fontFamily: 'Manrope_400Regular',
      color: C.textMuted,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.primary,
    },
  });
