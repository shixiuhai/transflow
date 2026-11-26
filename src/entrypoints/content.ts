import { defineContentScript } from 'wxt/utils/define-content-script';
import type { RuntimeMessage, RuntimeResponse, TranslateSuccess } from '../core/messages';
import type { Settings } from '../core/settings/schema';
import { normalizeSettings } from '../core/settings/schema';
import { matchesShortcut } from '../core/shortcut';
import type { PageMode } from '../core/settings/schema';
import { collectBlocks, type PageBlock } from '../core/segment/collector';
import { buildBatches } from '../core/segment/batcher';
import { cacheGetMany, cacheSetMany } from '../core/cache/store';
import { RateLimiter, mapWithConcurrency } from '../core/schedule/limiter';
import { applyPalette, samplePalette, type Palette } from '../core/render/theme';
import { clearBlocks, countBlocks, ensureStyles, renderBlock } from '../core/render/blocks';

const HOST_ID = 'transflow-root';
const BATCH = { maxItems: 12, maxChars: 4000 };

interface SelectionInfo {
  text: string;
  rect: DOMRect;
  el: HTMLElement;
  range: Range;
}

interface PageJob {
  controller: AbortController;
  refs: Map<string, PageBlock[]>;
  total: number;
  done: number;
  failed: number;
  active: boolean;
}

