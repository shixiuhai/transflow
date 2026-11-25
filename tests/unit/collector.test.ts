// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { collectBlocks, normalizeText } from '../../src/core/segment/collector';

describe('block collector', () => {
  it('collects paragraphs and headings, skipping code and notranslate', () => {
    document.body.innerHTML = `
      <article>
        <h1>Hello world</h1>
        <p>First paragraph.</p>
        <pre><code>const a = 1;</code></pre>
        <p class="notranslate">Do not translate me.</p>
        <ul><li>Item one</li><li>Item two</li></ul>
      </article>
    `;
    const { blocks } = collectBlocks();
    const texts = blocks.map((b) => b.text);
    expect(texts).toContain('Hello world');
    expect(texts).toContain('First paragraph.');
    expect(texts).toContain('Item one');
    expect(texts).not.toContain('const a = 1;');
    expect(texts).not.toContain('Do not translate me.');
  });

  it('prefers leaf blocks over nested ones', () => {
    document.body.innerHTML = `<ul><li><p>Nested text</p></li></ul>`;
    const { blocks } = collectBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.text).toBe('Nested text');
  });

  it('caps the number of segments but reports total', () => {
    document.body.innerHTML = Array.from({ length: 5 }, (_, i) => `<p>Paragraph ${i}</p>`).join('');
    const { blocks, totalFound } = collectBlocks({ maxSegments: 2 });
    expect(blocks).toHaveLength(2);
    expect(totalFound).toBe(5);
  });

  it('normalizes whitespace', () => {
    expect(normalizeText('  a\n\t b  ')).toBe('a b');
  });
});
