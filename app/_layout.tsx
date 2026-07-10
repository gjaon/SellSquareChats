import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { Provider, useSelector } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import * as SecureStore from 'expo-secure-store';
import { store, persistor, RootState } from '../src/store';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { extractChatToken } from '../src/hooks/useDeepLink';
import { Colors } from '../src/constants/colors';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { ConfirmProvider } from '../src/components/ui/ConfirmDialog';
import { ActionSheetProvider } from '../src/components/ui/ActionSheet';
import { realtimeService } from '../src/services/realtimeService';
import { BUYER_TOKEN_KEY } from '../src/constants/config';

// Keep splash visible until we're ready
SplashScreen.preventAutoHideAsync();

const isExpoGo = Constants.executionEnvironment === 'storeClient';

if (!isExpoGo) {
  import('expo-notifications').then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  });
}

function LoadingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Keep showing splash (via SplashScreen.preventAutoHideAsync) until fonts ready
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <PersistGate loading={<LoadingScreen />} persistor={persistor}>
          <ThemeProvider>
            <ConfirmProvider>
              <ActionSheetProvider>
                <RootNavigator />
              </ActionSheetProvider>
            </ConfirmProvider>
          </ThemeProvider>
        </PersistGate>
      </Provider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const router = useRouter();
  const { paletteVersion } = useTheme();
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const sessionChecked = useSelector((s: RootState) => s.auth.sessionChecked);

  // ── Realtime socket lifecycle ─────────────────────────────────────
  // Open the buyer-scoped WebSocket as soon as we have a token in
  // SecureStore, and tear it down on logout. Keeping the socket
  // co-located with auth state guarantees a single connection per
  // signed-in buyer and avoids a stale socket lingering after
  // sign-out (which would otherwise keep delivering events to a
  // logged-out client).
  useEffect(() => {
    let cancelled = false;
    // Only open the socket once the persisted session has been validated
    // against the backend (sessionChecked). Connecting on an unvalidated,
    // possibly-expired token would just churn through failed handshakes.
    if (!isAuthenticated || !sessionChecked) {
      realtimeService.disconnect();
      return;
    }
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(BUYER_TOKEN_KEY);
        if (!cancelled && token) {
          realtimeService.connect(token);
        }
      } catch (_) {
        /* SecureStore failure — fall back to polling */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, sessionChecked]);

  useEffect(() => {
    if (isExpoGo) return;
    let sub: any;
    import('expo-notifications').then((Notifications) => {
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const { chatToken } = response.notification.request.content.data as any;
        if (chatToken) router.push(`/chat/${chatToken}`);
      });
    });
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      const token = extractChatToken(url);
      if (token) router.push(`/chat/${token}`);
    });
    return () => sub.remove();
  }, []);

  return <Stack key={paletteVersion} screenOptions={{ headerShown: false }} />;
}
