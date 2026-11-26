import type { ProviderConfig } from '../provider/types';

export interface OpenAIBalance {
  currency: string;
  total: string;
  granted: string;
  toppedUp: string;
}

export interface OfficialUsage {
  provider: 'openai' | 'deepseek';
  kind: 'usage' | 'balance';
  month: string;
  inputTokens?: number;
  outputTokens?: number;
  requests?: number;
  cost?: number;
  currency?: string;
  legacy?: boolean;
  balances?: OpenAIBalance[];
  available?: boolean;
  fetchedAt: number;
}

export class OfficialUsageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OfficialUsageError';
  }
}

interface OpenAIBucket {
  results?: { input_tokens?: number; output_tokens?: number; num_model_requests?: number }[];
}

export function parseOpenAIUsage(json: { data?: OpenAIBucket[] }): {
  inputTokens: number;
  outputTokens: number;
  requests: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let requests = 0;
  for (const bucket of json.data ?? []) {
    for (const row of bucket.results ?? []) {
      inputTokens += row.input_tokens ?? 0;
      outputTokens += row.output_tokens ?? 0;
      requests += row.num_model_requests ?? 0;
    }
  }
  return { inputTokens, outputTokens, requests };
}

interface OpenAICostBucket {
  results?: { amount?: { value?: number; currency?: string } }[];
}

export function parseOpenAICosts(json: { data?: OpenAICostBucket[] }): { cost: number; currency: string } {
  let cost = 0;
  let currency = 'USD';
  for (const bucket of json.data ?? []) {
    for (const row of bucket.results ?? []) {
      cost += row.amount?.value ?? 0;
      if (row.amount?.currency) currency = row.amount.currency;
    }
  }
  return { cost, currency };
}

export function parseDeepSeekBalance(json: {
  is_available?: boolean;
  balance_infos?: { currency?: string; total_balance?: string; granted_balance?: string; topped_up_balance?: string }[];
}): { available: boolean; balances: OpenAIBalance[] } {
  return {
    available: Boolean(json.is_available),
    balances: (json.balance_infos ?? []).map((row) => ({
      currency: row.currency ?? 'CNY',
      total: row.total_balance ?? '0',
      granted: row.granted_balance ?? '0',
      toppedUp: row.topped_up_balance ?? '0',
    })),
  };
}

function monthStartSeconds(): number {
  const now = new Date();
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
}

async function getJson(url: string, apiKey: string): Promise<Response> {
  return fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
}

export async function fetchOfficialUsage(config: ProviderConfig): Promise<OfficialUsage> {
  const apiKey = config.apiKey?.trim() ?? '';
  if (!apiKey) throw new OfficialUsageError('missing_credentials', '请先配置 API Key');
  const base = (config.baseUrl?.trim() || 'https://api.deepseek.com/v1').replace(/\/$/, '');
  let host = '';
  try {
    host = new URL(base).hostname;
  } catch {
    throw new OfficialUsageError('bad_base_url', 'Base URL 格式不正确');
  }
  const month = new Date().toISOString().slice(0, 7);

  if (host.endsWith('deepseek.com')) {
    const response = await getJson('https://api.deepseek.com/user/balance', apiKey);
    if (!response.ok) {
      throw new OfficialUsageError(
        String(response.status),
        response.status === 401 ? 'DeepSeek API Key 无效或已过期' : `DeepSeek 余额接口失败（${response.status}）`,
      );
    }
    const json = (await response.json()) as Parameters<typeof parseDeepSeekBalance>[0];
    const parsed = parseDeepSeekBalance(json);
    return {
      provider: 'deepseek',
      kind: 'balance',
      month,
      available: parsed.available,
      balances: parsed.balances,
      currency: parsed.balances[0]?.currency ?? 'CNY',
      fetchedAt: Date.now(),
    };
  }

  if (host !== 'api.openai.com') {
    throw new OfficialUsageError(
      'unsupported',
      '该兼容端点未开放公开用量接口。目前支持 OpenAI 官方用量、DeepSeek 余额；GLM/Qwen 等请在服务商控制台查看。',
    );
  }

  const usageUrl = `https://api.openai.com/v1/organization/usage/completions?start_time=${monthStartSeconds()}&end_time=${Math.floor(Date.now() / 1000)}&bucket_width=1d&limit=31`;
  const usageResponse = await getJson(usageUrl, apiKey);
  if (!usageResponse.ok) {
    if (usageResponse.status === 401 || usageResponse.status === 403) {
      throw new OfficialUsageError(
        'permission',
        'OpenAI 组织用量接口需要 Admin key（sk-admin_…，组织管理员），普通项目 key 无权限。',
      );
    }
    throw new OfficialUsageError(String(usageResponse.status), `OpenAI 用量接口失败（${usageResponse.status}）`);
  }
  const usageJson = (await usageResponse.json()) as Parameters<typeof parseOpenAIUsage>[0];
  const tokens = parseOpenAIUsage(usageJson);

  let cost: number | undefined;
  let currency = 'USD';
  try {
    const costsUrl = `https://api.openai.com/v1/organization/costs?start_time=${monthStartSeconds()}&end_time=${Math.floor(Date.now() / 1000)}&bucket_width=1d&limit=31`;
    const costsResponse = await getJson(costsUrl, apiKey);
    if (costsResponse.ok) {
      const parsed = parseOpenAICosts(await costsResponse.json());
      cost = parsed.cost;
      currency = parsed.currency;
    }
  } catch {
    // usage is still useful without cost
  }

  return {
    provider: 'openai',
    kind: 'usage',
    month,
    ...tokens,
    cost,
    currency,
    fetchedAt: Date.now(),
  };
}
