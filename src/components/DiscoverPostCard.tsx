import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import SmartImage, { prefetchImages } from './SmartImage';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

import { AppDispatch, RootState } from '../store';
import { addSavedStore } from '../store/slices/savedStoresSlice';
import {
  FeedPost,
  reportFeedPost,
  recordFeedEngagement,
  getProductReviews,
} from '../services/feedService';
import {
  buildCarousel,
  buildChatPresetMessage,
  formatPriceLabel,
} from '../utils/variantHelpers';
import { getCurrencySymbol } from '../utils/currency';
import { Colors } from '../constants/colors';
import { API_URL } from '../constants/config';
import VideoScrubBar from './VideoScrubBar';
import ZoomablePhoto from './ZoomablePhoto';
import ReviewsSheet from './ReviewsSheet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DiscoverPostCardProps {
  post: FeedPost;
  height: number;
  isActive: boolean;
  /** Notifies the parent (Discover/SavedPosts list) whenever the buyer
   *  is using the long-press magnifier or dragging the video scrub bar
   *  so the parent can lock its vertical FlatList from paginating. */
  onMediaInteractionChange?: (active: boolean) => void;
}

const REPORT_REASONS = [
  'Inappropriate content',
  'Spam or misleading',
  'Counterfeit or fake',
  'Illegal item',
  'Other',
];

const resolveMediaUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${API_URL}${raw}`;
  return raw;
};

// Compact count label: 1.2K / 3.4M. Returns "0" for zero (we always
// want a number visible under the action icon so the buyer sees how
// much engagement a post has — empty looked broken next to "Reviews 12").
const formatCount = (n: number): string => {
  if (!n || n < 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`.replace('.0', '');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0', '');
};

