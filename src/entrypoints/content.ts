import { defineContentScript } from 'wxt/utils/define-content-script';
import type { RuntimeMessage, RuntimeResponse, TranslateSuccess } from '../core/messages';
import type { Settings } from '../core/settings/schema';
import type { PageMode } from '../core/settings/schema';
import { collectBlocks, type PageBlock } from '../core/segment/collector';
import { buildBatches } from '../core/segment/batcher';
import { cacheGetMany, cacheSetMany } from '../core/cache/store';
import { RateLimiter, mapWithConcurrency } from '../core/schedule/limiter';
import { applyPalette, samplePalette } from '../core/render/theme';
import { clearBlocks, countBlocks, ensureStyles, renderBlock } from '../core/render/blocks';

const HOST_ID = 'transflow-root';
const BATCH = { maxItems: 12, maxChars: 4000 };

interface SelectionInfo {
  text: string;
  rect: DOMRect;
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
  return { text, rect };
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
    background: rgba(255,255,255,.86); backdrop-filter: blur(16px) saturate(1.2);
    border: 1px solid rgba(16,24,40,.08); border-radius: 14px;
    box-shadow: 0 12px 32px rgba(16,24,40,.14); padding: 12px 14px 8px;
    pointer-events: auto; color: #111318;
  }
  @media (prefers-color-scheme: dark) {
    .card { background: rgba(22,25,30,.86); border-color: rgba(255,255,255,.10); color: #F1F4F8; }
    .quote { color: #98A2B3; }
    .meta { color: #6B7684; }
    .row { border-color: rgba(255,255,255,.08); }
  }
  .quote {
    font-size: 11px; line-height: 1.5; color: #667085; margin-bottom: 8px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .divider { height: 1px; background: currentColor; opacity: .08; margin: 0 -14px 9px; }
  .text { font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; min-height: 20px; }
  .row { display: flex; align-items: center; gap: 4px; margin: 8px -14px 0; padding: 6px 10px 2px; border-top: 1px solid rgba(16,24,40,.06); }
  .row button {
    border: 0; background: transparent; font: inherit; font-size: 11.5px; color: inherit; opacity: .72;
    padding: 5px 8px; border-radius: 6px; cursor: pointer;
  }
  .row button:hover { background: rgba(15,118,110,.10); opacity: 1; color: #0F766E; }
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
  document.documentElement.appendChild(host);
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
    let trigger: HTMLButtonElement | null = null;
    let card: HTMLDivElement | null = null;
    let toastTimer: number | null = null;
    let ambient: HTMLDivElement | null = null;
    let pageJob: PageJob | null = null;

    const hideTrigger = () => trigger?.classList.remove('show');

    const closeCard = () => {
      card?.remove();
      card = null;
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
      return response.data;
    };

    const sendTranslate = async (
      segments: { id: string; text: string }[],
      from: string,
      to: string,
    ): Promise<RuntimeResponse<TranslateSuccess>> =>
      (await chrome.runtime.sendMessage({ type: 'translate', segments, from, to })) as RuntimeResponse<TranslateSuccess>;

    // ---------- selection bubble ----------

    const positionCard = (target: HTMLDivElement, rect: DOMRect) => {
      const margin = 8;
      const width = 340;
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
      let top = rect.bottom + margin;
      const estimated = 180;
      if (top + estimated > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - estimated - margin);
      }
      target.style.left = `${left}px`;
      target.style.top = `${top}px`;
    };

    const requestTranslation = async (text: string, rect: DOMRect) => {
      closeCard();
      hideTrigger();
      card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="quote"></div>
        <div class="divider"></div>
        <div class="text"><div class="skeleton" style="width:88%"></div><div class="skeleton" style="width:64%"></div></div>
        <div class="row"><button data-act="copy">复制</button><button data-act="close">关闭</button><span class="spacer"></span><span class="meta">翻译中…</span></div>
      `;
      (card.querySelector('.quote') as HTMLElement).textContent = text;
      positionCard(card, rect);
      layer.appendChild(card);

      try {
        const response = await sendTranslate([{ id: 'selection', text }], 'auto', 'zh');
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

        card.querySelector('[data-act="copy"]')?.addEventListener('click', async () => {
          await navigator.clipboard.writeText(translated);
          metaEl.textContent = '已复制';
        });
        card.querySelector('[data-act="close"]')?.addEventListener('click', closeCard);
      } catch (error) {
        if (!card) return;
        (card.querySelector('.text') as HTMLElement).textContent = `翻译失败：${(error as Error).message}`;
      }
    };

    const showTrigger = (info: SelectionInfo) => {
      if (!trigger) {
        trigger = document.createElement('button');
        trigger.className = 'trigger';
        trigger.textContent = '译';
        trigger.title = '翻译选中文本';
        trigger.addEventListener('mousedown', (event) => event.preventDefault());
        trigger.addEventListener('click', () => {
          const current = readSelection();
          if (current) void requestTranslation(current.text, current.rect);
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
      hideAmbient(5000);
    };

    const restorePage = () => {
      pageJob?.controller.abort();
      const removed = clearBlocks();
      pageJob = null;
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
      setAmbient(label, 100, '还原', restorePage);
      hideAmbient(8000);
      if (totalFound > blocks.length) {
        showToast(`内容较多，已翻译前 ${blocks.length} 段`);
      }
    };

    // ---------- events ----------

    document.addEventListener('mouseup', (event) => {
      if (isEditable(event.target)) return;
      window.setTimeout(() => {
        const info = readSelection();
        if (info) showTrigger(info);
        else hideTrigger();
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

    chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
      void (async () => {
        if (message.type === 'selection-translate') {
          const info = readSelection();
          if (!info) showToast('请先选中要翻译的文本');
          else await requestTranslation(info.text, info.rect);
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
          showToast('输入框翻译将在下一版本接入');
          sendResponse({ ok: true, data: null });
          return;
        }
        if (message.type === 'get-selection') {
          const text = window.getSelection()?.toString().trim() ?? '';
          sendResponse({ ok: true, data: { text } });
          return;
        }
        sendResponse({ ok: false, error: { code: 'unknown', message: '未知操作' } });
      })();
      return true;
    });
  },
});
