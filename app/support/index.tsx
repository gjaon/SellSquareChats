/**
 * Buyer Support — ticket list + "New request" composer (chatalog).
 *
 * Server-driven list (search + status filter → backend) via supportSlice.
 * Realtime SUPPORT_TICKET_* events bump realtime.supportDirtyAt; this screen
 * watches it and refetches. Tapping a ticket opens the thread at
 * /support/[ticketId]. Styled to chatalog's conventions (Manrope, themed
 * palette via useThemedStyles) — mirrors the merchant Support page's capabilities.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';

import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';
import { RootState, AppDispatch } from '../../src/store';
import {
  fetchSupportTickets,
  createSupportTicket,
} from '../../src/store/slices/supportSlice';
import { SupportTicket } from '../../src/services/supportService';
import SupportAttachmentBar, {
  LocalAttachment,
  stripLocal,
} from '../../src/components/support/SupportAttachmentBar';

const CATEGORIES = [
  { value: 'payments', label: 'Payments & wallet' },
  { value: 'orders', label: 'Orders & fulfilment' },
  { value: 'account', label: 'Account & settings' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'other', label: 'Something else' },
];
const categoryLabel = (v?: string) => CATEGORIES.find((c) => c.value === v)?.label || 'Other';

type StatusTone = 'info' | 'warning' | 'success' | 'muted';
const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: 'Open', tone: 'info' },
  awaiting_support: { label: 'With support', tone: 'info' },
  awaiting_user: { label: 'Your reply needed', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'muted' },
};

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'awaiting_user', label: 'Reply needed' },
  { value: 'awaiting_support', label: 'With support' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const relTime = (d?: string) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const diff = Date.now() - dt.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
};

export default function SupportListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const dispatch = useDispatch<AppDispatch>();

  const { items, isLoading, isSubmitting } = useSelector((s: RootState) => s.support);
  const supportDirtyAt = useSelector((s: RootState) => s.realtime.supportDirtyAt);
  const lastDirtyRef = useRef<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('other');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);

  const load = useCallback(
    (over?: { search?: string; status?: string }) => {
      dispatch(
        fetchSupportTickets({
          search: over?.search ?? search,
          status: (over?.status ?? status) || null,
          page: 1,
        }),
      );
    },
    [dispatch, search, status],
  );

  const didMountRef = useRef(false);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search — skip the first run (the mount effect already loaded).
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const t = setTimeout(() => load({ search }), 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime refetch when a support event marks the list stale.
  useEffect(() => {
    if (!supportDirtyAt || lastDirtyRef.current === supportDirtyAt) return;
    lastDirtyRef.current = supportDirtyAt;
    load();
  }, [supportDirtyAt, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.resolve(load()).finally(() => setRefreshing(false));
  }, [load]);

  const onStatusFilter = (value: string) => {
    setStatus(value);
    load({ status: value });
  };

  const resetCompose = () => {
    setSubject('');
    setCategory('other');
    setBody('');
    setAttachments([]);
  };

  const submitCompose = async () => {
    if (!subject.trim()) {
      Alert.alert('Add a subject', "Briefly, what's the issue?");
      return;
    }
    if (!body.trim() && attachments.length === 0) {
      Alert.alert('Add details', 'Add a message or an attachment.');
      return;
    }
    try {
      const ticket = await dispatch(
        createSupportTicket({
          subject: subject.trim(),
          category,
          body: body.trim(),
          attachments: stripLocal(attachments),
        }),
      ).unwrap();
      setShowCompose(false);
      resetCompose();
      if (ticket?._id) router.push(`/support/${ticket._id}` as any);
    } catch (err: any) {
      Alert.alert('Could not send', typeof err === 'string' ? err : "Couldn't send your request.");
    }
  };

  const renderItem = ({ item }: { item: SupportTicket }) => {
    const meta = STATUS_META[item.status] || STATUS_META.open;
    const newReply =
      item.lastMessageSenderType === 'admin' && !['closed', 'resolved'].includes(item.status);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/support/${item._id}` as any)}
      >
        <View style={styles.cardTop}>
          <View style={styles.subjectWrap}>
            {newReply && <View style={styles.dot} />}
            <Text style={styles.subject} numberOfLines={1}>
              {item.subject}
            </Text>
          </View>
          <Text style={styles.time}>{relTime(item.lastMessageAt)}</Text>
        </View>
        <View style={styles.cardBottom}>
          <View style={[styles.badge, styles[`badge_${meta.tone}`]]}>
            <Text style={[styles.badgeText, styles[`badgeText_${meta.tone}`]]}>{meta.label}</Text>
          </View>
          <Text style={styles.category}>{categoryLabel(item.category)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Support</Text>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={() => setShowCompose(true)}
        accessibilityLabel="New request"
      >
        <Ionicons name="add" size={26} color={Colors.primary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderHeader()}

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your requests…"
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {STATUS_FILTERS.map((f) => {
            const active = status === f.value;
            return (
              <TouchableOpacity
                key={f.value || 'all'}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => onStatusFilter(f.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={34} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No requests yet</Text>
          <Text style={styles.emptySubtitle}>
            Need a hand? Start a new request and the team will get back to you.
          </Text>
          <TouchableOpacity style={styles.emptyCta} onPress={() => setShowCompose(true)} activeOpacity={0.85}>
            <Text style={styles.emptyCtaText}>New request</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
        />
      )}

      {/* New request modal */}
      <Modal visible={showCompose} animationType="slide" transparent onRequestClose={() => setShowCompose(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>New support request</Text>
              <TouchableOpacity onPress={() => setShowCompose(false)} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Subject</Text>
              <TextInput
                style={styles.field}
                placeholder="Briefly, what's the issue?"
                placeholderTextColor={Colors.textMuted}
                value={subject}
                onChangeText={setSubject}
              />

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.catWrap}>
                {CATEGORIES.map((c) => {
                  const active = category === c.value;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      style={[styles.catChip, active && styles.catChipActive]}
                      onPress={() => setCategory(c.value)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.catText, active && styles.catTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Message</Text>
              <TextInput
                style={[styles.field, styles.fieldMultiline]}
                placeholder="Tell us what's happening…"
                placeholderTextColor={Colors.textMuted}
                value={body}
                onChangeText={setBody}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />

              <SupportAttachmentBar attachments={attachments} setAttachments={setAttachments} />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowCompose(false)} activeOpacity={0.8}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, isSubmitting && styles.btnDisabled]}
                onPress={submitCompose}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Send request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },

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
    headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold', color: C.text },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      height: 42,
      backgroundColor: C.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchInput: { flex: 1, fontSize: 14, fontFamily: 'Manrope_400Regular', color: C.text, padding: 0 },

    filterRow: { marginTop: 10 },
    filterContent: { paddingHorizontal: 16, gap: 8 },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    filterChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    filterText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: C.textSecondary },
    filterTextActive: { color: C.white },

    listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 10 },

    card: {
      backgroundColor: C.surface,
      borderRadius: 16,
      padding: 14,
      gap: 10,
      shadowColor: C.cardShadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 3,
      elevation: 1,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    subjectWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.error },
    subject: { fontSize: 15, fontFamily: 'Manrope_600SemiBold', color: C.text, flexShrink: 1 },
    time: { fontSize: 11, fontFamily: 'Manrope_500Medium', color: C.textMuted },
    cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    category: { fontSize: 12, fontFamily: 'Manrope_400Regular', color: C.textSecondary },

    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeText: { fontSize: 11, fontFamily: 'Manrope_700Bold' },
    badge_info: { backgroundColor: C.cardBlue },
    badgeText_info: { color: C.primaryDark },
    badge_warning: { backgroundColor: C.warningLight },
    badgeText_warning: { color: C.warning },
    badge_success: { backgroundColor: C.successLight },
    badgeText_success: { color: C.success },
    badge_muted: { backgroundColor: C.border },
    badgeText_muted: { color: C.textSecondary },

    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.primaryLight,
      marginBottom: 6,
    },
    emptyTitle: { fontSize: 17, fontFamily: 'Manrope_700Bold', color: C.text },
    emptySubtitle: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
    },
    emptyCta: { marginTop: 8, backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
    emptyCtaText: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: C.white },

    // Modal
    modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalCard: {
      backgroundColor: C.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '92%',
    },
    modalHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    modalTitle: { fontSize: 17, fontFamily: 'Manrope_700Bold', color: C.text },
    modalBody: { padding: 18, gap: 8 },
    fieldLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: C.text, marginTop: 6 },
    field: {
      backgroundColor: C.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      fontFamily: 'Manrope_400Regular',
      color: C.text,
    },
    fieldMultiline: { minHeight: 110, paddingTop: 12 },
    catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    catChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    catText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', color: C.textSecondary },
    catTextActive: { color: C.white },

    modalFooter: {
      flexDirection: 'row',
      gap: 12,
      padding: 18,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    ghostBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    ghostBtnText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: C.textSecondary },
    primaryBtn: { flex: 1.4, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: C.primary },
    primaryBtnText: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: C.white },
    btnDisabled: { opacity: 0.6 },
  });
