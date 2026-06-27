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
