import type { PageMode } from '../settings/schema';

export interface Palette {
  bg: string;
  fg: string;
  dark: boolean;
  trans: string;
  rule: string;
  card: string;
}

type Rgba = [number, number, number, number];

export function parseColor(input: string): Rgba | null {
  const value = input.trim();
  if (!value || value === 'transparent') return null;

  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const raw = hex[1] ?? '';
    const expand = (part: string) => parseInt(part.length === 1 ? part + part : part, 16);
    if (raw.length === 3 || raw.length === 4) {
      return [expand(raw[0]!), expand(raw[1]!), expand(raw[2]!), raw.length === 4 ? expand(raw[3]!) / 255 : 1];
    }
    if (raw.length === 6 || raw.length === 8) {
      return [
        parseInt(raw.slice(0, 2), 16),
        parseInt(raw.slice(2, 4), 16),
        parseInt(raw.slice(4, 6), 16),
        raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1,
      ];
    }
  }

  const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i);
  if (!match) return null;
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4] === undefined ? 1 : Number(match[4]),
  ];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function mix(a: Rgba, b: Rgba, ratio: number): Rgba {
  const t = Math.min(1, Math.max(0, ratio));
  return [
    Math.round(a[0] * t + b[0] * (1 - t)),
    Math.round(a[1] * t + b[1] * (1 - t)),
    Math.round(a[2] * t + b[2] * (1 - t)),
    1,
  ];
}

function css(color: Rgba): string {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

const bgCache = new WeakMap<HTMLElement, Rgba>();
const paletteCache = new Map<string, Palette>();

function findBackground(el: HTMLElement): Rgba {
  const cached = bgCache.get(el);
  if (cached) return cached;

  const chain: HTMLElement[] = [];
  let node: HTMLElement | null = el;
  let result: Rgba = [255, 255, 255, 1];

  while (node) {
    const hit = bgCache.get(node);
    if (hit) {
      result = hit;
      break;
    }
    chain.push(node);
    const parsed = parseColor(getComputedStyle(node).backgroundColor);
    if (parsed && parsed[3] > 0.8) {
      result = parsed;
      break;
    }
    node = node.parentElement;
  }

  for (const item of chain) bgCache.set(item, result);
  return result;
}

export function samplePalette(el: HTMLElement): Palette {
  const bg = findBackground(el);
  const fg = parseColor(getComputedStyle(el).color) ?? [16, 20, 24, 1];
  const key = `${bg.join(',')}|${fg.join(',')}`;
  const cached = paletteCache.get(key);
  if (cached) return cached;

  const dark = luminance(bg) < 0.45;

  let trans = mix(fg, bg, 0.62);
  if (contrastRatio(trans, bg) < 4.5) trans = mix(fg, bg, 0.9);

  const accent: Rgba = dark ? [45, 212, 191, 1] : [15, 118, 110, 1];
  const rule = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${dark ? 0.5 : 0.38})`;
  const card = css(mix(accent, bg, 0.12));
  const palette: Palette = { bg: css(bg), fg: css(fg), dark, trans: css(trans), rule, card };
  if (paletteCache.size > 200) paletteCache.clear();
  paletteCache.set(key, palette);
  return palette;
}

export function applyPalette(palette: Palette, mode: PageMode): void {
  const root = document.documentElement;
  root.style.setProperty('--tf-bg', palette.bg);
  root.style.setProperty('--tf-fg', palette.fg);
  root.style.setProperty('--tf-trans-color', palette.trans);
  root.style.setProperty('--tf-rule-color', palette.rule);
  root.style.setProperty('--tf-card-bg', palette.card);
  root.classList.toggle('tf-dark', palette.dark);
  for (const m of ['blend', 'card', 'mask', 'replace']) {
    root.classList.toggle(`tf-mode-${m}`, m === mode);
  }
}
