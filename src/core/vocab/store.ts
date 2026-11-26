import type { VocabDraft, VocabItem, VocabState } from './types';

const KEY = 'tf:vocab:v1';
const MAX_ITEMS = 5000;

export function normalizeTerm(term: string): string {
  return term.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isVocabUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function createEmptyVocab(uuid?: string): VocabState {
  return {
    version: 1,
    uuid: uuid && isVocabUuid(uuid) ? uuid : crypto.randomUUID(),
    items: [],
    deleted: {},
    updatedAt: Date.now(),
    sync: { lastSyncAt: 0, auto: true, intervalMinutes: 360 },
  };
}

function normalize(raw: Partial<VocabState> | undefined): VocabState {
  const base = createEmptyVocab(raw?.uuid && isVocabUuid(raw.uuid) ? raw.uuid : undefined);
  return {
    ...base,
    items: Array.isArray(raw?.items) ? raw.items : [],
    deleted: raw?.deleted && typeof raw.deleted === 'object' ? raw.deleted : {},
    updatedAt: raw?.updatedAt ?? base.updatedAt,
    sync: {
      lastSyncAt: raw?.sync?.lastSyncAt ?? 0,
      lastError: raw?.sync?.lastError,
      auto: raw?.sync?.auto ?? true,
      intervalMinutes: raw?.sync?.intervalMinutes ?? 360,
    },
  };
}

export async function loadVocab(): Promise<VocabState> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as Partial<VocabState> | undefined;
  const state = normalize(stored);
  if (!stored) await saveVocab(state);
  return state;
}

export async function saveVocab(state: VocabState): Promise<void> {
  state.updatedAt = Date.now();
  await chrome.storage.local.set({ [KEY]: state });
}

export async function addVocabItem(draft: VocabDraft): Promise<{ state: VocabState; added: boolean; item: VocabItem }> {
  const state = await loadVocab();
  const term = draft.term.replace(/\s+/g, ' ').trim();
  if (!term) throw new Error('原文为空');
  const key = `${normalizeTerm(term)}|${draft.sourceLang}|${draft.targetLang}`;
  const existing = state.items.find(
    (item) => `${normalizeTerm(item.term)}|${item.sourceLang}|${item.targetLang}` === key,
  );
  const now = Date.now();

  if (existing) {
    existing.translation = draft.translation;
    existing.context = draft.context ?? existing.context;
    existing.url = draft.url ?? existing.url;
    existing.title = draft.title ?? existing.title;
    existing.updatedAt = now;
    await saveVocab(state);
    return { state, added: false, item: existing };
  }

  if (state.items.length >= MAX_ITEMS) throw new Error('单词本已满（5000 条）');
  const item: VocabItem = {
    id: crypto.randomUUID(),
    term,
    translation: draft.translation,
    sourceLang: draft.sourceLang,
    targetLang: draft.targetLang,
    context: draft.context,
    note: draft.note,
    tags: draft.tags,
    url: draft.url,
    title: draft.title,
    createdAt: now,
    updatedAt: now,
  };
  state.items.unshift(item);
  await saveVocab(state);
  return { state, added: true, item };
}

export async function deleteVocabItem(id: string): Promise<VocabState> {
  const state = await loadVocab();
  state.items = state.items.filter((item) => item.id !== id);
  state.deleted[id] = Date.now();
  await saveVocab(state);
  return state;
}

export async function updateVocabItem(
  id: string,
  patch: Partial<Pick<VocabItem, 'term' | 'translation' | 'context' | 'note' | 'tags'>>,
): Promise<VocabState> {
  const state = await loadVocab();
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return state;
  if (patch.term !== undefined) item.term = patch.term.replace(/\s+/g, ' ').trim();
  if (patch.translation !== undefined) item.translation = patch.translation.trim();
  if (patch.context !== undefined) item.context = patch.context.trim();
  if (patch.note !== undefined) item.note = patch.note.trim();
  if (patch.tags !== undefined) item.tags = patch.tags;
  item.updatedAt = Date.now();
  await saveVocab(state);
  return state;
}

export async function deleteVocabItems(ids: string[]): Promise<VocabState> {
  const state = await loadVocab();
  const targets = new Set(ids);
  const now = Date.now();
  for (const item of state.items) {
    if (targets.has(item.id)) state.deleted[item.id] = now;
  }
  state.items = state.items.filter((item) => !targets.has(item.id));
  await saveVocab(state);
  return state;
}

