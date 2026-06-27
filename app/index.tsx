import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../src/store';
import { restoreSession } from '../src/store/slices/authSlice';
import * as Linking from 'expo-linking';
import { extractChatToken } from '../src/hooks/useDeepLink';
import { registerPushToken } from '../src/services/notificationService';
import { Colors } from '../src/constants/colors';

export default function Index() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { isAuthenticated, sessionChecked } = useSelector((s: RootState) => s.auth);

  useEffect(() => {
    dispatch(restoreSession());
  }, []);

  useEffect(() => {
    if (!sessionChecked) return;

    const handleInitialUrl = async () => {
      const url = await Linking.getInitialURL();
      const token = url ? extractChatToken(url) : null;

      if (!isAuthenticated) {
        router.replace('/(auth)/login');
      } else {
        registerPushToken();
        if (token) {
          router.replace(`/chat/${token}`);
        } else {
          router.replace('/(main)/home');
        }
      }
    };

    handleInitialUrl();
  }, [sessionChecked]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}
