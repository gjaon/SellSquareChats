import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authReducer from './slices/authSlice';
import savedStoresReducer from './slices/savedStoresSlice';
import chatReducer from './slices/chatSlice';
import walletReducer from './slices/walletSlice';
import realtimeReducer from './slices/realtimeSlice';
import supportReducer from './slices/supportSlice';

const persistConfig = {
  key: 'chatalog-root',
  storage: AsyncStorage,
  // realtime is intentionally NOT persisted — connection status is
  // session-local; rehydrating a stale "connected" status would lie to
  // the UI before the socket reopens.
  whitelist: ['auth', 'savedStores', 'chat'],
};

const rootReducer = combineReducers({
  auth: authReducer,
  savedStores: savedStoresReducer,
  chat: chatReducer,
  wallet: walletReducer,
  realtime: realtimeReducer,
  support: supportReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export const persistor = persistStore(store);
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
