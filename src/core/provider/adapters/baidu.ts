import type { TranslationResult } from '../../types';
import { toProviderCode } from '../../lang';
import { md5 } from '../sign/md5';
import {
  ProviderError,
  type ProviderConfig,
  type ProviderTranslateOptions,
  type TranslationProvider,
} from '../types';
import { metaFor } from '../meta';

const ENDPOINT = 'https://fanyi-api.baidu.com/api/trans/vip/translate';

const ERROR_MESSAGES: Record<string, string> = {
  '52001': '百度翻译请求超时，请重试',
  '52002': '百度翻译系统错误，请重试',
  '52003': '未授权用户，请检查 APPID',
  '54000': '缺少必填参数',
  '54001': '签名错误，请检查密钥',
  '54003': '访问频率受限，请降低并发',
  '54004': '账户余额不足',
  '54005': '长文本请求频繁，请稍后重试',
  '58000': '客户端 IP 非法',
  '58001': '不支持的语言方向',
  '58002': '服务已关闭',
  '90107': '认证未通过或未生效',
};

interface BaiduResponse {
  from?: string;
  to?: string;
  trans_result?: { src?: string; dst?: string }[];
  error_code?: string;
  error_msg?: string;
}

function messageFor(code: string, fallback: string): string {
  return ERROR_MESSAGES[code] ?? `${fallback}（${code}）`;
}

export function createBaiduProvider(config: ProviderConfig): TranslationProvider {
  const appId = config.appId?.trim() ?? '';
  const secret = config.apiKey?.trim() ?? '';

  async function one(text: string, from: string, to: string, signal?: AbortSignal): Promise<string> {
    if (!appId || !secret) {
      throw new ProviderError('missing_credentials', '请先填写百度翻译的 APPID 与密钥');
    }
    const salt = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const sign = md5(appId + text + salt + secret);
    const body = new URLSearchParams({
      q: text,
      from: toProviderCode(from, 'baidu'),
      to: toProviderCode(to, 'baidu'),
      appid: appId,
      salt,
      sign,
    });

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal,
    });
    const json = (await response.json().catch(() => null)) as BaiduResponse | null;
    const code = json?.error_code;
    if (!response.ok || (code && code !== '52000')) {
      throw new ProviderError(code ?? String(response.status), messageFor(code ?? '', '百度翻译请求失败'), response.status);
    }
    const dst = json?.trans_result?.[0]?.dst;
    if (typeof dst !== 'string') throw new ProviderError('bad_response', '百度翻译返回为空');
    return dst;
  }

  return {
    meta: { id: 'baidu', ...metaFor('baidu') },
    caps: { batch: 'single', maxItems: 1, maxChars: 5000, qps: 10, detect: true, glossary: false },
    async translate({ segments, from, to, signal }): Promise<TranslationResult[]> {
      const results: TranslationResult[] = [];
      // Baidu accepts one q per request; keep a small parallel window.
      const windowSize = 4;
      for (let i = 0; i < segments.length; i += windowSize) {
        const slice = segments.slice(i, i + windowSize);
        const texts = await Promise.all(slice.map((segment) => one(segment.text, from, to, signal)));
        slice.forEach((segment, index) => {
          results.push({ id: segment.id, text: texts[index] ?? '' });
        });
      }
      return results;
    },
    async test(signal) {
      const started = performance.now();
      const text = await one('Hello world', 'en', 'zh', signal);
      return { ok: Boolean(text), latencyMs: Math.round(performance.now() - started), detail: text };
    },
  };
}
