/**
 * Realtime WebSocket client
 *
 * Maintains a persistent WebSocket to the SellSquare backend (`/ws`)
 * authenticated as the signed-in buyer. Re-emits typed events into the
 * Redux store via the registered handlers in `events.ts`. Designed to
 * survive backgrounding / network blips with exponential backoff and
 * a heartbeat-driven dead-connection detector.
 *
 * Lifecycle:
 *   - `realtimeService.connect()` is called from `_layout.tsx` once
 *     the buyer token is restored from SecureStore.
 *   - `realtimeService.disconnect()` is called on logout.
 *   - Conversation rooms are joined on demand by the chat screen.
 *
 * Single-instance discipline: the module exports a singleton so that
 * accidental double-mounts (Expo Router fast refresh, AppState churn)
 * don't open multiple sockets per buyer.
 */

import { API_URL } from '../constants/config';
import { dispatchRealtimeEvent } from './realtimeEvents';
import { store } from '../store';
import { setRealtimeStatus } from '../store/slices/realtimeSlice';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

const HEARTBEAT_INTERVAL_MS = 25_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = Infinity; // mobile networks roam — keep trying

const wsUrlFromApiUrl = (apiUrl: string): string => {
  // `EXPO_PUBLIC_API_URL` is `http(s)://host[:port]`. Convert to `ws(s)://host[:port]/ws`.
  // We append `?tokenType=buyer` so the backend's verifyClient picks the
  // buyer secret first (and never tries to interpret the token as a
  // business JWT).
  const url = apiUrl.replace(/^http/i, 'ws').replace(/\/$/, '');
  return `${url}/ws?tokenType=buyer`;
};

class RealtimeService {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private status: ConnectionStatus = 'idle';
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private explicitlyClosed = false;
  private pendingConversationSubscriptions = new Set<string>();

  /**
   * Open the socket. Idempotent — calling while already connected to
   * the same token is a no-op. If called with a different token the
   * existing socket is closed first.
   */
  connect(buyerToken: string): void {
    if (!buyerToken) return;
    if (this.ws && this.token === buyerToken && this.status !== 'disconnected') {
      return;
    }
    this.disconnect({ silent: true });
    this.token = buyerToken;
    this.explicitlyClosed = false;
    this.openSocket();
  }

  /**
   * Close the socket. Pass `silent: true` to suppress the auto-reconnect
   * scheduler — used internally when swapping tokens.
   */
  disconnect({ silent = false }: { silent?: boolean } = {}): void {
    if (silent) {
      this.explicitlyClosed = true;
    } else {
      this.explicitlyClosed = true;
      this.token = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {
        /* ignore */
      }
      this.ws = null;
    }
    this.setStatus('idle');
    this.pendingConversationSubscriptions.clear();
  }

  subscribeConversation(conversationId: string): void {
    if (!conversationId) return;
    this.pendingConversationSubscriptions.add(conversationId);
    this.send({ type: 'subscribe_conversation', conversationId });
  }

  unsubscribeConversation(conversationId: string): void {
    if (!conversationId) return;
    this.pendingConversationSubscriptions.delete(conversationId);
    this.send({ type: 'unsubscribe_conversation', conversationId });
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  // ── internals ────────────────────────────────────────────────────

  private openSocket(): void {
    if (!this.token) return;
    this.setStatus('connecting');

    let url: string;
    try {
      url = `${wsUrlFromApiUrl(API_URL)}&token=${encodeURIComponent(this.token)}`;
    } catch (err) {
      console.warn('[Realtime] Bad API_URL, cannot connect:', err);
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      console.warn('[Realtime] WebSocket constructor failed:', err);
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      // Re-subscribe to any rooms the chat screen had opened before the
      // socket dropped.
      this.pendingConversationSubscriptions.forEach((conversationId) => {
        this.send({ type: 'subscribe_conversation', conversationId });
      });
      this.startHeartbeat();
    };

    socket.onmessage = (evt) => {
      let parsed: any;
      try {
        parsed = JSON.parse(typeof evt.data === 'string' ? evt.data : String(evt.data));
      } catch (_) {
        return;
      }
      if (!parsed || typeof parsed !== 'object') return;

      // Backend frames: { type: 'event' | 'connected' | 'pong' | ..., data, timestamp }
      if (parsed.type === 'event' && parsed.data) {
        // `parsed.data` is the canonical event payload {id, type, data, metadata, ...}
        dispatchRealtimeEvent(parsed.data);
      }
      // Other frames (`connected`, `pong`, `subscribed_conversation`, ...)
      // are control messages we don't surface to the rest of the app.
    };

    socket.onerror = (err) => {
      console.warn('[Realtime] socket error', err);
    };

    socket.onclose = () => {
      this.stopHeartbeat();
      this.ws = null;
      this.setStatus('disconnected');
      if (!this.explicitlyClosed && this.token) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) return;
    if (this.reconnectTimer) return;
    const attempt = this.reconnectAttempts + 1;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempts = attempt;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(payload: Record<string, unknown>): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1 /* OPEN */) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    try {
      store.dispatch(setRealtimeStatus(next));
    } catch (_) {
      /* store may not be ready in tests */
    }
  }
}

export const realtimeService = new RealtimeService();
export type { ConnectionStatus };
