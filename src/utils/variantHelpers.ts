// Helpers for working with FeedPost / variant data on the client.
import type { FeedPost, FeedVariantCombination } from '../services/feedService';

// Find the combination matching the current selection. Returns null if any
// attribute is unselected or the combination doesn't exist. `selected` may be
// undefined when the caller doesn't yet have a picker mounted.
export function findCombination(
  post: FeedPost,
  selected?: Record<string, string | null> | null,
): FeedVariantCombination | null {
  const variants = post.variants;
  if (!variants) return null;
  const sel = selected || {};
  for (const attr of variants.attributes) {
    if (!sel[attr]) return null;
  }
  return (
    variants.combinations.find((c) =>
      variants.attributes.every((attr) => c.values[attr] === sel[attr]),
    ) || null
  );
}

// Build the initial selection: first in-stock combination, falling back to
// the first combination if all are sold out. Standalone products → empty map.
export function defaultVariantSelection(
  post: FeedPost,
): Record<string, string | null> {
  if (!post.variants) return {};
  const initial =
    post.variants.combinations.find((c) => c.inStock) ||
    post.variants.combinations[0];
  if (!initial) return {};
  const out: Record<string, string | null> = {};
  for (const attr of post.variants.attributes) {
    out[attr] = initial.values[attr] || null;
  }
  return out;
}

// Build the carousel list of images for a post.
//   - For groups, prefer the lead variant image if a selection exists, then
//     all per-variant images (in combination order), then group gallery.
//   - For standalone products, just media.gallery.
export function buildCarousel(
  post: FeedPost,
  selected?: Record<string, string | null> | null,
): string[] {
  if (post.type !== 'group') {
    if (post.media.gallery && post.media.gallery.length > 0) return post.media.gallery;
    return post.media.primary ? [post.media.primary] : [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url?: string | null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  const combo = findCombination(post, selected);
  if (combo?.image) push(combo.image);
  // Add every variant image so users can swipe through ALL variant photos.
  if (post.variants) {
    for (const c of post.variants.combinations) push(c.image);
  }
  push(post.media.primary);
  for (const url of post.media.gallery || []) push(url);
  if (post.media.variantImages) {
    for (const url of Object.values(post.media.variantImages)) push(url);
  }
  return out;
}

// Compose the chat preset message.
// Selection is optional. We tell the AI exactly what the buyer picked (if
// anything) and let it ask follow-ups for the missing pieces.
export function buildChatPresetMessage(
  post: FeedPost,
  selected?: Record<string, string | null> | null,
): string {
  if (post.type === 'group' && post.variants) {
    const sel = selected || {};
    const chosen = post.variants.attributes
      .map((attr) => (sel[attr] ? `${attr}: ${sel[attr]}` : null))
      .filter(Boolean) as string[];
    if (chosen.length === post.variants.attributes.length && chosen.length > 0) {
      return `Hi! I'd like the ${chosen.join(', ')} variant of "${post.name}". Is it available?`;
    }
    if (chosen.length > 0) {
      return `Hi! I'm interested in "${post.name}" \u2014 ${chosen.join(', ')}. Can you walk me through the rest?`;
    }
    return `Hi! I'm interested in "${post.name}". Can you tell me what options you have available?`;
  }
  return `Hi! I'm interested in "${post.name}". Can you tell me more about it?`;
}

// Format the price line for a feed post.
export function formatPriceLabel(
  post: FeedPost,
  selected?: Record<string, string | null> | null,
): string {
  const fmt = (n: number) => `₦${Number(n || 0).toLocaleString()}`;
  if (post.type === 'group') {
    const combo = findCombination(post, selected);
    if (combo) return fmt(combo.price);
    if (post.price.hasRange) {
      return `${fmt(post.price.min)} – ${fmt(post.price.max)}`;
    }
    return fmt(post.price.min || post.price.base);
  }
  return fmt(post.price.effective || post.price.base);
}
