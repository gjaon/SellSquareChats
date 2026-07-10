// utils/participantColors.ts
//
// Deterministic per-sender colour for the chat thread so the buyer can tell
// at a glance who is speaking — the store's AI assistant and each human staff
// member who takes over get their own stable colour for their name label
// (WhatsApp-group style). The colour is derived from the sender's name, so the
// same person always gets the same colour without any configuration. Mirrors
// SellSquare/client/src/utils/participantColors.js — keep the palettes in sync.

// Reserved for the AI assistant so it never collides with a human's colour.
export const AI_PARTICIPANT_COLOR = '#0E9F6E'; // emerald

const HUMAN_PALETTE = [
  '#2563EB', // blue
  '#7C3AED', // violet
  '#DB2777', // pink
  '#EA580C', // orange
  '#0891B2', // cyan
  '#4F46E5', // indigo
  '#BE123C', // rose
  '#CA8A04', // amber-dark
];

const hashString = (str: string): number => {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0; // 32-bit
  }
  return Math.abs(h);
};

export const colorForSender = ({
  isAI = false,
  name = '',
}: { isAI?: boolean; name?: string | null } = {}): string => {
  if (isAI) return AI_PARTICIPANT_COLOR;
  const key = String(name || '').trim().toLowerCase() || 'staff';
  return HUMAN_PALETTE[hashString(key) % HUMAN_PALETTE.length];
};

// ── C3: role-based bubble tints (mirror of the merchant surface) ───────────────
// The MERCHANT Conversations panel (web + sellsquare.app) colours agent bubbles
// by role (owner/staff/AI) with these brand-adjacent background+label tints.
// Kept here so the 3-file participant-colour mirror stays in sync. The buyer
// ChatBubble intentionally does NOT apply bubble backgrounds (buyer bubble
// layout is out of scope for C3) — this export exists for parity / future use.
export const STAFF_TINT_COUNT = 5;
type BubbleTint = { bg: string; label: string };
const BUBBLE_TINTS: Record<'light' | 'dark', { ai: BubbleTint; owner: BubbleTint; staff: BubbleTint[] }> = {
  light: {
    ai: { bg: '#e4f3ec', label: '#047857' },
    owner: { bg: '#d5ecd8', label: '#1f4823' },
    staff: [
      { bg: '#e8f0de', label: '#4d7c0f' },
      { bg: '#d9f0ec', label: '#0f766e' },
      { bg: '#dcecf3', label: '#0e7490' },
      { bg: '#eaf1d6', label: '#3f6212' },
      { bg: '#dcf0e6', label: '#059669' },
    ],
  },
  dark: {
    ai: { bg: '#16291f', label: '#6ee7b7' },
    owner: { bg: '#1b2e1f', label: '#8cc593' },
    staff: [
      { bg: '#232a14', label: '#bef264' },
      { bg: '#16292a', label: '#5eead4' },
      { bg: '#16262b', label: '#7dd3fc' },
      { bg: '#202a16', label: '#a3c76b' },
      { bg: '#17281f', label: '#6ee7b7' },
    ],
  },
};

export const bubbleTintForSender = ({
  isAI = false,
  role = null,
  name = '',
  isDark = false,
}: {
  isAI?: boolean;
  role?: 'owner' | 'staff' | null;
  name?: string | null;
  isDark?: boolean;
} = {}): BubbleTint => {
  const set = isDark ? BUBBLE_TINTS.dark : BUBBLE_TINTS.light;
  if (isAI) return set.ai;
  if (role === 'owner') return set.owner;
  const key = String(name || '').trim().toLowerCase() || 'staff';
  return set.staff[hashString(key) % set.staff.length];
};
