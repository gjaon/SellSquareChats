import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { getSavedStores, saveStore, removeStore } from '../../services/storeService';

export interface SavedStore {
  storeToken: string;
  businessName: string;
  businessLogo?: string;
  lastMessagePreview?: string;
  lastActivityAt?: string;
  unreadCount: number;
}

export const fetchSavedStores = createAsyncThunk('savedStores/fetch', async () => {
  const { data } = await getSavedStores();
  return data as SavedStore[];
});

export const addSavedStore = createAsyncThunk(
  'savedStores/add',
  async (store: SavedStore) => {
    await saveStore(store);
    return store;
  }
);

export const deleteSavedStore = createAsyncThunk(
  'savedStores/delete',
  async (storeToken: string) => {
    await removeStore(storeToken);
    return storeToken;
  }
);

const savedStoresSlice = createSlice({
  name: 'savedStores',
  initialState: { stores: [] as SavedStore[], isLoading: false },
  reducers: {
    updatePreview(
      state,
      action: PayloadAction<{ storeToken: string; preview: string; unread: number }>
    ) {
      const store = state.stores.find((s) => s.storeToken === action.payload.storeToken);
      if (store) {
        store.lastMessagePreview = action.payload.preview;
        store.unreadCount = action.payload.unread;
        store.lastActivityAt = new Date().toISOString();
      }
    },
    markRead(state, action: PayloadAction<string>) {
      const store = state.stores.find((s) => s.storeToken === action.payload);
      if (store) store.unreadCount = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSavedStores.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchSavedStores.fulfilled, (state, action) => {
        state.stores = action.payload;
        state.isLoading = false;
      })
      .addCase(fetchSavedStores.rejected, (state) => {
        state.isLoading = false;
      })
      .addCase(addSavedStore.fulfilled, (state, action) => {
        const exists = state.stores.find((s) => s.storeToken === action.payload.storeToken);
        if (!exists) state.stores.unshift(action.payload);
      })
      .addCase(deleteSavedStore.fulfilled, (state, action) => {
        state.stores = state.stores.filter((s) => s.storeToken !== action.payload);
      });
  },
});

export const { updatePreview, markRead } = savedStoresSlice.actions;
export default savedStoresSlice.reducer;