export default function DiscoverPostCard({ post, height, isActive, onMediaInteractionChange }: DiscoverPostCardProps) {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const savedStores = useSelector((s: RootState) => s.savedStores.stores);

  const [liked, setLiked] = useState<boolean>(post.engagement?.isLikedByMe ?? false);
  const [isPostSaved, setIsPostSaved] = useState<boolean>(post.engagement?.isSavedByMe ?? false);
  const [descExpanded, setDescExpanded] = useState(false);
  // Keep our flags in sync if the feed gets re-fetched and the same post
  // comes back with refreshed per-buyer state (e.g. after sign-in or
  // pull-to-refresh).
  useEffect(() => {
    if (typeof post.engagement?.isLikedByMe === 'boolean') {
      setLiked(post.engagement.isLikedByMe);
    }
    if (typeof post.engagement?.isSavedByMe === 'boolean') {
      setIsPostSaved(post.engagement.isSavedByMe);
    }
  }, [post.engagement?.isLikedByMe, post.engagement?.isSavedByMe]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  // Double-tap heart animation. We track the timestamp of the last tap on
  // the media area; a second tap inside 280ms triggers a like + a brief
  // scaling/fading heart overlay (Instagram/TikTok style).
  const lastTapRef = useRef<number>(0);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  // Engagement counts. Seeded from server, updated optimistically on tap.
  const [counts, setCounts] = useState({
    likes: post.engagement?.likes || 0,
    saves: post.engagement?.saves || 0,
    shares: post.engagement?.shares || 0,
  });

  // Reviews bottom-sheet. Count is fetched lazily the first time the
  // sheet opens and cached locally so the floating button label updates
  // without forcing a global re-fetch.
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [reviewCount, setReviewCount] = useState<number | null>(null);

  // Prefetch the review count once per post so the action button shows
  // a real number ("12") instead of a stale "0" until the buyer opens
  // the sheet. Skipped for posts with no product/group identifier.
  useEffect(() => {
    const pid = post.productId;
    const gid = post.groupId;
    if (!pid && !gid) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getProductReviews(pid || gid || '', gid);
        if (!cancelled && typeof data?.totalCount === 'number') {
          setReviewCount(data.totalCount);
        }
      } catch {
        // Network blip — leave count at null and let the sheet retry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post.productId, post.groupId]);

  // Carousel images: every available image for the item. For groups this is
  // every variant photo (in combination order) plus the group cover gallery,
  // all deduped. Variant *selection* lives in chat — not here — so this list
  // never recomputes mid-render.
  const carouselImages = buildCarousel(post)
    .map(resolveMediaUrl)
    .filter(Boolean) as string[];

  // Video page lives in front of the image carousel when present, so the
  // buyer sees motion first — matching TikTok/Reels-style discovery.
  const videoUri = resolveMediaUrl(post.media?.video) || null;
  const hasVideo = !!videoUri;
  // Total pages = (video ? 1 : 0) + image count. We treat page index 0 as
  // the video when it exists.
  const totalPages = (hasVideo ? 1 : 0) + carouselImages.length;

  // Loop only when the video is the SOLE media item on the post. When the
  // post has additional images we want `playToEnd` to fire so we can
  // auto-advance the carousel to the next page.
  const shouldLoopVideo = totalPages <= 1;
  const videoPlayer = useVideoPlayer(videoUri, (player) => {
    if (!videoUri) return;
    player.loop = shouldLoopVideo;
    // Sound is on by default per product spec. Mobile browsers may still
    // block autoplay-with-sound until first user interaction; native
    // expo-video has no such restriction.
    player.muted = false;
    player.playbackRate = 1;
    // Trim the forward buffer so playback starts faster on slow networks.
    // Default is ~10 s; 4 s is enough for smooth playback while cutting
    // initial-load latency roughly in half. Wrapped in try/catch because
    // bufferOptions is platform-conditional.
    try {
      (player as any).bufferOptions = {
        preferredForwardBufferDuration: 4,
        waitsToMinimizeStalling: true,
      };
    } catch (_e) {}
  });

  // Keep the loop flag in sync if the carousel size changes after mount.
  useEffect(() => {
    if (!videoPlayer) return;
    try { videoPlayer.loop = shouldLoopVideo; } catch (_e) {}
  }, [videoPlayer, shouldLoopVideo]);

  // Track when the player has actually loaded enough to play. On a fresh
  // app launch / reload the player can finish constructing AFTER our
  // play/pause effect runs, in which case the initial `play()` call is a
  // silent no-op and the user has to manually tap. We listen for
  // `statusChange` and re-trigger play once the player is ready.
  const [videoReady, setVideoReady] = useState(false);
  useEffect(() => {
    if (!videoPlayer) return;
    setVideoReady(false);
    const sub = videoPlayer.addListener('statusChange', ({ status }: { status: string }) => {
      setVideoReady(status === 'readyToPlay');
    });
    return () => {
      try { sub.remove(); } catch (_e) {}
    };
  }, [videoPlayer, videoUri]);

  // Warm the disk + memory cache for the active card's first image only.
  // We deliberately:
  //   - skip the rest of the carousel — expo-image will fetch additional
  //     images lazily as the buyer pages through the horizontal scroller.
  //     Prefetching them all on every active-card change was hammering
  //     the decode threads (group products can have many variant photos)
  //     and warming the device.
  //   - debounce by 250 ms so a fast vertical scroll through Discover
  //     does not fire a prefetch for every card the buyer flies past.
  useEffect(() => {
    if (!isActive) return;
    const first = carouselImages[0];
    if (!first) return;
    const t = setTimeout(() => prefetchImages([first]), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, post.id]);

  const [videoMuted, setVideoMuted] = useState(false);
  const isScreenFocused = useIsFocused();
  const toggleVideoMute = useCallback(() => {
    if (!videoPlayer) return;
    try {
      const next = !videoMuted;
      videoPlayer.muted = next;
      setVideoMuted(next);
    } catch (_e) {}
  }, [videoPlayer, videoMuted]);

  // Manual play/pause toggle. Used by single-tap on the video page — the
  // useEffect below otherwise auto-plays whenever the card is active. To
  // prevent the auto-play effect from immediately undoing a user pause we
  // track an explicit "user paused" flag, cleared whenever the card or
  // page changes.
  const [userPaused, setUserPaused] = useState(false);
  useEffect(() => {
    setUserPaused(false);
  }, [isActive, pageIndex, isScreenFocused]);

  // While the buyer is using the long-press magnifier or dragging the
  // video scrub bar, we lock the horizontal carousel so a sideways
  // drag doesn't paginate to the next image. We also bubble this up to
  // the parent FlatList so its vertical paging is suspended too.
  const [mediaInteracting, setMediaInteractingRaw] = useState(false);
  const setMediaInteracting = (v: boolean) => {
    setMediaInteractingRaw(v);
    onMediaInteractionChange?.(v);
  };

  // Horizontal carousel scroller — keep a ref so we can auto-advance
  // image pages on a timer.
  const carouselScrollRef = useRef<ScrollView>(null);
  const scrollToPage = useCallback(
    (idx: number, animated = true) => {
      const clamped = Math.max(0, Math.min(idx, totalPages - 1));
      try {
        carouselScrollRef.current?.scrollTo({
          x: clamped * SCREEN_WIDTH,
          y: 0,
          animated,
        });
      } catch (_e) {}
      setPageIndex(clamped);
    },
    [totalPages],
  );

  // Auto-advance image pages after 7 s while the card + screen are focused.
  // The video page is intentionally skipped here — it advances via its own
  // `playToEnd` handler so the buyer always sees the clip in full before
  // we move on. Wraps to the first image / video after the last.
  // Pauses entirely while the magnifier or video scrub is active so the
  // buyer's preview isn't yanked out from under them.
  useEffect(() => {
    if (totalPages <= 1) return;
    if (!isActive || !isScreenFocused) return;
    if (mediaInteracting) return;
    // Video page advances via playToEnd (below), not on a fixed timer.
    if (hasVideo && pageIndex === 0) return;
    const timer = setTimeout(() => {
      const next = pageIndex + 1 >= totalPages ? 0 : pageIndex + 1;
      scrollToPage(next);
    }, 7000);
    return () => clearTimeout(timer);
  }, [pageIndex, isActive, isScreenFocused, totalPages, hasVideo, scrollToPage, mediaInteracting]);

  // Advance the carousel when the video finishes playing once. Only fires
  // when the post has additional media (loop is disabled in that case).
  useEffect(() => {
    if (!videoPlayer || !hasVideo || totalPages <= 1) return;
    const sub = videoPlayer.addListener('playToEnd', () => {
      // Only act if the video is currently visible and active. Otherwise
      // the listener fired for a stale playback we don't care about.
      if (pageIndex !== 0 || !isActive || !isScreenFocused) return;
      scrollToPage(1);
    });
    return () => {
      try { sub.remove(); } catch (_e) {}
    };
  }, [videoPlayer, hasVideo, totalPages, pageIndex, isActive, isScreenFocused, scrollToPage]);
  const toggleVideoPlayback = useCallback(() => {
    if (!videoPlayer) return;
    try {
      // expo-video's `playing` field is read-only; check via play state.
      // Easiest: if currently paused (we tracked it) play; else pause.
      if (userPaused) {
        videoPlayer.play();
        setUserPaused(false);
      } else {
        videoPlayer.pause();
        setUserPaused(true);
      }
    } catch (_e) {}
  }, [videoPlayer, userPaused]);

  // Auto play / pause based on whether THIS card is the active page in the
  // parent vertical FlatList AND the video is the current horizontal page
  // AND the Discover screen itself is focused (so navigating to chat /
  // saved-stores / etc. stops playback). `videoReady` is included so we
  // re-attempt play() once the player finishes loading after a fresh app
  // launch / reload (where the first play() call would otherwise be a
  // silent no-op and force the user to tap manually).
  useEffect(() => {
    if (!hasVideo || !videoPlayer) return;
    const onVideoPage = pageIndex === 0;
    const shouldPlay = isActive && onVideoPage && isScreenFocused && !userPaused;
    if (shouldPlay) {
      try { videoPlayer.play(); } catch (_e) {}
    } else {
      try {
        videoPlayer.pause();
        // Rewind only when leaving the video page entirely or when the
        // card / screen becomes inactive. A user-initiated pause should
        // keep its position so the next tap resumes.
        if (!onVideoPage || !isActive || !isScreenFocused) {
          videoPlayer.currentTime = 0;
        }
      } catch (_e) {}
    }
  }, [isActive, pageIndex, hasVideo, videoPlayer, isScreenFocused, userPaused, videoReady]);

  const isSaved = savedStores.some((s) => s.storeToken === post.business.chatToken);
  const logoUri = resolveMediaUrl(post.business.logo);

  const requireAuth = (action: string): boolean => {
    if (isAuthenticated) return true;
    Alert.alert('Sign in required', `Please sign in to ${action}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign In', onPress: () => router.push('/(auth)/login' as any) },
    ]);
    return false;
  };

  const setLikedState = (willLike: boolean) => {
    if (!requireAuth(willLike ? 'like this post' : 'unlike this post')) {
      return;
    }
    setLiked(willLike);
    setCounts((prev) => ({
      ...prev,
      likes: Math.max(0, prev.likes + (willLike ? 1 : -1)),
    }));
    recordFeedEngagement({
      productId: post.productId,
      groupId: post.groupId,
      action: willLike ? 'like' : 'unlike',
    })
      .then(({ data }) => {
        // Trust the server's authoritative counts (it dedupes per buyer).
        if (typeof data?.likes === 'number') {
          setCounts((prev) => ({ ...prev, likes: data.likes }));
        }
        if (typeof data?.isLikedByMe === 'boolean') {
          setLiked(data.isLikedByMe);
        }
      })
      .catch(() => {
        // Roll back on failure.
        setLiked(!willLike);
        setCounts((prev) => ({
          ...prev,
          likes: Math.max(0, prev.likes + (willLike ? -1 : 1)),
        }));
      });
  };

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLikedState(!liked);
  };

  // Plays the burst-heart animation. Independent of the like toggle so a
  // double-tap on an already-liked post still confirms with a heart.
  const playHeartBurst = useCallback(() => {
    heartScale.setValue(0.3);
    heartOpacity.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.spring(heartScale, {
          toValue: 1,
          friction: 4,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(heartScale, {
          toValue: 1.15,
          duration: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(heartOpacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.delay(380),
        Animated.timing(heartOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [heartOpacity, heartScale]);

  // Detects a double-tap on the media area. Single taps fall through and do
  // nothing (the carousel handles its own swipe gestures separately).
  const handleMediaTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Always show the heart burst on double-tap; only flip to liked if
      // it isn't already (mirrors Instagram/TikTok behaviour).
      if (!liked) setLikedState(true);
      playHeartBurst();
    } else {
      lastTapRef.current = now;
    }
  }, [liked, playHeartBurst]);

  // Same gesture detector as `handleMediaTap`, but on a single tap we toggle
  // video playback after a short delay (so a follow-up tap can still be
  // recognised as a double-tap and trigger the like burst).
  const videoTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleVideoTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      // Double tap — cancel the pending single-tap action and like.
      lastTapRef.current = 0;
      if (videoTapTimeoutRef.current) {
        clearTimeout(videoTapTimeoutRef.current);
        videoTapTimeoutRef.current = null;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (!liked) setLikedState(true);
      playHeartBurst();
    } else {
      lastTapRef.current = now;
      // Schedule the single-tap play/pause toggle. If a second tap arrives
      // within the double-tap window, the branch above cancels it.
      if (videoTapTimeoutRef.current) clearTimeout(videoTapTimeoutRef.current);
      videoTapTimeoutRef.current = setTimeout(() => {
        videoTapTimeoutRef.current = null;
        toggleVideoPlayback();
      }, 280);
    }
  }, [liked, playHeartBurst, toggleVideoPlayback]);

  useEffect(() => {
    return () => {
      if (videoTapTimeoutRef.current) clearTimeout(videoTapTimeoutRef.current);
    };
  }, []);

  // Toggle a post-level save. Backed by the per-buyer
  // BuyerPostInteraction collection so the saved set persists across
  // devices and powers the buyer's "Saved Posts" screen. Note: this is
  // distinct from "saved stores" (which bookmarks the merchant chat).
  const handleSavePost = async () => {
    if (!requireAuth(isPostSaved ? 'unsave this post' : 'save this post')) return;
    if (savingStore) return;
    const willSave = !isPostSaved;
    setSavingStore(true);
    setIsPostSaved(willSave);
    setCounts((prev) => ({
      ...prev,
      saves: Math.max(0, prev.saves + (willSave ? 1 : -1)),
    }));
    try {
      const { data } = await recordFeedEngagement({
        productId: post.productId,
        groupId: post.groupId,
        action: willSave ? 'save' : 'unsave',
      });
      if (typeof data?.saves === 'number') {
        setCounts((prev) => ({ ...prev, saves: data.saves }));
      }
      if (typeof data?.isSavedByMe === 'boolean') {
        setIsPostSaved(data.isSavedByMe);
      }
      Haptics.notificationAsync(
        willSave
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch {
      // Roll back on failure.
      setIsPostSaved(!willSave);
      setCounts((prev) => ({
        ...prev,
        saves: Math.max(0, prev.saves + (willSave ? -1 : 1)),
      }));
      Alert.alert('Could not save', 'Please try again in a moment.');
    } finally {
      setSavingStore(false);
    }
  };

  const handleShare = async () => {
    try {
      const result = await Share.share({
        message: `Check out ${post.name} from ${post.business.name} on Chatalog`,
      });
      if (result.action === Share.sharedAction) {
        setCounts((prev) => ({ ...prev, shares: prev.shares + 1 }));
        recordFeedEngagement({
          productId: post.productId,
          groupId: post.groupId,
          action: 'share',
        }).catch(() => {});
      }
    } catch {
      // user cancelled or share failed silently
    }
  };

  const openReport = () => setReportOpen(true);

  const submitReport = async () => {
    const reason = [reportReason, reportNote.trim()].filter(Boolean).join(' — ');
    if (!reason) {
      Alert.alert('Pick a reason', 'Please choose a reason for reporting this post.');
      return;
    }
    setReportSubmitting(true);
    try {
      await reportFeedPost({
        productId: post.productId,
        groupId: post.groupId,
        variantKey: null,
        reason,
      });
      setReportOpen(false);
      setReportReason('');
      setReportNote('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Thanks for the report', 'Our team will review this post.');
    } catch {
      Alert.alert('Report failed', 'Please try again.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const isGroup = post.type === 'group';
  const variantCount = isGroup && post.variants ? post.variants.combinations.length : 0;
  const isSoldOut = isGroup ? !post.stock.anyInStock : post.stock.quantity === 0;
  const showLowStock = isGroup
    ? post.stock.lowStock && post.stock.anyInStock
    : post.stock.lowStock;

  const openChat = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // For groups, the preset lists every available option so the buyer is
    // prompted to pick when they reach the chat. No variant pre-selected.
    const presetMessage = buildChatPresetMessage(post);
    const productContext = JSON.stringify({
      type: post.type,
      productId: post.productId,
      groupId: post.groupId,
      variantKey: null,
      name: post.name,
      price: post.price.effective || post.price.min,
    });
    router.push({
      pathname: '/chat/[storeToken]',
      params: {
        storeToken: post.business.chatToken,
        presetMessage,
        productContext,
      },
    });
  }, [post, router]);

  const openStore = useCallback(() => {
    router.push({
      pathname: '/chat/[storeToken]',
      params: { storeToken: post.business.chatToken },
    });
  }, [post.business.chatToken, router]);

  const truncatedDescription =
    post.description.length > 120 && !descExpanded
      ? `${post.description.slice(0, 117)}…`
      : post.description;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx !== pageIndex) setPageIndex(idx);
  };

  const ctaLabel = isSoldOut
    ? 'Sold out'
    : isGroup
      ? 'Chat to pick & buy'
      : 'Chat to Buy';

  return (
    <View style={[styles.container, { height }]}>
      {totalPages > 0 ? (
        // Horizontal ScrollView (rather than nested FlatList) so gesture
        // handling stays reliable inside the parent vertical paging FlatList.
        <ScrollView
          ref={carouselScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          scrollEnabled={isActive && totalPages > 1 && !mediaInteracting}
          style={styles.carousel}
        >
          {hasVideo && videoUri && (
            <Pressable
              key={`video-${videoUri}`}
              onPress={handleVideoTap}
              onLongPress={toggleVideoMute}
              style={{ width: SCREEN_WIDTH, height, backgroundColor: '#000' }}
            >
              <VideoView
                player={videoPlayer}
                style={{ width: SCREEN_WIDTH, height }}
                contentFit="cover"
                nativeControls={false}
                allowsPictureInPicture={false}
              />
              {/* Poster: show the first carousel image (already cached by
                  the prefetcher) until the player reports readyToPlay so
                  the card never flashes a black frame while the video
                  buffers. */}
              {!videoReady && carouselImages[0] ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <SmartImage
                    uri={carouselImages[0]}
                    style={{ width: SCREEN_WIDTH, height }}
                    variant="feed"
                    resizeMode="cover"
                  />
                </View>
              ) : null}
              {/* Mute hint — only while muted, fades after first tap. */}
              {videoMuted && (
                <View pointerEvents="none" style={styles.muteBadge}>
                  <Ionicons name="volume-mute" size={14} color="#fff" />
                  <Text style={styles.muteBadgeText}>Muted — long-press to unmute</Text>
                </View>
              )}
              {/* Paused overlay: big play icon when user has paused. */}
              {userPaused && (
                <View pointerEvents="none" style={styles.pausedOverlay}>
                  <Ionicons name="play" size={72} color="rgba(255,255,255,0.85)" />
                </View>
              )}
              {/* Draggable scrub bar pinned to the bottom of the video.
                  Only rendered when this is the active card and the
                  video page is showing. */}
              <VideoScrubBar
                player={videoPlayer}
                visible={isActive && pageIndex === 0}
                onScrubStateChange={setMediaInteracting}
              />
            </Pressable>
          )}
          {carouselImages.map((uri, i) => (
            <View
              key={`${uri}-${i}`}
              style={{ width: SCREEN_WIDTH, height }}
            >
              <ZoomablePhoto
                uri={uri}
                width={SCREEN_WIDTH}
                height={height}
                onTap={handleMediaTap}
                onZoomStateChange={setMediaInteracting}
                recyclingKey={post.id}
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        <Pressable
          onPress={handleMediaTap}
          style={[styles.media, styles.mediaPlaceholder]}
        >
          <Ionicons name="image-outline" size={64} color={Colors.textMuted} />
        </Pressable>
      )}

      {/* Double-tap heart burst overlay. `pointerEvents="none"` so it never
          steals taps from the media beneath it. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.heartBurst,
          { opacity: heartOpacity, transform: [{ scale: heartScale }] },
        ]}
      >
        <Ionicons name="heart" size={120} color="#ff4d6d" />
      </Animated.View>

      {/* Carousel pagination dots */}
      {totalPages > 1 && (
        <View style={styles.dotsRow} pointerEvents="none">
          {Array.from({ length: totalPages }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === pageIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}

      {/* Bottom scrim for text legibility */}
      <View style={[styles.scrim, styles.scrimBottom]} pointerEvents="none" />

      {/* Top-right pills: image counter + variants count for groups */}
      <View style={styles.topRightStack} pointerEvents="none">
        {totalPages > 1 && (
          <View style={styles.countPill}>
            <Ionicons
              name={hasVideo && pageIndex === 0 ? 'play' : 'images-outline'}
              size={11}
              color="#fff"
            />
            <Text style={styles.countPillText}>
              {pageIndex + 1}/{totalPages}
            </Text>
          </View>
        )}
        {isGroup && variantCount > 0 && (
          <View style={[styles.countPill, styles.variantsPill]}>
            <Ionicons name="layers-outline" size={11} color="#fff" />
            <Text style={styles.countPillText}>{variantCount} variants</Text>
          </View>
        )}
      </View>

      {/* Right-side action column. Icons are always filled — default state
          uses white, active state uses a tinted color.
          Order: Like → Reviews → Save → Share → Report. */}
      <View style={styles.actions}>
        <ActionButton
          icon="heart"
          color={liked ? '#ff4d6d' : '#fff'}
          label={formatCount(counts.likes)}
          onPress={handleLike}
        />
        {(post.productId || post.groupId) && (
          <ActionButton
            icon="star"
            color="#fff"
            label={reviewCount != null ? formatCount(reviewCount) : '0'}
            onPress={() => setReviewsOpen(true)}
          />
        )}
        <ActionButton
          icon="bookmark"
          color={isPostSaved ? Colors.secondary : '#fff'}
          label={formatCount(counts.saves)}
          onPress={handleSavePost}
          loading={savingStore}
        />
        <ActionButton
          icon="share-social"
          color="#fff"
          label={formatCount(counts.shares)}
          onPress={handleShare}
        />
        <ActionButton icon="flag" color="#fff" label="Report" onPress={openReport} />
      </View>

      {/* Bottom overlay: store + product info + CTA */}
      <View style={styles.bottomOverlay}>
        <TouchableOpacity style={styles.storeRow} onPress={openStore} activeOpacity={0.8}>
          {logoUri ? (
            <SmartImage uri={logoUri} style={styles.storeAvatar} variant="thumb" />
          ) : (
            <View style={[styles.storeAvatar, styles.storeAvatarFallback]}>
              <Ionicons name="storefront" size={14} color="#fff" />
            </View>
          )}
          <Text style={styles.storeName} numberOfLines={1}>
            {post.business.name}
          </Text>
        </TouchableOpacity>

        <Text style={styles.productName} numberOfLines={2}>
          {post.name}
        </Text>

        {!!post.description && (
          <TouchableOpacity onPress={() => setDescExpanded((v) => !v)} activeOpacity={0.8}>
            <Text style={styles.description} numberOfLines={descExpanded ? undefined : 3}>
              {truncatedDescription}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.priceRow}>
          <Text style={styles.priceText}>{formatPriceLabel(post)}</Text>
          {!isGroup && post.price.effective < post.price.base && (
            <Text style={styles.priceStrike}>
              {getCurrencySymbol(post.business?.currency)}
              {post.price.base.toLocaleString('en-NG')}
            </Text>
          )}
          {showLowStock && (
            <View style={styles.lowStockBadge}>
              <Text style={styles.lowStockText}>
                {isGroup
                  ? `Low stock · ${post.stock.inStockCount} of ${post.stock.totalCount}`
                  : 'Low stock'}
              </Text>
            </View>
          )}
          {isSoldOut && (
            <View style={[styles.lowStockBadge, styles.outBadge]}>
              <Text style={styles.lowStockText}>Sold out</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.cta, isSoldOut && styles.ctaDisabled]}
          onPress={openChat}
          activeOpacity={0.85}
          disabled={isSoldOut}
        >
          <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Report modal */}
      <Modal
        visible={reportOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReportOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalBackdropFill} />
          </TouchableWithoutFeedback>
          <ScrollView
            style={styles.modalSheetScroll}
            contentContainerStyle={styles.modalSheet}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Report this post</Text>
            <Text style={styles.modalSubtitle}>
              Tell us what's wrong with this listing.
            </Text>

            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonRow, reportReason === r && styles.reasonRowActive]}
                onPress={() => setReportReason(r)}
              >
                <Ionicons
                  name={reportReason === r ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={reportReason === r ? Colors.primary : Colors.textMuted}
                />
                <Text style={styles.reasonText}>{r}</Text>
              </TouchableOpacity>
            ))}

            <TextInput
              placeholder="Additional details (optional)"
              placeholderTextColor={Colors.textMuted}
              style={styles.reportInput}
              multiline
              value={reportNote}
              onChangeText={setReportNote}
              maxLength={300}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setReportOpen(false)}
                disabled={reportSubmitting}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={submitReport}
                disabled={reportSubmitting}
              >
                {reportSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>Submit report</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <ReviewsSheet
        visible={reviewsOpen}
        onClose={() => setReviewsOpen(false)}
        productId={post.productId}
        groupId={post.groupId}
        productName={post.name}
        onCountChange={setReviewCount}
      />
    </View>
  );
}

interface ActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  onPress: () => void;
  loading?: boolean;
}

function ActionButton({ icon, color, label, onPress, loading }: ActionButtonProps) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.7}>
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Ionicons name={icon} size={28} color={color} />
      )}
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
    position: 'relative',
  },
  carousel: {
    ...StyleSheet.absoluteFillObject,
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  mediaPlaceholder: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBurst: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -60,
    marginTop: -60,
    zIndex: 20,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  dotsRow: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#fff',
  },
  topRightStack: {
    position: 'absolute',
    top: 60,
    right: 14,
    gap: 6,
    alignItems: 'flex-end',
    zIndex: 6,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  variantsPill: {
    backgroundColor: 'rgba(41, 95, 45, 0.85)',
  },
  countPillText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
  },
  muteBadge: {
    position: 'absolute',
    bottom: 96,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  muteBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
  },
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  scrimBottom: {
    bottom: 0,
    height: 320,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  actions: {
    position: 'absolute',
    right: 12,
    bottom: 220,
    alignItems: 'center',
    gap: 22,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#fff',
    fontSize: 11,
    marginTop: 4,
    fontFamily: 'Manrope_500Medium',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 16,
    right: 80,
    bottom: 24,
    gap: 8,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#fff',
    backgroundColor: '#333',
  },
  storeAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeName: {
    color: '#fff',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    flexShrink: 1,
  },
  productName: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    marginTop: 2,
  },
  description: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  priceText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
  },
  priceStrike: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    textDecorationLine: 'line-through',
  },
  lowStockBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  outBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
  },
  lowStockText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
  },
  cta: {
    marginTop: 10,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    alignSelf: 'flex-start',
    paddingHorizontal: 22,
  },
  ctaDisabled: {
    backgroundColor: 'rgba(120,120,120,0.65)',
  },
  ctaText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheetScroll: {
    maxHeight: '85%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalSheet: {
    padding: 20,
    paddingBottom: 32,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 14,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  reasonRowActive: {
    backgroundColor: 'rgba(41, 95, 45, 0.04)',
    borderRadius: 8,
  },
  reasonText: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.text,
  },
  reportInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 70,
    marginTop: 10,
    color: Colors.text,
    fontFamily: 'Manrope_400Regular',
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalBtnGhostText: {
    color: Colors.textSecondary,
    fontFamily: 'Manrope_600SemiBold',
  },
  modalBtnPrimary: {
    backgroundColor: Colors.primary,
  },
  modalBtnPrimaryText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
});
