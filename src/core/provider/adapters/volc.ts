import type { TranslationResult } from '../../types';
import { toProviderCode } from '../../lang';
import { signVolcRequest } from '../sign/volc';
import {
  ProviderError,
  type ProviderConfig,
  type ProviderTestResult,
  type ProviderTranslateOptions,
  type TranslationProvider,
} from '../types';
import { metaFor } from '../meta';

const HOST = 'translate.volcengineapi.com';
const REGION = 'cn-north-1';
const SERVICE = 'translate';
const ENDPOINT = `https://${HOST}/`;
const QUERY = { Action: 'TranslateText', Version: '2020-06-01' } as const;

interface VolcTranslation {
  Translation?: string;
  DetectedSourceLanguage?: string;
}

interface VolcResponse {
  TranslationList?: VolcTranslation[];
  ResponseMetadata?: {
    Error?: { Code?: string; Message?: string } | null;
    RequestId?: string;
  };
}

function chunk(items: ProviderTranslateOptions['segments']): ProviderTranslateOptions['segments'][] {
  const batches: ProviderTranslateOptions['segments'][] = [];
  let current: ProviderTranslateOptions['segments'] = [];
  let chars = 0;
  for (const item of items) {
    const len = item.text.length;
    if (current.length > 0 && (current.length >= 16 || chars + len > 5000)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += len;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function createVolcProvider(config: ProviderConfig): TranslationProvider {
  const accessKey = config.accessKey?.trim() ?? '';
  const secretKey = config.secretKey?.trim() ?? '';

  async function request(
    segments: ProviderTranslateOptions['segments'],
    from: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<TranslationResult[]> {
    if (!accessKey || !secretKey) {
      throw new ProviderError('missing_credentials', '请先在设置中填写火山引擎的 Access Key 与 Secret Key');
    }

    const body = JSON.stringify({
      ...(from !== 'auto' ? { SourceLanguage: toProviderCode(from, 'volc') } : {}),
      TargetLanguage: toProviderCode(to, 'volc'),
      TextList: segments.map((s) => s.text),
    });

    const signed = await signVolcRequest({
      method: 'POST',
      host: HOST,
      path: '/',
      query: { ...QUERY },
      body,
      credentials: { accessKey, secretKey },
      region: REGION,
      service: SERVICE,
    });

    const response = await fetch(ENDPOINT + '?' + new URLSearchParams(QUERY).toString(), {
      method: 'POST',
      headers: signed.headers,
      body,
      signal,
    });

    const json = (await response.json().catch(() => null)) as VolcResponse | null;
    const error = json?.ResponseMetadata?.Error;
    if (!response.ok || error) {
      const code = error?.Code ?? String(response.status);
      const message = error?.Message ?? `火山引擎请求失败（${response.status}）`;
      throw new ProviderError(code, message, response.status);
    }

    const list = json?.TranslationList ?? [];
    if (list.length !== segments.length) {
      throw new ProviderError('bad_response', '火山引擎返回的段落数量与请求不一致');
    }

    return segments.map((segment, i) => ({
      id: segment.id,
      text: list[i]?.Translation ?? '',
      detected: list[i]?.DetectedSourceLanguage,
    }));
  }

  return {
    meta: { id: 'volc', ...metaFor('volc') },
    caps: { batch: 'array', maxItems: 16, maxChars: 5000, qps: 10, detect: true, glossary: false },
    async translate({ segments, from, to, signal }) {
      const out: TranslationResult[] = [];
      for (const batch of chunk(segments)) {
        out.push(...(await request(batch, from, to, signal)));
      }
      return out;
    },
    async test(signal): Promise<ProviderTestResult> {
      const started = performance.now();
      const result = await request([{ id: 't', text: 'Hello world' }], 'en', 'zh', signal);
      return {
        ok: Boolean(result[0]?.text),
        latencyMs: Math.round(performance.now() - started),
        detail: result[0]?.text,
      };
    },
  };
}
