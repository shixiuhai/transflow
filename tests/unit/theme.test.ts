// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor, samplePalette } from '../../src/core/render/theme';

function makePage(bg: string, fg: string) {
  document.body.innerHTML = `<article style="background:${bg};color:${fg}"><p id="p">Hello world</p></article>`;
  return document.getElementById('p') as HTMLElement;
}

describe('theme sampling', () => {
  it('parses rgb and rgba', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3, 0.5]);
    expect(parseColor('transparent')).toBeNull();
  });

  it('detects dark pages', () => {
    const el = makePage('#0e131a', '#e7ebf0');
    const palette = samplePalette(el);
    expect(palette.dark).toBe(true);
  });

  it('keeps translation contrast readable on light pages', () => {
    const el = makePage('#ffffff', '#16181d');
    const palette = samplePalette(el);
    const ratio = contrastRatio(parseColor(palette.trans)!, parseColor(palette.bg)!);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps translation contrast readable on dark pages', () => {
    const el = makePage('#0e131a', '#e7ebf0');
    const palette = samplePalette(el);
    const ratio = contrastRatio(parseColor(palette.trans)!, parseColor(palette.bg)!);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
