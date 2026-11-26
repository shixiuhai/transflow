export interface VocabItem {
  id: string;
  term: string;
  translation: string;
  sourceLang: string;
  targetLang: string;
  context?: string;
  note?: string;
  tags?: string[];
  url?: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  /** Review progress (SM-2 lite). */
  mastery?: number;
  reviewCount?: number;
  lastReviewedAt?: number;
  nextReviewAt?: number;
  intervalDays?: number;
}

export interface VocabSyncState {
  lastSyncAt: number;
  lastError?: string;
  auto: boolean;
  intervalMinutes: number;
}

export interface VocabState {
  version: 1;
  uuid: string;
  items: VocabItem[];
  deleted: Record<string, number>;
  updatedAt: number;
  sync: VocabSyncState;
}

export interface VocabDraft {
  term: string;
  translation: string;
  sourceLang: string;
  targetLang: string;
  context?: string;
  note?: string;
  tags?: string[];
  url?: string;
  title?: string;
}

export interface VocabRemote {
  protocol: number;
  revision: number;
  serverTime: number;
  items: VocabItem[];
  deleted: Record<string, number>;
}
