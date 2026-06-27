import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SmartImage from './SmartImage';
import { useSelector } from 'react-redux';

import { Colors } from '../constants/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import {
  ProductReview,
  ProductReviewEligibility,
  getProductReviews,
  getProductReviewEligibility,
  submitProductReview,
} from '../services/feedService';
import { RootState } from '../store';

interface ReviewsSheetProps {
  visible: boolean;
  onClose: () => void;
  productId: string | null;
  groupId: string | null;
  productName: string;
  onCountChange?: (count: number) => void;
}

// Bottom-sheet listing reviews for a Discover product. When the buyer has
// a delivered order containing this product (and hasn't already reviewed
// it) we surface a star-rating + comment form so they can submit a new
// review without leaving Discover.
const ReviewsSheet: React.FC<ReviewsSheetProps> = ({
  visible,
  onClose,
  productId,
  groupId,
  productName,
  onCountChange,
}) => {
  const styles = useThemedStyles(makeStyles);
  const isAuthed = useSelector((s: RootState) => !!s.auth?.isAuthenticated);

  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [eligibility, setEligibility] = useState<ProductReviewEligibility | null>(
    null,
  );

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !productId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const reqs: Promise<any>[] = [getProductReviews(productId, groupId)];
        if (isAuthed) {
          reqs.push(
            getProductReviewEligibility(productId, groupId).catch(() => null),
          );
        }
        const [reviewsRes, eligRes] = await Promise.all(reqs);
        if (cancelled) return;
        setReviews(reviewsRes.data.reviews || []);
        setAverageRating(reviewsRes.data.averageRating || 0);
        setTotalCount(reviewsRes.data.totalCount || 0);
        onCountChange?.(reviewsRes.data.totalCount || 0);
        setEligibility(eligRes?.data || null);
        setRating(0);
        setComment('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, productId, groupId, isAuthed]);

  const submit = async () => {
    if (!eligibility?.eligibleOrderId || rating < 1) return;
    setSubmitting(true);
    try {
      await submitProductReview({
        orderId: eligibility.eligibleOrderId,
        productId: eligibility.targetProductId || productId,
        rating,
        comment: comment.trim(),
      });
      // Refetch to show the new review at the top.
      if (productId) {
        const { data } = await getProductReviews(productId, groupId);
        setReviews(data.reviews || []);
        setAverageRating(data.averageRating || 0);
        setTotalCount(data.totalCount || 0);
        onCountChange?.(data.totalCount || 0);
      }
      setEligibility((e) =>
        e ? { ...e, canReview: false, alreadyReviewed: true } : e,
      );
      setRating(0);
      setComment('');
    } finally {
      setSubmitting(false);
    }
  };

  const avgLabel = useMemo(
    () => (totalCount > 0 ? averageRating.toFixed(1) : '—'),
    [averageRating, totalCount],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                Reviews
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {productName}
              </Text>
            </View>
            <View style={styles.avgPill}>
              <Ionicons name="star" size={14} color={Colors.warning} />
              <Text style={styles.avgText}>{avgLabel}</Text>
              <Text style={styles.avgCount}>({totalCount})</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
            ) : reviews.length === 0 ? (
              <Text style={styles.emptyText}>
                No reviews yet. Be the first to share your experience!
              </Text>
            ) : (
              reviews.map((r) => (
                <View key={r._id} style={styles.reviewRow}>
                  <View style={styles.reviewerRow}>
                    {r.buyer.profilePicture ? (
                      <SmartImage
                        uri={r.buyer.profilePicture}
                        style={styles.avatar}
                        variant="thumb"
                      />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Ionicons name="person" size={14} color={Colors.white} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewerName} numberOfLines={1}>
                        {r.buyer.name}
                      </Text>
                      <View style={styles.starsRow}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Ionicons
                            key={n}
                            name={n <= r.rating ? 'star' : 'star-outline'}
                            size={12}
                            color={Colors.warning}
                          />
                        ))}
                      </View>
                    </View>
                  </View>
                  {!!r.comment && <Text style={styles.comment}>{r.comment}</Text>}
                </View>
              ))
            )}
          </ScrollView>

          {/* Submit form: only when buyer has bought the product and has
              not already reviewed it. */}
          {eligibility?.canReview && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Write a review</Text>
              <View style={styles.formStars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setRating(n)}
                    hitSlop={6}
                  >
                    <Ionicons
                      name={n <= rating ? 'star' : 'star-outline'}
                      size={26}
                      color={Colors.warning}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Share what you liked (optional)"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={submit}
                disabled={rating < 1 || submitting}
                style={[
                  styles.submitBtn,
                  (rating < 1 || submitting) && styles.submitBtnDisabled,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit review</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
          {eligibility?.alreadyReviewed && (
            <View style={styles.infoBar}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.infoText}>You've already reviewed this product.</Text>
            </View>
          )}
          {!isAuthed && (
            <View style={styles.infoBar}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={Colors.textSecondary}
              />
              <Text style={styles.infoText}>
                Sign in and complete an order to leave a review.
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const makeStyles = (palette: typeof Colors) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: palette.overlay,
    },
    sheetWrap: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: palette.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 16,
      maxHeight: '85%',
      minHeight: '50%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.border,
      marginTop: 8,
      marginBottom: 6,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
      gap: 8,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: palette.text,
    },
    subtitle: {
      fontSize: 12,
      color: palette.textSecondary,
      marginTop: 2,
    },
    avgPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.background,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    avgText: { fontSize: 13, fontWeight: '700', color: palette.text },
    avgCount: { fontSize: 11, color: palette.textSecondary },
    closeBtn: { padding: 4 },
    body: { paddingHorizontal: 16, paddingTop: 12 },
    emptyText: {
      textAlign: 'center',
      color: palette.textSecondary,
      marginTop: 24,
      fontSize: 14,
    },
    reviewRow: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
    },
    reviewerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: palette.border,
    },
    avatarFallback: {
      backgroundColor: palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewerName: { fontSize: 13, fontWeight: '600', color: palette.text },
    starsRow: { flexDirection: 'row', gap: 1, marginTop: 2 },
    comment: {
      fontSize: 13,
      color: palette.textSecondary,
      marginTop: 6,
      marginLeft: 42,
      lineHeight: 18,
    },
    formCard: {
      marginHorizontal: 16,
      marginTop: 8,
      padding: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border,
      borderRadius: 12,
      backgroundColor: palette.background,
    },
    formTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: palette.text,
      marginBottom: 6,
    },
    formStars: { flexDirection: 'row', gap: 4, marginBottom: 8 },
    input: {
      backgroundColor: palette.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border,
      borderRadius: 8,
      padding: 10,
      minHeight: 60,
      color: palette.text,
      textAlignVertical: 'top',
      fontSize: 13,
    },
    submitBtn: {
      marginTop: 10,
      backgroundColor: palette.primary,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    infoBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginHorizontal: 16,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: palette.background,
    },
    infoText: { fontSize: 12, color: palette.textSecondary, flex: 1 },
  });

export default ReviewsSheet;
