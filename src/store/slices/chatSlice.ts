import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ProductCard {
  productId?: string | null;
  groupId?: string | null;
  name: string;
  price: number;
  image: string;
  images?: string[];
  description: string;
  hasMoreDetails: boolean;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  mediaUrl?: string;
  sentByBusiness?: boolean;
  // Display name of the business user who manually injected this
  // message from the merchant Conversations panel. When present,
  // ChatBubble renders it under the store label so the buyer knows
  // which person on the team is replying.
  injectedByName?: string | null;
  // Inline product cards rendered with the assistant bubble. Emitted
  // by the AI via `[[PRODUCT:id]]` / `[[GROUP:id]]` markers and
  // resolved server-side. The `content` field is already cleaned of
  // those markers.
  productCards?: ProductCard[];
  // Set when this message is a swipe-to-reply quoting an earlier
  // bubble. Drives the WhatsApp-style quote block at the top of the
  // bubble + tap-to-jump-to-original behaviour.
  replyTo?: {
    label?: string | null;
    snippet: string;
    messageTimestamp?: string | null;
    role?: 'user' | 'assistant' | null;
  } | null;
  timestamp: string;
}

export interface ConversationOrder {
  orderId?: string | null;
  orderNumber: string;
  amount?: number;
  status?: string;
  createdAt: string;
  gatewayReference?: string | null;
  buyerViewedAt?: string | null;
  refund?: {
    status: 'none' | 'requested' | 'credited_to_wallet';
    amount?: number;
    reason?: string;
    completedAt?: string | null;
  } | null;
}

export interface PendingPayment {
  provider?: string;
  reference?: string;
  authorizationUrl?: string;
  amount?: number;
  initiatedAt?: string;
  status?: 'initialized' | 'success' | 'failed' | 'abandoned';
}

interface ChatEntry {
  messages: Message[];
  status: string;
  // "ai" (assistant is answering) or "human" (a merchant has taken over
  // and is replying manually). Drives the "you're chatting with a team
  // member" badge in the chat header.
  handoffMode?: 'ai' | 'human';
  holdsExpiresAt?: string;
  orderNumber?: string;
  orders: ConversationOrder[];
  pendingPayment?: PendingPayment | null;
  isLoading: boolean;
  lastPolledAt?: string;
}

interface ChatState {
  [storeToken: string]: ChatEntry;
}

const ensureEntry = (state: ChatState, token: string): ChatEntry => {
  if (!state[token]) {
    state[token] = {
      messages: [],
      status: 'active',
      isLoading: false,
      orders: [],
      pendingPayment: null,
    };
  } else if (!state[token].orders) {
    state[token].orders = [];
  }
  return state[token];
};

