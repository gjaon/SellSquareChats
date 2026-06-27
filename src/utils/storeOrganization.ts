import AsyncStorage from '@react-native-async-storage/async-storage';

// Stores buyer-side organization metadata for saved stores. Lives only on
// the device — labels and "saved" (starred) state are a UI organization
// tool, not synced to the backend.

const STORAGE_KEY = 'chatalog_store_labels_v1';

export interface StoreOrganization {
  // User-created label strings, in insertion order.
  labels: string[];
  // storeToken -> labels assigned to that store.
  assignments: Record<string, string[]>;
  // storeToken set the user has explicitly starred ("saved chat").
  saved: Record<string, true>;
}

const EMPTY: StoreOrganization = { labels: [], assignments: {}, saved: {} };

export async function loadStoreOrganization(): Promise<StoreOrganization> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      labels: Array.isArray(parsed?.labels) ? parsed.labels : [],
      assignments: parsed?.assignments && typeof parsed.assignments === 'object' ? parsed.assignments : {},
      saved: parsed?.saved && typeof parsed.saved === 'object' ? parsed.saved : {},
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveStoreOrganization(state: StoreOrganization): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal — organization will simply not persist this session.
  }
}

export function addLabel(state: StoreOrganization, label: string): StoreOrganization {
  const trimmed = label.trim();
  if (!trimmed) return state;
  if (state.labels.includes(trimmed)) return state;
  return { ...state, labels: [...state.labels, trimmed] };
}

export function removeLabel(state: StoreOrganization, label: string): StoreOrganization {
  const labels = state.labels.filter((l) => l !== label);
  const assignments: Record<string, string[]> = {};
  for (const [token, tags] of Object.entries(state.assignments)) {
    const filtered = tags.filter((t) => t !== label);
    if (filtered.length > 0) assignments[token] = filtered;
  }
  return { ...state, labels, assignments };
}

export function toggleStoreLabel(
  state: StoreOrganization,
  storeToken: string,
  label: string,
): StoreOrganization {
  const current = state.assignments[storeToken] || [];
  const next = current.includes(label)
    ? current.filter((l) => l !== label)
    : [...current, label];
  const assignments = { ...state.assignments };
  if (next.length > 0) assignments[storeToken] = next;
  else delete assignments[storeToken];
  return { ...state, assignments };
}

export function toggleStoreSaved(
  state: StoreOrganization,
  storeToken: string,
): StoreOrganization {
  const saved = { ...state.saved };
  if (saved[storeToken]) delete saved[storeToken];
  else saved[storeToken] = true;
  return { ...state, saved };
}
