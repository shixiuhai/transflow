import type { ProviderConfig } from './provider/types';
import type { Segment } from './types';
import type { Settings } from './settings/schema';

export type RuntimeMessage =
  | { type: 'translate'; segments: Segment[]; from: string; to: string }
  | { type: 'test-provider'; id: string; config?: ProviderConfig }
  | { type: 'get-settings' }
  | { type: 'save-settings'; patch: Partial<Settings> }
  | { type: 'page-translate' }
  | { type: 'page-restore' }
  | { type: 'selection-translate' }
  | { type: 'input-translate' }
  | { type: 'get-selection' }
  | { type: 'diagnose' }
  | { type: 'page-status' }
  | { type: 'ping' };

export interface TranslateSuccess {
  results: { id: string; text: string }[];
  provider: string;
  latencyMs: number;
  cached?: boolean;
}

export type RuntimeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
