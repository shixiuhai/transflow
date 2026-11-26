import { describe, expect, it } from 'vitest';
import { parseVolcBilling } from '../../src/core/usage/billing';

describe('volc billing parse', () => {
  it('sums account and translation amounts', () => {
    const result = parseVolcBilling({
      Result: {
        List: [
          { Product: 'TTS', ProductZh: '语音合成', PayableAmount: '8.19', Currency: 'CNY' },
          { Product: 'Translate', ProductZh: '机器翻译', PayableAmount: '1.50', Currency: 'CNY' },
        ],
      },
    }, '2026-11');
    expect(result.total).toBeCloseTo(9.69);
    expect(result.translationTotal).toBeCloseTo(1.5);
    expect(result.hasTranslationLine).toBe(true);
    expect(result.lines).toHaveLength(2);
  });

  it('reports no translation line when everything is in free tier', () => {
    const result = parseVolcBilling({ Result: { List: [] } }, '2026-11');
    expect(result.total).toBe(0);
    expect(result.hasTranslationLine).toBe(false);
  });
});

import { parseDeepSeekBalance, parseOpenAICosts, parseOpenAIUsage } from '../../src/core/usage/openai';

describe('openai / deepseek official data parse', () => {
  it('sums OpenAI token usage', () => {
    const parsed = parseOpenAIUsage({
      data: [
        { results: [{ input_tokens: 100, output_tokens: 30, num_model_requests: 2 }] },
        { results: [{ input_tokens: 50, output_tokens: 20, num_model_requests: 1 }] },
      ],
    });
    expect(parsed).toEqual({ inputTokens: 150, outputTokens: 50, requests: 3 });
  });

  it('sums OpenAI costs', () => {
    const parsed = parseOpenAICosts({
      data: [{ results: [{ amount: { value: 0.12, currency: 'usd' } }] }, { results: [{ amount: { value: 0.08, currency: 'usd' } }] }],
    });
    expect(parsed.cost).toBeCloseTo(0.2);
    expect(parsed.currency).toBe('usd');
  });

  it('parses DeepSeek balance', () => {
    const parsed = parseDeepSeekBalance({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }],
    });
    expect(parsed.available).toBe(true);
    expect(parsed.balances[0]?.total).toBe('110.00');
  });
});
