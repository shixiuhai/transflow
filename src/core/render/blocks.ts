import type { PageBlock } from '../segment/collector';
import type { PageMode } from '../settings/schema';

const STYLE_ID = 'tf-style';
const BLOCK_CLASS = 'tf-block';

const CSS = `
.${BLOCK_CLASS} {
  font-family: inherit;
  font-size: 0.96em;
  line-height: inherit;
  letter-spacing: inherit;
  color: var(--tf-trans-color, #59636f);
  margin: 6px 0 14px;
  padding: 0 0 0 12px;
  border-left: 2px solid var(--tf-rule-color, rgba(15, 118, 110, 0.38));
  contain: content;
  white-space: pre-wrap;
  word-break: break-word;
  animation: tf-in 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.tf-mode-card .${BLOCK_CLASS} {
  background: var(--tf-card-bg, rgba(15, 118, 110, 0.08));
  border-left: 0;
  border-radius: 10px;
  padding: 10px 12px;
}
.tf-mode-mask .${BLOCK_CLASS} {
  filter: blur(4px);
  transition: filter 120ms ease;
  cursor: default;
}
.tf-mode-mask .${BLOCK_CLASS}:hover,
.tf-mode-mask .${BLOCK_CLASS}:focus {
  filter: none;
}
@keyframes tf-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .${BLOCK_CLASS} { animation: none; }
}
`;

export function ensureStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.documentElement.appendChild(style);
}

function removeSiblingBlock(el: HTMLElement): void {
  const next = el.nextElementSibling;
  if (next?.classList.contains(BLOCK_CLASS)) next.remove();
}

export function renderBlock(block: PageBlock, translation: string, mode: PageMode): void {
  const { el } = block;
  if (mode === 'replace') {
    if (el.dataset.tfOriginal === undefined) el.dataset.tfOriginal = el.textContent ?? '';
    el.textContent = translation;
    el.dataset.tfTranslated = '1';
    return;
  }

  removeSiblingBlock(el);
  const node = document.createElement('div');
  node.className = BLOCK_CLASS;
  node.dataset.tfId = block.id;
  node.dir = 'auto';
  node.textContent = translation;

  if (el.tagName === 'TD' || el.tagName === 'TH') {
    el.appendChild(node);
  } else {
    el.insertAdjacentElement('afterend', node);
  }
  el.dataset.tfTranslated = '1';
}

export function clearBlocks(doc: Document = document): number {
  const nodes = Array.from(doc.querySelectorAll(`.${BLOCK_CLASS}`));
  for (const node of nodes) node.remove();

  let restored = 0;
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[data-tf-original]'))) {
    el.textContent = el.dataset.tfOriginal ?? '';
    restored += 1;
    delete el.dataset.tfOriginal;
    delete el.dataset.tfTranslated;
  }
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[data-tf-translated="1"]'))) {
    delete el.dataset.tfTranslated;
  }
  return nodes.length + restored;
}

export function countBlocks(doc: Document = document): number {
  return doc.querySelectorAll(`.${BLOCK_CLASS}`).length;
}
