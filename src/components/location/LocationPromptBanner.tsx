import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootState } from '../../store';
import { Colors } from '../../constants/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import LocationEditorModal from './LocationEditorModal';

const dismissKey = (buyerId: string) => `chatalog_location_prompt_dismissed_${buyerId}`;

/**
 * LocationPromptBanner — non-blocking prompt asking a pre-existing buyer to add
 * their location so the Discover feed can rank stores closest-first. Mirrors the
 * merchant "add your location" prompt. Dismissal persists per buyer; once
 * dismissed, the buyer can still edit their address any time from Account →
 * Delivery location (both use the shared LocationEditorModal).
 */
export default function LocationPromptBanner() {
  const styles = useThemedStyles(makeStyles);
  const buyer = useSelector((s: RootState) => s.auth.buyer);

  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const buyerId = buyer?._id;

  useEffect(() => {
    let cancelled = false;
    if (!buyerId) return;
    AsyncStorage.getItem(dismissKey(buyerId)).then((v) => {
      if (cancelled) return;
      setDismissed(!!v);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [buyerId]);

  const hasCoords =
    Array.isArray(buyer?.location?.coordinates) && buyer.location.coordinates.length === 2;
  // Once the buyer has set their location (a country is enough — exact
  // coordinates are an optional extra they can pin later from Account → Edit
  // profile), the banner has done its job and must disappear. This mirrors the
  // merchant fix for the "banner won't go away after I added my location" bug.
  // Check the country NAME as well as the ISO code: a save always persists the
  // country name but only writes the code when the client sent one, so keying
  // off the code alone is exactly why the banner used to linger after a save.
  const addr = buyer?.defaultShippingAddress;
  const hasCountry = !!(addr?.countryCode || addr?.country);

  if (!loaded || !buyerId || dismissed || hasCountry || hasCoords) return null;

  const dismiss = () => {
    AsyncStorage.setItem(dismissKey(buyerId), '1').catch(() => {});
    setDismissed(true);
  };

  return (
    <>
      <View style={styles.banner}>
        <Ionicons name="location-outline" size={18} color={Colors.primary} />
        <Text style={styles.text}>
          Add your location to discover shops closest to you first.
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.cta} onPress={() => setOpen(true)}>
            <Text style={styles.ctaText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismiss} hitSlop={8} accessibilityLabel="Dismiss">
            <Ionicons name="close" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <LocationEditorModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: C.primaryLight + '22',
      borderWidth: 1,
      borderColor: C.primary,
    },
    text: { flex: 1, fontSize: 13, fontFamily: 'Manrope_500Medium', color: C.text },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cta: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: C.primary,
    },
    ctaText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', color: C.white },
  });
