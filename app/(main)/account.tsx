import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import SmartImage from '../../src/components/SmartImage';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppDispatch, RootState } from '../../src/store';
import { logoutBuyer, updateProfilePicture, removeProfilePicture } from '../../src/store/slices/authSlice';
import { registerPushToken, unregisterPushToken } from '../../src/services/notificationService';
import api from '../../src/services/api';
import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';
import ThemeToggleButton from '../../src/components/ThemeToggleButton';
import { useConfirm } from '../../src/components/ui/ConfirmDialog';

function SectionHeader({ title }: { title: string }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function Row({
  icon,
  label,
  value,
  onPress,
  rightElement,
  destructive,
}: {
  icon: any;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  destructive?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress && !rightElement}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={20} color={destructive ? Colors.error : Colors.primary} style={styles.rowIcon} />
      <Text style={[styles.rowLabel, destructive && { color: Colors.error }]}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {rightElement ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} /> : null)}
    </TouchableOpacity>
  );
}

export default function Account() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const confirm = useConfirm();
  const buyer = useSelector((s: RootState) => s.auth.buyer);
  const storeCount = useSelector((s: RootState) => s.savedStores.stores.length);

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const pickAndUploadAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingAvatar(true);
    try {
      const action = await dispatch(updateProfilePicture(result.assets[0].uri));
      if (updateProfilePicture.rejected.match(action)) {
        Alert.alert('Upload failed', (action.payload as string) || 'Could not upload your photo.');
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarPress = async () => {
    if (uploadingAvatar) return;
    if (!buyer?.profilePicture) {
      pickAndUploadAvatar();
      return;
    }
    Alert.alert('Profile picture', undefined, [
      { text: 'Change photo', onPress: pickAndUploadAvatar },
      {
        text: 'Remove photo',
        style: 'destructive',
        onPress: async () => {
          setUploadingAvatar(true);
          try {
            await dispatch(removeProfilePicture());
          } finally {
            setUploadingAvatar(false);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const toggleNotifications = async (enabled: boolean) => {
    setNotifEnabled(enabled);
    if (enabled) {
      await registerPushToken();
    } else {
      await unregisterPushToken();
    }
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Log Out',
      message: 'Are you sure you want to log out?',
      confirmText: 'Log Out',
      kind: 'destructive',
      icon: 'log-out-outline',
    });
    if (!ok) return;
    await dispatch(logoutBuyer());
    router.replace('/(auth)/login');
  };

  const handleDeactivate = async () => {
    // Two-step confirm: first the warning, then the final destructive
    // confirmation. The backend soft-deactivates (sets `deactivatedAt`),
    // which both blocks future logins and rejects the current token, so
    // we follow up with a local logout + redirect to /login.
    const first = await confirm({
      title: 'Deactivate Account',
      message:
        'This will deactivate your account. You will be logged out, push notifications will stop, and you will not be able to log back in. Continue?',
      confirmText: 'Deactivate',
      kind: 'warning',
    });
    if (!first) return;
    const second = await confirm({
      title: 'Are you sure?',
      message: 'This action cannot be undone from the app. Contact support to reactivate.',
      confirmText: 'Yes, deactivate',
      kind: 'destructive',
    });
    if (!second) return;
    try {
      await api.delete('/api/buyer/account');
    } catch (e: any) {
      await confirm({
        title: 'Could not deactivate',
        message: e?.response?.data?.message || 'Please try again later.',
        confirmText: 'OK',
        cancelText: null,
        kind: 'warning',
      });
      return;
    }
    await dispatch(logoutBuyer());
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Account</Text>
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

      {/* Profile */}
      <View style={styles.profileCard}>
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={handleAvatarPress}
          activeOpacity={0.8}
          accessibilityLabel="Change profile picture"
        >
          {buyer?.profilePicture ? (
            <SmartImage uri={buyer.profilePicture} style={styles.avatarImage} variant="thumb" />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {buyer?.firstName?.[0]}{buyer?.lastName?.[0]}
              </Text>
            </View>
          )}
          <View style={styles.avatarBadge}>
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Ionicons name="camera" size={14} color={Colors.white} />
            )}
          </View>
        </TouchableOpacity>
        <View>
          <Text style={styles.profileName}>{buyer?.firstName} {buyer?.lastName}</Text>
          <Text style={styles.profileEmail}>{buyer?.email}</Text>
        </View>
      </View>

      <SectionHeader title="Notifications" />
      <View style={styles.card}>
        <Row
          icon="notifications-outline"
          label="Push Notifications"
          rightElement={
            <Switch
              value={notifEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={notifEnabled ? Colors.primary : Colors.textMuted}
            />
          }
        />
      </View>

      <SectionHeader title="Stores" />
      <View style={styles.card}>
        <Row
          icon="storefront-outline"
          label="Linked Stores"
          value={`${storeCount} store${storeCount !== 1 ? 's' : ''}`}
          onPress={() => router.push('/(main)/home')}
        />
        <Row
          icon="bookmark-outline"
          label="Saved Posts"
          onPress={() => router.push('/(main)/saved-posts' as any)}
        />
        <Row
          icon="time-outline"
          label="History"
          onPress={() => router.push('/(main)/history' as any)}
        />
      </View>

      <SectionHeader title="Privacy" />
      <View style={styles.card}>
        <Row
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          onPress={() => Linking.openURL('https://sellsquarehub.com/privacy')}
        />
      </View>

      <SectionHeader title="" />
      <View style={styles.card}>
        <Row
          icon="log-out-outline"
          label="Log Out"
          onPress={handleLogout}
          destructive
        />
        <Row
          icon="person-remove-outline"
          label="Deactivate Account"
          onPress={handleDeactivate}
          destructive
        />
      </View>

      <Text style={styles.version}>Chatalog v1.0.0</Text>
    </ScrollView>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingBottom: 40 },
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
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.surface,
    margin: 16,
    padding: 16,
    borderRadius: 14,
    shadowColor: C.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: {
    width: 52,
    height: 52,
    position: 'relative',
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.border,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.surface,
  },
  avatarText: {
    color: C.white,
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
  },
  profileName: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: C.text },
  profileEmail: { fontSize: 13, fontFamily: 'Manrope_400Regular', color: C.textSecondary, marginTop: 2 },
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  card: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: C.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rowIcon: { marginRight: 12 },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
    color: C.text,
  },
  rowValue: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
    marginRight: 8,
  },
  version: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: C.textMuted,
  },
});
