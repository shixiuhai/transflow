import type { TranslationResult } from '../../types';
import {
  ProviderError,
  type ProviderConfig,
  type ProviderTranslateOptions,
  type TranslationProvider,
} from '../types';
import { metaFor } from '../meta';

const SYSTEM_PROMPT = [
  'You are a professional translator embedded in a reading tool.',
  'Translate every segment into the target language.',
  'Preserve meaning, tone and inline placeholders such as ⟦0⟧ exactly.',
  'Return ONLY JSON: {"translations":[{"id":"<id>","text":"<translation>"}]}',
].join(' ');

function buildUserPrompt(opts: ProviderTranslateOptions): string {
  const glossary = opts.glossary?.length
    ? `\nGlossary (must follow):\n${opts.glossary.map((g) => `${g.source} => ${g.target}`).join('\n')}`
    : '';
  const segments = opts.segments.map((s) => ({ id: s.id, text: s.text }));
  return `Target language: ${opts.to}\nDomain: ${opts.domain ?? 'general'}${glossary}\nSegments:\n${JSON.stringify(segments)}`;
}

export function createOpenAIProvider(config: ProviderConfig): TranslationProvider {
  const baseUrl = (config.baseUrl?.trim() || 'https://api.deepseek.com/v1').replace(/\/$/, '');
  const apiKey = config.apiKey?.trim() ?? '';
  const model = config.model?.trim() || 'deepseek-chat';

  async function request(opts: ProviderTranslateOptions): Promise<TranslationResult[]> {
    if (!apiKey) throw new ProviderError('missing_credentials', '请先填写 API Key');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(opts) },
        ],
      }),
      signal: opts.signal,
    });

    if (!response.ok) {
      throw new ProviderError(String(response.status), `模型接口请求失败（${response.status}）`, response.status);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? '';
    let parsed: { translations?: { id?: string; text?: string }[] } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
      return opts.segments.map((s, i) => ({ id: s.id, text: lines[i] ?? s.text }));
    }

    const byId = new Map((parsed.translations ?? []).map((t) => [String(t.id), String(t.text ?? '')]));
    return opts.segments.map((s) => ({ id: s.id, text: byId.get(s.id) ?? s.text }));
  }

  return {
    meta: { id: 'openai', ...metaFor('openai') },
    caps: { batch: 'array', maxItems: 30, maxChars: 6000, qps: 3, detect: false, glossary: true },
    translate: request,
    async test(signal) {
      const started = performance.now();
      const result = await request({
        segments: [{ id: 't', text: 'Hello world' }],
        from: 'en',
        to: 'zh',
        signal,
      });
      return {
        ok: Boolean(result[0]?.text),
        latencyMs: Math.round(performance.now() - started),
        detail: result[0]?.text,
      };
    },
  };
}
