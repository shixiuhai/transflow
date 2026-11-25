/**
 * Block-level collector. Translations are attached to block elements (p, li,
 * headings, cells...) rather than raw text nodes so sentences keep context and
 * the host layout is not rewritten node by node.
 */

export interface PageBlock {
  id: string;
  el: HTMLElement;
  text: string;
}

export interface CollectOptions {
  root?: ParentNode;
  maxSegments?: number;
}

export interface CollectResult {
  blocks: PageBlock[];
  totalFound: number;
}

const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, dd, dt, td, th, summary';

const SKIP_SELECTOR = [
  'pre',
  'code',
  'kbd',
  'samp',
  'var',
  'textarea',
  'input',
  'select',
  'option',
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  'math',
  'template',
  '[contenteditable]:not([contenteditable="false"])',
  '[translate="no"]',
  '.notranslate',
  '[aria-hidden="true"]',
].join(',');

export function normalizeText(input: string): string {
  return input.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function isHidden(el: HTMLElement): boolean {
  if (el.hidden) return true;
  const style = getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
}

function hasLetter(text: string): boolean {
  return /\p{L}/u.test(text);
}

export function collectBlocks(options: CollectOptions = {}): CollectResult {
  const root = options.root ?? document.body;
  if (!root) return { blocks: [], totalFound: 0 };
  const maxSegments = options.maxSegments ?? 2000;
  const all = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));

  // Prefer leaf blocks: if a candidate contains another candidate, the inner one wins.
  const set = new Set(all);
  const leaves = all.filter((el) => {
    for (const child of Array.from(el.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))) {
      if (set.has(child)) return false;
    }
    return true;
  });

  const blocks: PageBlock[] = [];
  let totalFound = 0;

  for (const el of leaves) {
    if (el.closest(SKIP_SELECTOR)) continue;
    if (el.dataset.tfTranslated === '1' || el.dataset.tfSkip === '1') continue;
    if (el.isContentEditable) continue;
    if (isHidden(el)) continue;

    const text = normalizeText(el.textContent ?? '');
    if (text.length < 2 || !hasLetter(text)) continue;

    totalFound += 1;
    if (blocks.length >= maxSegments) continue;
    blocks.push({ id: `b${blocks.length}`, el, text });
  }

  return { blocks, totalFound };
}
