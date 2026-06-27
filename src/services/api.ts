import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL, BUYER_TOKEN_KEY } from '../constants/config';

const api = axios.create({ baseURL: API_URL });
// Identify the client surface for the backend error feed (admin System Health).
api.defaults.headers.common['X-Client-App'] = 'chatalog';

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(BUYER_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On a 401/403 from any authenticated endpoint, the buyer's session has
// expired or been revoked. Drop the stale token and force a clean
// logged-out state so the app routes to login instead of continuing to
// act signed-in (which previously let an expired session message a
// merchant anonymously and fork the conversation). Skip the auth routes
// themselves so a wrong-password login doesn't masquerade as expiry.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url || '';
    const isAuthRoute =
      url.includes('/api/buyer/auth/login') ||
      url.includes('/api/buyer/auth/register');
    if ((status === 401 || status === 403) && !isAuthRoute) {
      try {
        await SecureStore.deleteItemAsync(BUYER_TOKEN_KEY);
      } catch (_) {
        /* ignore */
      }
      try {
        // Lazy require to avoid the api <-> store <-> slice import cycle.
        const { store } = require('../store');
        const { sessionExpired } = require('../store/slices/authSlice');
        if (store.getState().auth.isAuthenticated) {
          store.dispatch(sessionExpired());
        }
      } catch (_) {
        /* store not ready (e.g. very early startup / tests) */
      }
    }
    return Promise.reject(error);
  },
);

export default api;
