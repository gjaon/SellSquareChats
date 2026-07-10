import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { registerBuyer, clearError } from '../../src/store/slices/authSlice';
import { AppDispatch, RootState } from '../../src/store';
import { registerPushToken } from '../../src/services/notificationService';
import Input from '../../src/components/ui/Input';
import Button from '../../src/components/ui/Button';
import LocationFields, {
  LocationValue,
  emptyLocation,
} from '../../src/components/location/LocationFields';
import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';

export default function Register() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { isLoading, error } = useSelector((s: RootState) => s.auth);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [location, setLocation] = useState<LocationValue>(emptyLocation);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (key: keyof typeof form) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));
  const updateLocation = (patch: Partial<LocationValue>) =>
    setLocation((prev) => ({ ...prev, ...patch }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = 'Required';
    if (!form.lastName.trim()) errs.lastName = 'Required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email';
    if (form.password.length < 8) errs.password = 'At least 8 characters';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegister = async () => {
    dispatch(clearError());
    if (!validate()) return;
    const result = await dispatch(
      registerBuyer({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        // Optional location captured at signup → ranks Discover closest-first.
        country: location.country || undefined,
        countryCode: location.countryCode || undefined,
        state: location.state || undefined,
        city: location.city || undefined,
        street: location.street || undefined,
        latitude: location.latitude,
        longitude: location.longitude,
        locationSource: location.locationSource,
      })
    );
    if (registerBuyer.fulfilled.match(result)) {
      await registerPushToken();
      router.replace('/(main)/home');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.wordmark}>Chatalog</Text>
          <Text style={styles.tagline}>Create your account</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.row}>
            <View style={styles.half}>
              <Input
                label="First Name"
                value={form.firstName}
                onChangeText={set('firstName')}
                placeholder="Ada"
                error={fieldErrors.firstName}
              />
            </View>
            <View style={styles.half}>
              <Input
                label="Last Name"
                value={form.lastName}
                onChangeText={set('lastName')}
                placeholder="Okafor"
                error={fieldErrors.lastName}
              />
            </View>
          </View>

          <Input
            label="Email"
            value={form.email}
            onChangeText={set('email')}
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
            error={fieldErrors.email}
          />
          <Input
            label="Phone (optional)"
            value={form.phone}
            onChangeText={set('phone')}
            keyboardType="phone-pad"
            placeholder="+234 800 000 0000"
          />
          <Input
            label="Password"
            value={form.password}
            onChangeText={set('password')}
            isPassword
            placeholder="••••••••"
            error={fieldErrors.password}
          />
          <Input
            label="Confirm Password"
            value={form.confirmPassword}
            onChangeText={set('confirmPassword')}
            isPassword
            placeholder="••••••••"
            error={fieldErrors.confirmPassword}
          />

          <Text style={styles.sectionLabel}>
            Your location <Text style={styles.optional}>(optional — helps us show shops near you)</Text>
          </Text>
          <LocationFields value={location} onChange={updateLocation} />

          {error && <Text style={styles.errorBanner}>{error}</Text>}

          <Button title="Create Account" onPress={handleRegister} loading={isLoading} style={styles.btn} />

          <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={styles.link}>
            <Text style={styles.linkText}>
              Already have an account?{' '}
              <Text style={styles.linkAction}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  wordmark: {
    fontSize: 32,
    fontFamily: 'Manrope_700Bold',
    color: C.primary,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 15,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
    marginTop: 4,
  },
  form: {},
  sectionLabel: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    color: C.text,
    marginTop: 4,
    marginBottom: 10,
  },
  optional: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: C.textMuted,
  },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  btn: { marginTop: 8 },
  errorBanner: {
    backgroundColor: C.errorLight,
    color: C.error,
    padding: 12,
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    marginBottom: 12,
    textAlign: 'center',
  },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
  },
  linkAction: {
    fontFamily: 'Manrope_600SemiBold',
    color: C.primary,
  },
});
