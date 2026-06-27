import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SmartImage from './SmartImage';
import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { SavedStore } from '../store/slices/savedStoresSlice';

interface StoreCardProps {
  store: SavedStore;
  onPress: () => void;
  onLongPress: () => void;
  isSaved?: boolean;
  onToggleSaved?: () => void;
}

function formatTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return d.toLocaleDateString();
}

export default function StoreCard({
  store,
  onPress,
  onLongPress,
  isSaved,
  onToggleSaved,
}: StoreCardProps) {
  const styles = useThemedStyles(makeStyles);
  const handleShare = (e: any) => {
    e.stopPropagation?.();
    Share.share({
      message: `Check out this store: https://app.sellsquare.io/ai-chat/${store.storeToken}`,
    });
  };
  const handleStar = (e: any) => {
    e.stopPropagation?.();
    onToggleSaved?.();
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      <View style={styles.avatar}>
        {store.businessLogo ? (
          <SmartImage uri={store.businessLogo} style={styles.logo} variant="thumb" />
        ) : (
          <Ionicons name="storefront-outline" size={24} color={Colors.primary} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, store.unreadCount > 0 && styles.nameUnread]} numberOfLines={1}>
          {store.businessName}
        </Text>
        {store.lastMessagePreview ? (
          <Text style={[styles.preview, store.unreadCount > 0 && styles.previewUnread]} numberOfLines={1}>
            {store.lastMessagePreview}
          </Text>
        ) : (
          <Text style={styles.preview} numberOfLines={1}>
            Tap to start chatting
          </Text>
        )}
      </View>
      <View style={styles.right}>
        <Text style={[styles.time, store.unreadCount > 0 && styles.timeUnread]}>{formatTime(store.lastActivityAt)}</Text>
        <View style={styles.actions}>
          {store.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{store.unreadCount}</Text>
            </View>
          )}
          <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
            <Ionicons name="share-outline" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
          {onToggleSaved && (
            <TouchableOpacity
              onPress={handleStar}
              style={styles.shareBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={isSaved ? 'Unsave chat' : 'Save chat'}
            >
              <Ionicons
                name={isSaved ? 'star' : 'star-outline'}
                size={18}
                color={isSaved ? Colors.warning : Colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 14,
    shadowColor: C.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logo: { width: 48, height: 48, borderRadius: 24 },
  info: { flex: 1 },
  name: {
    fontSize: 15,
    fontFamily: 'Manrope_600SemiBold',
    color: C.text,
  },
  nameUnread: {
    fontFamily: 'Manrope_700Bold',
  },
  preview: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
    marginTop: 2,
  },
  previewUnread: {
    fontFamily: 'Manrope_600SemiBold',
    color: C.text,
  },
  right: { alignItems: 'flex-end', marginLeft: 8 },
  time: {
    fontSize: 11,
    fontFamily: 'Manrope_400Regular',
    color: C.textMuted,
    marginBottom: 4,
  },
  timeUnread: {
    color: C.primary,
    fontFamily: 'Manrope_600SemiBold',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    backgroundColor: C.primary,
    borderRadius: 99,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: C.white,
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
  },
  shareBtn: { padding: 2 },
});
