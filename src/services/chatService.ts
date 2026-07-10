import api from './api';
import type { FeedPost } from './feedService';

export const getChatMeta = (chatToken: string) =>
  api.get(`/api/ai-storefront/chat-meta/${chatToken}`);

export const sendMessage = (
  chatToken: string,
  data: {
    chatSessionId: string;
    message?: string;
    mediaUrl?: string;
    /**
     * Optional structured context describing the product/variant the buyer
     * was viewing when they opened chat (from Discover or store info panel).
     * The backend prepends a hidden context preamble to the message so the
     * AI agent knows exactly which item the buyer is asking about.
     */
    productContext?: {
      type: 'product' | 'group';
      productId?: string | null;
      groupId?: string | null;
      variantKey?: string | null;
      variantLabel?: string | null;
      values?: Record<string, string> | null;
      name?: string;
      price?: number;
    };
    /**
     * Set when this message is a swipe-to-reply quoting an earlier
     * bubble. The backend persists it on the message and the AI sees
     * a markdown blockquote prepended to the prompt for context.
     */
    replyTo?: {
      label?: string | null;
      snippet: string;
      timestamp?: string | null;
      role?: 'user' | 'assistant' | null;
    } | null;
  }
) => api.post(`/api/ai-storefront/chat/${chatToken}`, data);

// Buyer-facing "Re-hold my items for 5 more minutes" action — used
// when the previous reservation expired and the buyer still wants to
// pay. Backend re-creates the inventory holds (subject to current
// stock) and returns the new `holdsExpiresAt`.
export const reholdCart = (chatToken: string, chatSessionId: string) =>
  api.post<{
    ok: true;
    // `paid` is true when the backend, while re-holding, discovered the
    // previous payment had actually gone through and settled the order.
    paid?: boolean;
    status: string;
    holdsExpiresAt: string;
    pendingPayment?: {
      provider?: string;
      reference?: string;
      authorizationUrl?: string;
      amount?: number;
      status?: 'initialized' | 'success' | 'failed' | 'abandoned';
    } | null;
  }>(`/api/ai-storefront/chat/${chatToken}/rehold`, { chatSessionId });

// Buyer-facing "I need a new payment link" action. Unlike re-hold (which
// reuses the outstanding link so the buyer never pays twice), this explicitly
// discards the old link and mints a fresh one for the same cart. Backend
// verifies the old link first — `paid` is true if it had actually settled.
export const requestNewPaymentLink = (chatToken: string, chatSessionId: string) =>
  api.post<{
    ok: true;
    paid?: boolean;
    status: string;
    holdsExpiresAt?: string | null;
    pendingPayment?: {
      provider?: string;
      reference?: string;
      authorizationUrl?: string;
      amount?: number;
      status?: 'initialized' | 'success' | 'failed' | 'abandoned';
    } | null;
  }>(`/api/ai-storefront/chat/${chatToken}/new-payment-link`, { chatSessionId });

// Verify-on-return for Flutterwave checkouts. Called when the buyer comes
// back to the app after paying (or taps "I've paid") so the payment is
// verified + settled immediately instead of waiting on the webhook (which
// can't reach localhost in dev and may lag in prod). Idempotent.
export const verifyChatPayment = (
  chatToken: string,
  chatSessionId: string,
  reference?: string,
) =>
  api.post<{
    ok: true;
    paid: boolean;
    status: string;
    pendingPayment?: {
      provider?: string;
      reference?: string;
      authorizationUrl?: string;
      amount?: number;
      status?: 'initialized' | 'success' | 'failed' | 'abandoned';
    } | null;
  }>(`/api/ai-storefront/chat/${chatToken}/verify-payment`, {
    chatSessionId,
    reference,
  });

export const pollUpdates = (chatToken: string, sessionId: string, since: string) =>
  api.get(`/api/ai-storefront/chat/${chatToken}/updates`, {
    params: { sessionId, since },
  });

// Fetch the persisted message history for the current buyer's
// (business, buyer) conversation so the same chat shows up on every
// device they sign in on. Falls back to the per-device session id when
// the buyer is not signed in.
export const getChatHistory = (chatToken: string, sessionId: string) =>
  api.get<{
    conversationId: string | null;
    status: string;
    holdsExpiresAt: string | null;
    orderNumber: string | null;
    orders?: {
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
    }[];
    pendingPayment?: {
      provider?: string;
      reference?: string;
      authorizationUrl?: string;
      amount?: number;
      initiatedAt?: string;
      status?: 'initialized' | 'success' | 'failed' | 'abandoned';
    } | null;
    messages: {
      role: 'user' | 'assistant';
      content: string;
      mediaUrl?: string;
      sentByBusiness: boolean;
      injectedByName?: string | null;
      productCards?: {
        productId?: string | null;
        groupId?: string | null;
        name: string;
        price: number;
        image: string;
        description: string;
        hasMoreDetails: boolean;
      }[];
      replyTo?: {
        label?: string | null;
        snippet: string;
        messageTimestamp?: string | null;
        role?: 'user' | 'assistant' | null;
      } | null;
      timestamp: string;
    }[];
  }>(`/api/ai-storefront/chat/${chatToken}/history`, {
    params: { sessionId },
  });

// Mark all unviewed orders on the conversation as viewed so the badge
// on the orders icon clears.
export const markOrderViewed = (
  chatToken: string,
  orderId: string,
  sessionId: string,
) =>
  api.post(
    `/api/ai-storefront/chat/${chatToken}/orders/${orderId}/viewed`,
    { sessionId },
  );

// Store products endpoint now returns the same unified shape as the
// Discover feed (`FeedPost`), so a single card component handles both.
export type StoreProduct = FeedPost;

export const getStoreProducts = (chatToken: string, params?: { search?: string; limit?: number }) =>
  api.get<{ items: StoreProduct[] }>(`/api/ai-storefront/chat/${chatToken}/products`, {
    params: {
      search: params?.search || undefined,
      limit: params?.limit || undefined,
    },
  });
