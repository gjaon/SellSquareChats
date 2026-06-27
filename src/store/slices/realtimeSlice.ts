import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ConnectionStatus } from '../../services/realtimeService';

interface RealtimeState {
  status: ConnectionStatus;
  lastEventAt: string | null;
  // Monotonic "dirty" markers bumped when a realtime event tells us a
  // screen's data is stale. Screens watch the relevant marker and refetch
  // (debounced refetch model — we don't patch individual rows here).
  discoverDirtyAt: string | null;
  ordersDirtyAt: string | null;
}

const initialState: RealtimeState = {
  status: 'idle',
  lastEventAt: null,
  discoverDirtyAt: null,
  ordersDirtyAt: null,
};

const realtimeSlice = createSlice({
  name: 'realtime',
  initialState,
  reducers: {
    setRealtimeStatus(state, action: PayloadAction<ConnectionStatus>) {
      state.status = action.payload;
    },
    markRealtimeEvent(state) {
      state.lastEventAt = new Date().toISOString();
    },
    markDiscoverDirty(state) {
      state.discoverDirtyAt = new Date().toISOString();
    },
    markOrdersDirty(state) {
      state.ordersDirtyAt = new Date().toISOString();
    },
  },
});

export const {
  setRealtimeStatus,
  markRealtimeEvent,
  markDiscoverDirty,
  markOrdersDirty,
} = realtimeSlice.actions;
export default realtimeSlice.reducer;
