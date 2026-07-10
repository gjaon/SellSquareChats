import React, { useMemo, useState } from 'react';
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
import { State } from 'country-state-city';
import { RootState, AppDispatch } from '../../store';
import { setBuyerLocation } from '../../store/slices/authSlice';
import { updateBuyerLocation } from '../../services/authService';
import { Colors } from '../../constants/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import Button from '../ui/Button';
import LocationFields, { LocationValue, emptyLocation } from './LocationFields';

/**
 * LocationEditorModal — the shared "add / update your location" sheet. Used by
 * both the dismissible LocationPromptBanner and the Account screen's "Delivery
 * location" row, so a buyer who dismissed the banner can still edit their
 * address any time from their profile.
 *
 * Pre-fills from the buyer's saved `defaultShippingAddress` + `location` so an
 * edit shows what's already there. Saves via PATCH /api/buyer/location.
 */
export default function LocationEditorModal({
  visible,
  onClose,
  intro,
}: {
  visible: boolean;
  onClose: () => void;
  intro?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const dispatch = useDispatch<AppDispatch>();
  const buyer = useSelector((s: RootState) => s.auth.buyer);

  // Seed the form from whatever the buyer already has. The state name is
  // resolved back to its ISO code so the State→City cascade keeps working.
  const initial = useMemo<LocationValue>(() => {
    const addr = buyer?.defaultShippingAddress;
    const coords = buyer?.location?.coordinates;
    const countryCode = addr?.countryCode || '';
    let stateCode = '';
    if (countryCode && addr?.state) {
      const match = State.getStatesOfCountry(countryCode).find(
        (s) => s.name.toLowerCase() === addr.state!.toLowerCase()
      );
      stateCode = match?.isoCode || '';
    }
    return {
      ...emptyLocation,
      country: addr?.country || '',
      countryCode,
      state: addr?.state || '',
      stateCode,
      city: addr?.city || '',
      street: addr?.street || '',
      latitude: Array.isArray(coords) ? coords[1] : null,
      longitude: Array.isArray(coords) ? coords[0] : null,
      locationSource: buyer?.locationSource as 'google' | 'manual' | undefined,
    };
  }, [buyer]);

  const [location, setLocation] = useState<LocationValue>(initial);
  const [saving, setSaving] = useState(false);
  // Re-seed each time the sheet is opened so it reflects the latest saved value.
  const [seededFor, setSeededFor] = useState(false);
  if (visible && !seededFor) {
    setLocation(initial);
    setSeededFor(true);
  }
  if (!visible && seededFor) setSeededFor(false);

  const updateLocation = (patch: Partial<LocationValue>) =>
    setLocation((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!location.countryCode && !location.latitude) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const { data } = await updateBuyerLocation({
        country: location.country || undefined,
        countryCode: location.countryCode || undefined,
        state: location.state || undefined,
        city: location.city || undefined,
        street: location.street || undefined,
        latitude: location.latitude,
        longitude: location.longitude,
        locationSource: location.locationSource,
      });
      dispatch(setBuyerLocation(data));
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
          <Text style={styles.sheetTitle}>Your location</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
            <Text style={styles.intro}>
              {intro ||
                'Choose your country, state and city. Optionally pin your exact address so we can show shops nearest to you.'}
            </Text>
            <LocationFields value={location} onChange={updateLocation} />
          </ScrollView>
          <Button
            title="Save location"
            onPress={save}
            loading={saving}
            disabled={!location.countryCode}
            style={styles.saveBtn}
          />
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
    saveBtn: { marginTop: 16 },
  });
