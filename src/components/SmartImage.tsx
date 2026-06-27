// Thin wrapper around expo-image that gives every screen the same
// caching / fade-in / priority defaults. We migrated off React Native's
// built-in <Image> because it has no real disk cache on iOS and decodes
// the same URL twice when the long-press magnifier mounts a second copy
// of the photo, causing the lens to stay blank for several seconds (or
// up to a minute) while the original re-decodes from scratch.
//
// expo-image (SDWebImage on iOS, Glide on Android) gives us:
//   - shared memory + disk cache keyed by URI, so the magnifier reuses
//     the already-decoded bitmap instead of refetching the original
//   - `priority` knob so offscreen Discover cards don't fight the
//     active card for bandwidth
//   - smooth fade-in transition that hides decode jank on slow networks
//
// Use the `variant` prop to pick a sensible content-fit + transition
// duration per call site. Storage is currently raw S3 (no on-the-fly
// resize), so we cannot swap in smaller URLs here — once the backend
// generates sized variants we can plug them in inside `resolveSrc`.
import React, { forwardRef, useMemo } from 'react';
import {
  Image as ExpoImage,
  ImageProps as ExpoImageProps,
  ImageContentFit,
} from 'expo-image';

export type SmartImageVariant = 'thumb' | 'card' | 'feed' | 'lens';

/** Subset of RN's ImageResizeMode we actually use. */
type LegacyResizeMode = 'cover' | 'contain' | 'stretch' | 'center' | 'repeat';

type Source =
  | string
  | { uri?: string | null }
  | { uri?: string | null }[]
  | null
  | undefined;

interface SmartImageProps extends Omit<ExpoImageProps, 'source' | 'contentFit'> {
  source?: Source;
  /** Optional URI shorthand. */
  uri?: string | null;
  /** Hint used to set defaults (transition, default contentFit). */
  variant?: SmartImageVariant;
  /** Map RN's resizeMode prop onto expo-image's contentFit. */
  resizeMode?: LegacyResizeMode;
  /** Forwarded to expo-image. */
  contentFit?: ImageContentFit;
}

const RESIZE_MAP: Record<LegacyResizeMode, ImageContentFit> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
  repeat: 'cover',
};

const resolveSrc = (
  source: Source,
  uri: string | null | undefined,
): ExpoImageProps['source'] => {
  if (uri) return { uri };
  if (!source) return undefined;
  if (typeof source === 'string') return { uri: source };
  if (Array.isArray(source)) {
    return source
      .filter((s): s is { uri?: string | null } => !!s)
      .map((s) => ({ uri: s.uri ?? undefined }));
  }
  return { uri: source.uri ?? undefined };
};

/** Default transition / contentFit per variant. */
const variantDefaults = (variant: SmartImageVariant) => {
  switch (variant) {
    case 'thumb':
      return { transition: 80, contentFit: 'cover' as ImageContentFit };
    case 'lens':
      // No fade in the magnifier — we want the zoomed copy to paint the
      // instant the cached bitmap is available.
      return { transition: 0, contentFit: 'cover' as ImageContentFit };
    case 'feed':
      return { transition: 150, contentFit: 'cover' as ImageContentFit };
    case 'card':
    default:
      return { transition: 120, contentFit: 'cover' as ImageContentFit };
  }
};

// Priority defaults per variant. We deliberately keep `normal` as the
// ceiling for visible content because expo-image's `high` priority
// short-circuits the queue — using it everywhere just saturates the
// decode threads and warms the device. Reserve `high` for explicit
// opt-in (e.g. the active Discover card's poster).
const priorityDefault = (variant: SmartImageVariant) => {
  switch (variant) {
    case 'thumb':
      return 'low' as const;
    case 'lens':
    case 'feed':
    case 'card':
    default:
      return 'normal' as const;
  }
};

const SmartImage = forwardRef<any, SmartImageProps>(function SmartImage(
  {
    source,
    uri,
    variant = 'card',
    resizeMode,
    contentFit,
    transition,
    cachePolicy,
    priority,
    recyclingKey,
    ...rest
  },
  ref,
) {
  const defaults = useMemo(() => variantDefaults(variant), [variant]);
  const finalSource = resolveSrc(source, uri);
  const finalContentFit =
    contentFit ?? (resizeMode ? RESIZE_MAP[resizeMode] : defaults.contentFit);

  return (
    <ExpoImage
      ref={ref}
      source={finalSource}
      contentFit={finalContentFit}
      transition={transition ?? defaults.transition}
      cachePolicy={cachePolicy ?? 'memory-disk'}
      priority={priority ?? priorityDefault(variant)}
      recyclingKey={recyclingKey}
      {...rest}
    />
  );
});

export default SmartImage;

/** Warm the disk + memory cache for a list of URLs. Safe to call with
 *  empty / null entries. */
export const prefetchImages = (urls: Array<string | null | undefined>) => {
  const list = urls.filter((u): u is string => !!u);
  if (list.length === 0) return;
  // Fire-and-forget; expo-image returns a promise we don't need to await.
  ExpoImage.prefetch(list, 'memory-disk').catch(() => {
    /* prefetch failures are non-fatal */
  });
};

export const clearImageCache = async () => {
  await Promise.all([
    ExpoImage.clearMemoryCache(),
    ExpoImage.clearDiskCache(),
  ]);
};
