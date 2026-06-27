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
import { loginBuyer, clearError } from '../../src/store/slices/authSlice';
import { AppDispatch, RootState } from '../../src/store';
import { registerPushToken } from '../../src/services/notificationService';
import Input from '../../src/components/ui/Input';
import Button from '../../src/components/ui/Button';
import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';

export default function Login() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { isLoading, error } = useSelector((s: RootState) => s.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const errs: typeof fieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email';
    if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogin = async () => {
    dispatch(clearError());
    if (!validate()) return;
    const result = await dispatch(loginBuyer({ email, password }));
    if (loginBuyer.fulfilled.match(result)) {
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
          <Text style={styles.tagline}>Your stores, in one place</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
            error={fieldErrors.email}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            isPassword
            placeholder="••••••••"
            error={fieldErrors.password}
          />

          {error && <Text style={styles.errorBanner}>{error}</Text>}

          <Button title="Log In" onPress={handleLogin} loading={isLoading} style={styles.btn} />

          <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={styles.link}>
            <Text style={styles.linkText}>
              Don't have an account?{' '}
              <Text style={styles.linkAction}>Register</Text>
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
  header: { alignItems: 'center', marginBottom: 40 },
  wordmark: {
    fontSize: 36,
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
