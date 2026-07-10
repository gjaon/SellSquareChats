import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { requestEmailChange, getEmailChangeRequests } from '../../services/authService';
import { Colors } from '../../constants/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import Input from '../ui/Input';
import Button from '../ui/Button';

const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * ChangeEmailModal — self-service email change. The buyer enters a new address;
 * we email a confirmation link there. Clicking the link (from the new inbox)
 * applies the change, so the current email keeps working until then. We surface
 * any still-pending request so the buyer knows to check their inbox.
 */
export default function ChangeEmailModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const buyer = useSelector((s: RootState) => s.auth.buyer);

  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setNewEmail('');
    setError('');
    setSentTo(null);
    setPendingEmail(null);
    // Surface an outstanding pending request (e.g. from a previous attempt).
    getEmailChangeRequests()
      .then(({ data }) => {
        const pending = data?.requests?.[0];
        if (pending) setPendingEmail(pending.proposedEmail);
      })
      .catch(() => {});
  }, [visible]);

  const submit = async () => {
    setError('');
    const email = newEmail.trim().toLowerCase();
    if (!isEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (email === (buyer?.email || '').toLowerCase()) {
      setError('That is already your current email.');
      return;
    }
    setBusy(true);
    try {
      await requestEmailChange({ newEmail: email });
      setSentTo(email);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not start the email change. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Change email</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
            {sentTo ? (
              <View style={styles.doneWrap}>
                <Ionicons name="mail-unread-outline" size={48} color={Colors.primary} />
                <Text style={styles.doneText}>
                  We've sent a confirmation link to{'\n'}
                  <Text style={styles.bold}>{sentTo}</Text>.
                </Text>
                <Text style={styles.doneSub}>
                  Open it from that inbox to finish the change. Your current email keeps working until
                  you confirm.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.intro}>
                  Your current email is <Text style={styles.bold}>{buyer?.email}</Text>. Enter a new
                  email and we'll send a confirmation link there. The change applies only after you
                  click that link.
                </Text>
                {pendingEmail ? (
                  <View style={styles.pendingBox}>
                    <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                    <Text style={styles.pendingText}>
                      Pending: confirm the link we sent to {pendingEmail}. Submitting a new one
                      replaces it.
                    </Text>
                  </View>
                ) : null}
                <Input
                  label="New email"
                  value={newEmail}
                  onChangeText={setNewEmail}
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          {sentTo ? (
            <Button title="Done" onPress={onClose} style={styles.cta} />
          ) : (
            <Button title="Send confirmation link" onPress={submit} loading={busy} style={styles.cta} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { flex: 1, backgroundColor: C.overlay },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 36,
      maxHeight: '85%',
    },
    sheetHandle: {
      width: 40,
      height: 4,
      backgroundColor: C.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 16,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sheetTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold', color: C.text },
    sheetScroll: { flexGrow: 0 },
    intro: { fontSize: 13, fontFamily: 'Manrope_400Regular', color: C.textSecondary, marginBottom: 16 },
    bold: { fontFamily: 'Manrope_700Bold', color: C.text },
    pendingBox: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      backgroundColor: C.background,
      borderRadius: 10,
      padding: 12,
      marginBottom: 14,
    },
    pendingText: { flex: 1, fontSize: 12, fontFamily: 'Manrope_400Regular', color: C.textSecondary },
    error: { fontSize: 13, fontFamily: 'Manrope_500Medium', color: C.error, marginTop: 4 },
    cta: { marginTop: 16 },
    doneWrap: { alignItems: 'center', paddingVertical: 20, gap: 12 },
    doneText: { fontSize: 15, fontFamily: 'Manrope_500Medium', color: C.text, textAlign: 'center' },
    doneSub: { fontSize: 13, fontFamily: 'Manrope_400Regular', color: C.textSecondary, textAlign: 'center' },
  });
