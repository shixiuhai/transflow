import { defineBackground } from 'wxt/utils/define-background';
import type { RuntimeMessage, RuntimeResponse, TranslateSuccess } from '../core/messages';
import { loadSettings, saveSettings } from '../core/settings/store';
import { createProvider } from '../core/provider/registry';
import { ProviderError, type ProviderConfig } from '../core/provider/types';
import { protectTerms, restoreTerms } from '../core/glossary';
import { recordUsage } from '../core/usage';
import { addVocabItem, loadVocab, saveVocab } from '../core/vocab/store';
import { syncVocab } from '../core/vocab/sync';
import type { VocabState } from '../core/vocab/types';

const VOCAB_ALARM = 'transflow-vocab-sync';
let vocabSyncPromise: Promise<void> | null = null;

async function ensureVocabAlarm(): Promise<void> {
  const [state, settings] = await Promise.all([loadVocab(), loadSettings()]);
  const auto = state.sync.auto;
  const minutes = state.sync.intervalMinutes || settings.vocab?.syncIntervalMinutes || 360;
  await chrome.alarms.clear(VOCAB_ALARM);
  if (auto && state.uuid) {
    chrome.alarms.create(VOCAB_ALARM, { periodInMinutes: Math.max(1, minutes) });
  }
}

async function syncVocabNow(): Promise<VocabState> {
  if (vocabSyncPromise) {
    await vocabSyncPromise;
    return loadVocab();
  }
  const task = (async () => {
    const state = await loadVocab();
    const settings = await loadSettings();
    const next = await syncVocab(state, settings.vocab?.syncUrl);
    next.sync.auto = state.sync.auto;
    next.sync.intervalMinutes = state.sync.intervalMinutes;
    await saveVocab(next);
  })();
  vocabSyncPromise = task;
  try {
    await task;
  } catch (error) {
    const state = await loadVocab();
    state.sync.lastError = (error as Error).message;
    await saveVocab(state);
    throw error;
  } finally {
    vocabSyncPromise = null;
  }
  return loadVocab();
}

async function sendToActiveTab(message: unknown, frameId?: number): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return;
  try {
    if (frameId == null) await chrome.tabs.sendMessage(tab.id, message);
    else await chrome.tabs.sendMessage(tab.id, message, { frameId });
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
    void ensureVocabAlarm();
  });

  chrome.runtime.onStartup.addListener(() => {
    void ensureVocabAlarm();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === VOCAB_ALARM) {
      void syncVocabNow().catch(() => null);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes['tf:vocab:v1'] || changes.settings) void ensureVocabAlarm();
  });

  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === 'tf-selection') void sendToActiveTab({ type: 'selection-translate' }, info.frameId);
    if (info.menuItemId === 'tf-page') void sendToActiveTab({ type: 'page-translate' }, 0);
    if (info.menuItemId === 'tf-restore') void sendToActiveTab({ type: 'page-restore' }, 0);
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === 'translate-selection') void sendToActiveTab({ type: 'selection-translate' });
    if (command === 'translate-page') void sendToActiveTab({ type: 'page-translate' }, 0);
    if (command === 'translate-input') void sendToActiveTab({ type: 'input-translate' }, 0);
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
            const entries = settings.glossary?.entries ?? [];
            const protectedSegments = entries.length
              ? message.segments.map((segment) => ({ ...segment, text: protectTerms(segment.text, entries) }))
              : message.segments;

            for (const id of order) {
              try {
                const data = await translateOnce(
                  id,
                  settings.provider.configs[id] ?? {},
                  protectedSegments,
                  message.from,
                  message.to,
                );
                if (entries.length) {
                  data.results = data.results.map((result) => ({
                    ...result,
                    text: restoreTerms(result.text, entries),
                  }));
                }
                await recordUsage(id, message.segments.reduce((sum, segment) => sum + segment.text.length, 0));
                sendResponse({ ok: true, data } satisfies RuntimeResponse);
                return;
              } catch (error) {
                lastError = error;
                if (error instanceof ProviderError && error.code === 'missing_credentials') break;
              }
            }
            throw lastError ?? new Error('没有可用的翻译渠道');
          }

          case 'vocab-add': {
            const result = await addVocabItem(message.payload);
            await ensureVocabAlarm();
            sendResponse({
              ok: true,
              data: { added: result.added, item: result.item },
            } satisfies RuntimeResponse);
            return;
          }

          case 'vocab-sync-now': {
            const state = await syncVocabNow();
            await ensureVocabAlarm();
            sendResponse({
              ok: true,
              data: { items: state.items.length, lastSyncAt: state.sync.lastSyncAt },
            } satisfies RuntimeResponse);
            return;
          }

          case 'vocab-get':
            sendResponse({ ok: true, data: await loadVocab() } satisfies RuntimeResponse);
            return;

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
