import api from './api';

export type FeedItemType = 'product' | 'group';

export interface FeedPostMedia {
  primary: string | null;
  video: string | null;
  gallery: string[];
  variantImages: Record<string, string> | null;
}

export interface FeedPostBusiness {
  id: string;
  name: string;
  logo: string | null;
  chatToken: string;
}

export interface FeedPostPrice {
  base: number;
  effective: number;
  min: number;
  max: number;
  hasRange: boolean;
}

export interface FeedPostStock {
  quantity: number;
  inStock: boolean;
  lowStock: boolean;
  anyInStock: boolean;
  totalCount: number;
  inStockCount: number;
}

export interface FeedVariantCombination {
  key: string;
  label: string;
  values: Record<string, string>;
  price: number;
  quantity: number;
  inStock: boolean;
  lowStock: boolean;
  image: string | null;
  productId: string | null;
  sku: string | null;
}

export interface FeedVariantOption {
  value: string;
  swatch: string | null;
  anyInStock: boolean;
}

export interface FeedVariants {
  attributes: string[];
  options: Record<string, string[]>;
  optionMeta: Record<string, FeedVariantOption[]>;
  combinations: FeedVariantCombination[];
  hasColorAttribute: boolean;
  primaryAttribute: string | null;
}

export interface FeedPost {
  type: FeedItemType;
  id: string;
  productId: string | null;
  groupId: string | null;
  name: string;
  description: string;
  category: string | null;
  sku: string | null;
  price: FeedPostPrice;
  media: FeedPostMedia;
  stock: FeedPostStock;
  variants: FeedVariants | null;
  business: FeedPostBusiness;
  engagement?: {
    likes: number;
    saves: number;
    shares: number;
    views: number;
    // Per-buyer state. Only populated when the request was made with the
    // buyer's auth token; otherwise undefined / false.
    isLikedByMe?: boolean;
    isSavedByMe?: boolean;
  };
  createdAt: string;
  updatedAt?: string;
  // Only present on History feed items — when the buyer last viewed this post.
  seenAt?: string;
}

export interface FeedResponse {
  items: FeedPost[];
  nextCursor: string | null;
  seed: string;
}

export const getDiscoverFeed = (params: {
  cursor?: string | null;
  seed?: string;
  limit?: number;
  search?: string;
}) =>
  api.get<FeedResponse>('/api/public/v1/marketplace/feed', {
    params: {
      cursor: params.cursor || undefined,
      seed: params.seed || undefined,
      limit: params.limit || undefined,
      search: params.search || undefined,
    },
  });

export const reportFeedPost = (payload: {
  productId?: string | null;
  groupId?: string | null;
  variantKey?: string | null;
  reason: string;
}) => api.post('/api/public/v1/marketplace/feed/report', payload);

export type FeedEngagementAction =
  | 'like'
  | 'unlike'
  | 'save'
  | 'unsave'
  | 'share'
  | 'view';

export const recordFeedEngagement = (payload: {
  productId?: string | null;
  groupId?: string | null;
  action: FeedEngagementAction;
}) =>
  api.post<{
    likes: number;
    saves: number;
    shares: number;
    views: number;
    isLikedByMe?: boolean;
    isSavedByMe?: boolean;
  }>('/api/public/v1/marketplace/feed/engagement', payload);

// Buyer's own saved-posts feed. Auth required.
export const getSavedPostsFeed = () =>
  api.get<{ items: FeedPost[] }>('/api/buyer/saved-posts');

// Buyer's Discover view history, most-recently-seen first (de-duplicated).
// Auth required.
export const getHistoryFeed = () =>
  api.get<{ items: FeedPost[] }>('/api/buyer/history');

// Discover product reviews. Read endpoint is public; eligibility check
// requires `protectBuyer` so an Authorization header must be attached
// for it to succeed.
export interface ProductReview {
  _id: string;
  rating: number;
  comment: string;
  productName: string;
  createdAt: string;
  buyer: { name: string; profilePicture: string | null };
}

export interface ProductReviewsResponse {
  reviews: ProductReview[];
  averageRating: number;
  totalCount: number;
}

export interface ProductReviewEligibility {
  canReview: boolean;
  alreadyReviewed: boolean;
  eligibleOrderId: string | null;
  targetProductId?: string;
}

export const getProductReviews = (
  productId: string,
  groupId?: string | null,
) =>
  api.get<ProductReviewsResponse>(
    `/api/buyer/marketplace/products/${productId}/reviews`,
    { params: { groupId: groupId || undefined } },
  );

export const getProductReviewEligibility = (
  productId: string,
  groupId?: string | null,
) =>
  api.get<ProductReviewEligibility>(
    `/api/buyer/marketplace/products/${productId}/review-eligibility`,
    { params: { groupId: groupId || undefined } },
  );

export const submitProductReview = (payload: {
  orderId: string;
  productId: string | null;
  rating: number;
  comment?: string;
}) =>
  api.post('/api/buyer/reviews', {
    orderId: payload.orderId,
    reviews: [
      {
        productId: payload.productId,
        rating: payload.rating,
        comment: payload.comment || '',
      },
    ],
  });