export async function importVocabJson(raw: string): Promise<{
  state: VocabState;
  imported: number;
  updated: number;
  skipped: number;
}> {
  const parsed = JSON.parse(raw) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : null;
  if (!list) throw new Error('JSON 中没有 items 数组');

  const state = await loadVocab();
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const now = Date.now();

  for (const rawItem of list) {
    if (!rawItem || typeof rawItem !== 'object') {
      skipped += 1;
      continue;
    }
    const candidate = rawItem as Partial<VocabItem>;
    const term = typeof candidate.term === 'string' ? candidate.term.replace(/\s+/g, ' ').trim() : '';
    const translation = typeof candidate.translation === 'string' ? candidate.translation.trim() : '';
    if (!term || !translation) {
      skipped += 1;
      continue;
    }
    const sourceLang = typeof candidate.sourceLang === 'string' ? candidate.sourceLang : 'en';
    const targetLang = typeof candidate.targetLang === 'string' ? candidate.targetLang : 'zh';
    const id = typeof candidate.id === 'string' && isVocabUuid(candidate.id) ? candidate.id : crypto.randomUUID();
    const existing = state.items.find((item) => item.id === id)
      ?? state.items.find(
        (item) => `${normalizeTerm(item.term)}|${item.sourceLang}|${item.targetLang}`
          === `${normalizeTerm(term)}|${sourceLang}|${targetLang}`,
      );

    if (existing) {
      if ((candidate.updatedAt ?? now) >= existing.updatedAt) {
        existing.term = term;
        existing.translation = translation;
        existing.context = candidate.context ?? existing.context;
        existing.note = candidate.note ?? existing.note;
        existing.url = candidate.url ?? existing.url;
        existing.title = candidate.title ?? existing.title;
        existing.tags = Array.isArray(candidate.tags) ? candidate.tags.filter((tag) => typeof tag === 'string') : existing.tags;
        existing.updatedAt = candidate.updatedAt ?? now;
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    if (state.items.length >= MAX_ITEMS) {
      skipped += 1;
      continue;
    }
    state.items.push({
      id,
      term,
      translation,
      sourceLang,
      targetLang,
      context: typeof candidate.context === 'string' ? candidate.context : undefined,
      note: typeof candidate.note === 'string' ? candidate.note : undefined,
      url: typeof candidate.url === 'string' ? candidate.url : undefined,
      title: typeof candidate.title === 'string' ? candidate.title : undefined,
      tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag) => typeof tag === 'string') : undefined,
      createdAt: candidate.createdAt ?? now,
      updatedAt: candidate.updatedAt ?? now,
      mastery: typeof candidate.mastery === 'number' ? candidate.mastery : undefined,
      reviewCount: typeof candidate.reviewCount === 'number' ? candidate.reviewCount : undefined,
      lastReviewedAt: typeof candidate.lastReviewedAt === 'number' ? candidate.lastReviewedAt : undefined,
      nextReviewAt: typeof candidate.nextReviewAt === 'number' ? candidate.nextReviewAt : undefined,
      intervalDays: typeof candidate.intervalDays === 'number' ? candidate.intervalDays : undefined,
    });
    imported += 1;
  }

  await saveVocab(state);
  return { state, imported, updated, skipped };
}

export async function clearVocabLocal(): Promise<VocabState> {
  const state = await loadVocab();
  for (const item of state.items) state.deleted[item.id] = Date.now();
  state.items = [];
  await saveVocab(state);
  return state;
}

export async function setVocabUuid(uuid: string): Promise<VocabState> {
  if (!isVocabUuid(uuid)) throw new Error('UUID 格式不正确');
  const state = await loadVocab();
  state.uuid = uuid.trim().toLowerCase();
  state.sync.lastSyncAt = 0;
  state.sync.lastError = undefined;
  await saveVocab(state);
  return state;
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export function dueVocabItems(items: VocabItem[], now = Date.now()): VocabItem[] {
  return items
    .filter((item) => (item.nextReviewAt ?? 0) <= now)
    .sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0));
}

export async function gradeVocabItem(id: string, grade: ReviewGrade): Promise<VocabState> {
  const state = await loadVocab();
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return state;
  const now = Date.now();
  const previous = item.intervalDays ?? 0;
  let interval = previous;
  let mastery = item.mastery ?? 0;

  if (grade === 'again') {
    interval = 0;
    mastery = Math.max(0, mastery - 1);
  } else if (grade === 'hard') {
    interval = previous ? Math.max(1, previous * 1.2) : 1;
  } else if (grade === 'good') {
    interval = previous ? Math.max(2, previous * 2.3) : 1;
    mastery = Math.min(5, mastery + 1);
  } else {
    interval = previous ? Math.max(3, previous * 3.5) : 3;
    mastery = Math.min(5, mastery + 2);
  }

  interval = Math.min(180, interval);
  item.mastery = mastery;
  item.reviewCount = (item.reviewCount ?? 0) + 1;
  item.lastReviewedAt = now;
  item.intervalDays = interval;
  item.nextReviewAt = grade === 'again' ? now + 10 * 60_000 : now + interval * 86_400_000;
  item.updatedAt = now;
  await saveVocab(state);
  return state;
}

export function searchVocab(items: VocabItem[], query: string): VocabItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) => item.term.toLowerCase().includes(q) || item.translation.toLowerCase().includes(q),
  );
}

export function exportVocabJson(state: VocabState): string {
  return JSON.stringify({ version: 1, uuid: state.uuid, items: state.items }, null, 2);
}

export function exportVocabCsv(items: VocabItem[]): string {
  const escape = (value: string) => `"${(value ?? '').replace(/"/g, '""')}"`;
  const header = ['term', 'translation', 'sourceLang', 'targetLang', 'url', 'createdAt'];
  const rows = items.map((item) =>
    [item.term, item.translation, item.sourceLang, item.targetLang, item.url ?? '', new Date(item.createdAt).toISOString()]
      .map(escape)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}
