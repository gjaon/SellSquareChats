/**
 * Realtime event router
 *
 * The single integration point between raw WebSocket payloads from the
 * backend and Redux mutations. Keep this dumb and fanout-only — the
 * heavy logic (persistence, optimistic updates) belongs in the
 * thunks/screens that submit user actions, not in event handling.
 *
 * Backend payload shape (see `SellSquare/events/EventEmitter.js`):
 *   {
 *     id, type, version, timestamp, signature,
 *     data: { ... },
 *     metadata: { businessId?, buyerId?, conversationId?, source?, ... },
 *   }
 *
 * Hardening note: we intentionally do NOT verify the HMAC signature
 * client-side (the secret is server-only). The WebSocket handshake's
 * buyer JWT auth is the trust boundary.
 */

import { store } from '../store';
import {
  addMessage,
  setStatus,
  clearHoldTimer,
  setHandoffMode,
  Message,
} from '../store/slices/chatSlice';
import { updatePreview } from '../store/slices/savedStoresSlice';
import {
  markRealtimeEvent,
  markDiscoverDirty,
  markOrdersDirty,
} from '../store/slices/realtimeSlice';

interface RealtimePayload {
  id?: string;
  type?: string;
  data?: any;
  metadata?: {
    businessId?: string;
    buyerId?: string;
    conversationId?: string;
    source?: string;
    scope?: 'buyer' | 'conversation' | 'business';
  };
}

const EVENT_TYPES = {
  CHAT_MESSAGE_NEW: 'chat.message.new',
  CHAT_HOLD_EXPIRED: 'chat.hold.expired',
  CHAT_PAYMENT_UPDATED: 'chat.payment.updated',
  CHAT_HANDOFF_CHANGED: 'chat.handoff.changed',
  CHAT_STATUS_CHANGED: 'chat.status.changed',
  BUYER_SAVED_STORE_UPDATED: 'buyer.saved_store.updated',
  BUYER_ORDER_UPDATED: 'buyer.order.updated',
  MARKETPLACE_INTERNAL_ORDER_ACCEPTED: 'marketplace.internal_order.accepted',
  MARKETPLACE_INTERNAL_ORDER_REJECTED: 'marketplace.internal_order.rejected',
  MARKETPLACE_INTERNAL_ORDER_STATUS_UPDATED: 'marketplace.internal_order.status_updated',
  MARKETPLACE_LISTING_CHANGED: 'marketplace.listing.changed',
  WALLET_CREDITED: 'wallet.credited',
} as const;

/**
 * Resolve a storeToken (the chat slice's primary key) from an event
 * payload. We accept either an explicit `chatToken` field or fall back
 * to scanning the saved stores in Redux for a matching storeToken-by-
 * conversationId mapping (currently we don't track that mapping
 * client-side, so consumers should pass `chatToken` in `data`).
 */
const resolveStoreToken = (payload: RealtimePayload): string | null => {
  return payload?.data?.chatToken || payload?.data?.storeToken || null;
};

const handleChatMessageNew = (payload: RealtimePayload) => {
  const storeToken = resolveStoreToken(payload);
  const message: Message | undefined = payload?.data?.message;
  if (!storeToken || !message) return;

  // Idempotency: the same logical message can arrive both as the
  // POST /chat response (added optimistically) AND as a realtime
  // event — and the two timestamps usually differ by a few ms (one
  // comes from the client, the other from the server). So compare
  // role + normalised content against the last few bubbles instead
  // of requiring an exact timestamp match.
  const state = store.getState();
  const entry = state.chat[storeToken];
  if (entry) {
    const norm = (s: unknown) => String(s || '').trim();
    const incomingContent = norm(message.content);
    const incomingMs = Date.parse(String(message.timestamp || '')) || 0;
    const tail = entry.messages.slice(-6);
    const dup = tail.some((m) => {
      if (m.role !== message.role) return false;
      if (norm(m.content) !== incomingContent) return false;
      const existingMs = Date.parse(String(m.timestamp || '')) || 0;
      // If we have parseable timestamps, treat anything within 60s
      // as the same logical message. Otherwise fall back to a pure
      // content match within the tail window.
      if (incomingMs && existingMs) {
        return Math.abs(incomingMs - existingMs) < 60_000;
      }
      return true;
    });
    if (dup) return;
  }

  store.dispatch(addMessage({ storeToken, message }));
  store.dispatch(
    updatePreview({
      storeToken,
      preview: String(message.content || '').slice(0, 120),
      unread: (entry?.messages?.length || 0) === 0 ? 1 : (entry ? 1 : 1),
    }),
  );

  if (payload?.data?.status) {
    store.dispatch(
      setStatus({
        storeToken,
        status: payload.data.status,
        holdsExpiresAt: payload.data.holdsExpiresAt ?? undefined,
        orderNumber: payload.data.orderNumber ?? undefined,
        pendingPayment: payload.data.pendingPayment ?? undefined,
      }),
    );
  }
};

