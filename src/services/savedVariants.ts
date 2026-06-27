// Persists the most recently viewed variant per group so the buyer returns
// to that exact combination next time they open the same item — both in
// Discover and in the chat store-products panel.
//
// Keyed by groupId. Stored in AsyncStorage as a single JSON map to avoid
// fragmenting storage with many keys.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'savedVariantsV1';

type SavedVariantsMap = Record<string, string>; // groupId -> variantKey

let cache: SavedVariantsMap | null = null;
let loadPromise: Promise<SavedVariantsMap> | null = null;

const ensureLoaded = async (): Promise<SavedVariantsMap> => {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      cache = raw ? (JSON.parse(raw) as SavedVariantsMap) : {};
    } catch {
      cache = {};
    }
    loadPromise = null;
    return cache!;
  })();
  return loadPromise;
};

export const getSavedVariant = async (
  groupId: string | null | undefined,
): Promise<string | null> => {
  if (!groupId) return null;
  const map = await ensureLoaded();
  return map[groupId] || null;
};

export const setSavedVariant = async (
  groupId: string | null | undefined,
  variantKey: string | null | undefined,
): Promise<void> => {
  if (!groupId || !variantKey) return;
  const map = await ensureLoaded();
  if (map[groupId] === variantKey) return;
  map[groupId] = variantKey;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort persistence — non-fatal
  }
};

// Synchronous accessor for components that have already triggered preload.
export const getSavedVariantSync = (
  groupId: string | null | undefined,
): string | null => {
  if (!groupId || !cache) return null;
  return cache[groupId] || null;
};

// Preload at app startup so synchronous reads work in render.
export const preloadSavedVariants = () => ensureLoaded();
