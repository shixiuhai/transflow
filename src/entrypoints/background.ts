import { defineBackground } from 'wxt/utils/define-background';
import type { RuntimeMessage, RuntimeResponse, TranslateSuccess } from '../core/messages';
import { loadSettings, saveSettings } from '../core/settings/store';
import { createProvider } from '../core/provider/registry';
import { ProviderError, type ProviderConfig } from '../core/provider/types';

async function sendToActiveTab(message: unknown): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // The active tab may be a chrome:// page or not yet injected.
  }
}

async function translateOnce(
  id: string,
  config: ProviderConfig,
  segments: { id: string; text: string }[],
  from: string,
  to: string,
): Promise<TranslateSuccess> {
  const provider = createProvider(id, config);
  const started = performance.now();
  const results = await provider.translate({ segments, from, to });
  return {
    results: results.map((r) => ({ id: r.id, text: r.text })),
    provider: id,
    latencyMs: Math.round(performance.now() - started),
  };
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'tf-selection', title: '翻译选中文本', contexts: ['selection'] });
      chrome.contextMenus.create({ id: 'tf-page', title: '翻译整页', contexts: ['page'] });
      chrome.contextMenus.create({ id: 'tf-restore', title: '还原原文', contexts: ['page'] });
    });
  });

  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === 'tf-selection') void sendToActiveTab({ type: 'selection-translate' });
    if (info.menuItemId === 'tf-page') void sendToActiveTab({ type: 'page-translate' });
    if (info.menuItemId === 'tf-restore') void sendToActiveTab({ type: 'page-restore' });
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === 'translate-selection') void sendToActiveTab({ type: 'selection-translate' });
    if (command === 'translate-page') void sendToActiveTab({ type: 'page-translate' });
    if (command === 'translate-input') void sendToActiveTab({ type: 'input-translate' });
  });

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    void (async () => {
      try {
        switch (message.type) {
          case 'ping':
            sendResponse({ ok: true, data: 'pong' } satisfies RuntimeResponse);
            return;

          case 'get-settings':
            sendResponse({ ok: true, data: await loadSettings() } satisfies RuntimeResponse);
            return;

          case 'save-settings':
            sendResponse({ ok: true, data: await saveSettings(message.patch) } satisfies RuntimeResponse);
            return;

          case 'test-provider': {
            const settings = await loadSettings();
            const config = message.config ?? settings.provider.configs[message.id] ?? {};
            const provider = createProvider(message.id, config);
            const result = await provider.test();
            sendResponse({ ok: true, data: result } satisfies RuntimeResponse);
            return;
          }

          case 'translate': {
            const settings = await loadSettings();
            const order = [settings.provider.active, ...settings.provider.fallback].filter(Boolean);
            let lastError: unknown = null;
            for (const id of order) {
              try {
                const data = await translateOnce(
                  id,
                  settings.provider.configs[id] ?? {},
                  message.segments,
                  message.from,
                  message.to,
                );
                sendResponse({ ok: true, data } satisfies RuntimeResponse);
                return;
              } catch (error) {
                lastError = error;
                if (error instanceof ProviderError && error.code === 'missing_credentials') break;
              }
            }
            throw lastError ?? new Error('没有可用的翻译渠道');
          }

          case 'page-translate':
          case 'page-restore':
          case 'selection-translate':
          case 'input-translate':
            await sendToActiveTab(message);
            sendResponse({ ok: true, data: null } satisfies RuntimeResponse);
            return;

          default:
            sendResponse({ ok: false, error: { code: 'unknown', message: '未知操作' } } satisfies RuntimeResponse);
        }
      } catch (error) {
        const err = error as Error & { code?: string };
        sendResponse({
          ok: false,
          error: { code: err.code ?? 'error', message: err.message },
        } satisfies RuntimeResponse);
      }
    })();
    return true;
  });
});