const handleHoldExpired = (payload: RealtimePayload) => {
  const storeToken = resolveStoreToken(payload);
  if (!storeToken) return;
  store.dispatch(clearHoldTimer(storeToken));
  store.dispatch(
    setStatus({
      storeToken,
      status: 'hold_expired',
      holdsExpiresAt: null,
    }),
  );
};

// Merchant took over / handed back to the AI. Flip the chat entry's
// handoff mode so the header shows/clears the "team member" badge.
const handleHandoffChanged = (payload: RealtimePayload) => {
  const storeToken = resolveStoreToken(payload);
  const mode = payload?.data?.handoffMode === 'human' ? 'human' : 'ai';
  if (!storeToken) return;
  store.dispatch(setHandoffMode({ storeToken, mode }));
};

const handleSavedStoreUpdated = (payload: RealtimePayload) => {
  const storeToken = resolveStoreToken(payload);
  if (!storeToken) return;
  const preview = String(payload?.data?.lastMessagePreview || '').slice(0, 140);
  if (!preview) return;
  const state = store.getState();
  const existing = state.savedStores.stores.find((s) => s.storeToken === storeToken);
  const unread = (existing?.unreadCount || 0) + Number(payload?.data?.unreadDelta || 0);
  store.dispatch(updatePreview({ storeToken, preview, unread }));
};

// Discover feed: a coarse, debounced "listings changed" broadcast (a
// product was edited / stock changed / a store toggled its AI on-off).
// We just mark the feed dirty; the Discover screen refetches.
const handleListingChanged = () => {
  store.dispatch(markDiscoverDirty());
};

// Buyer orders: an order this buyer placed advanced status (accepted /
// rejected / processing / shipped / delivered). Mark the Orders tab dirty
// so it refetches; the screen owns the actual list state.
const handleOrderUpdated = () => {
  store.dispatch(markOrdersDirty());
};

const handlerMap: Record<string, (p: RealtimePayload) => void> = {
  [EVENT_TYPES.CHAT_MESSAGE_NEW]: handleChatMessageNew,
  [EVENT_TYPES.CHAT_HOLD_EXPIRED]: handleHoldExpired,
  [EVENT_TYPES.CHAT_HANDOFF_CHANGED]: handleHandoffChanged,
  [EVENT_TYPES.BUYER_SAVED_STORE_UPDATED]: handleSavedStoreUpdated,
  [EVENT_TYPES.MARKETPLACE_LISTING_CHANGED]: handleListingChanged,
  [EVENT_TYPES.BUYER_ORDER_UPDATED]: handleOrderUpdated,
  [EVENT_TYPES.MARKETPLACE_INTERNAL_ORDER_ACCEPTED]: handleOrderUpdated,
  [EVENT_TYPES.MARKETPLACE_INTERNAL_ORDER_REJECTED]: handleOrderUpdated,
  [EVENT_TYPES.MARKETPLACE_INTERNAL_ORDER_STATUS_UPDATED]: handleOrderUpdated,
  // Wallet events are wired here as the wallet slice grows realtime
  // support. For now they no-op — the next manual fetch reconciles.
};

export const dispatchRealtimeEvent = (payload: RealtimePayload): void => {
  if (!payload || typeof payload !== 'object' || !payload.type) return;
  store.dispatch(markRealtimeEvent());
  const handler = handlerMap[payload.type];
  if (handler) handler(payload);
};

export { EVENT_TYPES };
