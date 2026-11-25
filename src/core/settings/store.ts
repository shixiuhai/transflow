import type { Settings } from './schema';
import { normalizeSettings } from './schema';

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return normalizeSettings(stored[KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function resetSettings(): Promise<Settings> {
  await chrome.storage.local.remove(KEY);
  return normalizeSettings(undefined);
}
