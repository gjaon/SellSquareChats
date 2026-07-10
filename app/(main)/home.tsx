import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { RootState, AppDispatch } from '../../src/store';
import {
  fetchSavedStores,
  deleteSavedStore,
  SavedStore,
} from '../../src/store/slices/savedStoresSlice';
import { extractChatToken } from '../../src/hooks/useDeepLink';
import StoreCard from '../../src/components/StoreCard';
import EmptyState from '../../src/components/ui/EmptyState';
import Button from '../../src/components/ui/Button';
import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';
import ThemeToggleButton from '../../src/components/ThemeToggleButton';
import LocationPromptBanner from '../../src/components/location/LocationPromptBanner';
import { useConfirm } from '../../src/components/ui/ConfirmDialog';
import { useActionSheet } from '../../src/components/ui/ActionSheet';
import {
  StoreOrganization,
  loadStoreOrganization,
  saveStoreOrganization,
  addLabel,
  removeLabel,
  toggleStoreLabel,
  toggleStoreSaved,
} from '../../src/utils/storeOrganization';

const RECENT_KEY = 'chatalog_recent_links';
import AsyncStorage from '@react-native-async-storage/async-storage';

async function getRecentLinks(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function addRecentLink(token: string) {
  const links = await getRecentLinks();
  const updated = [token, ...links.filter((l) => l !== token)].slice(0, 5);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
}

interface ChipProps {
  label: string;
  count?: number;
  active: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  onLongPress?: () => void;
}

function Chip({ label, count, active, icon, onPress, onLongPress }: ChipProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={13}
          color={active ? Colors.white : Colors.textSecondary}
        />
      )}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {typeof count === 'number' && count > 0 && (
        <Text style={[styles.chipCount, active && styles.chipCountActive]}>{count}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function Home() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const confirm = useConfirm();
  const actionSheet = useActionSheet();
  const { stores, isLoading } = useSelector((s: RootState) => s.savedStores);

  const [modalVisible, setModalVisible] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState('');
  const [recentLinks, setRecentLinks] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Local-only organization state (labels + saved/starred). Persisted to
  // AsyncStorage. The selected chip filter — `null` = All, `'__saved'` =
  // saved-only, anything else = label name.
  const [org, setOrg] = useState<StoreOrganization>({ labels: [], assignments: {}, saved: {} });
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [labelManagerStore, setLabelManagerStore] = useState<SavedStore | null>(null);
  const [newLabelInput, setNewLabelInput] = useState('');

  useEffect(() => {
    dispatch(fetchSavedStores());
  }, []);

  // Hydrate the local organization state once on mount, and persist on
  // every change so labels survive across app launches.
  useEffect(() => {
    loadStoreOrganization().then(setOrg);
  }, []);
  const orgRef = useRef(org);
  useEffect(() => {
    orgRef.current = org;
    saveStoreOrganization(org).catch(() => {});
  }, [org]);

  const openModal = async () => {
    setLinkError('');
    const clip = await Clipboard.getStringAsync();
    const token = extractChatToken(clip);
    setLinkInput(clip && token ? clip : '');
    const recent = await getRecentLinks();
    setRecentLinks(recent);
    setModalVisible(true);
  };

  const handleOpenStore = async (inputOrToken: string) => {
    const token = extractChatToken(inputOrToken) || extractChatToken(`/chat/${inputOrToken}`);
    if (!token) {
      setLinkError('Invalid store link. Please paste a valid Chatalog link.');
      return;
    }
    await addRecentLink(token);
    setModalVisible(false);
    setLinkInput('');
    router.push(`/chat/${token}`);
  };

  const handleLongPress = async (store: SavedStore) => {
    // Long-press opens a themed organization sheet — the user can star
    // the chat ("Save"), assign labels, or remove the store entirely.
    // Uses the in-app ActionSheet so the chrome respects the active
    // light/dark theme instead of the OS-native Alert.
    const isSaved = !!org.saved[store.storeToken];
    const choice = await actionSheet({
      title: store.businessName,
      options: [
        {
          label: isSaved ? 'Unsave chat' : 'Save chat',
          icon: isSaved ? 'star' : 'star-outline',
        },
        { label: 'Manage labels', icon: 'pricetag-outline' },
        { label: 'Remove store', icon: 'trash-outline', kind: 'destructive' },
      ],
    });
    if (choice === 0) {
      setOrg((s) => toggleStoreSaved(s, store.storeToken));
    } else if (choice === 1) {
      setNewLabelInput('');
      setLabelManagerStore(store);
    } else if (choice === 2) {
      const ok = await confirm({
        title: 'Remove this store?',
        message: 'This will clear it from your list.',
        confirmText: 'Remove',
        kind: 'destructive',
      });
      if (ok) dispatch(deleteSavedStore(store.storeToken));
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchSavedStores());
    setRefreshing(false);
  };

  const sorted = [...stores].sort(
    (a, b) => new Date(b.lastActivityAt ?? 0).getTime() - new Date(a.lastActivityAt ?? 0).getTime()
  );

  // Apply chip filter on top of the time-sorted list. Saved chats are
  // always sorted to the top of the All view so the user can quickly
  // find the conversations they care about.
  const visibleStores = useMemo(() => {
    let list = sorted;
    if (activeChip === '__saved') {
      list = sorted.filter((s) => org.saved[s.storeToken]);
    } else if (activeChip) {
      list = sorted.filter((s) =>
        (org.assignments[s.storeToken] || []).includes(activeChip),
      );
    } else {
      // "All" view — promote saved chats to the top while preserving
      // intra-group recency order.
      const saved = sorted.filter((s) => org.saved[s.storeToken]);
      const rest = sorted.filter((s) => !org.saved[s.storeToken]);
      list = [...saved, ...rest];
    }
    return list;
  }, [sorted, activeChip, org]);

  const savedCount = useMemo(
    () => sorted.filter((s) => org.saved[s.storeToken]).length,
    [sorted, org.saved],
  );
  const labelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const store of sorted) {
      for (const tag of org.assignments[store.storeToken] || []) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  }, [sorted, org.assignments]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Stores</Text>
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

      <LocationPromptBanner />

      <FlatList
        data={visibleStores}
        keyExtractor={(item) => item.storeToken}
        ListHeaderComponent={
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            <Chip
              label="All"
              count={sorted.length}
              active={activeChip === null}
              onPress={() => setActiveChip(null)}
            />
            <Chip
              icon="star"
              label="Saved"
              count={savedCount}
              active={activeChip === '__saved'}
              onPress={() => setActiveChip('__saved')}
            />
            {org.labels.map((label) => (
              <Chip
                key={label}
                label={label}
                count={labelCounts[label] || 0}
                active={activeChip === label}
                onPress={() => setActiveChip(label)}
                onLongPress={async () => {
                  const ok = await confirm({
                    title: `Delete label "${label}"?`,
                    message: 'It will be removed from all stores.',
                    confirmText: 'Delete',
                    kind: 'destructive',
                  });
                  if (ok) {
                    setOrg((s) => removeLabel(s, label));
                    if (activeChip === label) setActiveChip(null);
                  }
                }}
              />
            ))}
            <TouchableOpacity
              style={styles.chipNew}
              onPress={() => {
                setLabelManagerStore(null);
                setNewLabelInput('');
                // Reuse the manager modal in "create only" mode \u2014 indicated
                // by passing `null` as the store. The modal handles both.
                setLabelManagerStore({ storeToken: '__create_only__' } as SavedStore);
              }}
            >
              <Ionicons name="add" size={14} color={Colors.primary} />
              <Text style={styles.chipNewText}>New label</Text>
            </TouchableOpacity>
          </ScrollView>
        }
        renderItem={({ item }) => (
          <StoreCard
            store={item}
            onPress={() => router.push(`/chat/${item.storeToken}`)}
            onLongPress={() => handleLongPress(item)}
            isSaved={!!org.saved[item.storeToken]}
            onToggleSaved={() => setOrg((s) => toggleStoreSaved(s, item.storeToken))}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="storefront-outline"
              title={activeChip ? 'No stores in this view' : 'No stores yet'}
              subtitle={
                activeChip
                  ? 'Try a different filter or assign more labels to your stores.'
                  : 'Paste a store link or tap a link shared with you to start chatting.'
              }
            />
          ) : null
        }
        contentContainerStyle={visibleStores.length === 0 ? { flexGrow: 1 } : { paddingBottom: 8 }}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openModal} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>

      {/* Paste Link Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setModalVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Open a Store</Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.linkInput}
                value={linkInput}
                onChangeText={(t) => { setLinkInput(t); setLinkError(''); }}
                placeholder="Paste store link here"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={async () => {
                  const clip = await Clipboard.getStringAsync();
                  setLinkInput(clip);
                }}
                style={styles.pasteBtn}
              >
                <Ionicons name="clipboard-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            {linkError ? <Text style={styles.linkError}>{linkError}</Text> : null}

            <Button title="Open Store" onPress={() => handleOpenStore(linkInput)} style={styles.openBtn} />

            {recentLinks.length > 0 && (
              <>
                <Text style={styles.recentLabel}>Recent</Text>
                {recentLinks.map((token) => (
                  <TouchableOpacity
                    key={token}
                    style={styles.recentItem}
                    onPress={() => handleOpenStore(token)}
                  >
                    <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                    <Text style={styles.recentText} numberOfLines={1}>
                      {token}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Label manager modal — single sheet that handles two cases:
          (1) `labelManagerStore.storeToken === '__create_only__'` → just
              create a new label, no per-store assignment.
          (2) any other store → toggle assignments + optionally create a
              new label inline. */}
      <Modal
        visible={!!labelManagerStore}
        transparent
        animationType="slide"
        onRequestClose={() => setLabelManagerStore(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setLabelManagerStore(null)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {labelManagerStore?.storeToken === '__create_only__'
                ? 'New label'
                : `Labels for ${labelManagerStore?.businessName ?? 'store'}`}
            </Text>

            {labelManagerStore && labelManagerStore.storeToken !== '__create_only__' && (
              <View style={styles.labelChipsWrap}>
                {org.labels.length === 0 ? (
                  <Text style={styles.recentLabel}>
                    No labels yet — create one below to start organizing.
                  </Text>
                ) : (
                  org.labels.map((label) => {
                    const assigned = (org.assignments[labelManagerStore.storeToken] || []).includes(
                      label,
                    );
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[styles.labelToggle, assigned && styles.labelToggleActive]}
                        onPress={() =>
                          setOrg((s) =>
                            toggleStoreLabel(s, labelManagerStore.storeToken, label),
                          )
                        }
                      >
                        <Ionicons
                          name={assigned ? 'checkmark-circle' : 'ellipse-outline'}
                          size={14}
                          color={assigned ? Colors.white : Colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.labelToggleText,
                            assigned && styles.labelToggleTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}

            <View style={styles.inputRow}>
              <TextInput
                style={styles.linkInput}
                value={newLabelInput}
                onChangeText={setNewLabelInput}
                placeholder="New label name"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                maxLength={24}
              />
            </View>

            <Button
              title={
                labelManagerStore?.storeToken === '__create_only__'
                  ? 'Add label'
                  : 'Save'
              }
              onPress={() => {
                const trimmed = newLabelInput.trim();
                const targetStore = labelManagerStore;
                const isCreateOnly =
                  targetStore?.storeToken === '__create_only__';

                // In create-only mode the button is the only way to commit
                // anything, so an empty input means "do nothing" (a no-op
                // is friendlier than closing without saving).
                if (isCreateOnly && !trimmed) return;

                if (trimmed) {
                  setOrg((s) => {
                    let next = addLabel(s, trimmed);
                    if (targetStore && !isCreateOnly) {
                      next = toggleStoreLabel(next, targetStore.storeToken, trimmed);
                    }
                    return next;
                  });
                }
                // Clear the input and close the sheet so the user gets
                // immediate confirmation that the modal accepted the
                // change — no empty form lingering on screen. In manage
                // mode the per-label toggles already mutated state in
                // real time, so closing here means "I'm done editing".
                setNewLabelInput('');
                setLabelManagerStore(null);
              }}
              style={styles.openBtn}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
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
  headerIcon: {
    padding: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: { fontSize: 24, fontFamily: 'Manrope_700Bold', color: C.text },
  // Filter chip rail
  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontFamily: 'Manrope_500Medium', color: C.textSecondary },
  chipTextActive: { color: C.white, fontFamily: 'Manrope_600SemiBold' },
  chipCount: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    color: C.textMuted,
    backgroundColor: C.background,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  chipCountActive: { color: C.primary, backgroundColor: C.white },
  chipNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.primary,
    backgroundColor: C.surface,
  },
  chipNewText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    color: C.primary,
  },
  // Per-row star toggle
  storeRow: { flexDirection: 'row', alignItems: 'center' },
  starBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  // Label toggles inside the manager modal
  labelChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  labelToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
  },
  labelToggleActive: { backgroundColor: C.primary, borderColor: C.primary },
  labelToggleText: {
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    color: C.textSecondary,
  },
  labelToggleTextActive: { color: C.white, fontFamily: 'Manrope_600SemiBold' },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  backdrop: {
    flex: 1,
    backgroundColor: C.overlay,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    color: C.text,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: C.background,
    marginBottom: 8,
  },
  linkInput: {
    flex: 1,
    height: 50,
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: C.text,
  },
  pasteBtn: { padding: 4 },
  linkError: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: C.error,
    marginBottom: 10,
  },
  openBtn: { marginBottom: 20 },
  recentLabel: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  recentText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
  },
});
