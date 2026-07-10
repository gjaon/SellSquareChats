/**
 * Buyer support slice (chatalog).
 *
 * Server-driven list (search / status / page flow to the backend) + the open
 * thread (full messages[]). Mirrors the merchant supportQuerySlice shape so the
 * two clients behave identically against the unified SupportTicket backend.
 * Realtime SUPPORT_TICKET_* events set realtime.supportDirtyAt; the Support
 * screen watches it and refetches (debounced-refetch model, like wallet/orders).
 */
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import supportService, { SupportTicket } from '../../services/supportService';

const DEFAULT_LIMIT = 20;

interface SupportQuery {
  search: string;
  status: string | null;
}

interface SupportState {
  query: SupportQuery;
  page: number;
  limit: number;
  items: SupportTicket[];
  total: number | null;
  totalPages: number | null;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  openTicket: SupportTicket | null;
  isLoadingThread: boolean;
  isSubmitting: boolean;
}

const initialState: SupportState = {
  query: { search: '', status: null },
  page: 1,
  limit: DEFAULT_LIMIT,
  items: [],
  total: null,
  totalPages: null,
  hasMore: false,
  isLoading: false,
  error: null,
  lastFetchedAt: null,
  openTicket: null,
  isLoadingThread: false,
  isSubmitting: false,
};

const errMsg = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.message || fallback;

export const fetchSupportTickets = createAsyncThunk(
  'support/fetch',
  async (
    args: { search?: string; status?: string | null; page?: number } = {},
    thunkAPI,
  ) => {
    try {
      const state = (thunkAPI.getState() as any).support as SupportState;
      const search = args.search !== undefined ? args.search : state.query.search;
      const status = args.status !== undefined ? args.status : state.query.status;
      const page = Math.max(1, args.page || 1);
      const res = await supportService.getTickets({ page, limit: state.limit, search, status });
      return { ...res, page, query: { search: (search || '').trim(), status: status || null } };
    } catch (err: any) {
      return thunkAPI.rejectWithValue(errMsg(err, 'Failed to load tickets'));
    }
  },
);

export const fetchSupportTicket = createAsyncThunk(
  'support/fetchOne',
  async (id: string, thunkAPI) => {
    try {
      return await supportService.getTicket(id);
    } catch (err: any) {
      return thunkAPI.rejectWithValue(errMsg(err, 'Failed to load ticket'));
    }
  },
);

export const createSupportTicket = createAsyncThunk(
  'support/create',
  async (
    payload: Parameters<typeof supportService.createTicket>[0],
    thunkAPI,
  ) => {
    try {
      return await supportService.createTicket(payload);
    } catch (err: any) {
      return thunkAPI.rejectWithValue(errMsg(err, 'Failed to create ticket'));
    }
  },
);

export const replySupportTicket = createAsyncThunk(
  'support/reply',
  async (
    { id, body, attachments }: { id: string; body: string; attachments: Parameters<typeof supportService.reply>[1]['attachments'] },
    thunkAPI,
  ) => {
    try {
      return await supportService.reply(id, { body, attachments });
    } catch (err: any) {
      return thunkAPI.rejectWithValue(errMsg(err, 'Failed to send reply'));
    }
  },
);

export const setSupportTicketStatus = createAsyncThunk(
  'support/setStatus',
  async ({ id, action }: { id: string; action: 'close' | 'reopen' }, thunkAPI) => {
    try {
      return await supportService.setStatus(id, action);
    } catch (err: any) {
      return thunkAPI.rejectWithValue(errMsg(err, 'Failed to update ticket'));
    }
  },
);

// Merge fresh ticket fields into the matching list row (status / last message).
const upsertListRow = (state: SupportState, ticket: SupportTicket | null) => {
  if (!ticket?._id) return;
  const slim: SupportTicket = {
    _id: ticket._id,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    lastMessageAt: ticket.lastMessageAt,
    lastMessageSenderType: ticket.lastMessageSenderType,
    createdAt: ticket.createdAt,
  };
  const idx = state.items.findIndex((t) => t?._id === ticket._id);
  if (idx >= 0) {
    state.items[idx] = { ...state.items[idx], ...slim };
    state.items.sort(
      (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime(),
    );
  } else if (state.page === 1) {
    state.items.unshift(slim);
    if (state.items.length > state.limit) state.items.length = state.limit;
    if (typeof state.total === 'number') state.total += 1;
  }
};

const supportSlice = createSlice({
  name: 'support',
  initialState,
  reducers: {
    clearOpenTicket(state) {
      state.openTicket = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSupportTickets.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSupportTickets.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload.tickets;
        state.total = action.payload.total;
        state.totalPages = action.payload.totalPages;
        state.hasMore = action.payload.hasMore;
        state.page = action.payload.page;
        state.query = action.payload.query;
        state.lastFetchedAt = Date.now();
      })
      .addCase(fetchSupportTickets.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) || 'Failed to load tickets';
      })

      .addCase(fetchSupportTicket.pending, (state) => {
        state.isLoadingThread = true;
      })
      .addCase(fetchSupportTicket.fulfilled, (state, action) => {
        state.isLoadingThread = false;
        state.openTicket = action.payload;
      })
      .addCase(fetchSupportTicket.rejected, (state) => {
        state.isLoadingThread = false;
      })

      .addCase(createSupportTicket.pending, (state) => {
        state.isSubmitting = true;
      })
      .addCase(createSupportTicket.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.openTicket = action.payload;
        upsertListRow(state, action.payload);
      })
      .addCase(createSupportTicket.rejected, (state) => {
        state.isSubmitting = false;
      })

      .addCase(replySupportTicket.pending, (state) => {
        state.isSubmitting = true;
      })
      .addCase(replySupportTicket.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.openTicket = action.payload;
        upsertListRow(state, action.payload);
      })
      .addCase(replySupportTicket.rejected, (state) => {
        state.isSubmitting = false;
      })

      .addCase(setSupportTicketStatus.fulfilled, (state, action) => {
        state.openTicket = action.payload;
        upsertListRow(state, action.payload);
      });
  },
});

export const { clearOpenTicket } = supportSlice.actions;
export default supportSlice.reducer;
