import type { TranslationProvider } from '../types';
import { metaFor } from '../meta';

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** Deterministic offline provider used by tests and first-run demos. */
export function createMockProvider(): TranslationProvider {
  return {
    meta: { id: 'mock', ...metaFor('mock') },
    caps: { batch: 'array', maxItems: 50, maxChars: 5000, qps: 50, detect: false, glossary: false },
    async translate({ segments, from, to, signal }) {
      await wait(80, signal);
      return segments.map((s) => ({
        id: s.id,
        text: `〔模拟 ${from}→${to}〕${s.text}`,
      }));
    },
    async test(signal) {
      const started = performance.now();
      await wait(40, signal);
      return { ok: true, latencyMs: Math.round(performance.now() - started), detail: '〔模拟〕你好，世界' };
    },
  };
}
