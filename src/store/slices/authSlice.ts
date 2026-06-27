import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as SecureStore from 'expo-secure-store';
import { login, register, logout, getMe } from '../../services/authService';
import api from '../../services/api';
import { BUYER_TOKEN_KEY } from '../../constants/config';

interface Buyer {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  profilePicture?: string;
}

interface AuthState {
  buyer: Buyer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionChecked: boolean;
  error: string | null;
}

export const loginBuyer = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const { data } = await login(credentials);
      if (data.token) await SecureStore.setItemAsync(BUYER_TOKEN_KEY, data.token);
      return data.buyer as Buyer;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || 'Login failed');
    }
  }
);

export const registerBuyer = createAsyncThunk(
  'auth/register',
  async (
    payload: { firstName: string; lastName: string; email: string; password: string; phone?: string },
    { rejectWithValue }
  ) => {
    try {
      const { data } = await register(payload);
      if (data.token) await SecureStore.setItemAsync(BUYER_TOKEN_KEY, data.token);
      return data.buyer as Buyer;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || 'Registration failed');
    }
  }
);

type RestoreResult =
  | { status: 'ok'; buyer: Buyer }
  | { status: 'no-token' }
  | { status: 'unvalidated' };

export const restoreSession = createAsyncThunk(
  'auth/restore',
  async (_, { rejectWithValue }) => {
    const token = await SecureStore.getItemAsync(BUYER_TOKEN_KEY);
    if (!token) return { status: 'no-token' } as RestoreResult;
    try {
      const { data } = await getMe();
      return { status: 'ok', buyer: data as Buyer } as RestoreResult;
    } catch (e: any) {
      const code = e?.response?.status;
      if (code === 401 || code === 403) {
        // Token was explicitly rejected by the backend — the session is
        // gone. Drop the stale token so we never present a logged-in
        // shell (and so the chat endpoints, which accept anonymous
        // callers, can't silently fork an anonymous conversation).
        try {
          await SecureStore.deleteItemAsync(BUYER_TOKEN_KEY);
        } catch (_) {
          /* ignore */
        }
        return rejectWithValue('expired');
      }
      // Transient failure (offline / 5xx): keep the persisted session as
      // it is and let the next authed request reconcile via the 401
      // response interceptor in `services/api.ts`.
      return { status: 'unvalidated' } as RestoreResult;
    }
  }
);

export const logoutBuyer = createAsyncThunk('auth/logout', async () => {
  try {
    await logout();
  } catch {
    // ignore
  }
  await SecureStore.deleteItemAsync(BUYER_TOKEN_KEY);
});

export const updateProfilePicture = createAsyncThunk(
  'auth/updateProfilePicture',
  async (uri: string, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      formData.append('file', { uri, name: `profile.${ext}`, type: mime } as any);
      const { data } = await api.post('/api/buyer/profile-picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.profilePicture as string;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || 'Upload failed');
    }
  }
);

export const removeProfilePicture = createAsyncThunk(
  'auth/removeProfilePicture',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.delete('/api/buyer/profile-picture');
      return data.profilePicture as string;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message || 'Remove failed');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    buyer: null,
    isAuthenticated: false,
    isLoading: false,
    sessionChecked: false,
    error: null,
  } as AuthState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    // Force a clean logged-out state. Dispatched by the API 401/403
    // response interceptor (services/api.ts) when the backend rejects the
    // buyer token mid-session, so an expired session can never keep
    // acting as if it were still signed in.
    sessionExpired(state) {
      state.buyer = null;
      state.isAuthenticated = false;
      state.sessionChecked = true;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.fulfilled, (state, action) => {
        const res = action.payload as RestoreResult;
        state.sessionChecked = true;
        if (res.status === 'ok') {
          state.buyer = res.buyer;
          state.isAuthenticated = true;
        } else if (res.status === 'no-token') {
          state.buyer = null;
          state.isAuthenticated = false;
        }
        // 'unvalidated' → keep the persisted buyer / isAuthenticated as-is
        // (offline tolerance); a later 401 will force a logout.
      })
      .addCase(restoreSession.rejected, (state) => {
        // Token was explicitly rejected (expired/invalid). Clear auth so
        // the app routes to login instead of a stale logged-in shell.
        state.buyer = null;
        state.isAuthenticated = false;
        state.sessionChecked = true;
        state.error = null;
      })
      .addCase(loginBuyer.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginBuyer.fulfilled, (state, action) => {
        state.buyer = action.payload;
        state.isAuthenticated = true;
        state.isLoading = false;
      })
      .addCase(loginBuyer.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(registerBuyer.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerBuyer.fulfilled, (state, action) => {
        state.buyer = action.payload;
        state.isAuthenticated = true;
        state.isLoading = false;
      })
      .addCase(registerBuyer.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(logoutBuyer.fulfilled, (state) => {
        state.buyer = null;
        state.isAuthenticated = false;
      })
      .addCase(updateProfilePicture.fulfilled, (state, action) => {
        if (state.buyer) state.buyer.profilePicture = action.payload;
      })
      .addCase(removeProfilePicture.fulfilled, (state, action) => {
        if (state.buyer) state.buyer.profilePicture = action.payload;
      });
  },
});

export const { clearError, sessionExpired } = authSlice.actions;
export default authSlice.reducer;
