import { defineContentScript } from 'wxt/utils/define-content-script';

/**
 * Runs in the page's MAIN world at document_start, before site scripts. Some
 * sites call stopImmediatePropagation() on keydown, which prevents isolated
 * content scripts from seeing the key. This early listener forwards a small
 * payload via postMessage; the isolated content script does the real work.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    (window as unknown as { __transflowKeyBridge?: string }).__transflowKeyBridge = '1';
    window.addEventListener(
      'keydown',
      (event) => {
        (window as unknown as { __transflowKeySeen?: unknown }).__transflowKeySeen = {
          key: event.key,
          code: event.code,
          composing: event.isComposing,
          sel: window.getSelection()?.toString().trim().length ?? 0,
        };
        if (event.isComposing) return;
        const selection = window.getSelection();
        const text = selection?.toString().trim() ?? '';
        if (!selection || selection.isCollapsed || !text) return;
        let rect: { left: number; top: number; right: number; bottom: number; width: number; height: number } | null = null;
        try {
          const r = selection.getRangeAt(0).getBoundingClientRect();
          rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        } catch {
          rect = null;
        }
        const printable =
          event.key.length === 1 || event.code?.startsWith('Key') || event.code?.startsWith('Digit');
        if (!printable && !event.ctrlKey && !event.altKey && !event.metaKey) return;
        document.documentElement.dataset.tfKeyPress = JSON.stringify({
          key: event.key,
          text,
          rect,
          code: event.code,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          at: Date.now(),
        });
      },
      true,
    );
  },
});
