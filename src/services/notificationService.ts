import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';

// expo-notifications push token registration is not available in Expo Go (SDK 53+).
// All functions are safe no-ops when running in Expo Go; they work in dev builds and production.
const isExpoGo = Constants.executionEnvironment === 'storeClient';

export async function registerPushToken() {
  if (isExpoGo) return;

  try {
    const { default: Device } = await import('expo-device');
    if (!Device.isDevice) return;

    const Notifications = await import('expo-notifications');
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api.post('/api/buyer/push-token', { token, platform: Platform.OS });
  } catch {
    // Push registration failed silently — user can still use the app
  }
}

export async function unregisterPushToken() {
  if (isExpoGo) return;
  try {
    const Notifications = await import('expo-notifications');
    const { data } = await Notifications.getExpoPushTokenAsync();
    if (data) await api.delete('/api/buyer/push-token', { data: { token: data } });
  } catch {
    // Ignore
  }
}

// In-app notification log (mirrors what we send via push). Powers the
// chatalog Notifications tab and lets us route taps even after the OS
// notification has been dismissed.
export type BuyerNotificationType =
  | 'order'
  | 'chat'
  | 'review'
  | 'promo'
  | 'system';

export interface BuyerNotification {
  _id: string;
  type: BuyerNotificationType;
  title: string;
  body: string;
  data: {
    orderId?: string;
    storeToken?: string;
    productId?: string;
    [key: string]: any;
  };
  readAt: string | null;
  createdAt: string;
}

export const fetchNotifications = () =>
  api.get<{ notifications: BuyerNotification[]; unreadCount: number }>(
    '/api/buyer/notifications',
  );

export const markNotificationRead = (id: string) =>
  api.post<{ ok: true }>(`/api/buyer/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  api.post<{ ok: true }>('/api/buyer/notifications/read-all');
