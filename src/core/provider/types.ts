import type { ProviderMetaLike } from './meta';
import type { ProviderId } from '../types';
import type { Domain, GlossaryEntry, Segment, TranslationResult } from '../types';

export interface ProviderMeta extends ProviderMetaLike {
  id: ProviderId;
}

export interface ProviderCaps {
  /** How the provider accepts multiple segments in one request. */
  batch: 'array' | 'delimiter' | 'single';
  maxItems: number;
  maxChars: number;
  qps: number;
  detect: boolean;
  glossary: boolean;
}

export interface ProviderConfig {
  accessKey?: string;
  secretKey?: string;
  appId?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface ProviderTranslateOptions {
  segments: Segment[];
  from: string;
  to: string;
  glossary?: GlossaryEntry[];
  domain?: Domain;
  signal?: AbortSignal;
}

export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

export interface TranslationProvider {
  meta: ProviderMeta;
  caps: ProviderCaps;
  translate(opts: ProviderTranslateOptions): Promise<TranslationResult[]>;
  detect?(text: string, signal?: AbortSignal): Promise<string>;
  test(signal?: AbortSignal): Promise<ProviderTestResult>;
}

export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
