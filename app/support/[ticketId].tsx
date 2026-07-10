/**
 * Buyer Support thread (chatalog) — one ticket's conversation.
 *
 * Loads the full ticket (messages[]) via supportSlice, renders the thread
 * (buyer right / support left) with inline image attachments and a reply
 * composer (photo/video attach, close/reopen). Realtime SUPPORT_TICKET_* events
 * bump realtime.supportDirtyAt; while this ticket is open we refetch it.
 *
 * Attachment images stream from the authenticated, ticket-scoped endpoint, so
 * we render them with RN's <Image> + an Authorization header (bearer token
 * loaded once from SecureStore) — the bucket is never public. The app has no
 * native video player, so a received video attachment shows as a labelled card
 * (attaching videos works fully; inline playback is deferred).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useDispatch, useSelector } from 'react-redux';

import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';
import { BUYER_TOKEN_KEY } from '../../src/constants/config';
import { RootState, AppDispatch } from '../../src/store';
import {
  fetchSupportTicket,
  replySupportTicket,
  setSupportTicketStatus,
  clearOpenTicket,
} from '../../src/store/slices/supportSlice';
import supportService, { SupportAttachment } from '../../src/services/supportService';
import SupportAttachmentBar, {
  LocalAttachment,
  stripLocal,
} from '../../src/components/support/SupportAttachmentBar';

const categoryLabel = (v?: string) => {
  const map: Record<string, string> = {
    payments: 'Payments & wallet',
    orders: 'Orders & fulfilment',
    account: 'Account & settings',
    technical: 'Technical issue',
    other: 'Something else',
  };
  return map[v || ''] || 'Other';
};

type StatusTone = 'info' | 'warning' | 'success' | 'muted';
const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: 'Open', tone: 'info' },
  awaiting_support: { label: 'With support', tone: 'info' },
  awaiting_user: { label: 'Your reply needed', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'muted' },
};

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

function MessageAttachments({
  attachments,
  token,
  styles,
}: {
  attachments?: SupportAttachment[];
  token: string | null;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (!attachments?.length) return null;
  return (
    <View style={styles.media}>
      {attachments.map((a) =>
        a.kind === 'image' ? (
          <Image
            key={a.key}
            source={{
              uri: supportService.attachmentUrl(a.key),
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            }}
            style={styles.mediaThumb}
          />
        ) : (
          <View key={a.key} style={styles.videoCard}>
            <Ionicons name="videocam" size={20} color={Colors.textMuted} />
            <Text style={styles.videoLabel}>Video attachment</Text>
          </View>
        ),
      )}
    </View>
  );
}

export default function SupportThreadScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const dispatch = useDispatch<AppDispatch>();

  const { openTicket, isLoadingThread, isSubmitting } = useSelector((s: RootState) => s.support);
  const supportDirtyAt = useSelector((s: RootState) => s.realtime.supportDirtyAt);
  const lastDirtyRef = useRef<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const ticket = openTicket && openTicket._id === ticketId ? openTicket : null;

  useEffect(() => {
    SecureStore.getItemAsync(BUYER_TOKEN_KEY).then(setToken).catch(() => setToken(null));
  }, []);

  useEffect(() => {
    if (ticketId) dispatch(fetchSupportTicket(String(ticketId)));
    return () => {
      dispatch(clearOpenTicket());
    };
  }, [ticketId, dispatch]);

  // Realtime: refetch this ticket when a support event fires for the buyer.
  useEffect(() => {
    if (!supportDirtyAt || lastDirtyRef.current === supportDirtyAt) return;
    lastDirtyRef.current = supportDirtyAt;
    if (ticketId) dispatch(fetchSupportTicket(String(ticketId)));
  }, [supportDirtyAt, ticketId, dispatch]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [ticket?._id, ticket?.messages?.length]);

  const send = async () => {
    if (!body.trim() && attachments.length === 0) return;
    try {
      await dispatch(
        replySupportTicket({
          id: String(ticketId),
          body: body.trim(),
          attachments: stripLocal(attachments),
        }),
      ).unwrap();
      setBody('');
      setAttachments([]);
    } catch (err: any) {
      Alert.alert('Could not send', typeof err === 'string' ? err : "Couldn't send your reply.");
    }
  };

  const toggleStatus = useCallback(
    async (action: 'close' | 'reopen') => {
      try {
        await dispatch(setSupportTicketStatus({ id: String(ticketId), action })).unwrap();
      } catch (err: any) {
        Alert.alert('Could not update', typeof err === 'string' ? err : "Couldn't update the ticket.");
      }
    },
    [dispatch, ticketId],
  );

  const meta = ticket ? STATUS_META[ticket.status] || STATUS_META.open : null;
  const isClosed = ticket?.status === 'closed';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {ticket?.subject || 'Support'}
          </Text>
          {ticket && meta ? (
            <View style={styles.headerSub}>
              <View style={[styles.badge, styles[`badge_${meta.tone}`]]}>
                <Text style={[styles.badgeText, styles[`badgeText_${meta.tone}`]]}>{meta.label}</Text>
              </View>
              <Text style={styles.headerCat}>{categoryLabel(ticket.category)}</Text>
            </View>
          ) : null}
        </View>
        {ticket ? (
          <TouchableOpacity
            style={styles.statusBtn}
            onPress={() => toggleStatus(isClosed ? 'reopen' : 'close')}
            activeOpacity={0.8}
          >
            <Text style={styles.statusBtnText}>{isClosed ? 'Reopen' : 'Close'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {isLoadingThread && !ticket ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : !ticket ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>This ticket couldn't be loaded.</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {(ticket.messages || []).map((m, i) => {
            const mine = m.senderType === 'user';
            return (
              <View key={m._id || i} style={[styles.msg, mine ? styles.msgMe : styles.msgSupport]}>
                <Text style={styles.msgMeta}>
                  {mine ? 'You' : m.senderName || 'Support'} · {relTime(m.createdAt)}
                </Text>
                {m.body ? <Text style={styles.msgBody}>{m.body}</Text> : null}
                <MessageAttachments attachments={m.attachments} token={token} styles={styles} />
              </View>
            );
          })}
        </ScrollView>
      )}

      {ticket && isClosed ? (
        <View style={styles.closedBar}>
          <Text style={styles.closedText}>This ticket is closed. Reopen it to continue the conversation.</Text>
        </View>
      ) : ticket ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.composerInput}
            placeholder="Write a reply…"
            placeholderTextColor={Colors.textMuted}
            value={body}
            onChangeText={setBody}
            multiline
          />
          <View style={styles.composerRow}>
            <SupportAttachmentBar attachments={attachments} setAttachments={setAttachments} />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (isSubmitting || (!body.trim() && attachments.length === 0)) && styles.sendBtnDisabled,
              ]}
              onPress={send}
              disabled={isSubmitting || (!body.trim() && attachments.length === 0)}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.sendBtnText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyText: { fontSize: 14, fontFamily: 'Manrope_500Medium', color: C.textSecondary, textAlign: 'center' },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingBottom: 12,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    headerTitles: { flex: 1, minWidth: 0, gap: 3 },
    headerTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: C.text },
    headerSub: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerCat: { fontSize: 12, fontFamily: 'Manrope_400Regular', color: C.textSecondary },
    statusBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    statusBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: C.textSecondary },

    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    badgeText: { fontSize: 11, fontFamily: 'Manrope_700Bold' },
    badge_info: { backgroundColor: C.cardBlue },
    badgeText_info: { color: C.primaryDark },
    badge_warning: { backgroundColor: C.warningLight },
    badgeText_warning: { color: C.warning },
    badge_success: { backgroundColor: C.successLight },
    badgeText_success: { color: C.success },
    badge_muted: { backgroundColor: C.border },
    badgeText_muted: { color: C.textSecondary },

    messages: { flex: 1 },
    messagesContent: { padding: 16, gap: 12 },
    msg: { maxWidth: '86%', padding: 12, borderRadius: 14, gap: 6 },
    msgMe: { alignSelf: 'flex-end', backgroundColor: C.successLight },
    msgSupport: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    msgMeta: { fontSize: 11, fontFamily: 'Manrope_500Medium', color: C.textMuted },
    msgBody: { fontSize: 14, fontFamily: 'Manrope_400Regular', color: C.text, lineHeight: 20 },
    media: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    mediaThumb: { width: 120, height: 120, borderRadius: 10, backgroundColor: C.border },
    videoCard: {
      width: 120,
      height: 120,
      borderRadius: 10,
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    videoLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular', color: C.textMuted },

    closedBar: { padding: 16, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
    closedText: { fontSize: 13, fontFamily: 'Manrope_400Regular', color: C.textSecondary, textAlign: 'center' },

    composer: {
      paddingHorizontal: 12,
      paddingTop: 10,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: C.border,
      backgroundColor: C.surface,
    },
    composerInput: {
      backgroundColor: C.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: 'Manrope_400Regular',
      color: C.text,
      maxHeight: 120,
    },
    composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    sendBtn: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minWidth: 72 },
    sendBtnDisabled: { opacity: 0.5 },
    sendBtnText: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: C.white },
  });
