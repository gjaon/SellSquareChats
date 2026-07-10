import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL, BUYER_TOKEN_KEY } from '../constants/config';
import { rateLimitMessage } from '../utils/retryAfter';

// Timeout: without one, a hung backend/socket leaves the request (and any
// "sending…" UI state awaiting it) pending forever. Generous because an AI
// chat send waits for the full OpenAI round-trip incl. backend retries.
const api = axios.create({ baseURL: API_URL, timeout: 120_000 });
// Identify the client surface for the backend error feed (admin System Health).
api.defaults.headers.common['X-Client-App'] = 'chatalog';

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(BUYER_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On a 401 from any authenticated endpoint, the buyer's session has
// expired or been revoked. Drop the stale token and force a clean
// logged-out state so the app routes to login instead of continuing to
// act signed-in (which previously let an expired session message a
// merchant anonymously and fork the conversation). Skip the auth routes
// themselves so a wrong-password login doesn't masquerade as expiry.
// Deliberately NOT 403: buyerAuthMiddleware only ever emits 401 for auth
// failures, so a 403 is a business-rule denial — logging the buyer out
// for one would be wrong.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;

    // 429 rate-limit: rewrite the error body message to a human "try again in
    // Xm Ys" (from `retryAfterSeconds` / `Retry-After`). Every screen reads
    // `error.response.data.message`, so this maps the message app-wide. Chatalog
    // previously had no 429 handling at all.
    if (status === 429) {
      if (!error.response.data || typeof error.response.data !== 'object') {
        error.response.data = {};
      }
      error.response.data.message = rateLimitMessage(error);
      return Promise.reject(error);
    }
    const url: string = error?.config?.url || '';
    const isAuthRoute =
      url.includes('/api/buyer/auth/login') ||
      url.includes('/api/buyer/auth/register');
    if (status === 401 && !isAuthRoute) {
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
