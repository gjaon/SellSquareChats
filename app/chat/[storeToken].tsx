import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
  Alert,
  ActivityIndicator,
  Linking,
  ScrollView,
  InteractionManager,
  AppState,
} from 'react-native';
import SmartImage from '../../src/components/SmartImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Camera from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
const generateSessionId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

import { AppDispatch, RootState } from '../../src/store';
import {
  initChat,
  addMessage,
  setMessages,
  setLoading,
  setStatus,
  clearHoldTimer,
  setHandoffMode,
  injectMessages,
  markAllOrdersViewed,
  Message,
} from '../../src/store/slices/chatSlice';
import { addSavedStore, markRead, updatePreview } from '../../src/store/slices/savedStoresSlice';
import {
  getChatMeta,
  sendMessage,
  pollUpdates,
  getStoreProducts,
  getChatHistory,
  reholdCart,
  verifyChatPayment,
  markOrderViewed,
  StoreProduct,
} from '../../src/services/chatService';
import { updateStorePreview } from '../../src/services/storeService';
import api from '../../src/services/api';
import { SESSION_ID_PREFIX } from '../../src/constants/config';
import { realtimeService } from '../../src/services/realtimeService';

import ChatBubble from '../../src/components/ChatBubble';
import TypingIndicator from '../../src/components/TypingIndicator';
import HoldTimer from '../../src/components/HoldTimer';
import VariantSheet from '../../src/components/VariantSheet';
import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';
import { useConfirm } from '../../src/components/ui/ConfirmDialog';
import { API_URL } from '../../src/constants/config';
import { formatPriceLabel } from '../../src/utils/variantHelpers';
import { preloadSavedVariants } from '../../src/services/savedVariants';

// Make sure saved variant memory is hydrated for VariantSheet's sync getter.
preloadSavedVariants().catch(() => {});

const resolveMediaUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${API_URL}${raw}`;
  return raw;
};

// Backoff schedule (ms) for transparently retrying a send when the backend
// reports `aiBusy` (its AI-concurrency queue is saturated). The number of
// entries is also the max retry count. Kept short so the buyer isn't left
// waiting too long before the canned "busy" reply is finally shown.
const BUSY_RETRY_DELAYS_MS = [1500, 2500, 4000];

type ProductContext = NonNullable<
  Parameters<typeof sendMessage>[1]['productContext']
>;

export default function ChatScreen() {
  const { storeToken, presetMessage, productContext: productContextParam, orderContext: orderContextParam } =
    useLocalSearchParams<{
      storeToken: string;
      presetMessage?: string;
      productContext?: string;
      orderContext?: string;
    }>();
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const confirm = useConfirm();

  const chat = useSelector((s: RootState) => s.chat[storeToken]);
  const savedStores = useSelector((s: RootState) => s.savedStores.stores);
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);

  // Pre-resolve cached metadata for THIS store so the header paints with
  // the real name + logo on the very first render. Without this the
  // screen flashed "Loading..." until the network round-trip for
  // getChatMeta returned, which made tapping a saved store feel slow.
  const cachedStore = savedStores.find((s) => s.storeToken === storeToken);

  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [businessName, setBusinessName] = useState(cachedStore?.businessName || '');
  const [businessLogo, setBusinessLogo] = useState(cachedStore?.businessLogo || '');
  // Tracked so we can subscribe to the per-conversation realtime room
  // and tear it down on unmount / navigation away. The same buyer can
  // bounce between multiple stores, and each store has its own
  // BotConversation document on the backend.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [showStoreInfo, setShowStoreInfo] = useState(false);
  const [chatMeta, setChatMeta] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    uri: string;
    type?: string;
    name?: string;
    mediaType?: 'image' | 'video';
  } | null>(null);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const productsLoadedRef = useRef(false);

  // Variant sheet for group products tapped from the store info panel.
  const [variantSheetPost, setVariantSheetPost] = useState<StoreProduct | null>(null);

  // Pending product context — set when the user arrives from Discover with a
  // ?productContext= JSON param, OR taps a product card here. Sent with the
  // very next message and then cleared so subsequent unrelated messages
  // aren't tagged with stale context.
  const [pendingProductContext, setPendingProductContext] = useState<
    ProductContext | null
  >(null);

  // Pending order context — set when the buyer navigates here from the
  // order detail screen via `?orderContext=<json>`. Rendered as a pinned
  // card above the input so the AI / store knows which order the next
  // message refers to. Cleared once the buyer dismisses it OR sends a
  // message (handled in `handleSend`).
  type OrderContextPayload = {
    type: 'order';
    orderId: string;
    orderNumber: string;
    status: string;
    total?: number;
    lines?: { name: string; qty: number; variantLabel?: string }[];
  };
  const [pendingOrderContext, setPendingOrderContext] =
    useState<OrderContextPayload | null>(null);

  // Quoted message the buyer is replying to (set by swipe-to-reply on a
  // ChatBubble). When set, a small preview row appears above the input
  // bar and the next outbound message carries this as structured
  // metadata so it renders as a distinct, tappable quote block on the
  // bubble (WhatsApp-style) instead of inline plain-text quoting.
  const [replyTo, setReplyTo] = useState<{
    label: string;
    snippet: string;
    timestamp: string;
    role: 'user' | 'assistant';
  } | null>(null);
  const handleSwipeReply = useCallback(
    (m: { role: 'user' | 'assistant'; content: string; sentByBusiness?: boolean; injectedByName?: string | null; timestamp: string; mediaUrl?: string }) => {
      const label = m.role === 'user'
        ? 'You'
        : m.injectedByName
          ? m.injectedByName
          : (chatMeta?.assistantName || businessName || 'Store');
      const snippet = (m.content || (m.mediaUrl ? '\u{1F5BC} Image' : '')).slice(0, 140);
      setReplyTo({ label, snippet, timestamp: m.timestamp, role: m.role });
    },
    [businessName, chatMeta],
  );

  // Tap-handler on a quoted reply block: scroll the FlatList to the
  // original message it references. The list is rendered with `inverted`
  // and `data={[...messages].reverse()}`, so the visual index of the
  // original is `messages.length - 1 - originalIndex`.
  const handleJumpToOriginal = useCallback(
    (rt: { messageTimestamp?: string | null }) => {
      if (!rt?.messageTimestamp) return;
      const targetTs = new Date(rt.messageTimestamp).getTime();
      const originalIdx = messages.findIndex(
        (msg) => new Date(msg.timestamp).getTime() === targetTs,
      );
      if (originalIdx < 0 || !flatListRef.current) return;
      const reversedIdx = messages.length - 1 - originalIdx;
      try {
        flatListRef.current.scrollToIndex({
          index: reversedIdx,
          animated: true,
          viewPosition: 0.4,
        });
      } catch {
        // scrollToIndex throws if the row hasn't been measured; the
        // FlatList will recover on next render.
      }
    },
    [messages],
  );

  const flatListRef = useRef<FlatList>(null);
  const presetAppliedRef = useRef(false);
  const productContextAppliedRef = useRef(false);
  const orderContextAppliedRef = useRef(false);

  // ── Pre-fill the input when navigated from the Discover feed ────────────────
  useEffect(() => {
    if (presetAppliedRef.current) return;
    const preset = typeof presetMessage === 'string' ? presetMessage : '';
    if (preset) {
      setInputText(preset);
      presetAppliedRef.current = true;
    }
  }, [presetMessage]);

  // ── Decode productContext route param so the AI knows the source item ──────
  useEffect(() => {
    if (productContextAppliedRef.current) return;
    if (typeof productContextParam !== 'string' || !productContextParam) return;
    try {
      const parsed = JSON.parse(productContextParam) as ProductContext;
      setPendingProductContext(parsed);
      productContextAppliedRef.current = true;
    } catch {
      // Ignore malformed payloads silently — chat still works.
    }
  }, [productContextParam]);

  // ── Decode orderContext route param when arriving from the order detail ───
  useEffect(() => {
    if (orderContextAppliedRef.current) return;
    if (typeof orderContextParam !== 'string' || !orderContextParam) return;
    try {
      const parsed = JSON.parse(orderContextParam) as OrderContextPayload;
      if (parsed?.orderNumber) {
        setPendingOrderContext(parsed);
        orderContextAppliedRef.current = true;
      }
    } catch {
      // Ignore malformed payloads silently — chat still works.
    }
  }, [orderContextParam]);

  // ── Open the store info sheet (and lazy-load the product list) ──────────────
  const loadStoreProducts = useCallback(async () => {
    if (productsLoadedRef.current) return;
    productsLoadedRef.current = true;
    setProductsLoading(true);
    try {
      const { data } = await getStoreProducts(storeToken, { limit: 50 });
      setStoreProducts(data?.items || []);
    } catch (err) {
      // Silent — empty state handles it
      productsLoadedRef.current = false;
    } finally {
      setProductsLoading(false);
    }
  }, [storeToken]);

  const openStoreInfo = useCallback(() => {
    setShowStoreInfo(true);
    loadStoreProducts();
  }, [loadStoreProducts]);

  // Tap handler for a product card in the store info sheet.
  // Standalone products → fast preset. Groups → open VariantSheet picker.
  const askAboutProduct = useCallback((product: StoreProduct) => {
    if (product.type === 'group') {
      setVariantSheetPost(product);
      return;
    }
    const message = `Hi! I'm interested in "${product.name}". Can you tell me more about it?`;
    setInputText(message);
    setPendingProductContext({
      type: 'product',
      productId: product.productId,
      groupId: null,
      name: product.name,
      price: product.price.effective,
    });
    setShowStoreInfo(false);
  }, []);

  // Called by VariantSheet when the buyer hits one of its CTAs.
  const handleVariantAsk = useCallback(
    (preset: string, ctx: Record<string, unknown>) => {
      setInputText(preset);
      setPendingProductContext(ctx as ProductContext);
      setVariantSheetPost(null);
      setShowStoreInfo(false);
    },
    [],
  );

  // ── Session ID ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const initSession = async () => {
      const key = SESSION_ID_PREFIX + storeToken;
      let sid = await AsyncStorage.getItem(key);
      if (!sid) {
        sid = generateSessionId();
        await AsyncStorage.setItem(key, sid);
      }
      setChatSessionId(sid);
    };
    initSession();
  }, [storeToken]);

  // ── Init chat + fetch meta ──────────────────────────────────────────────────
  useEffect(() => {
    dispatch(initChat(storeToken));
    dispatch(markRead(storeToken));

    const fetchMeta = async () => {
      try {
        const { data } = await getChatMeta(storeToken);
        setChatMeta(data);
        const name = data.businessName || 'Store';
        const logo = data.businessLogo || '';
        setBusinessName(name);
        setBusinessLogo(logo);

        // Auto-save store
        const alreadySaved = savedStores.some((s) => s.storeToken === storeToken);
        if (!alreadySaved) {
          dispatch(addSavedStore({ storeToken, businessName: name, businessLogo: logo, unreadCount: 0 }));
        }

        // Inject greeting as first message if chat is empty AND we don't
        // already have server-side history queued up to hydrate (the
        // history effect below will handle that case).
        if (data.greeting && (!chat || chat.messages.length === 0)) {
          dispatch(
            addMessage({
              storeToken,
              message: {
                role: 'assistant',
                content: data.greeting,
                timestamp: new Date().toISOString(),
              },
            })
          );
        }
      } catch {
        // meta fetch failed — continue with blank header
      }
    };
    fetchMeta();
  }, [storeToken]);

  // ── Hydrate persisted history so the same chat shows on every device ──────
  // The backend keys conversations by (business, buyer) when the buyer
  // is signed in, so this fetch returns the canonical thread regardless
  // of which device the buyer last used.
  // Fetch the canonical thread + state from the backend and replace the
  // Redux cache. Extracted into a callback so it can be re-run on demand
  // (e.g. after a verify-on-return settles a payment), not just on mount.
  const loadHistory = useCallback(async () => {
    if (!chatSessionId) return;
    try {
      const { data } = await getChatHistory(storeToken, chatSessionId);
      if (data?.conversationId) {
        setConversationId(data.conversationId);
      }
      if ((data as any)?.handoffMode) {
        dispatch(
          setHandoffMode({
            storeToken,
            mode: (data as any).handoffMode === 'human' ? 'human' : 'ai',
          }),
        );
      }
      if (data?.messages?.length) {
        dispatch(
          setMessages({
            storeToken,
            messages: data.messages.map((m) => ({
              role: m.role,
              content: m.content,
              mediaUrl: m.mediaUrl,
              sentByBusiness: !!m.sentByBusiness,
              injectedByName: m.injectedByName ?? null,
              productCards: Array.isArray((m as any).productCards) && (m as any).productCards.length
                ? (m as any).productCards
                : undefined,
              replyTo: m.replyTo
                ? {
                    label: m.replyTo.label ?? null,
                    snippet: m.replyTo.snippet ?? '',
                    messageTimestamp: m.replyTo.messageTimestamp ?? null,
                    role: m.replyTo.role ?? null,
                  }
                : null,
              timestamp: m.timestamp,
            })),
            status: data.status,
            holdsExpiresAt: data.holdsExpiresAt,
            orderNumber: data.orderNumber,
            orders: data.orders || [],
            pendingPayment: data.pendingPayment || null,
          }),
        );
      }
    } catch {
      // History fetch failed — local cache stays as-is.
    }
  }, [chatSessionId, storeToken, dispatch]);

  useEffect(() => {
    if (!chatSessionId) return;
    // Same as the meta fetch: the FlatList already renders from the
    // persisted Redux cache, so we wait for the navigation transition
    // to settle before doing the network round-trip + Redux replace.
    const handle = InteractionManager.runAfterInteractions(loadHistory);
    return () => {
      try { (handle as any)?.cancel?.(); } catch (_e) {}
    };
  }, [chatSessionId, loadHistory]);

  // ── Verify-on-return for Flutterwave checkouts ───────────────────────────────
  // The buyer pays in an external browser (Linking.openURL), so the app never
  // receives a deep-link callback. When the app returns to the foreground with a
  // pending payment outstanding, verify it with the backend (which re-checks
  // Flutterwave and settles the order) — this is what makes test/dev payments
  // actually complete, and adds resilience if the webhook is missed in prod.
  // We read live state via a ref so the listener isn't re-bound every render,
  // and dedupe by reference so we never spam verify for the same checkout.
  const pendingPayRef = useRef(chat?.pendingPayment);
  pendingPayRef.current = chat?.pendingPayment;
  const verifiedRefRef = useRef<string | null>(null);
  const tryVerifyPaymentRef = useRef<() => void>(() => {});
  tryVerifyPaymentRef.current = async () => {
    if (!chatSessionId) return;
    const pp = pendingPayRef.current;
    if (!pp?.reference || pp.status !== 'initialized') return;
    if (verifiedRefRef.current === pp.reference) return; // already attempted
    verifiedRefRef.current = pp.reference;
    try {
      const { data } = await verifyChatPayment(storeToken, chatSessionId, pp.reference);
      // Whether it settled, failed, or is still pending, re-sync the thread so
      // the UI reflects the truth (new order + confirmation bubble on success).
      await loadHistory();
      if (data?.paid) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        // Still pending (e.g. buyer hasn't actually paid yet) — allow a later
        // foreground attempt to retry this same reference.
        verifiedRefRef.current = null;
      }
    } catch {
      verifiedRefRef.current = null; // non-fatal; let a later attempt retry
    }
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') tryVerifyPaymentRef.current?.();
    });
    return () => sub.remove();
  }, []);
  // Fire whenever a pending checkout appears (cold open after paying, or a
  // freshly-minted link that the buyer then pays out-of-band).
  useEffect(() => {
    if (chat?.pendingPayment?.status === 'initialized') {
      tryVerifyPaymentRef.current?.();
    }
  }, [chat?.pendingPayment?.reference, chat?.pendingPayment?.status]);

  // ── NetInfo ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
    });
    return () => unsub();
  }, []);

  // ── Realtime subscription ────────────────────────────────────────
  // Once we know which conversationId this chat maps to, join the
  // conversation room so assistant replies + business injections land
  // in Redux without waiting on the 5-second poll. The polling effect
  // below stays as a safety net for when the WS is down.
  useEffect(() => {
    if (!conversationId) return;
    realtimeService.subscribeConversation(conversationId);
    return () => {
      realtimeService.unsubscribeConversation(conversationId);
    };
  }, [conversationId]);

  // ── Poll for business injections ────────────────────────────────────────────
  useEffect(() => {
    if (!chatSessionId || !chat) return;
    if (chat.status === 'closed' || chat.status === 'refund_completed') return;

    const poll = setInterval(async () => {
      try {
        const lastTimestamp =
          chat.messages.length > 0
            ? chat.messages[chat.messages.length - 1].timestamp
            : new Date(0).toISOString();
        const { data } = await pollUpdates(storeToken, chatSessionId, lastTimestamp);
        if (data?.handoffMode) {
          dispatch(
            setHandoffMode({
              storeToken,
              mode: data.handoffMode === 'human' ? 'human' : 'ai',
            }),
          );
        }
        if (data.messages?.length > 0) {
          dispatch(injectMessages({ storeToken, messages: data.messages }));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const lastInjected = data.messages[data.messages.length - 1];
          const injectedPreview = lastInjected.content.substring(0, 80);
          dispatch(updatePreview({ storeToken, preview: injectedPreview, unread: 0 }));
          updateStorePreview(storeToken, { lastMessagePreview: injectedPreview, unreadCount: 0 }).catch(() => {});
        }
      } catch {
        // ignore poll errors
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [chatSessionId, chat?.messages?.length, chat?.status]);

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async () => {
      if (!chatSessionId) return;
      // Never send while unauthenticated. The chat endpoint accepts
      // anonymous callers, so an expired session would otherwise be
      // recorded against an anonymous (session-keyed) thread, delivering
      // "anonymous" to the merchant and hiding the buyer's real
      // conversation. Bounce to login instead.
      if (!isAuthenticated) {
        router.replace('/(auth)/login');
        return;
      }
      const text = inputText.trim();
      const imageUri = pendingImage?.uri ?? null;
      if (!text && !imageUri) return;

      setInputText('');
      setPendingImage(null);

      // Upload image first if one is staged
      let mediaUrl: string | undefined;
      if (imageUri) {
        setUploading(true);
        try {
          const formData = new FormData();
          const isVideo = pendingImage?.mediaType === 'video';
          const guessedExt = (pendingImage?.uri.split('.').pop() || '').toLowerCase();
          const fallbackName = isVideo
            ? `clip.${guessedExt && guessedExt.length <= 5 ? guessedExt : 'mp4'}`
            : `image.${guessedExt && guessedExt.length <= 5 ? guessedExt : 'jpg'}`;
          const fallbackType = isVideo
            ? guessedExt === 'mov'
              ? 'video/quicktime'
              : guessedExt === 'webm'
              ? 'video/webm'
              : 'video/mp4'
            : guessedExt === 'png'
            ? 'image/png'
            : 'image/jpeg';
          formData.append('file', {
            uri: imageUri,
            name: pendingImage?.name || fallbackName,
            type: pendingImage?.type || fallbackType,
          } as any);
          if (chatSessionId) formData.append('chatSessionId', chatSessionId);
          const { data: uploadData } = await api.post('/api/ai-storefront/upload/bot-receipt', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          mediaUrl = uploadData.url ?? uploadData.mediaUrl;
        } catch {
          Alert.alert('Upload failed', 'Could not upload the file. Please try again.');
          setUploading(false);
          return;
        } finally {
          setUploading(false);
        }
      }

      const displayContent = text || (mediaUrl ? '(image sent)' : '');
      // Snapshot the reply quote BEFORE clearing it so we can both
      // attach it to the optimistic local bubble AND forward it as
      // structured metadata to the backend below.
      const replyToSend = replyTo;
      if (replyToSend) setReplyTo(null);
      dispatch(
        addMessage({
          storeToken,
          message: {
            role: 'user',
            content: displayContent,
            mediaUrl,
            replyTo: replyToSend
              ? {
                  label: replyToSend.label,
                  snippet: replyToSend.snippet,
                  messageTimestamp: replyToSend.timestamp,
                  role: replyToSend.role,
                }
              : null,
            timestamp: new Date().toISOString(),
          },
        })
      );
      dispatch(updatePreview({
        storeToken,
        preview: `You: ${text || '🖼️ Image'}`.substring(0, 80),
        unread: 0,
      }));
      // Persist to DB immediately so timestamp survives reload
      updateStorePreview(storeToken, {
        lastMessagePreview: `You: ${text || '🖼️ Image'}`.substring(0, 80),
        unreadCount: 0,
      }).catch(() => {});
      dispatch(setLoading({ storeToken, loading: true }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Snapshot + clear product context BEFORE the request so a parallel
      // user action can't double-attach it to the next message.
      const ctxToSend = pendingProductContext;
      if (ctxToSend) setPendingProductContext(null);

      // Snapshot + clear pending order context the same way. We prepend a
      // short "[Re: ORD-####]" marker to the outgoing text so the AI / store
      // can see which order the buyer is referring to even though the chat
      // backend doesn't yet model an explicit order context.
      const orderCtxToSend = pendingOrderContext;
      if (orderCtxToSend) setPendingOrderContext(null);

      const baseText = text || '(image sent)';
      const messageWithOrderRef = orderCtxToSend
        ? `[Re: Order ${orderCtxToSend.orderNumber}] ${baseText}`
        : baseText;

      try {
        const sendPayload = {
          chatSessionId,
          message: messageWithOrderRef,
          mediaUrl,
          productContext: ctxToSend || undefined,
          // Structured swipe-to-reply context. The backend stores it on
          // the message as a subdoc and the bubble renders a tappable
          // WhatsApp-style quote block — no inline ">" prepending.
          replyTo: replyToSend
            ? {
                label: replyToSend.label,
                snippet: replyToSend.snippet,
                timestamp: replyToSend.timestamp,
                role: replyToSend.role,
              }
            : undefined,
        };

        // The backend returns `aiBusy` when its per-business / global AI
        // concurrency queue is saturated — and crucially it does NOT persist
        // the buyer's message in that case. Rather than render the canned
        // "resend in a few seconds" text (which would orphan the buyer's
        // bubble on the next reload), transparently retry the SAME message a
        // few times with backoff while the typing indicator stays up, so the
        // server-side cap is invisible under normal bursts. Only after the
        // retries are exhausted do we let the busy reply render so the buyer
        // knows to try again later.
        let data: any;
        for (let attempt = 0; ; attempt += 1) {
          ({ data } = await sendMessage(storeToken, sendPayload));
          if (data?.aiBusy && attempt < BUSY_RETRY_DELAYS_MS.length) {
            await new Promise((r) => setTimeout(r, BUSY_RETRY_DELAYS_MS[attempt]));
            continue;
          }
          break;
        }

        // When a merchant has taken over the chat, the backend pauses the AI
        // and returns `aiPaused: true` with `reply: null` — it deliberately
        // does NOT generate a reply. Appending an assistant bubble here would
        // render an empty AI message that should never exist. Only add the
        // assistant bubble when the AI actually produced content (or product
        // cards). The merchant's manual reply arrives separately via realtime.
        const replyText = data.reply ?? data.message ?? '';
        const hasProductCards =
          Array.isArray(data.productCards) && data.productCards.length > 0;
        if (!data.aiPaused && (replyText || hasProductCards)) {
          dispatch(
            addMessage({
              storeToken,
              message: {
                role: 'assistant',
                content: replyText,
                productCards: hasProductCards ? data.productCards : undefined,
                timestamp: new Date().toISOString(),
              },
            })
          );
        }

        if (
          data.status ||
          data.holdsExpiresAt !== undefined ||
          data.orderNumber !== undefined ||
          data.orders !== undefined ||
          data.pendingPayment !== undefined
        ) {
          dispatch(
            setStatus({
              storeToken,
              status: data.status,
              holdsExpiresAt: data.holdsExpiresAt,
              orderNumber: data.orderNumber,
              orders: data.orders,
              pendingPayment: data.pendingPayment,
            })
          );
        }

        // Update saved store preview. Skip the overwrite when the AI is paused
        // and produced no reply — the optimistic "You: …" preview set above
        // already reflects the buyer's last message.
        if (!data.aiPaused && replyText) {
          const preview = replyText.substring(0, 80);
          dispatch(updatePreview({ storeToken, preview, unread: 0 }));
          updateStorePreview(storeToken, { lastMessagePreview: preview, unreadCount: 0 }).catch(() => {});
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (data.orderCreated) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (e: any) {
        // Whatever went wrong (network drop, server error), the buyer should
        // never see a cold "something went wrong". Reassure them instead —
        // their message reached us in most cases, and the merchant can follow
        // up. The backend already returns a warm fallback for AI failures, so
        // this branch is mostly transport-level errors.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        dispatch(
          addMessage({
            storeToken,
            message: {
              role: 'assistant',
              content:
                "Thanks for your message! 🙏 We're having a brief hiccup connecting right now, but the team will get back to you shortly.",
              timestamp: new Date().toISOString(),
            },
          })
        );
      } finally {
        dispatch(setLoading({ storeToken, loading: false }));
      }
    },
    [chatSessionId, inputText, pendingImage, storeToken, pendingProductContext, pendingOrderContext, isAuthenticated, router]
  );

  // ── Image attachment ─────────────────────────────────────────────────────────
  const handleAttach = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        async (idx) => {
          if (idx === 1) await capturePhoto();
          else if (idx === 2) await pickImage();
        }
      );
    } else {
      Alert.alert('Attach Receipt', 'Choose an option', [
        { text: 'Take Photo', onPress: capturePhoto },
        { text: 'Choose from Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const capturePhoto = async () => {
    const { status } = await Camera.Camera.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0] as any;
      const isVideo = (asset.type || '').toString().startsWith('video') || asset.mediaType === 'video';
      setPendingImage({
        uri: asset.uri,
        type: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        name: asset.fileName || undefined,
        mediaType: isVideo ? 'video' : 'image',
      });
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0] as any;
      const isVideo = (asset.type || '').toString().startsWith('video') || asset.mediaType === 'video';
      // Hard cap: backend rejects > 60 MB; do a friendly client check too.
      if (asset.fileSize && asset.fileSize > 60 * 1024 * 1024) {
        Alert.alert('Too large', 'Please choose a file under 60 MB.');
        return;
      }
      setPendingImage({
        uri: asset.uri,
        type: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        name: asset.fileName || undefined,
        mediaType: isVideo ? 'video' : 'image',
      });
    }
  };

  // ── Quick Pay (awaiting_payment state) ───────────────────────────────────────
  // Opens the Flutterwave checkout URL the AI just sent in the chat. We
  // do NOT remove the link from the chat bubble — this button is a
  // shortcut, the original message stays intact for the buyer to copy
  // or revisit.
  const handleQuickPay = async () => {
    const url = chat?.pendingPayment?.authorizationUrl;
    if (!url) {
      await confirm({
        title: 'Payment link unavailable',
        message: 'The store hasn\u2019t sent a payment link yet. Please wait a moment and try again.',
        confirmText: 'OK',
        cancelText: null,
        kind: 'warning',
      });
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      await confirm({
        title: 'Could not open link',
        message: 'We couldn\u2019t open the payment page. Please tap the link in the chat instead.',
        confirmText: 'OK',
        cancelText: null,
        kind: 'warning',
      });
    }
  };

  // ── Re-hold (hold_expired state) ─────────────────────────────────────────────
  // Buyer's 5-minute reservation expired before they completed payment.
  // Tapping "Re-hold for 5 minutes" calls the backend to put the same
  // cart back on hold (subject to current stock) and resumes the
  // payment flow.
  const [reholding, setReholding] = useState(false);
  const handleRehold = async () => {
    if (!chatSessionId || reholding) return;
    setReholding(true);
    try {
      const { data } = await reholdCart(storeToken, chatSessionId);
      dispatch(
        setStatus({
          storeToken,
          status: data.status,
          holdsExpiresAt: data.holdsExpiresAt,
          pendingPayment: data.pendingPayment ?? null,
        }),
      );
      // Re-sync the thread so the fresh pay-link bubble (or the completed
      // order, if the prior payment had actually settled) shows up.
      await loadHistory();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        'Could not re-hold your items — they may no longer be available.';
      await confirm({
        title: 'Re-hold failed',
        message: msg,
        confirmText: 'OK',
        icon: 'alert-circle-outline',
      });
    } finally {
      setReholding(false);
    }
  };

  const messages = chat?.messages ?? [];
  const conversationOrders = chat?.orders ?? [];
  const unviewedOrders = conversationOrders.filter((o) => !o.buyerViewedAt);
  const unviewedOrderCount = unviewedOrders.length;
  const showRefundCard = chat?.status === 'refund_requested';
  const showQuickPay =
    chat?.status === 'awaiting_payment' || !!chat?.pendingPayment?.authorizationUrl;

  const handleHeaderOrdersPress = useCallback(() => {
    // Mark every unviewed order as viewed so the badge clears, then
    // navigate to the orders list. Failures are silent — we already
    // optimistically clear the badge locally.
    if (unviewedOrders.length && chatSessionId) {
      dispatch(markAllOrdersViewed(storeToken));
      unviewedOrders.forEach((o) => {
        const id = o.orderId;
        if (id) markOrderViewed(storeToken, String(id), chatSessionId).catch(() => {});
      });
    }
    router.push({
      pathname: '/(main)/orders',
      params: { storeToken, storeName: businessName || '' },
    } as any);
  }, [unviewedOrders, chatSessionId, dispatch, storeToken, businessName, router]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <TouchableOpacity style={styles.header} onPress={openStoreInfo} activeOpacity={0.8}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName} numberOfLines={1}>
            {businessName || 'Loading...'}
          </Text>
          <Text style={styles.headerSub}>
            {chatMeta && chatMeta.enabled === false
              ? 'Closed'
              : chat?.handoffMode === 'human'
              ? 'Chatting with the team'
              : 'AI-powered store chat'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleHeaderOrdersPress}
          style={styles.headerIconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="View orders from this store"
        >
          <Ionicons name="receipt-outline" size={22} color={Colors.textSecondary} />
          {unviewedOrderCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>
                {unviewedOrderCount > 9 ? '9+' : String(unviewedOrderCount)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <Ionicons name="information-circle-outline" size={22} color={Colors.textSecondary} />
      </TouchableOpacity>

      {/* Offline Banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={Colors.white} />
          <Text style={styles.offlineText}>You're offline — messages will send when reconnected</Text>
        </View>
      )}

      {/* Human-takeover banner — a real person from the store is replying */}
      {chat?.handoffMode === 'human' && (
        <View style={styles.teamBanner}>
          <Ionicons name="person-circle-outline" size={15} color={Colors.primary} />
          <Text style={styles.teamBannerText}>
            You're chatting with a team member from {businessName || 'the store'}
          </Text>
        </View>
      )}

      {/* Hold Timer */}
      {chat?.holdsExpiresAt && (
        <HoldTimer
          holdsExpiresAt={chat.holdsExpiresAt}
          onExpire={() => {
            dispatch(clearHoldTimer(storeToken));
            // Reflect the terminal state locally so the re-hold CTA
            // appears without waiting for the next backend poll.
            dispatch(setStatus({ storeToken, status: 'hold_expired', holdsExpiresAt: null }));
          }}
        />
      )}

      {/* Re-hold CTA — appears once the 5-minute reservation expired
          but the cart is still pending payment. Lets the buyer put the
          items back on hold for another 5 minutes (subject to stock). */}
      {chat?.status === 'hold_expired' && !chat?.holdsExpiresAt && (
        <TouchableOpacity
          style={styles.reholdBanner}
          onPress={handleRehold}
          disabled={reholding}
          activeOpacity={0.8}
        >
          {reholding ? (
            <ActivityIndicator color={Colors.primary} size="small" />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
          )}
          <Text style={styles.reholdText}>
            {reholding ? 'Re-holding items…' : 'Reservation expired — tap to hold for 5 more minutes'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Message List */}
      <FlatList
        ref={flatListRef}
        data={[...messages].reverse()}
        keyExtractor={(_, i) => String(i)}
        inverted
        // Perf budget: render only what's on-screen for the first paint
        // so opening the chat from the Stores list feels instant even
        // when the persisted history has dozens of bubbles. Subsequent
        // bubbles fill in as the user scrolls / as new messages arrive.
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item }) => (
          <ChatBubble
            message={item}
            agentLabel={businessName || undefined}
            aiLabel={chatMeta?.assistantName || undefined}
            onSwipeReply={handleSwipeReply}
            onJumpToOriginal={handleJumpToOriginal}
            onAskAboutProduct={(card) => {
              const preset = `Tell me more about ${card.name}.`;
              setInputText(preset);
              if (card.productId || card.groupId) {
                setPendingProductContext({
                  type: card.groupId && !card.productId ? 'group' : 'product',
                  productId: card.productId || null,
                  groupId: card.groupId || null,
                  name: card.name,
                  price: card.price,
                  variantKey: null,
                  variantLabel: null,
                  values: null,
                });
              }
            }}
          />
        )}
        contentContainerStyle={styles.msgList}
        ListHeaderComponent={
          <>
            {chat?.isLoading && <TypingIndicator />}
          </>
        }
        ListFooterComponent={
          showRefundCard ? (
            <View style={styles.refundCard}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.warning} />
              <Text style={styles.refundText}>
                A refund request is being reviewed by the store. If approved, the amount will be credited to your Chatalog Wallet.
              </Text>
            </View>
          ) : null
        }
      />

      {/* Quick Pay shortcut */}
      {showQuickPay && (
        <TouchableOpacity style={styles.quickPayBar} onPress={handleQuickPay} activeOpacity={0.8}>
          <Ionicons name="card-outline" size={16} color={Colors.white} />
          <Text style={styles.quickPayText}>
            {chat?.pendingPayment?.authorizationUrl
              ? 'Pay securely with Flutterwave'
              : 'Waiting for payment link…'}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.white} />
        </TouchableOpacity>
      )}

      {/* Order Confirm Card removed — buyers now see the unviewed-orders
          badge on the receipt icon in the header instead of a fixed
          card pinned above the input. */}

      {/* Store Info Sheet (simple inline — no bottom sheet library needed) */}
      {showStoreInfo && chatMeta && (
        <TouchableOpacity
          style={styles.infoOverlay}
          onPress={() => setShowStoreInfo(false)}
          activeOpacity={1}
        >
          <TouchableOpacity
            style={styles.infoSheet}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation?.()}
          >
            <View style={styles.sheetHandle} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.infoSheetContent}
            >
              <View style={styles.infoHeaderRow}>
                {businessLogo ? (
                  <SmartImage uri={businessLogo} style={styles.infoLogo} variant="thumb" />
                ) : (
                  <View style={[styles.infoLogo, styles.infoLogoPlaceholder]}>
                    <Text style={styles.infoLogoInitial}>
                      {(chatMeta.businessName || 'S').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoName}>{chatMeta.businessName}</Text>
                  <Text style={styles.infoSubtle}>Tap a product to ask about it</Text>
                </View>
              </View>

              {chatMeta.businessHours && (
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.infoValue}>{chatMeta.businessHours}</Text>
                </View>
              )}
              {chatMeta.pickupAddress && (
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.infoValue}>{chatMeta.pickupAddress}</Text>
                </View>
              )}
              {chatMeta.deliveryAreas && (
                <View style={styles.infoRow}>
                  <Ionicons name="bicycle-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.infoValue}>Delivers to: {chatMeta.deliveryAreas}</Text>
                </View>
              )}
              {chatMeta.deliveryFee && (
                <View style={styles.infoRow}>
                  <Ionicons name="cash-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.infoValue}>Delivery fee: {chatMeta.deliveryFee}</Text>
                </View>
              )}

              {/* Products section */}
              <View style={styles.productsHeaderRow}>
                <Text style={styles.productsHeader}>Products</Text>
                {storeProducts.length > 0 && (
                  <Text style={styles.productsCount}>{storeProducts.length}</Text>
                )}
              </View>

              {productsLoading ? (
                <View style={styles.productsLoading}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : storeProducts.length === 0 ? (
                <View style={styles.productsEmpty}>
                  <Ionicons name="cube-outline" size={28} color={Colors.textMuted} />
                  <Text style={styles.productsEmptyText}>
                    This store hasn't listed any products yet.
                  </Text>
                </View>
              ) : (
                <View style={styles.productsGrid}>
                  {storeProducts.map((p) => {
                    const imgUri = resolveMediaUrl(p.media.primary);
                    const isGroup = p.type === 'group';
                    const soldOut = isGroup ? !p.stock.anyInStock : !p.stock.inStock;
                    const variantCount = isGroup && p.variants ? p.variants.combinations.length : 0;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.productCard}
                        activeOpacity={0.85}
                        onPress={() => askAboutProduct(p)}
                      >
                        <View style={styles.productImageWrap}>
                          {imgUri ? (
                            <SmartImage uri={imgUri} style={styles.productImage} variant="card" />
                          ) : (
                            <View style={[styles.productImage, styles.productImagePlaceholder]}>
                              <Ionicons name="image-outline" size={28} color={Colors.textMuted} />
                            </View>
                          )}
                          {soldOut && (
                            <View style={styles.productBadgeSoldOut}>
                              <Text style={styles.productBadgeText}>Sold out</Text>
                            </View>
                          )}
                          {!soldOut && p.stock.lowStock && (
                            <View style={styles.productBadgeLow}>
                              <Text style={styles.productBadgeText}>
                                {isGroup
                                  ? `${p.stock.inStockCount} of ${p.stock.totalCount} left`
                                  : `Only ${p.stock.quantity} left`}
                              </Text>
                            </View>
                          )}
                          {isGroup && variantCount > 0 && (
                            <View style={styles.productVariantsPill}>
                              <Ionicons name="layers-outline" size={10} color="#fff" />
                              <Text style={styles.productVariantsPillText}>
                                {variantCount}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.productName} numberOfLines={2}>
                          {p.name}
                        </Text>
                        <Text style={styles.productPrice}>{formatPriceLabel(p)}</Text>
                        <View style={styles.productCta}>
                          <Ionicons
                            name={isGroup ? 'options-outline' : 'chatbubble-ellipses'}
                            size={12}
                            color={Colors.primary}
                          />
                          <Text style={styles.productCtaText}>
                            {isGroup ? 'Pick variant' : 'Ask about this'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Input Bar */}
      {chatMeta && chatMeta.enabled === false ? (
        <View style={styles.closedBanner}>
          <Ionicons name="lock-closed-outline" size={16} color={Colors.white} />
          <Text style={styles.closedBannerText}>
            {businessName || 'This store'} has temporarily closed chat. You can still
            see past messages — please check back soon.
          </Text>
        </View>
      ) : (
      <View style={styles.inputBar}>
        {/* Quoted message the buyer is replying to (set via swipe). */}
        {replyTo && (
          <View style={styles.replyPreviewRow}>
            <View style={styles.replyPreviewBar} />
            <View style={styles.replyPreviewInfo}>
              <Text style={styles.replyPreviewLabel} numberOfLines={1}>
                Replying to {replyTo.label}
              </Text>
              <Text style={styles.replyPreviewSnippet} numberOfLines={1}>
                {replyTo.snippet}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setReplyTo(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        {/* Pending order context — shown when the buyer arrived from the
            order detail screen. The next message they send will reference
            this order. */}
        {pendingOrderContext && (
          <View style={styles.orderContextRow}>
            <View style={styles.orderContextIcon}>
              <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
            </View>
            <View style={styles.orderContextInfo}>
              <Text style={styles.orderContextLabel} numberOfLines={1}>
                Re: Order {pendingOrderContext.orderNumber}
              </Text>
              <Text style={styles.orderContextSub} numberOfLines={1}>
                {pendingOrderContext.lines && pendingOrderContext.lines.length > 0
                  ? pendingOrderContext.lines
                      .map((l) => `${l.name} ×${l.qty}`)
                      .join(', ')
                  : pendingOrderContext.status.replace(/_/g, ' ')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPendingOrderContext(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        {/* Pending image preview */}
        {pendingImage && (
          <View style={styles.pendingImageRow}>
            {pendingImage.mediaType === 'video' ? (
              <View style={[styles.pendingThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }]}>
                <Ionicons name="videocam" size={20} color="#fff" />
              </View>
            ) : (
              <SmartImage uri={pendingImage.uri} style={styles.pendingThumb} variant="thumb" />
            )}
            <View style={styles.pendingImageInfo}>
              <Text style={styles.pendingImageLabel}>
                {pendingImage.mediaType === 'video'
                  ? '🎬 Video attached'
                  : chat?.status === 'awaiting_payment'
                  ? '🧾 Payment receipt'
                  : '🖼️ Image attached'}
              </Text>
              <Text style={styles.pendingImageSub}>Add a message or tap send</Text>
            </View>
            <TouchableOpacity onPress={() => setPendingImage(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        {/* Input row */}
        <View style={styles.inputRow}>
          <TouchableOpacity
            onPress={handleAttach}
            style={[styles.attachBtn, chat?.status === 'awaiting_payment' && !pendingImage && styles.attachBtnReceipt]}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons
                name={chat?.status === 'awaiting_payment' && !pendingImage ? 'receipt-outline' : 'attach'}
                size={22}
                color={chat?.status === 'awaiting_payment' && !pendingImage ? Colors.primary : Colors.textSecondary}
              />
            )}
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={pendingImage ? 'Add a caption…' : 'Type a message…'}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={2000}
            editable={isOnline}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              ((!inputText.trim() && !pendingImage) || chat?.isLoading || !isOnline) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={(!inputText.trim() && !pendingImage) || chat?.isLoading || !isOnline}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={18} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
      )}

      {/* Variant picker for group products tapped from the store info panel.
          Lazy-mounted so the entire VariantSheet subtree (image carousel,
          option pickers, sticky footer) doesn't pay any render / measure
          cost on the very first paint of the chat screen. */}
      {variantSheetPost && (
        <VariantSheet
          post={variantSheetPost}
          visible={!!variantSheetPost}
          onClose={() => setVariantSheetPost(null)}
          onAsk={handleVariantAsk}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
  },
  backBtn: { padding: 2 },
  headerCenter: { flex: 1 },
  headerIconBtn: { padding: 4, position: 'relative' },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.primary,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: C.white,
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
    lineHeight: 12,
  },
  headerName: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: C.text },
  headerSub: { fontSize: 11, fontFamily: 'Manrope_400Regular', color: C.textSecondary, marginTop: 1 },

  // Offline
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.textMuted,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineText: { fontSize: 12, fontFamily: 'Manrope_500Medium', color: C.white, flex: 1 },

  teamBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  teamBannerText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', color: C.primary, flex: 1 },

  // Buyer-tappable banner shown after the 5-minute reservation expired
  // while the cart is still pending payment. Tapping calls the rehold
  // endpoint to put the items back on hold for another 5 minutes.
  reholdBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.primary + '14',
    borderBottomWidth: 1,
    borderColor: C.primary,
  },
  reholdText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: C.primary, flex: 1 },

  // Shown in place of the input bar when the merchant has turned the AI
  // assistant off. The chat thread above stays readable so the buyer can
  // catch up on history; only new outbound messages are blocked.
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: C.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 24,
  },
  closedBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    color: C.white,
    lineHeight: 18,
  },

  // Messages
  msgList: { paddingVertical: 10 },

  // Refund card
  refundCard: {
    flexDirection: 'row',
    gap: 8,
    margin: 14,
    padding: 12,
    backgroundColor: C.warningLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.warning + '40',
    alignItems: 'flex-start',
  },
  refundText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    color: C.text,
    lineHeight: 18,
  },

  // Quick Pay
  quickPayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickPayText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: C.white,
  },

  // Input bar
  inputBar: {
    flexDirection: 'column',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pendingImageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 6,
  },
  orderContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: C.successLight,
    borderRadius: 10,
    marginBottom: 8,
  },
  // "Replying to ..." preview shown above the input bar after a swipe
  // gesture on a chat bubble. The colored bar on the left mirrors the
  // accent in the merchant inbox so it reads as a quote rather than a
  // generic context chip.
  replyPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
  },
  replyPreviewBar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: C.primary,
    borderRadius: 2,
  },
  replyPreviewInfo: { flex: 1 },
  replyPreviewLabel: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    color: C.primary,
  },
  replyPreviewSnippet: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
    marginTop: 2,
  },
  orderContextIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderContextInfo: { flex: 1 },
  orderContextLabel: {
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
    color: C.text,
  },
  orderContextSub: {
    fontSize: 11,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
    marginTop: 2,
  },
  pendingThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: C.border,
  },
  pendingImageInfo: { flex: 1 },
  pendingImageLabel: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: C.text,
  },
  pendingImageSub: {
    fontSize: 11,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
    marginTop: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  attachBtn: { padding: 6 },
  attachBtnReceipt: {
    backgroundColor: C.successLight,
    borderRadius: 20,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Manrope_400Regular',
    color: C.text,
    backgroundColor: C.background,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: C.border },

  // Store info overlay
  infoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.overlay,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  infoSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  infoSheetContent: {
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  infoLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.background,
  },
  infoLogoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
  },
  infoLogoInitial: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
    color: '#fff',
  },
  infoName: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    color: C.text,
  },
  infoSubtle: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: C.textMuted,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: C.textSecondary,
    lineHeight: 20,
  },
  productsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  productsHeader: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
    color: C.text,
  },
  productsCount: {
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    color: C.textMuted,
  },
  productsLoading: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  productsEmpty: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  productsEmptyText: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    color: C.textMuted,
    textAlign: 'center',
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  productCard: {
    width: '47.5%',
    backgroundColor: C.background,
    borderRadius: 12,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  productImageWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productImagePlaceholder: {
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productBadgeSoldOut: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  productBadgeLow: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(220,140,0,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  productBadgeText: {
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
    color: '#fff',
  },
  productVariantsPill: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  productVariantsPillText: {
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
    color: '#fff',
  },
  productName: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: C.text,
    marginBottom: 4,
    minHeight: 34,
  },
  productPrice: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    color: C.primary,
    marginBottom: 6,
  },
  productCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  productCtaText: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    color: C.primary,
  },
});
