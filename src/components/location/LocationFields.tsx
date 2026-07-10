import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Country, State, City } from 'country-state-city';
import { Colors } from '../../constants/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import {
  fetchAddressPredictions,
  fetchPlaceDetails,
  newSessionToken,
  AddressPrediction,
} from '../../services/placesService';

/**
 * LocationValue — the shape captured at signup / via the "add your location"
 * prompt and sent to the backend. Mirrors the web LocationFields component.
 */
export interface LocationValue {
  country: string;
  countryCode: string;
  state: string;
  stateCode: string;
  city: string;
  street: string;
  latitude: number | null;
  longitude: number | null;
  locationSource?: 'google' | 'manual';
}

export const emptyLocation: LocationValue = {
  country: '',
  countryCode: '',
  state: '',
  stateCode: '',
  city: '',
  street: '',
  latitude: null,
  longitude: null,
  locationSource: undefined,
};

type Option = { value: string; label: string; latitude?: string | null; longitude?: string | null };

/* ---------- modal-based searchable select --------------------------------- */

function SelectField({
  label,
  placeholder,
  options,
  value,
  onSelect,
  disabled,
  error,
}: {
  label: string;
  placeholder: string;
  options: Option[];
  value: string;
  onSelect: (o: Option) => void;
  disabled?: boolean;
  error?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = options.find((o) => o.value === value)?.label || '';
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.control, error && styles.controlError, disabled && styles.controlDisabled]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={selectedLabel ? styles.controlText : styles.placeholder} numberOfLines={1}>
          {selectedLabel || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search…"
                placeholderTextColor={Colors.textMuted}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                  {item.value === value && (
                    <Ionicons name="checkmark" size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No matches</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------- address autocomplete ------------------------------------------ */

function AddressField({
  value,
  countryCode,
  onText,
  onResolve,
}: {
  value: string;
  countryCode?: string;
  onText: (t: string) => void;
  onResolve: (d: any) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionRef = useRef(newSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (text: string) => {
    onText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text || text.trim().length < 3) {
      setPredictions([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const preds = await fetchAddressPredictions(text, {
        country: countryCode,
        sessionToken: sessionRef.current,
      });
      setPredictions(preds);
      setLoading(false);
    }, 300);
  };

  const handlePick = async (p: AddressPrediction) => {
    onText(p.description);
    setPredictions([]);
    const details = await fetchPlaceDetails(p.placeId, { sessionToken: sessionRef.current });
    sessionRef.current = newSessionToken();
    if (details) onResolve({ ...details, street: p.description });
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Street address</Text>
      <View style={[styles.control, { paddingVertical: 0 }]}>
        <TextInput
          style={styles.addressInput}
          placeholder="Start typing your address…"
          placeholderTextColor={Colors.textMuted}
          value={value}
          onChangeText={handleChange}
          autoCapitalize="words"
        />
      </View>
      {predictions.length > 0 && (
        <View style={styles.predictions}>
          {predictions.map((p) => (
            <TouchableOpacity key={p.placeId} style={styles.optionRow} onPress={() => handlePick(p)}>
              <Text style={styles.optionText} numberOfLines={2}>
                {p.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Text style={styles.hint}>
        {loading ? 'Searching addresses…' : 'Pick a suggestion to pin your exact location (optional).'}
      </Text>
    </View>
  );
}

/* ---------- main composite ------------------------------------------------ */

const num = (v?: string | null) => (v == null || v === '' ? null : Number(v));

export default function LocationFields({
  value,
  onChange,
  errors = {},
}: {
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
  errors?: Record<string, string>;
}) {
  const styles = useThemedStyles(makeStyles);

  const countries: Option[] = useMemo(
    () => Country.getAllCountries().map((c) => ({ value: c.isoCode, label: c.name })),
    []
  );
  const states: Option[] = useMemo(
    () =>
      value.countryCode
        ? State.getStatesOfCountry(value.countryCode).map((s) => ({
            value: s.isoCode,
            label: s.name,
            latitude: s.latitude,
            longitude: s.longitude,
          }))
        : [],
    [value.countryCode]
  );
  const cities: Option[] = useMemo(
    () =>
      value.countryCode && value.stateCode
        ? City.getCitiesOfState(value.countryCode, value.stateCode).map((c) => ({
            value: c.name,
            label: c.name,
            latitude: c.latitude,
            longitude: c.longitude,
          }))
        : [],
    [value.countryCode, value.stateCode]
  );

  return (
    <View>
      <SelectField
        label="Country"
        placeholder="Select your country"
        options={countries}
        value={value.countryCode}
        onSelect={(o) =>
          onChange({
            country: o.label,
            countryCode: o.value,
            state: '',
            stateCode: '',
            city: '',
            ...(value.locationSource === 'manual'
              ? { latitude: null, longitude: null, locationSource: undefined }
              : {}),
          })
        }
        error={errors.country}
      />
      <View style={styles.row}>
        <View style={styles.half}>
          <SelectField
            label="State / Region"
            placeholder="Select state"
            options={states}
            value={value.stateCode}
            disabled={!value.countryCode}
            onSelect={(o) =>
              onChange({
                state: o.label,
                stateCode: o.value,
                city: '',
                ...(value.locationSource !== 'google'
                  ? { latitude: num(o.latitude), longitude: num(o.longitude), locationSource: 'manual' }
                  : {}),
              })
            }
          />
        </View>
        <View style={styles.half}>
          <SelectField
            label="City"
            placeholder="Select city"
            options={cities}
            value={value.city}
            disabled={!value.stateCode}
            onSelect={(o) =>
              onChange({
                city: o.label,
                ...(value.locationSource !== 'google'
                  ? { latitude: num(o.latitude), longitude: num(o.longitude), locationSource: 'manual' }
                  : {}),
              })
            }
          />
        </View>
      </View>
      <AddressField
        value={value.street}
        countryCode={value.countryCode}
        onText={(t) => onChange({ street: t })}
        onResolve={(d) =>
          onChange({
            street: d.street || d.formattedAddress || value.street,
            latitude: d.latitude,
            longitude: d.longitude,
            locationSource: 'google',
            ...(!value.country && d.country ? { country: d.country } : {}),
            ...(!value.countryCode && d.countryCode ? { countryCode: d.countryCode } : {}),
            ...(!value.state && d.state ? { state: d.state } : {}),
            ...(!value.city && d.city ? { city: d.city } : {}),
          })
        }
      />
    </View>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    wrapper: { marginBottom: 16 },
    row: { flexDirection: 'row', gap: 12 },
    half: { flex: 1 },
    label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: C.text, marginBottom: 6 },
    control: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1.5,
      borderColor: C.border,
      borderRadius: 12,
      backgroundColor: C.surface,
      paddingHorizontal: 14,
      height: 50,
    },
    controlError: { borderColor: C.error },
    controlDisabled: { opacity: 0.5 },
    controlText: { flex: 1, fontSize: 15, fontFamily: 'Manrope_400Regular', color: C.text },
    placeholder: { flex: 1, fontSize: 15, fontFamily: 'Manrope_400Regular', color: C.textMuted },
    addressInput: { flex: 1, height: 50, fontSize: 15, fontFamily: 'Manrope_400Regular', color: C.text },
    errorText: { marginTop: 4, fontSize: 12, fontFamily: 'Manrope_400Regular', color: C.error },
    hint: { marginTop: 4, fontSize: 12, fontFamily: 'Manrope_400Regular', color: C.textMuted },
    predictions: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      backgroundColor: C.surface,
      marginTop: 6,
      overflow: 'hidden',
    },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: C.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '80%',
      paddingBottom: 24,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
    },
    modalTitle: { fontSize: 17, fontFamily: 'Manrope_700Bold', color: C.text },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      borderWidth: 1.5,
      borderColor: C.border,
      borderRadius: 12,
      backgroundColor: C.surface,
    },
    searchInput: { flex: 1, height: 46, fontSize: 15, fontFamily: 'Manrope_400Regular', color: C.text },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    optionText: { flex: 1, fontSize: 15, fontFamily: 'Manrope_400Regular', color: C.text },
    empty: { textAlign: 'center', padding: 24, color: C.textMuted, fontFamily: 'Manrope_400Regular' },
  });