const chatSlice = createSlice({
  name: 'chat',
  initialState: {} as ChatState,
  reducers: {
    initChat(state, action: PayloadAction<string>) {
      ensureEntry(state, action.payload);
    },
    // Replace the entire message list for a store (used when hydrating
    // from the server-side conversation history so the same chat shows
    // up on every device the buyer signs in on).
    setMessages(
      state,
      action: PayloadAction<{
        storeToken: string;
        messages: Message[];
        status?: string;
        holdsExpiresAt?: string | null;
        orderNumber?: string | null;
        orders?: ConversationOrder[];
        pendingPayment?: PendingPayment | null;
      }>,
    ) {
      const {
        storeToken,
        messages,
        status,
        holdsExpiresAt,
        orderNumber,
        orders,
        pendingPayment,
      } = action.payload;
      const entry = ensureEntry(state, storeToken);
      entry.messages = messages;
      if (status) entry.status = status;
      if (holdsExpiresAt !== undefined) {
        entry.holdsExpiresAt = holdsExpiresAt || undefined;
      }
      if (orderNumber !== undefined) {
        entry.orderNumber = orderNumber || undefined;
      }
      if (orders !== undefined) entry.orders = orders || [];
      if (pendingPayment !== undefined) entry.pendingPayment = pendingPayment;
    },
    addMessage(state, action: PayloadAction<{ storeToken: string; message: Message }>) {
      const chat = state[action.payload.storeToken];
      if (chat) chat.messages.push(action.payload.message);
    },
    setLoading(state, action: PayloadAction<{ storeToken: string; loading: boolean }>) {
      const chat = state[action.payload.storeToken];
      if (chat) chat.isLoading = action.payload.loading;
    },
    setStatus(
      state,
      action: PayloadAction<{
        storeToken: string;
        status: string;
        holdsExpiresAt?: string | null;
        orderNumber?: string | null;
        orders?: ConversationOrder[];
        pendingPayment?: PendingPayment | null;
      }>,
    ) {
      const chat = state[action.payload.storeToken];
      if (!chat) return;
      chat.status = action.payload.status;
      // Treat `undefined` as "leave alone", `null` as "explicitly
      // clear" (e.g. after hold expiry), and a string as "replace".
      if (action.payload.holdsExpiresAt === null) {
        chat.holdsExpiresAt = undefined;
      } else if (action.payload.holdsExpiresAt) {
        chat.holdsExpiresAt = action.payload.holdsExpiresAt;
      }
      if (action.payload.orderNumber === null) {
        chat.orderNumber = undefined;
      } else if (action.payload.orderNumber) {
        chat.orderNumber = action.payload.orderNumber;
      }
      if (action.payload.orders !== undefined) {
        chat.orders = action.payload.orders || [];
      }
      if (action.payload.pendingPayment !== undefined) {
        chat.pendingPayment = action.payload.pendingPayment;
      }
    },
    clearHoldTimer(state, action: PayloadAction<string>) {
      const chat = state[action.payload];
      if (chat) chat.holdsExpiresAt = undefined;
    },
    setHandoffMode(
      state,
      action: PayloadAction<{ storeToken: string; mode: 'ai' | 'human' }>,
    ) {
      const chat = ensureEntry(state, action.payload.storeToken);
      chat.handoffMode = action.payload.mode;
    },
    setLastPolled(state, action: PayloadAction<{ storeToken: string; at: string }>) {
      const chat = state[action.payload.storeToken];
      if (chat) chat.lastPolledAt = action.payload.at;
    },
    injectMessages(
      state,
      action: PayloadAction<{ storeToken: string; messages: Message[] }>,
    ) {
      const chat = state[action.payload.storeToken];
      if (!chat) return;
      // Dedupe against the existing tail. The poll/realtime feed can
      // re-deliver an assistant reply that we already added
      // optimistically from the POST /chat response with a slightly
      // different timestamp. Match on (role, normalised content)
      // within a 60s window of the existing bubble.
      const norm = (s: unknown) => String(s || '').trim();
      const tail = chat.messages.slice(-10);
      for (const incoming of action.payload.messages) {
        const incomingContent = norm(incoming.content);
        const incomingMs = Date.parse(String(incoming.timestamp || '')) || 0;
        const dup = tail.some((m) => {
          if (m.role !== incoming.role) return false;
          if (norm(m.content) !== incomingContent) return false;
          const existingMs = Date.parse(String(m.timestamp || '')) || 0;
          if (incomingMs && existingMs) {
            return Math.abs(incomingMs - existingMs) < 60_000;
          }
          return true;
        });
        if (!dup) {
          chat.messages.push(incoming);
          tail.push(incoming);
          if (tail.length > 10) tail.shift();
        }
      }
    },
    markAllOrdersViewed(state, action: PayloadAction<string>) {
      const chat = state[action.payload];
      if (!chat || !chat.orders) return;
      const now = new Date().toISOString();
      chat.orders = chat.orders.map((o) =>
        o.buyerViewedAt ? o : { ...o, buyerViewedAt: now },
      );
    },
  },
});

export const {
  initChat,
  addMessage,
  setMessages,
  setLoading,
  setStatus,
  clearHoldTimer,
  setHandoffMode,
  setLastPolled,
  injectMessages,
  markAllOrdersViewed,
} = chatSlice.actions;
export default chatSlice.reducer;
