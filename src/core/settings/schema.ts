import type { ProviderConfig } from '../provider/types';
import type { GlossaryEntry } from '../glossary';

export type PageMode = 'blend' | 'card' | 'mask' | 'replace';

export interface Settings {
  version: 2;
  provider: {
    active: string;
    fallback: string[];
    configs: Record<string, ProviderConfig>;
  };
  language: { source: string; target: string };
  page: {
    mode: PageMode;
    autoTranslate: boolean;
    maxSegments: number;
    includeIframes: boolean;
    rules: string[];
  };
  selection: {
    enabled: boolean;
    target: string;
    /** button = floating button only, shortcut = key only, both = either. */
    trigger: 'button' | 'shortcut' | 'both';
    /** Normalized shortcut, e.g. `alt+s` or `t`. */
    keys: string;
    /** Selection bubble surface. */
    bubbleStyle: 'auto' | 'paper' | 'glass' | 'contrast';
  };
  input: { enabled: boolean };
  ui: { theme: 'auto' | 'light' | 'dark'; reduceMotion: boolean };
  glossary: { entries: GlossaryEntry[] };
  vocab: {
    enabled: boolean;
    autoSync: boolean;
    syncIntervalMinutes: number;
    syncUrl: string;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  provider: {
    active: 'mock',
    fallback: [],
    configs: {},
  },
  language: { source: 'auto', target: 'zh' },
  page: {
    mode: 'blend',
    autoTranslate: false,
    maxSegments: 2000,
    includeIframes: false,
    rules: [],
  },
  selection: { enabled: true, target: 'zh', trigger: 'both', keys: 't', bubbleStyle: 'paper' },
  input: { enabled: true },
  ui: { theme: 'auto', reduceMotion: false },
  glossary: { entries: [] },
  vocab: {
    enabled: true,
    autoSync: true,
    syncIntervalMinutes: 360,
    syncUrl: 'https://transflow.yizhiweb.top/transflow',
  },
};

type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep merge used for forward-compatible settings migrations. */
export function mergeSettings(base: Settings, patch: unknown): Settings {
  if (!isPlain(patch)) return base;
  const out: Plain = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] = isPlain(current) && isPlain(value) ? mergeSettings(current as unknown as Settings, value) : value;
  }
  return out as unknown as Settings;
}

export function normalizeSettings(raw: unknown): Settings {
  const sourceVersion = isPlain(raw) && typeof raw.version === 'number' ? raw.version : 0;
  const merged = mergeSettings(DEFAULT_SETTINGS, raw);

  // The old untouched default was `alt+s` + both. Migrate it to lowercase `t`
  // even for settings saved by 1.1.x (which already wrote version 2).
  if (merged.selection.keys === 'alt+s' && merged.selection.trigger === 'both') {
    merged.selection.keys = 't';
  }

  return { ...merged, version: 2 };
}
