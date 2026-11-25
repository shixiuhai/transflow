import { defineContentScript } from 'wxt/utils/define-content-script';
import type { RuntimeMessage, RuntimeResponse, TranslateSuccess } from '../core/messages';

const HOST_ID = 'transflow-root';

interface SelectionInfo {
  text: string;
  rect: DOMRect;
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
    background: color-mix(in srgb, #ffffff 86%, transparent);
    backdrop-filter: blur(16px) saturate(1.2);
    border: 1px solid rgba(16,24,40,.08); border-radius: 14px;
    box-shadow: 0 12px 32px rgba(16,24,40,.14); padding: 12px 14px 8px;
    pointer-events: auto; color: #111318;
  }
  @media (prefers-color-scheme: dark) {
    .card { background: color-mix(in srgb, #16191e 86%, transparent); border-color: rgba(255,255,255,.10); color: #F1F4F8; }
    .quote { color: #98A2B3; }
    .meta { color: #6B7684; }
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

    const positionCard = (target: HTMLDivElement, rect: DOMRect) => {
      const margin = 8;
      const width = 340;
      let left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
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

      const message: RuntimeMessage = {
        type: 'translate',
        segments: [{ id: 'selection', text }],
        from: 'auto',
        to: 'zh',
      };

      try {
        const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse<TranslateSuccess>;
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
          if (!info) {
            showToast('请先选中要翻译的文本');
          } else {
            await requestTranslation(info.text, info.rect);
          }
          sendResponse({ ok: true, data: null });
          return;
        }
        if (message.type === 'page-translate' || message.type === 'page-restore') {
          showToast('整页翻译与还原将在下一版本接入');
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
