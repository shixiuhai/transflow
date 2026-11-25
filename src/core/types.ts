/** Shared domain types. Keep this module free of browser/WXT imports so it is unit-testable. */

export type ProviderId = 'mock' | 'volc' | 'baidu' | 'openai' | 'libre' | (string & {});

export type SegmentRole = 'title' | 'body' | 'ui' | 'caption';

export interface Segment {
  id: string;
  text: string;
  role?: SegmentRole;
}

export interface GlossaryEntry {
  source: string;
  target: string;
  caseSensitive?: boolean;
}

export type Domain = 'general' | 'tech' | 'academic' | 'news';

export interface TranslateInput {
  segments: Segment[];
  from: string;
  to: string;
  glossary?: GlossaryEntry[];
  domain?: Domain;
  signal?: AbortSignal;
}

export interface TranslationResult {
  id: string;
  text: string;
  detected?: string;
}

export interface LanguageDef {
  code: string;
  name: string;
  englishName: string;
}
