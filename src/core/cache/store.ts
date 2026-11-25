import { cacheKey } from './key';

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  text: string;
  ts: number;
}

export interface CacheLookup {
  provider: string;
  from: string;
  to: string;
  text: string;
}

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return Boolean(entry && typeof entry.text === 'string' && Date.now() - entry.ts < TTL_MS);
}

/** Bulk read: one storage round-trip for a whole page. */
export async function cacheGetMany(lookups: CacheLookup[]): Promise<Map<string, string>> {
  const hits = new Map<string, string>();
  if (lookups.length === 0) return hits;
  const keys = lookups.map((l) => cacheKey(l.provider, l.from, l.to, l.text));
  try {
    const stored = (await chrome.storage.local.get(keys)) as Record<string, CacheEntry | undefined>;
    lookups.forEach((lookup, i) => {
      const key = keys[i];
      if (!key) return;
      const entry = stored[key];
      if (isFresh(entry)) hits.set(lookup.text, entry.text);
    });
  } catch {
    // Cache must never break translation.
  }
  return hits;
}

export async function cacheSetMany(provider: string, from: string, to: string, entries: { text: string; translation: string }[]) {
  if (entries.length === 0) return;
  const payload: Record<string, CacheEntry> = {};
  const ts = Date.now();
  for (const entry of entries) {
    payload[cacheKey(provider, from, to, entry.text)] = { text: entry.translation, ts };
  }
  try {
    await chrome.storage.local.set(payload);
  } catch {
    // Ignore quota errors.
  }
}

export async function cacheClear(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((key) => key.startsWith('tf:cache:'));
  if (keys.length > 0) await chrome.storage.local.remove(keys);
}
