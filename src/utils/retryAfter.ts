/* retryAfter — chatalog copy of the web/RN helper (client/src/utils/retryAfter.js,
 * sellsquare.app/src/utils/retryAfter.ts).
 *
 * Renders the backend's standardized 429 rate-limit contract (a
 * `retryAfterSeconds` JSON field + `Retry-After` header) as a human "try again
 * in Xm Ys" message. The api.ts response interceptor rewrites the error message
 * on a 429 so every screen's `error.response.data.message` read shows it. */

// "45 seconds" / "3 minutes". Minutes round up; under 90s stays in seconds.
export const formatRetryAfter = (seconds: number): string => {
  const s = Math.max(1, Math.ceil(Number(seconds) || 0));
  if (s < 90) return s === 1 ? '1 second' : `${s} seconds`;
  const m = Math.ceil(s / 60);
  return m === 1 ? '1 minute' : `${m} minutes`;
};

// JSON field first, then the standard header. null when neither is valid.
export const getRetryAfterSeconds = (error: any): number | null => {
  const data = error?.response?.data;
  if (data && typeof data.retryAfterSeconds === 'number' && data.retryAfterSeconds > 0) {
    return data.retryAfterSeconds;
  }
  const header = error?.response?.headers?.['retry-after'];
  const n = header != null ? parseInt(header, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

// The user-facing "too many attempts" message for a 429 error.
export const rateLimitMessage = (error: any): string => {
  const secs = getRetryAfterSeconds(error);
  return secs != null
    ? `Too many attempts. Try again in ${formatRetryAfter(secs)}.`
    : 'Too many attempts. Please wait a moment and try again.';
};
