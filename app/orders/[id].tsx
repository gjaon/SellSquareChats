import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/services/api';
import Badge from '../../src/components/ui/Badge';
import { Colors } from '../../src/constants/colors';
import { useThemedStyles } from '../../src/theme/useThemedStyles';
import { useConfirm } from '../../src/components/ui/ConfirmDialog';

interface OrderLine {
  product?: string | null;
  productGroup?: string | null;
  name: string;
  requestedQty: number;
  unitPrice?: number;
  lineTotal?: number;
  variantLabel?: string;
}

interface OrderReview {
  _id: string;
  product?: string | null;
  productGroup?: string | null;
  productName?: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

interface OrderDetail {
  _id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  deliveryFee?: number;
  total?: number;
  createdAt: string;
  updatedAt?: string;
  business?: { businessName?: string; businessLogo?: string };
  storeToken?: string;
  lines?: OrderLine[];
  shippingAddress?: { street?: string; city?: string; state?: string };
  paymentMethod?: string;
  notes?: string;
  reviews?: OrderReview[];
  payment?: {
    refund?: {
      status?: 'none' | 'requested' | 'credited_to_wallet';
      amount?: number;
      reason?: string;
    };
  };
}

const STATUS_VARIANT: Record<string, any> = {
  placed: 'info',
  payment_confirmed: 'success',
  accepted: 'success',
  rejected: 'error',
  processing: 'warning',
  shipped: 'info',
  delivered: 'success',
  received: 'success',
  completed: 'success',
};

// Once an order reaches one of these statuses the buyer can no longer
// add more items to it — they should place a new order instead.
const CLOSED_STATUSES = new Set(['delivered', 'received', 'completed', 'rejected']);
// Statuses where the order has already left the merchant's hands (or is on
// its way out). Adding more items at that point isn't meaningful — the
// merchant would have to start a separate fulfilment. Buyer should place a
// new order instead.
const NO_MORE_ITEMS_STATUSES = new Set([
  'shipped',
  'delivered',
  'received',
  'completed',
  'rejected',
]);

// Statuses where the order is finished and the buyer can leave a review.
const REVIEWABLE_STATUSES = new Set(['delivered', 'received', 'completed']);

// Statuses where the buyer has paid (or the order is in fulfilment) but the
// order has NOT yet been delivered, so a refund request is still meaningful.
// An un-accepted "placed" order or a rejected/cancelled one can't be refunded,
// and once the order is delivered/received/completed the refund window closes.
const REFUNDABLE_STATUSES = new Set([
  'payment_confirmed',
  'accepted',
  'processing',
  'shipped',
]);

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNaira(n?: number) {
  if (typeof n !== 'number') return '—';
  return `₦${n.toLocaleString()}`;
}

export default function OrderDetailScreen() {
  const { id, order: orderParam } = useLocalSearchParams<{ id: string; order?: string }>();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const confirm = useConfirm();

  // If the Orders list passes the row in via `?order=<json>`, use it as
  // the seed so the screen renders instantly. Otherwise fetch by id.
  const seed = useMemo<OrderDetail | null>(() => {
    if (!orderParam) return null;
    try {
      return JSON.parse(orderParam);
    } catch {
      return null;
    }
  }, [orderParam]);

  const [order, setOrder] = useState<OrderDetail | null>(seed);
  const [loading, setLoading] = useState(!seed);
  const [marking, setMarking] = useState(false);
  const [requestingRefund, setRequestingRefund] = useState(false);

  useEffect(() => {
    // If we already have a seed (e.g. dev mock or list-provided payload),
    // skip the network round-trip entirely. Real implementations can drop
    // this guard once a buyer-side detail endpoint exists.
    if (seed) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/api/buyer/marketplace/orders/${id}`);
        if (!cancelled) setOrder(data);
      } catch {
        // Detail endpoint may not exist for mocks / older orders — leave
        // empty state visible.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, seed]);

  // Reviews aren't returned by either the orders list or the order-detail
  // endpoint, so fetch them separately and hydrate `order.reviews`. This
  // is what gates the "Leave a review" button + renders the "Your review"
  // card. Without it, the button stays visible after a submission and
  // tapping it lands on a read-only screen showing "Review submitted".
  useEffect(() => {
    if (!order?._id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(
          `/api/buyer/reviews?orderId=${order._id}`,
        );
        const reviews: OrderReview[] = data?.reviews || [];
        if (cancelled) return;
        setOrder((prev) => (prev ? { ...prev, reviews } : prev));
      } catch {
        // Endpoint may not be reachable; leave reviews undefined so the
        // UI falls back to its pre-fetch state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order?._id]);

  const askAboutOrder = () => {
    if (!order) return;
    if (!order.storeToken) {
      confirm({
        title: 'Store unavailable',
        message: 'This order is not linked to a store chat. Please contact support.',
        confirmText: 'OK',
        cancelText: null,
        kind: 'warning',
      });
      return;
    }
    // Hand off to the chat screen with two pieces:
    //   - presetMessage: pre-fills the input so the buyer can edit/send.
    //   - orderContext: rendered as a pinned card above the input so the
    //     store knows exactly which order the question is about.
    const orderContext = {
      type: 'order',
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total ?? order.subtotal,
      lines:
        order.lines?.map((l) => ({
          name: l.name,
          qty: l.requestedQty,
          variantLabel: l.variantLabel,
        })) || [],
    };
    router.push({
      pathname: '/chat/[storeToken]',
      params: {
        storeToken: order.storeToken,
        presetMessage: `Hi! I have a question about my order ${order.orderNumber}.`,
        orderContext: JSON.stringify(orderContext),
      },
    } as any);
  };

  const addItemsToOrder = () => {
    if (!order?.storeToken) return;
    const orderContext = {
      type: 'order',
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total ?? order.subtotal,
      lines:
        order.lines?.map((l) => ({
          name: l.name,
          qty: l.requestedQty,
          variantLabel: l.variantLabel,
        })) || [],
    };
    router.push({
      pathname: '/chat/[storeToken]',
      params: {
        storeToken: order.storeToken,
        presetMessage: `I'd like to add more items to order ${order.orderNumber}.`,
        orderContext: JSON.stringify(orderContext),
      },
    } as any);
  };

  // Buyer-side acknowledgement that the goods physically arrived. The
  // backend may not have a dedicated endpoint yet, so we optimistically
  // flip the local state to `completed` and best-effort PATCH the server;
  // if the request 404s the local state still reflects the buyer's
  // confirmation.
  const markAsReceived = async () => {
    if (!order) return;
    const ok = await confirm({
      title: 'Mark as received?',
      message: `This confirms you received order ${order.orderNumber}. The store will be notified.`,
      confirmText: 'Mark received',
      kind: 'success',
      icon: 'checkmark-done-outline',
    });
    if (!ok) return;
    setMarking(true);
    try {
      const { data } = await api.patch(
        `/api/buyer/marketplace/orders/${order._id}/receive`,
      );
      setOrder((prev) =>
        prev ? { ...prev, status: data?.status || 'received' } : prev,
      );
    } catch (e: any) {
      await confirm({
        title: 'Could not mark as received',
        message:
          e?.response?.data?.message ||
          'Please check your connection and try again.',
        confirmText: 'OK',
        cancelText: null,
        kind: 'warning',
      });
    } finally {
      setMarking(false);
    }
  };

  // Ask the store for a refund. This doesn't move money — it flags the order
  // so the merchant can review and credit the buyer's Chatalog Wallet. The
  // merchant's "Initiate Refund" control only appears once this request lands.
  const requestRefund = async () => {
    if (!order) return;
    const ok = await confirm({
      title: 'Request a refund?',
      message: `Ask ${order.business?.businessName || 'the store'} to refund order ${order.orderNumber}. They'll review your request and credit your Chatalog Wallet if approved.`,
      confirmText: 'Request refund',
      kind: 'warning',
      icon: 'cash-outline',
    });
    if (!ok) return;
    setRequestingRefund(true);
    try {
      const { data } = await api.post(
        `/api/buyer/marketplace/orders/${order._id}/request-refund`,
      );
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              payment: {
                ...(prev.payment || {}),
                refund: data?.refund || { status: 'requested' },
              },
            }
          : prev,
      );
      await confirm({
        title: 'Refund requested',
        message:
          "The store has been notified. If they approve it, the amount will be credited to your Chatalog Wallet.",
        confirmText: 'OK',
        cancelText: null,
        kind: 'success',
      });
    } catch (e: any) {
      await confirm({
        title: 'Could not request refund',
        message:
          e?.response?.data?.message ||
          'Please check your connection and try again.',
        confirmText: 'OK',
        cancelText: null,
        kind: 'warning',
      });
    } finally {
      setRequestingRefund(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={36} color={Colors.textMuted} />
        <Text style={styles.errorText}>Order not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const total = order.total ?? order.subtotal;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {order.orderNumber}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status + store summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <Badge
              label={order.status.replace(/_/g, ' ')}
              variant={STATUS_VARIANT[order.status] ?? 'muted'}
            />
            <Text style={styles.placedAt}>{formatDate(order.createdAt)}</Text>
          </View>
          {order.business?.businessName && (
            <View style={styles.storeRow}>
              <Ionicons name="storefront-outline" size={16} color={Colors.primary} />
              <Text style={styles.storeName}>{order.business.businessName}</Text>
            </View>
          )}
        </View>

        {/* Items */}
        <Text style={styles.sectionHeader}>Items</Text>
        <View style={styles.card}>
          {(order.lines || []).map((line, i) => (
            <View
              key={`${line.name}-${i}`}
              style={[styles.lineRow, i > 0 && styles.lineDivider]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName} numberOfLines={2}>
                  {line.name}
                </Text>
                {line.variantLabel && (
                  <Text style={styles.lineVariant}>{line.variantLabel}</Text>
                )}
                <Text style={styles.lineQty}>Qty: {line.requestedQty}</Text>
              </View>
              {typeof line.lineTotal === 'number' && (
                <Text style={styles.linePrice}>{formatNaira(line.lineTotal)}</Text>
              )}
            </View>
          ))}
          {(!order.lines || order.lines.length === 0) && (
            <Text style={styles.emptyLines}>No item details available.</Text>
          )}
        </View>

        {/* Totals */}
        <Text style={styles.sectionHeader}>Summary</Text>
        <View style={styles.card}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatNaira(order.subtotal)}</Text>
          </View>
          {typeof order.deliveryFee === 'number' && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Delivery</Text>
              <Text style={styles.totalValue}>{formatNaira(order.deliveryFee)}</Text>
            </View>
          )}
          <View style={[styles.totalRow, styles.totalRowGrand]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{formatNaira(total)}</Text>
          </View>
        </View>

        {/* Shipping */}
        {order.shippingAddress &&
          (order.shippingAddress.street ||
            order.shippingAddress.city ||
            order.shippingAddress.state) && (
            <>
              <Text style={styles.sectionHeader}>Delivery</Text>
              <View style={styles.card}>
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.metaText}>
                    {[
                      order.shippingAddress.street,
                      order.shippingAddress.city,
                      order.shippingAddress.state,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                </View>
              </View>
            </>
          )}

        {order.notes && (
          <>
            <Text style={styles.sectionHeader}>Notes</Text>
            <View style={styles.card}>
              <Text style={styles.metaText}>{order.notes}</Text>
            </View>
          </>
        )}

        {order.reviews && order.reviews.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Your review</Text>
            <View style={styles.card}>
              {order.reviews.map((r, i) => (
                <View
                  key={r._id}
                  style={[styles.reviewRow, i > 0 && styles.lineDivider]}
                >
                  {r.productName ? (
                    <Text style={styles.reviewProduct} numberOfLines={2}>
                      {r.productName}
                    </Text>
                  ) : null}
                  <View style={styles.reviewStars}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons
                        key={n}
                        name={n <= r.rating ? 'star' : 'star-outline'}
                        size={16}
                        color="#F5A623"
                      />
                    ))}
                    <Text style={styles.reviewRatingText}>
                      {r.rating.toFixed(1)}
                    </Text>
                  </View>
                  {r.comment ? (
                    <Text style={styles.reviewComment}>{r.comment}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Action bar pinned to the bottom */}
      <View style={styles.actionBar}>
        {order.status === 'delivered' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={markAsReceived}
            activeOpacity={0.85}
            disabled={marking}
          >
            {marking ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={18} color={Colors.white} />
                <Text style={styles.actionTextPrimary}>Mark as received</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {REVIEWABLE_STATUSES.has(order.status) &&
          order.status !== 'delivered' &&
          !(order.reviews && order.reviews.length > 0) && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={() =>
                router.push({
                  pathname: '/orders/review/[id]',
                  params: { id: order._id, order: JSON.stringify(order) },
                } as any)
              }
              activeOpacity={0.85}
            >
              <Ionicons name="star" size={18} color={Colors.white} />
              <Text style={styles.actionTextPrimary}>Leave a review</Text>
            </TouchableOpacity>
          )}
        {!NO_MORE_ITEMS_STATUSES.has(order.status) && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={addItemsToOrder}
            activeOpacity={0.85}
            disabled={!order.storeToken}
          >
            <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.actionTextSecondary}>Add items</Text>
          </TouchableOpacity>
        )}
        {order.status !== 'delivered' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={askAboutOrder}
            activeOpacity={0.85}
            disabled={!order.storeToken}
          >
            <Ionicons name="chatbubble-ellipses" size={18} color={Colors.white} />
            <Text style={styles.actionTextPrimary}>Message store</Text>
          </TouchableOpacity>
        )}
        {/* Refund: request when eligible, otherwise reflect the current state. */}
        {order.payment?.refund?.status === 'requested' ? (
          <View style={[styles.actionBtn, styles.actionBtnMuted]}>
            <Ionicons name="time-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.actionTextMuted}>Refund requested</Text>
          </View>
        ) : order.payment?.refund?.status === 'credited_to_wallet' ? (
          <View style={[styles.actionBtn, styles.actionBtnMuted]}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.actionTextMuted}>Refunded to wallet</Text>
          </View>
        ) : REFUNDABLE_STATUSES.has(order.status) ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={requestRefund}
            activeOpacity={0.85}
            disabled={requestingRefund}
          >
            {requestingRefund ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <>
                <Ionicons name="cash-outline" size={18} color={Colors.primary} />
                <Text style={styles.actionTextSecondary}>Request a refund</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    errorText: {
      fontSize: 15,
      fontFamily: 'Manrope_500Medium',
      color: C.textSecondary,
    },
    backLink: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: C.primary,
      marginTop: 4,
    },
    header: {
      paddingTop: 56,
      paddingBottom: 12,
      paddingHorizontal: 14,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backBtn: { padding: 2 },
    title: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: C.text, flex: 1, textAlign: 'center' },
    content: { padding: 16, paddingBottom: 120 },
    summaryCard: {
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      shadowColor: C.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    summaryTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    placedAt: { fontSize: 12, fontFamily: 'Manrope_400Regular', color: C.textMuted },
    storeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    storeName: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: C.text },
    sectionHeader: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 16,
      marginBottom: 6,
    },
    card: {
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 14,
      shadowColor: C.cardShadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 3,
      elevation: 1,
    },
    lineRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      gap: 10,
      alignItems: 'flex-start',
    },
    lineDivider: { borderTopWidth: 1, borderTopColor: C.border },
    lineName: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: C.text },
    lineVariant: {
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
      marginTop: 2,
    },
    lineQty: {
      fontSize: 12,
      fontFamily: 'Manrope_500Medium',
      color: C.textSecondary,
      marginTop: 4,
    },
    linePrice: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: C.text },
    emptyLines: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: C.textMuted,
      textAlign: 'center',
      paddingVertical: 8,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    totalRowGrand: {
      borderTopWidth: 1,
      borderTopColor: C.border,
      marginTop: 4,
      paddingTop: 10,
    },
    totalLabel: { fontSize: 13, fontFamily: 'Manrope_500Medium', color: C.textSecondary },
    totalValue: { fontSize: 13, fontFamily: 'Manrope_500Medium', color: C.text },
    grandLabel: { fontSize: 15, fontFamily: 'Manrope_700Bold', color: C.text },
    grandValue: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: C.text },
    metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    metaText: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: C.text,
      flex: 1,
      lineHeight: 18,
    },
    reviewRow: { paddingVertical: 10 },
    reviewProduct: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
      color: C.text,
      marginBottom: 4,
    },
    reviewStars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    reviewRatingText: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: C.textSecondary,
      marginLeft: 6,
    },
    reviewComment: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: C.text,
      marginTop: 6,
      lineHeight: 18,
    },
    actionBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 28,
      backgroundColor: C.surface,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 12,
    },
    actionBtnPrimary: { backgroundColor: C.primary },
    actionBtnSecondary: {
      backgroundColor: C.background,
      borderWidth: 1.5,
      borderColor: C.primary,
    },
    actionBtnMuted: {
      backgroundColor: C.background,
      borderWidth: 1.5,
      borderColor: C.border,
    },
    actionTextPrimary: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: C.white,
    },
    actionTextSecondary: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: C.primary,
    },
    actionTextMuted: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: C.textSecondary,
    },
  });
