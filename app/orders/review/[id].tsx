import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../src/services/api';
import { Colors } from '../../../src/constants/colors';
import { useThemedStyles } from '../../../src/theme/useThemedStyles';
import { useConfirm } from '../../../src/components/ui/ConfirmDialog';

interface ReviewLine {
  product?: string | null;
  productGroup?: string | null;
  name: string;
  variantLabel?: string;
}

interface OrderSeed {
  _id: string;
  orderNumber: string;
  business?: { businessName?: string };
  lines?: ReviewLine[];
}

interface ExistingReview {
  product: string | null;
  rating: number;
  comment: string;
}

// Per-line rating + shared comment. The "overall" entry (product=null) is
// always present so the buyer can leave a single rating even when the
// order has no product-linked lines (legacy/AI-bot orders).
// `submitted` flips to true when an existing review for this product is
// loaded — the row then renders read-only and is excluded from the
// submit payload, so the buyer can't double-review.
interface RatingState {
  productId: string | null;
  productName: string;
  variantLabel?: string;
  rating: number;
  submitted?: boolean;
  submittedComment?: string;
}

const STAR_COUNT = 5;

export default function OrderReviewScreen() {
  const { id, order: orderParam } = useLocalSearchParams<{ id: string; order?: string }>();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const confirm = useConfirm();

  const seed = useMemo<OrderSeed | null>(() => {
    if (!orderParam) return null;
    try {
      return JSON.parse(orderParam);
    } catch {
      return null;
    }
  }, [orderParam]);

  const [order, setOrder] = useState<OrderSeed | null>(seed);
  const [loading, setLoading] = useState(!seed);
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState('');
  const [ratings, setRatings] = useState<RatingState[]>([]);

  useEffect(() => {
    if (seed) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/api/buyer/marketplace/orders/${id}`);
        if (!cancelled) setOrder(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, seed]);

  // Build the rating slots once we know the order. Each line with a
  // `product` ObjectId becomes its own row; if no lines have a product
  // id, fall back to a single "overall" row keyed by `null`.
  useEffect(() => {
    if (!order) return;
    const productLines = (order.lines || []).filter((l) => !!l.product);
    if (productLines.length > 0) {
      setRatings(
        productLines.map((l) => ({
          productId: l.product || null,
          productName: l.name,
          variantLabel: l.variantLabel,
          rating: 0,
        })),
      );
    } else {
      setRatings([
        {
          productId: null,
          productName: order.business?.businessName
            ? `Overall (${order.business.businessName})`
            : 'Overall rating',
          rating: 0,
        },
      ]);
    }
  }, [order]);

  // Pre-fill from any existing reviews so the buyer can SEE prior input
  // (read-only). We mark those rows as `submitted` so the stars become
  // non-tappable and the row is excluded from the submit payload.
  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/api/buyer/reviews?orderId=${order._id}`);
        if (cancelled) return;
        const existing: ExistingReview[] = data?.reviews || [];
        if (!existing.length) return;
        const byProduct = new Map(existing.map((r) => [r.product || '__overall__', r]));
        setRatings((prev) =>
          prev.map((r) => {
            const match = byProduct.get(r.productId || '__overall__');
            return match
              ? {
                  ...r,
                  rating: match.rating,
                  submitted: true,
                  submittedComment: match.comment || '',
                }
              : r;
          }),
        );
        // Use the first comment we find as the shared comment field's
        // default (only relevant when at least one row is still pending).
        const firstComment = existing.find((r) => r.comment)?.comment;
        if (firstComment) setComment(firstComment);
      } catch {
        // No existing reviews — leave defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order]);

  const setRating = (productId: string | null, value: number) => {
    setRatings((prev) =>
      prev.map((r) =>
        r.productId === productId && !r.submitted
          ? { ...r, rating: value }
          : r,
      ),
    );
  };

  // Pending rows = not yet submitted AND have a star rating chosen.
  const pendingRows = ratings.filter((r) => !r.submitted && r.rating > 0);
  const allDone = ratings.length > 0 && ratings.every((r) => r.submitted);
  const canSubmit = pendingRows.length > 0 && !submitting;

  const submit = async () => {
    if (!order) return;
    // Only send pending (not-yet-submitted) rows so the backend's
    // duplicate guard never trips and the buyer doesn't accidentally
    // overwrite an earlier review.
    const payload = pendingRows.map((r) => ({
      productId: r.productId,
      rating: r.rating,
      comment: comment.trim(),
    }));
    if (payload.length === 0) return;

    setSubmitting(true);
    try {
      await api.post('/api/buyer/reviews', {
        orderId: order._id,
        reviews: payload,
      });
      await confirm({
        title: 'Thanks for your review!',
        message: order.business?.businessName
          ? `Your feedback has been shared with ${order.business.businessName}.`
          : 'Your feedback has been recorded.',
        confirmText: 'Done',
        cancelText: null,
        kind: 'success',
        icon: 'checkmark-done-circle-outline',
      });
      router.back();
    } catch (e: any) {
      await confirm({
        title: 'Could not submit review',
        message:
          e?.response?.data?.message ||
          'Please check your connection and try again.',
        confirmText: 'OK',
        cancelText: null,
        kind: 'warning',
      });
    } finally {
      setSubmitting(false);
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
          Review order
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          {order.business?.businessName
            ? `How was your experience with ${order.business.businessName}?`
            : 'How was your experience?'}
        </Text>
        <Text style={styles.subIntro}>
          Tap a star for each item to rate it. Your feedback helps other buyers.
        </Text>

        <View style={styles.cardList}>
          {ratings.map((r) => (
            <View key={r.productId ?? '__overall__'} style={styles.card}>
              <Text style={styles.itemName} numberOfLines={2}>
                {r.productName}
              </Text>
              {!!r.variantLabel && (
                <Text style={styles.itemVariant}>{r.variantLabel}</Text>
              )}
              <View style={styles.starsRow}>
                {Array.from({ length: STAR_COUNT }).map((_, i) => {
                  const value = i + 1;
                  const filled = r.rating >= value;
                  if (r.submitted) {
                    return (
                      <Ionicons
                        key={i}
                        name={filled ? 'star' : 'star-outline'}
                        size={28}
                        color={filled ? Colors.warning : Colors.textMuted}
                      />
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setRating(r.productId, value)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    >
                      <Ionicons
                        name={filled ? 'star' : 'star-outline'}
                        size={32}
                        color={filled ? Colors.warning : Colors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
              {r.submitted ? (
                <View style={styles.submittedBlock}>
                  {r.submittedComment ? (
                    <Text style={styles.submittedComment}>
                      “{r.submittedComment}”
                    </Text>
                  ) : null}
                  <View style={styles.submittedBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                    <Text style={styles.submittedBadgeText}>Review submitted</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {pendingRows.length > 0 ? (
          <>
            <Text style={styles.sectionHeader}>Comment (optional)</Text>
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder="Tell the store what you liked or how they can improve…"
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={1000}
            />
          </>
        ) : null}
      </ScrollView>

      {allDone ? null : (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="send" size={18} color={Colors.white} />
                <Text style={styles.submitText}>Submit review</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    errorText: { fontSize: 15, fontFamily: 'Manrope_500Medium', color: C.textSecondary },
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
    title: {
      fontSize: 16,
      fontFamily: 'Manrope_700Bold',
      color: C.text,
      flex: 1,
      textAlign: 'center',
    },
    content: { padding: 16, paddingBottom: 120 },
    intro: {
      fontSize: 18,
      fontFamily: 'Manrope_700Bold',
      color: C.text,
    },
    subIntro: {
      marginTop: 4,
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
    },
    cardList: { marginTop: 16, gap: 10 },
    card: {
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 14,
      shadowColor: C.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    itemName: {
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
      color: C.text,
    },
    itemVariant: {
      marginTop: 2,
      fontSize: 12,
      fontFamily: 'Manrope_400Regular',
      color: C.textSecondary,
    },
    starsRow: {
      marginTop: 10,
      flexDirection: 'row',
      gap: 6,
    },
    submittedBlock: {
      marginTop: 12,
      gap: 8,
    },
    submittedComment: {
      fontSize: 13,
      fontFamily: 'Manrope_400Regular',
      fontStyle: 'italic',
      color: C.textSecondary,
      lineHeight: 19,
    },
    submittedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
    },
    submittedBadgeText: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: C.success,
    },
    sectionHeader: {
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 22,
      marginBottom: 8,
    },
    commentInput: {
      backgroundColor: C.surface,
      borderRadius: 12,
      padding: 14,
      minHeight: 110,
      color: C.text,
      fontFamily: 'Manrope_400Regular',
      fontSize: 14,
      textAlignVertical: 'top',
      borderWidth: 1,
      borderColor: C.border,
    },
    actionBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      paddingBottom: 28,
      backgroundColor: C.surface,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    submitBtn: {
      backgroundColor: C.primary,
      borderRadius: 999,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    submitBtnDisabled: {
      opacity: 0.5,
    },
    submitText: {
      color: C.white,
      fontFamily: 'Manrope_700Bold',
      fontSize: 15,
    },
  });
