// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { collectBlocks } from '../../src/core/segment/collector';
import { clearBlocks, renderBlock } from '../../src/core/render/blocks';

describe('block rendering', () => {
  it('inserts a sibling block in blend mode and can be removed', () => {
    document.documentElement.innerHTML = '<body><p id="a">Hello</p></body>';
    const { blocks } = collectBlocks();
    renderBlock(blocks[0]!, '你好', 'blend');
    expect(document.querySelector('.tf-block')?.textContent).toBe('你好');
    expect(document.getElementById('a')?.nextElementSibling?.className).toBe('tf-block');
    expect(clearBlocks()).toBeGreaterThan(0);
    expect(document.querySelector('.tf-block')).toBeNull();
  });

  it('replaces text and restores it', () => {
    document.documentElement.innerHTML = '<body><p id="a">Hello</p></body>';
    const { blocks } = collectBlocks();
    renderBlock(blocks[0]!, '你好', 'replace');
    expect(document.getElementById('a')?.textContent).toBe('你好');
    clearBlocks();
    expect(document.getElementById('a')?.textContent).toBe('Hello');
  });
});