function readSelection(): SelectionInfo | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString().trim();
  if (text.length < 1 || text.length > 5000) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const anchor = selection.anchorNode;
  const el = (anchor instanceof HTMLElement ? anchor : anchor?.parentElement) ?? document.body;
  if (el.closest('input, textarea, [contenteditable="true"]')) return null;
  return { text, rect, el, range: selection.getRangeAt(0).cloneRange() };
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest('input, textarea, [contenteditable="true"]'));
}

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .layer { position: fixed; inset: 0; pointer-events: none; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif; }
  .trigger {
    position: absolute; width: 22px; height: 22px; border-radius: 50%;
    background: #0F766E; color: #fff; font-size: 11px; line-height: 22px; text-align: center;
    cursor: pointer; pointer-events: auto; box-shadow: 0 2px 8px rgba(0,0,0,.18);
    user-select: none; opacity: 0; transform: translateY(2px); transition: opacity .12s ease, transform .12s ease;
  }
  .trigger.show { opacity: 1; transform: translateY(0); }
  .card {
    position: absolute; width: 340px; max-height: 60vh; overflow: auto;
    background: var(--tf-card-bg, rgba(255,255,255,.90));
    color: var(--tf-card-fg, #111318);
    border: 1px solid var(--tf-card-border, rgba(16,24,40,.08));
    border-radius: 14px;
    box-shadow: var(--tf-card-shadow, 0 12px 32px rgba(16,24,40,.14));
    backdrop-filter: var(--tf-card-blur, none);
    padding: 12px 14px 8px; pointer-events: auto;
  }
  .card::before {
    content: ""; position: absolute; width: 10px; height: 10px;
    background: var(--tf-card-bg, #fff);
    border: 1px solid var(--tf-card-border, rgba(16,24,40,.08));
    transform: rotate(45deg);
  }
  .card[data-placement="right"]::before { left: -5px; top: var(--tf-arrow-top, 50%); border-right: 0; border-top: 0; }
  .card[data-placement="bottom"]::before { top: -5px; left: var(--tf-arrow-left, 24px); border-right: 0; border-bottom: 0; }
  .card[data-placement="top"]::before { bottom: -5px; left: var(--tf-arrow-left, 24px); border-left: 0; border-top: 0; }

  .card[data-style="paper"] {
    --tf-card-bg: #FBF7EC;
    --tf-card-fg: #1E2A26;
    --tf-card-border: #E6DBC6;
    --tf-card-quote: #7B8A83;
    --tf-card-shadow: 0 16px 38px rgba(60,45,20,.20);
    --tf-card-blur: none;
  }
  .card[data-style="glass"] {
    --tf-card-bg: rgba(255,255,255,.62);
    --tf-card-fg: #111318;
    --tf-card-border: rgba(255,255,255,.55);
    --tf-card-quote: #5F6B76;
    --tf-card-shadow: 0 18px 48px rgba(16,24,40,.22);
    --tf-card-blur: blur(18px) saturate(1.25);
  }
  .card[data-style="contrast"] {
    --tf-card-bg: #0D1117;
    --tf-card-fg: #F3F6FA;
    --tf-card-border: rgba(255,255,255,.14);
    --tf-card-quote: #A9B4C0;
    --tf-card-shadow: 0 18px 48px rgba(0,0,0,.45);
    --tf-card-blur: none;
  }
  @media (prefers-color-scheme: dark) {
    .card[data-style="glass"] {
      --tf-card-bg: rgba(18,22,28,.62);
      --tf-card-fg: #F1F4F8;
      --tf-card-border: rgba(255,255,255,.14);
      --tf-card-quote: #A9B4C0;
    }
  }
  .card[data-style="paper"] .row, .card[data-style="glass"] .row, .card[data-style="contrast"] .row {
    border-top-color: var(--tf-card-border);
  }
  .card[data-style="paper"] .divider, .card[data-style="glass"] .divider, .card[data-style="contrast"] .divider {
    background: var(--tf-card-fg); opacity: .10;
  }
  .card[data-style="paper"] .quote, .card[data-style="glass"] .quote, .card[data-style="contrast"] .quote {
    color: var(--tf-card-quote);
  }
  .card[data-style="paper"] .meta, .card[data-style="glass"] .meta, .card[data-style="contrast"] .meta {
    color: var(--tf-card-quote); opacity: .8;
  }

  .quote {
    font-size: 11px; line-height: 1.5; color: #667085; margin-bottom: 8px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .divider { height: 1px; background: currentColor; opacity: .08; margin: 0 -14px 9px; }
  .text { font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; min-height: 20px; }
  .row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 8px -14px 0; padding: 6px 10px 2px; border-top: 1px solid rgba(16,24,40,.06); }
  .row button {
    border: 0; background: transparent; font: inherit; font-size: 11.5px; color: inherit; opacity: .72;
    padding: 5px 8px; border-radius: 6px; cursor: pointer;
  }
  .row button:hover { background: color-mix(in srgb, currentColor 10%, transparent); opacity: 1; }
  .spacer { flex: 1; }
  .meta { font-size: 10px; opacity: .55; font-variant-numeric: tabular-nums; }
  .skeleton { height: 12px; border-radius: 4px; background: currentColor; opacity: .08; margin: 6px 0; animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .16; } }
  .toast {
    position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(8px);
    background: #101828; color: #fff; font-size: 12px; padding: 9px 14px; border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,.2); opacity: 0; transition: opacity .2s ease, transform .2s ease;
    pointer-events: none; max-width: 70vw;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  .ambient {
    position: fixed; top: 0; left: 0; right: 0; height: 28px; display: flex; align-items: center; gap: 10px;
    padding: 0 12px; font-size: 11px; color: #0B5F59; background: rgba(15,118,110,.07);
    border-bottom: 1px solid rgba(15,118,110,.14); backdrop-filter: blur(8px);
    transform: translateY(-100%); transition: transform .18s ease; pointer-events: none; z-index: 5;
  }
  .ambient.show { transform: translateY(0); }
  .amb-mark { font-weight: 700; }
  .amb-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .amb-bar { width: 72px; height: 2px; border-radius: 2px; background: rgba(15,118,110,.18); overflow: hidden; flex: none; }
  .amb-bar i { display: block; height: 100%; width: 0; background: #0F766E; border-radius: 2px; transition: width .24s ease; }
  .amb-pct { font-variant-numeric: tabular-nums; opacity: .7; }
  .amb-spacer { flex: 1; }
  .amb-btn {
    pointer-events: auto; border: 0; background: transparent; color: #0B5F59; font: inherit; font-size: 11px;
    padding: 4px 8px; border-radius: 6px; cursor: pointer;
  }
  .amb-btn:hover { background: rgba(15,118,110,.12); }
  .ambient.dark { color: #7FE7D6; background: rgba(45,212,191,.08); border-bottom-color: rgba(45,212,191,.16); }
  .ambient.dark .amb-bar { background: rgba(45,212,191,.2); }
  .ambient.dark .amb-bar i { background: #2DD4BF; }
  .ambient.dark .amb-btn { color: #7FE7D6; }
  .ambient.compact {
    left: auto; right: 12px; top: 12px; width: auto; height: 30px;
    padding: 0 6px 0 10px; border: 1px solid rgba(15,118,110,.16); border-radius: 999px;
    transform: translateY(0); box-shadow: 0 6px 18px rgba(16,24,40,.12);
  }
  .ambient.compact .amb-mark, .ambient.compact .amb-bar, .ambient.compact .amb-pct, .ambient.compact .amb-spacer { display: none; }
  .ambient.compact .amb-text { max-width: 220px; }
  @media (prefers-reduced-motion: reduce) {
    .ambient, .card, .trigger, .toast { transition: none; }
  }
`;

function mount() {
  let host = document.getElementById(HOST_ID) as HTMLDivElement | null;
  if (host) return host.shadowRoot as ShadowRoot;

  host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const layer = document.createElement('div');
  layer.className = 'layer';
  shadow.append(style, layer);
  (document.body ?? document.documentElement).appendChild(host);
  return shadow;
}

function getLayer(shadow: ShadowRoot): HTMLElement {
  return shadow.querySelector('.layer') as HTMLElement;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: false,
  main() {
    const shadow = mount();
    const hostEl = document.getElementById(HOST_ID);
    const layer = getLayer(shadow);
    // Some sites (e.g. heavy news frameworks) strip unknown nodes during
    // hydration. Re-attach a detached host so the bubble can still render.
    window.setInterval(() => {
      if (hostEl && !hostEl.isConnected) (document.body ?? document.documentElement).appendChild(hostEl);
    }, 500);
    let trigger: HTMLButtonElement | null = null;
    let card: HTMLDivElement | null = null;
    let toastTimer: number | null = null;
    let ambient: HTMLDivElement | null = null;
    let pageJob: PageJob | null = null;
    let settingsCache: Settings | null = null;

    const hideTrigger = () => trigger?.classList.remove('show');

    const closeCard = () => {
      card?.remove();
      card = null;
      hostEl?.removeAttribute('data-tf-bubble');
      hostEl?.removeAttribute('data-tf-placement');
    };

    const showToast = (message: string) => {
      let el = layer.querySelector('.toast') as HTMLDivElement | null;
      if (!el) {
        el = document.createElement('div');
        el.className = 'toast';
        layer.appendChild(el);
      }
      el.textContent = message;
      requestAnimationFrame(() => el?.classList.add('show'));
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => el?.classList.remove('show'), 2600);
    };

    const getSettings = async (): Promise<Settings> => {
      const response = (await chrome.runtime.sendMessage({ type: 'get-settings' })) as RuntimeResponse<Settings>;
      if (!response.ok) throw new Error(response.error.message);
      settingsCache = response.data;
      return response.data;
    };

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings?.newValue) {
        settingsCache = normalizeSettings(changes.settings.newValue);
      }
    });
    void getSettings().catch(() => null);

    const sendTranslate = async (
      segments: { id: string; text: string }[],
      from: string,
      to: string,
    ): Promise<RuntimeResponse<TranslateSuccess>> =>
      (await chrome.runtime.sendMessage({ type: 'translate', segments, from, to })) as RuntimeResponse<TranslateSuccess>;


    // ---------- selection bubble ----------

    const positionCard = (target: HTMLDivElement, rect: DOMRect) => {
      const margin = 12;
      const gap = 12;
      const box = target.getBoundingClientRect();
      const width = box.width || 340;
      const height = box.height || 180;

      let placement: 'right' | 'bottom' | 'top' = 'right';
      let left = rect.right + gap;
      let top = rect.top + rect.height / 2 - height / 2;

      if (left + width > window.innerWidth - margin) {
        placement = 'bottom';
        left = rect.left;
        top = rect.bottom + gap;
        if (top + height > window.innerHeight - margin) {
          placement = 'top';
          top = rect.top - height - gap;
        }
      }

      left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
      top = Math.min(Math.max(margin, top), window.innerHeight - height - margin);
      target.dataset.placement = placement;
      hostEl?.setAttribute('data-tf-placement', placement);

      if (placement === 'right') {
        const arrow = Math.min(Math.max(14, rect.top + rect.height / 2 - top), height - 14);
        target.style.setProperty('--tf-arrow-top', `${arrow}px`);
      } else {
        const arrow = Math.min(Math.max(14, rect.left + Math.min(rect.width / 2, 48) - left), width - 14);
        target.style.setProperty('--tf-arrow-left', `${arrow}px`);
      }

      target.style.left = `${left}px`;
      target.style.top = `${top}px`;
    };

    const styleCardFromPalette = (target: HTMLElement, palette: Palette, style: 'auto' | 'paper' | 'glass' | 'contrast') => {
      target.dataset.style = style;
      if (style !== 'auto') {
        // Presets are defined in CSS; the host still needs the arrow to match.
        target.style.setProperty('--tf-bubble-bg', getComputedStyle(target).getPropertyValue('--tf-card-bg').trim() || '#FBF7EC');
        return;
      }
      const bubbleBg = `color-mix(in srgb, ${palette.bg} 88%, #0F766E 12%)`;
      target.style.setProperty('--tf-card-bg', bubbleBg);
      target.style.setProperty('--tf-card-fg', palette.fg);
      target.style.setProperty('--tf-card-border', `color-mix(in srgb, ${palette.fg} 14%, transparent)`);
      target.style.setProperty('--tf-card-quote', palette.trans);
      target.style.setProperty('--tf-card-shadow', '0 14px 36px rgba(16,24,40,.18)');
      target.style.setProperty('--tf-bubble-bg', bubbleBg);
      target.style.setProperty('--tf-bubble-border', `color-mix(in srgb, ${palette.fg} 14%, transparent)`);
      const quote = target.querySelector('.quote') as HTMLElement | null;
      if (quote) quote.style.color = palette.trans;
      const divider = target.querySelector('.divider') as HTMLElement | null;
      if (divider) divider.style.background = `color-mix(in srgb, ${palette.fg} 10%, transparent)`;
      const row = target.querySelector('.row') as HTMLElement | null;
      if (row) row.style.borderTopColor = `color-mix(in srgb, ${palette.fg} 8%, transparent)`;
    };

    const requestTranslation = async (text: string, rect: DOMRect, sourceEl: HTMLElement) => {
      hostEl?.setAttribute('data-tf-render', 'start');
      closeCard();
      hideTrigger();

      let anchor = rect;
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        sourceEl.scrollIntoView({ block: 'center' });
        anchor = sourceEl.getBoundingClientRect();
      }
      card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="quote"></div>
        <div class="divider"></div>
        <div class="text"><div class="skeleton" style="width:88%"></div><div class="skeleton" style="width:64%"></div></div>
        <div class="row"><button data-act="vocab" disabled>＋单词本</button><button data-act="speak-source">朗读原文</button><button data-act="speak-target">朗读译文</button><button data-act="copy">复制</button><button data-act="close">关闭</button><span class="spacer"></span><span class="meta">翻译中…</span></div>
      `;
      (card.querySelector('.quote') as HTMLElement).textContent = text;
      styleCardFromPalette(card, samplePalette(sourceEl), settingsCache?.selection.bubbleStyle ?? 'paper');
      layer.appendChild(card);
      hostEl?.setAttribute('data-tf-bubble', 'open');
      hostEl?.setAttribute('data-tf-render', 'appended');
      positionCard(card, anchor);

      try {
        const settings = await getSettings().catch(() => null);
        const target = settings?.selection.target || settings?.language.target || 'zh';
        const response = await sendTranslate([{ id: 'selection', text }], 'auto', target);
        if (!card) return;
        const textEl = card.querySelector('.text') as HTMLElement;
        const metaEl = card.querySelector('.meta') as HTMLElement;
        if (!response.ok) {
          textEl.textContent = response.error.message;
          metaEl.textContent = '失败';
          return;
        }
        const translated = response.data.results[0]?.text ?? '';
        textEl.textContent = translated;
        metaEl.textContent = `${response.data.provider} · ${response.data.latencyMs} ms`;
        positionCard(card, anchor);

        card.querySelector('[data-act="copy"]')?.addEventListener('click', async () => {
          await navigator.clipboard.writeText(translated);
          metaEl.textContent = '已复制';
        });
        const sourceLang = sourceEl.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang || 'en';
        const vocabBtn = card.querySelector('[data-act="vocab"]') as HTMLButtonElement | null;
        if (vocabBtn) {
          vocabBtn.disabled = false;
          vocabBtn.addEventListener('click', async () => {
            vocabBtn.disabled = true;
            vocabBtn.textContent = '加入中…';
            const context = (sourceEl.closest('p, li, article, blockquote') as HTMLElement | null)?.innerText ?? '';
            try {
              const response = (await chrome.runtime.sendMessage({
                type: 'vocab-add',
                payload: {
                  term: text,
                  translation: translated,
                  sourceLang,
                  targetLang: target,
                  context: context.slice(0, 500),
                  url: location.href,
                  title: document.title,
                },
              })) as { ok: boolean; data?: { added: boolean }; error?: { message: string } };
              if (response?.ok) {
                vocabBtn.textContent = response.data?.added ? '已加入' : '已更新';
                showToast(response.data?.added ? '已加入单词本' : '单词本已更新');
              } else {
                vocabBtn.disabled = false;
                vocabBtn.textContent = '＋单词本';
                showToast(response?.error?.message ?? '加入失败');
              }
            } catch (error) {
              vocabBtn.disabled = false;
              vocabBtn.textContent = '＋单词本';
              showToast(`加入失败：${(error as Error).message}`);
            }
          });
        }
        card.querySelector('[data-act="speak-source"]')?.addEventListener('click', () => {
          speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = sourceLang;
          speechSynthesis.speak(utterance);
        });
        card.querySelector('[data-act="speak-target"]')?.addEventListener('click', () => {
          speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(translated);
          utterance.lang = target;
          speechSynthesis.speak(utterance);
        });
        card.querySelector('[data-act="close"]')?.addEventListener('click', closeCard);
      } catch (error) {
        hostEl?.setAttribute('data-tf-render', `error:${(error as Error).message}`);
        if (!card) return;
        (card.querySelector('.text') as HTMLElement).textContent = `翻译失败：${(error as Error).message}`;
      }
    };

    let lastSelectionTrigger = 0;
    let lastKeyDebug: Record<string, unknown> | null = null;
    const translateSelection = (info: SelectionInfo) => {
      const now = Date.now();
      if (now - lastSelectionTrigger < 250) return;
      lastSelectionTrigger = now;
      void requestTranslation(info.text, info.rect, info.el);
    };

    const showTrigger = (info: SelectionInfo) => {
      if ((settingsCache?.selection.trigger ?? 'both') === 'shortcut') {
        hideTrigger();
        return;
      }
      if (!trigger) {
        trigger = document.createElement('button');
        trigger.className = 'trigger';
        trigger.textContent = '译';
        trigger.title = '翻译选中文本';
        trigger.addEventListener('mousedown', (event) => event.preventDefault());
        trigger.addEventListener('click', () => {
          const current = readSelection();
          if (current) translateSelection(current);
        });
        layer.appendChild(trigger);
      }
      trigger.style.left = `${Math.min(info.rect.right + 6, window.innerWidth - 30)}px`;
      trigger.style.top = `${Math.min(info.rect.bottom + 6, window.innerHeight - 30)}px`;
      requestAnimationFrame(() => trigger?.classList.add('show'));
    };

    // ---------- ambient bar ----------

    const ensureAmbient = (): HTMLDivElement => {
      if (ambient) return ambient;
      ambient = document.createElement('div');
      ambient.className = 'ambient';
      ambient.innerHTML = `
        <span class="amb-mark">译流</span>
        <span class="amb-text"></span>
        <span class="amb-bar"><i></i></span>
        <span class="amb-pct"></span>
        <span class="amb-spacer"></span>
        <button class="amb-btn"></button>
      `;
      layer.appendChild(ambient);
      return ambient;
    };

    const setAmbient = (text: string, percent: number, actionLabel: string, action: () => void) => {
      const el = ensureAmbient();
      el.classList.remove('compact');
      el.classList.toggle('dark', document.documentElement.classList.contains('tf-dark'));
      (el.querySelector('.amb-text') as HTMLElement).textContent = text;
      (el.querySelector('.amb-pct') as HTMLElement).textContent = `${Math.round(percent)}%`;
      (el.querySelector('.amb-bar i') as HTMLElement).style.width = `${Math.max(0, Math.min(100, percent))}%`;
      const button = el.querySelector('.amb-btn') as HTMLButtonElement;
      button.textContent = actionLabel;
      button.onclick = action;
      requestAnimationFrame(() => el.classList.add('show'));
    };

    const hideAmbient = (delay = 0) => {
      if (!ambient) return;
      ambient.classList.remove('compact');
      window.setTimeout(() => {
        ambient?.classList.remove('show');
      }, delay);
    };

    // ---------- page translation ----------

    const cancelPage = () => {
      if (!pageJob) return;
      pageJob.controller.abort();
      pageJob.active = false;
      const kept = pageJob.done;
      setAmbient(`已停止 · 保留 ${kept} 段`, 100, '还原', restorePage);
      window.setTimeout(() => ambient?.classList.add('compact'), 2500);
    };

    const restorePage = () => {
      pageJob?.controller.abort();
      const removed = clearBlocks();
      pageJob = null;
      hostEl?.removeAttribute('data-tf-page');
      hideAmbient();
      showToast(removed > 0 ? '已还原原文' : '没有可还原的内容');
    };

    const translatePage = async () => {
      if (pageJob?.active) {
        showToast('正在翻译中…');
        return;
      }
      if (countBlocks() > 0) {
        showToast('页面已翻译，请先还原');
        return;
      }

      let settings: Settings;
      try {
        settings = await getSettings();
      } catch (error) {
        showToast((error as Error).message);
        return;
      }

      const mode: PageMode = settings.page.mode;
      const target = settings.language.target || 'zh';
      const source = settings.language.source || 'auto';
      const { blocks, totalFound } = collectBlocks({ maxSegments: settings.page.maxSegments });
      if (blocks.length === 0) {
        showToast('页面中没有可翻译的内容');
        return;
      }

      ensureStyles();
      applyPalette(samplePalette(document.body), mode);

      const refs = new Map<string, PageBlock[]>();
      for (const block of blocks) {
        const list = refs.get(block.text);
        if (list) list.push(block);
        else refs.set(block.text, [block]);
      }
      const unique = Array.from(refs.keys()).map((text, index) => ({ id: `s${index}`, text }));
      const job: PageJob = {
        controller: new AbortController(),
        refs,
        total: unique.length,
        done: 0,
        failed: 0,
        active: true,
      };
      pageJob = job;
      hostEl?.setAttribute('data-tf-page', 'translating');

      const started = performance.now();
      setAmbient(`正在翻译 · 0/${unique.length} 段`, 0, '取消', cancelPage);

      const provider = settings.provider.active;
      const cached = await cacheGetMany(unique.map((s) => ({ provider, from: source, to: target, text: s.text })));
      const remaining: { id: string; text: string }[] = [];

      for (const segment of unique) {
        const hit = cached.get(segment.text);
        if (hit === undefined) {
          remaining.push(segment);
          continue;
        }
        for (const block of refs.get(segment.text) ?? []) renderBlock(block, hit, mode);
        job.done += 1;
      }
      if (job.done > 0) {
        setAmbient(`正在翻译 · ${job.done}/${job.total} 段`, (job.done / job.total) * 100, '取消', cancelPage);
      }

      const limiter = new RateLimiter(120);
      const batches = buildBatches(remaining, BATCH);

      await mapWithConcurrency(batches, 2, async (batch) => {
        if (job.controller.signal.aborted) return;
        try {
          await limiter.acquire(job.controller.signal);
          const response = await sendTranslate(batch, source, target);
          if (job.controller.signal.aborted) return;
          if (!response.ok) {
            job.failed += batch.length;
            return;
          }
          const pairs: { text: string; translation: string }[] = [];
          for (const result of response.data.results) {
            const segment = batch.find((s) => s.id === result.id);
            if (!segment) continue;
            for (const block of refs.get(segment.text) ?? []) renderBlock(block, result.text, mode);
            pairs.push({ text: segment.text, translation: result.text });
            job.done += 1;
          }
          await cacheSetMany(provider, source, target, pairs);
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
          job.failed += batch.length;
        } finally {
          if (!job.controller.signal.aborted) {
            setAmbient(
              `正在翻译 · ${job.done}/${job.total} 段`,
              (job.done / job.total) * 100,
              '取消',
              cancelPage,
            );
          }
        }
      });

      if (job.controller.signal.aborted) return;

      job.active = false;
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const label =
        job.failed > 0
          ? `完成 ${job.done} 段，${job.failed} 段失败`
          : `已翻译 ${job.done} 段 · ${seconds}s`;
      hostEl?.setAttribute('data-tf-page', 'translated');
      setAmbient(label, 100, '还原', restorePage);
      window.setTimeout(() => ambient?.classList.add('compact'), 2500);
      if (totalFound > blocks.length) {
        showToast(`内容较多，已翻译前 ${blocks.length} 段`);
      }
    };


    // ---------- input-box translation ----------

    const editableOf = (target: EventTarget | null): HTMLElement | null => {
      const el = target as HTMLElement | null;
      if (!el) return null;
      if (el instanceof HTMLTextAreaElement) return el;
      if (el instanceof HTMLInputElement) {
        const type = el.type.toLowerCase();
        if (['text', 'search', 'url', 'email', 'tel'].includes(type)) return el;
        return null;
      }
      return el.isContentEditable ? el : null;
    };

    const readEditable = (el: HTMLElement): string => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
      return el.innerText.replace(/\u00a0/g, ' ');
    };

    const writeEditable = (el: HTMLElement, text: string) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(el, text);
      } else {
        el.textContent = text;
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    };

    let lastReplace: { el: HTMLElement; original: string; at: number } | null = null;
    let lastSpaceAt = 0;
    let lastSpaceTarget: EventTarget | null = null;
    let lastSpaceTimer: number | null = null;

    const translateEditable = async (el: HTMLElement | null) => {
      if (!el) {
        showToast('请先聚焦一个输入框');
        return;
      }
      const original = readEditable(el).trim();
      if (original.length < 2) return;
      if (original.length > 5000) {
        showToast('输入内容超过 5000 字');
        return;
      }
      const settings = await getSettings().catch(() => null);
      const target = settings?.selection.target || settings?.language.target || 'zh';
      showToast('翻译中…');
      try {
        const response = await sendTranslate([{ id: 'input', text: original }], 'auto', target);
        if (!response.ok) {
          showToast(`翻译失败：${response.error.message}`);
          return;
        }
        const translated = response.data.results[0]?.text ?? '';
        if (!translated) return;
        lastReplace = { el, original: readEditable(el), at: Date.now() };
        writeEditable(el, translated);
        showToast('已翻译 · ⌘Z 撤销');
      } catch (error) {
        showToast(`翻译失败：${(error as Error).message}`);
      }
    };

    document.addEventListener('keydown', (event) => {
      const el = editableOf(event.target);
      if (el && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (lastReplace && lastReplace.el === el && Date.now() - lastReplace.at < 10000) {
          event.preventDefault();
          writeEditable(el, lastReplace.original);
          lastReplace = null;
          showToast('已撤销');
          return;
        }
      }

      if (event.key === ' ' && el) {
        const now = Date.now();
        if (lastSpaceTarget === el && now - lastSpaceAt < 400) {
          event.preventDefault();
          lastSpaceAt = 0;
          lastSpaceTarget = null;
          if (lastSpaceTimer) window.clearTimeout(lastSpaceTimer);
          void translateEditable(el);
          return;
        }
        lastSpaceAt = now;
        lastSpaceTarget = el;
      }
    });

    // ---------- events ----------

    document.addEventListener('mouseup', (event) => {
      if (isEditable(event.target)) return;
      window.setTimeout(() => {
        const info = readSelection();
        if (info) {
          showTrigger(info);
        } else {
          hideTrigger();
        }
      }, 100);
    });

    document.addEventListener('mousedown', (event) => {
      const path = event.composedPath();
      const inside = path.some((node) => node === hostEl || node === layer || node === trigger || node === card);
      if (!inside) {
        hideTrigger();
        closeCard();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideTrigger();
        closeCard();
      }
    });

    interface ShortcutPayload {
      key: string;
      code?: string;
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
      metaKey: boolean;
      isComposing?: boolean;
      /** Captured by the MAIN-world bridge before the page can clear the selection. */
      text?: string;
      rect?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
      at?: number;
    }

    const handleShortcutPayload = (
      payload: ShortcutPayload,
      originalEvent?: KeyboardEvent,
      target?: EventTarget | null,
    ) => {
      const effectiveTarget = target ?? document.activeElement;
      const bridgeInfo: SelectionInfo | null =
        payload.text && payload.rect
          ? {
              text: payload.text,
              rect: payload.rect as unknown as DOMRect,
              el: document.body,
              range: document.createRange(),
            }
          : null;
      lastKeyDebug = {
        key: payload.key,
        code: payload.code,
        target: (effectiveTarget as HTMLElement)?.tagName,
        editable: isEditable(effectiveTarget),
        composing: Boolean(payload.isComposing),
        prevented: originalEvent?.defaultPrevented ?? false,
        trigger: settingsCache?.selection.trigger,
        keys: settingsCache?.selection.keys,
        selectionLength: bridgeInfo?.text.length ?? window.getSelection()?.toString().trim().length ?? 0,
        via: originalEvent ? 'keydown' : 'bridge',
        at: Date.now(),
      };
      if (payload.isComposing || isEditable(effectiveTarget)) return;

      const settings = settingsCache;
      if (!settings) {
        // Settings may still be loading on a cold service worker. Re-check once
        // it arrives so an early keypress is not silently ignored.
        void getSettings()
          .then((loaded) => {
            if (!loaded.selection.enabled || loaded.selection.trigger === 'button') return;
            if (!matchesShortcut(payload, loaded.selection.keys)) return;
            const info = bridgeInfo ?? readSelection();
            if (info) translateSelection(info);
          })
          .catch(() => null);
        return;
      }
      if (!settings.selection.enabled) return;
      if (settings.selection.trigger === 'button') return;
      if (!matchesShortcut(payload, settings.selection.keys)) return;
      lastKeyDebug.matched = true;
      const info = bridgeInfo ?? readSelection();
      if (!info) return;
      originalEvent?.preventDefault();
      originalEvent?.stopPropagation();
      translateSelection(info);
    };

    window.addEventListener(
      'keydown',
      (event) => {
        handleShortcutPayload(
          {
            key: event.key,
            code: event.code,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            isComposing: event.isComposing,
          },
          event,
          event.target,
        );
      },
      true,
    );

    // Early MAIN-world bridge (see keybridge.ts): covers sites that stop keydown
    // propagation before isolated-world listeners run.
    let lastBridgeRaw = '';
    const checkBridge = () => {
      const raw = document.documentElement.dataset.tfKeyPress;
      if (!raw || raw === lastBridgeRaw) return;
      lastBridgeRaw = raw;
      try {
        const data = JSON.parse(raw) as ShortcutPayload;
        handleShortcutPayload(data, undefined, document.activeElement);
      } catch {
        // Ignore malformed page data.
      }
    };
    new MutationObserver(checkBridge).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-tf-key-press'],
    });
    window.setInterval(checkBridge, 150);

    // Wake the MV3 service worker on page load so settings/cache requests are warm.
    try {
      void chrome.runtime.sendMessage({ type: 'ping' });
    } catch {
      // Ignore when the extension context is invalidated (e.g. after an update).
    }

    chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
      void (async () => {
        if (message.type === 'selection-translate') {
          const info = readSelection();
          if (!info) showToast('请先选中要翻译的文本');
          else translateSelection(info);
          sendResponse({ ok: true, data: null });
          return;
        }
        if (message.type === 'page-translate') {
          await translatePage();
          sendResponse({ ok: true, data: null });
          return;
        }
        if (message.type === 'page-restore') {
          restorePage();
          sendResponse({ ok: true, data: null });
          return;
        }
        if (message.type === 'input-translate') {
          await translateEditable(editableOf(document.activeElement));
          sendResponse({ ok: true, data: null });
          return;
        }
        if (message.type === 'get-selection') {
          const text = window.getSelection()?.toString().trim() ?? '';
          sendResponse({ ok: true, data: { text } });
          return;
        }
        if (message.type === 'page-status') {
          sendResponse({
            ok: true,
            data: {
              translated: countBlocks() > 0,
              active: Boolean(pageJob?.active),
              done: pageJob?.done ?? 0,
              total: pageJob?.total ?? 0,
            },
          });
          return;
        }
        if (message.type === 'diagnose') {
          const selection = readSelection();
          sendResponse({
            ok: true,
            data: {
              version: chrome.runtime.getManifest().version,
              id: chrome.runtime.id,
              settings: settingsCache
                ? {
                    enabled: settingsCache.selection.enabled,
                    trigger: settingsCache.selection.trigger,
                    keys: settingsCache.selection.keys,
                  }
                : null,
              hasSelection: Boolean(selection),
              selectionLength: selection?.text.length ?? 0,
              href: location.href,
              lastKey: lastKeyDebug,
              bridgeAttr: document.documentElement.dataset.tfKeyPress ?? null,
              bridgeRaw: lastBridgeRaw,
              render: hostEl?.dataset.tfRender ?? null,
              hostConnected: Boolean(hostEl?.isConnected),
              hasCard: Boolean(card),
              bubbleAttr: hostEl?.dataset.tfBubble ?? null,
            },
          });
          return;
        }
        sendResponse({ ok: false, error: { code: 'unknown', message: '未知操作' } });
      })();
      return true;
    });
  },
});
