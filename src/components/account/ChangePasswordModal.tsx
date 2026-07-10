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
import { sendPasswordChangeCode, confirmPasswordChange } from '../../services/authService';
import { Colors } from '../../constants/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import Input from '../ui/Input';
import Button from '../ui/Button';

/**
 * ChangePasswordModal — no old password. The buyer enters a new password, we
 * email a 6-digit code to their address, and they enter the code to apply it.
 *
 * Two steps in one sheet:
 *   1. "enter" — new password + confirm → sends the code.
 *   2. "code"  — enter the emailed code → applies the change.
 */
export default function ChangePasswordModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const buyer = useSelector((s: RootState) => s.auth.buyer);

  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep('enter');
      setPassword('');
      setConfirm('');
      setCode('');
      setError('');
      setDone(false);
    }
  }, [visible]);

  const maskedEmail = (buyer?.email || '').replace(/^(.).*(@.*)$/, '$1•••$2');

  const sendCode = async () => {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordChangeCode();
      setStep('code');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setError('');
    if (!code.trim()) {
      setError('Enter the 6-digit code we emailed you.');
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordChange({ code: code.trim(), newPassword: password });
      setDone(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Incorrect or expired code. Please try again.');
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
          <Text style={styles.sheetTitle}>Change password</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
            {done ? (
              <View style={styles.doneWrap}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.primary} />
                <Text style={styles.doneText}>Your password has been changed.</Text>
              </View>
            ) : step === 'enter' ? (
              <>
                <Text style={styles.intro}>
                  Enter a new password. We'll email a 6-digit code to {maskedEmail || 'your email'} to
                  confirm the change — no current password needed.
                </Text>
                <Input
                  label="New password"
                  value={password}
                  onChangeText={setPassword}
                  isPassword
                  placeholder="At least 8 characters"
                />
                <Input
                  label="Confirm new password"
                  value={confirm}
                  onChangeText={setConfirm}
                  isPassword
                  placeholder="••••••••"
                />
              </>
            ) : (
              <>
                <Text style={styles.intro}>
                  We emailed a 6-digit code to {maskedEmail}. Enter it below to finish changing your
                  password.
                </Text>
                <Input
                  label="Verification code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  placeholder="123456"
                  maxLength={6}
                />
                <TouchableOpacity onPress={sendCode} disabled={busy} style={styles.resend}>
                  <Text style={styles.resendText}>Resend code</Text>
                </TouchableOpacity>
              </>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          {done ? (
            <Button title="Done" onPress={onClose} style={styles.cta} />
          ) : step === 'enter' ? (
            <Button title="Continue" onPress={sendCode} loading={busy} style={styles.cta} />
          ) : (
            <Button title="Change password" onPress={apply} loading={busy} style={styles.cta} />
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
    sheetTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold', color: C.text, marginBottom: 12 },
    sheetScroll: { flexGrow: 0 },
    intro: { fontSize: 13, fontFamily: 'Manrope_400Regular', color: C.textSecondary, marginBottom: 16 },
    resend: { paddingVertical: 6 },
    resendText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: C.primary },
    error: { fontSize: 13, fontFamily: 'Manrope_500Medium', color: C.error, marginTop: 4 },
    cta: { marginTop: 16 },
    doneWrap: { alignItems: 'center', paddingVertical: 24, gap: 12 },
    doneText: { fontSize: 15, fontFamily: 'Manrope_500Medium', color: C.text, textAlign: 'center' },
  });
