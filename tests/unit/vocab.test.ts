import { describe, expect, it } from 'vitest';
import { createEmptyVocab, exportVocabCsv, normalizeTerm } from '../../src/core/vocab/store';
import { mergeVocab } from '../../src/core/vocab/sync';
import type { VocabItem, VocabRemote } from '../../src/core/vocab/types';

const item = (id: string, translation: string, updatedAt: number): VocabItem => ({
  id,
  term: 'serendipity',
  translation,
  sourceLang: 'en',
  targetLang: 'zh',
  createdAt: 1000,
  updatedAt,
});

describe('vocab', () => {
  it('normalizes terms for dedupe', () => {
    expect(normalizeTerm('  Hello   World ')).toBe('hello world');
  });

  it('remote newer item wins in merge', () => {
    const local = createEmptyVocab('550e8400-e29b-41d4-a716-446655440000');
    local.items = [item('a', '意外发现', 1000)];
    const remote: VocabRemote = {
      protocol: 1,
      revision: 2,
      serverTime: 2000,
      items: [item('a', '机缘巧合', 2000)],
      deleted: {},
    };
    const merged = mergeVocab(local, remote);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]?.translation).toBe('机缘巧合');
  });

  it('tombstone removes older item', () => {
    const local = createEmptyVocab('550e8400-e29b-41d4-a716-446655440000');
    local.items = [item('a', '意外发现', 1000)];
    const remote: VocabRemote = {
      protocol: 1,
      revision: 2,
      serverTime: 2000,
      items: [item('a', '意外发现', 1000)],
      deleted: { a: 1500 },
    };
    const merged = mergeVocab(local, remote);
    expect(merged.items).toHaveLength(0);
    expect(merged.deleted.a).toBe(1500);
  });

  it('exports CSV with escaped quotes', () => {
    const csv = exportVocabCsv([{ ...item('a', 'say "hi"', 1000), term: 'he said "hi"' }]);
    expect(csv).toContain('"he said ""hi"""');
    expect(csv).toContain('"say ""hi"""');
  });
});
