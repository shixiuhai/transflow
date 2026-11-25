import { describe, expect, it } from 'vitest';
import { buildBatches, uniqueByText } from '../../src/core/segment/batcher';

describe('batcher', () => {
  it('splits by item count', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ text: `item ${i}` }));
    expect(buildBatches(items, { maxItems: 2, maxChars: 100 })).toHaveLength(3);
  });

  it('splits by character budget', () => {
    const items = [{ text: 'a'.repeat(60) }, { text: 'b'.repeat(60) }, { text: 'c' }];
    const batches = buildBatches(items, { maxItems: 10, maxChars: 100 });
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(1);
  });

  it('keeps oversized items alone', () => {
    const items = [{ text: 'x'.repeat(200) }, { text: 'y' }];
    const batches = buildBatches(items, { maxItems: 10, maxChars: 100 });
    expect(batches[0]).toHaveLength(1);
    expect(batches[1]).toHaveLength(1);
  });

  it('dedupes by exact text preserving order', () => {
    const { items, index } = uniqueByText([{ text: 'a' }, { text: 'b' }, { text: 'a' }]);
    expect(items.map((i) => i.text)).toEqual(['a', 'b']);
    expect(index.get('a')).toBe(0);
  });
});
