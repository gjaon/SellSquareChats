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
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { RootState, AppDispatch } from '../../store';
import { setBuyerProfile } from '../../store/slices/authSlice';
import { updateBuyerProfile } from '../../services/authService';
import { Colors } from '../../constants/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import Input from '../ui/Input';
import Button from '../ui/Button';
import LocationEditorModal from '../location/LocationEditorModal';

/** EditProfileModal — edit first name, last name and phone (email is changed
 *  separately via the verified email-change flow). */
export default function EditProfileModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const dispatch = useDispatch<AppDispatch>();
  const buyer = useSelector((s: RootState) => s.auth.buyer);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string }>({});
  const [saving, setSaving] = useState(false);
  const [showLocation, setShowLocation] = useState(false);

  // Human-readable summary of the buyer's saved delivery location, shown inline
  // so location now lives inside Edit profile (not just a separate banner).
  const addr = buyer?.defaultShippingAddress;
  const locationSummary = [addr?.city, addr?.state, addr?.country]
    .filter(Boolean)
    .join(', ');

  // Re-seed from the current buyer whenever the sheet is opened.
  useEffect(() => {
    if (visible) {
      setFirstName(buyer?.firstName || '');
      setLastName(buyer?.lastName || '');
      setPhone(buyer?.phone || '');
      setErrors({});
    }
  }, [visible, buyer]);

  const save = async () => {
    const errs: typeof errors = {};
    if (!firstName.trim()) errs.firstName = 'Required';
    if (!lastName.trim()) errs.lastName = 'Required';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const { data } = await updateBuyerProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
      dispatch(setBuyerProfile(data));
      onClose();
    } catch {
      /* surfaced by the api interceptor */
    } finally {
      setSaving(false);
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
            <Text style={styles.sheetTitle}>Edit profile</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
            <View style={styles.row}>
              <View style={styles.half}>
                <Input
                  label="First name"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Ada"
                  error={errors.firstName}
                />
              </View>
              <View style={styles.half}>
                <Input
                  label="Last name"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Okafor"
                  error={errors.lastName}
                />
              </View>
            </View>
            <Input
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+234 800 000 0000"
            />

            <Text style={styles.fieldLabel}>Delivery location</Text>
            <TouchableOpacity
              style={styles.locationRow}
              activeOpacity={0.7}
              onPress={() => setShowLocation(true)}
            >
              <View style={styles.locationIcon}>
                <Ionicons name="location-outline" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.locationValue} numberOfLines={1}>
                  {locationSummary || 'Add your location'}
                </Text>
                <Text style={styles.locationHint} numberOfLines={1}>
                  {locationSummary
                    ? 'Tap to update — helps show shops nearest to you'
                    : 'Helps Discover show shops nearest to you first'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </ScrollView>
          <Button title="Save changes" onPress={save} loading={saving} style={styles.saveBtn} />
        </View>
      </KeyboardAvoidingView>

      {/* Nested inside the parent Modal — RN cannot present two sibling root
          Modals at once (the second renders behind the first and traps touches,
          freezing the screen), but a Modal nested in another Modal's tree
          presents correctly on top. */}
      <LocationEditorModal visible={showLocation} onClose={() => setShowLocation(false)} />
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
    row: { flexDirection: 'row', gap: 12 },
    half: { flex: 1 },
    saveBtn: { marginTop: 8 },
    fieldLabel: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: C.textSecondary,
      marginTop: 16,
      marginBottom: 8,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.background,
    },
    locationIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.surface,
    },
    locationValue: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: C.text },
    locationHint: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
      marginTop: 2,
    },
  });
